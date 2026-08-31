/**
 * Turns Cloudflare D1 exports of the persistent tables into a SQL script you can review before
 * applying it to PostgreSQL. It never talks to Cloudflare or to a database: it reads local CSV or
 * JSON files and writes SQL to stdout.
 *
 * Usage, from the repository root:
 *   node backend/tools/import-d1.mjs \
 *     --removed-members  path/to/removed_members.json \
 *     --task-reschedules path/to/task_reschedules.csv \
 *     --task-checklists path/to/task_checklist_items.json \
 *     --handover-documents path/to/handover_documents.json \
 *     --handover-entries path/to/handover_entries.json \
 *     --handover-bundles path/to/handover_bundles.json \
 *     > backend/tools/out/import.sql
 *
 * Any flag may be omitted to import only selected tables. Input may be:
 *   - JSON: an array of row objects, or `wrangler d1 execute --json` output
 *     (`[{ "results": [ ... ] }]`), keyed by the D1 column names.
 *   - CSV:  a header row using the D1 column names, RFC 4180 quoting.
 *
 * The generated script is idempotent: removed_members and handover_documents upsert, document
 * children are replaced per included owner, and task_reschedules keeps its original ids. It resets
 * the task identity sequence so the next application insert cannot collide with an imported id.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const COLUMNS = {
  removed_members: ['person_id', 'removed_at'],
  task_reschedules: [
    'id', 'task_key', 'person_id', 'task_title',
    'from_start', 'to_start', 'reason', 'changed_by', 'changed_at',
  ],
  task_checklist_items: [
    'id', 'task_key', 'person_id', 'task_title', 'item_key',
    'completed', 'updated_by', 'updated_at',
  ],
  handover_documents: [
    'owner_email', 'owner_name', 'status', 'updated_at',
    'submitted_at', 'reviewed_at', 'reviewed_by',
  ],
  handover_entries: [
    'owner_email', 'entry_id', 'position', 'category', 'title', 'detail',
    'properties', 'attachments', 'font_family', 'font_size',
  ],
  handover_bundles: [
    'owner_email', 'bundle_id', 'position', 'title', 'entry_ids', 'decision', 'comment',
  ],
};
const NUMERIC = new Set(['id', 'from_start', 'to_start', 'position']);
const TIMESTAMP = new Set(['removed_at', 'changed_at', 'updated_at', 'submitted_at', 'reviewed_at']);
const BOOLEAN = new Set(['completed']);
const JSON_TEXT = new Set(['properties', 'attachments', 'entry_ids']);
const NULLABLE = new Set(['submitted_at', 'reviewed_at', 'reviewed_by', 'decision']);

function parseArgs(argv) {
  const args = {
    output: null,
    removedMembers: null,
    taskReschedules: null,
    taskChecklists: null,
    handoverDocuments: null,
    handoverEntries: null,
    handoverBundles: null,
  };
  for (let at = 0; at < argv.length; at += 1) {
    const flag = argv[at];
    const value = argv[at + 1];
    if (flag === '--removed-members') { args.removedMembers = value; at += 1; }
    else if (flag === '--task-reschedules') { args.taskReschedules = value; at += 1; }
    else if (flag === '--task-checklists') { args.taskChecklists = value; at += 1; }
    else if (flag === '--handover-documents') { args.handoverDocuments = value; at += 1; }
    else if (flag === '--handover-entries') { args.handoverEntries = value; at += 1; }
    else if (flag === '--handover-bundles') { args.handoverBundles = value; at += 1; }
    else if (flag === '--out') { args.output = value; at += 1; }
    else if (flag === '--help' || flag === '-h') { args.help = true; }
    else throw new Error(`unknown argument: ${flag}`);
  }
  return args;
}

/** RFC 4180 CSV, enough for the quoting `wrangler d1 export` and psql \copy produce. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (quoted) {
      if (char === '"' && text[at + 1] === '"') { field += '"'; at += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((entry) => entry.some((cell) => cell !== ''));
  if (!header) return [];
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [name.trim(), cells[index] ?? ''])));
}

function readRows(path) {
  const text = readFileSync(path, 'utf8');
  /* `sqlite3 -json` and some exporters write nothing at all for an empty table. */
  if (!text.trim()) return [];
  if (path.toLowerCase().endsWith('.csv')) return parseCsv(text);
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed) && parsed.length && Array.isArray(parsed[0]?.results)) {
    return parsed.flatMap((entry) => entry.results);
  }
  if (Array.isArray(parsed?.results)) return parsed.results;
  if (!Array.isArray(parsed)) throw new Error(`${path}: expected an array of rows`);
  return parsed;
}

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

function literal(column, value, table, index) {
  if (value === null || value === undefined || value === '') {
    if (NULLABLE.has(column)) return 'NULL';
    throw new Error(`${table} row ${index + 1}: ${column} is empty, but the column is NOT NULL`);
  }
  if (NUMERIC.has(column)) {
    const number = Number(value);
    if (!Number.isInteger(number)) throw new Error(`${table} row ${index + 1}: ${column} is not an integer`);
    return String(number);
  }
  if (BOOLEAN.has(column)) {
    if (value === true || value === 1 || value === '1' || value === 'true') return 'TRUE';
    if (value === false || value === 0 || value === '0' || value === 'false') return 'FALSE';
    throw new Error(`${table} row ${index + 1}: ${column} is not a boolean`);
  }
  if (TIMESTAMP.has(column)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error(`${table} row ${index + 1}: ${column} is not a timestamp`);
    /* D1 stored these as ISO-8601 text; PostgreSQL takes the same string as timestamptz. */
    return `${quote(parsed.toISOString())}::timestamptz`;
  }
  if (JSON_TEXT.has(column)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    try {
      JSON.parse(text);
    } catch {
      throw new Error(`${table} row ${index + 1}: ${column} is not valid JSON`);
    }
    return quote(text);
  }
  return quote(value);
}

function statements(table, rows, conflict) {
  const columns = COLUMNS[table];
  return rows.map((row, index) => {
    const values = columns.map((column) => literal(column, row[column], table, index));
    return `INSERT INTO ${table} (${columns.join(', ')})\nVALUES (${values.join(', ')})\n${conflict};`;
  });
}

const args = parseArgs(process.argv.slice(2));
if (args.help || (!args.removedMembers && !args.taskReschedules && !args.handoverDocuments
    && !args.taskChecklists && !args.handoverEntries && !args.handoverBundles)) {
  console.error(readFileSync(new URL(import.meta.url)).toString().split('*/')[0]);
  process.exit(args.help ? 0 : 1);
}

const lines = [
  '-- Generated by backend/tools/import-d1.mjs. Review before running.',
  `-- Generated at ${new Date().toISOString()}`,
  '-- Apply with:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f import.sql',
  '',
  'BEGIN;',
  '',
];

if (args.removedMembers) {
  const rows = readRows(args.removedMembers);
  lines.push(`-- removed_members: ${rows.length} row(s)`);
  /* Re-running must not fail, and the newer removal timestamp is the one worth keeping. */
  lines.push(...statements('removed_members', rows,
    'ON CONFLICT (person_id) DO UPDATE SET removed_at = EXCLUDED.removed_at'));
  lines.push('');
}

if (args.taskReschedules) {
  const rows = readRows(args.taskReschedules);
  lines.push(`-- task_reschedules: ${rows.length} row(s), original ids preserved`);
  lines.push(...statements('task_reschedules', rows, 'ON CONFLICT (id) DO NOTHING'));
  lines.push('');
  lines.push('-- Without this the next application insert would reuse an imported id.');
  lines.push("SELECT setval(pg_get_serial_sequence('task_reschedules', 'id'),");
  lines.push('              COALESCE((SELECT MAX(id) FROM task_reschedules), 0) + 1, false);');
  lines.push('');
}

if (args.taskChecklists) {
  const rows = readRows(args.taskChecklists);
  lines.push(`-- task_checklist_items: ${rows.length} row(s), latest state wins`);
  lines.push(...statements('task_checklist_items', rows, `ON CONFLICT (task_key, item_key) DO UPDATE SET
  completed = EXCLUDED.completed,
  updated_by = EXCLUDED.updated_by,
  updated_at = EXCLUDED.updated_at`));
  lines.push('');
  lines.push("SELECT setval(pg_get_serial_sequence('task_checklist_items', 'id'),");
  lines.push('              COALESCE((SELECT MAX(id) FROM task_checklist_items), 0) + 1, false);');
  lines.push('');
}

let handoverOwners = [];
if (args.handoverDocuments) {
  const rows = readRows(args.handoverDocuments);
  handoverOwners = [...new Set(rows.map((row) => row.owner_email).filter(Boolean))];
  lines.push(`-- handover_documents: ${rows.length} row(s)`);
  lines.push(...statements('handover_documents', rows, `ON CONFLICT (owner_email) DO UPDATE SET
  owner_name = EXCLUDED.owner_name,
  status = EXCLUDED.status,
  updated_at = EXCLUDED.updated_at,
  submitted_at = EXCLUDED.submitted_at,
  reviewed_at = EXCLUDED.reviewed_at,
  reviewed_by = EXCLUDED.reviewed_by`));
  lines.push('');
}

function replaceDocumentChildren(path, table, ownerColumn) {
  if (!path) return;
  const rows = readRows(path);
  const owners = [...new Set([...handoverOwners, ...rows.map((row, index) => {
    if (!row.owner_email) throw new Error(`${table} row ${index + 1}: owner_email is empty`);
    return row.owner_email;
  })])];
  lines.push(`-- ${table}: ${rows.length} row(s), replacing each included document's rows`);
  if (owners.length) {
    lines.push(`DELETE FROM ${table} WHERE ${ownerColumn} IN (${owners.map(quote).join(', ')});`);
  }
  lines.push(...statements(table, rows, 'ON CONFLICT DO NOTHING'));
  lines.push('');
}

replaceDocumentChildren(args.handoverEntries, 'handover_entries', 'owner_email');
replaceDocumentChildren(args.handoverBundles, 'handover_bundles', 'owner_email');

lines.push('COMMIT;');
const sql = `${lines.join('\n')}\n`;

if (args.output) {
  writeFileSync(args.output, sql);
  console.error(`wrote ${args.output}`);
} else {
  process.stdout.write(sql);
}
