/**
 * Turns a Cloudflare D1 export of the two persistent tables into a SQL script you can review before
 * applying it to PostgreSQL. It never talks to Cloudflare or to a database: it reads local CSV or
 * JSON files and writes SQL to stdout.
 *
 * Usage, from the repository root:
 *   node backend/tools/import-d1.mjs \
 *     --removed-members  path/to/removed_members.json \
 *     --task-reschedules path/to/task_reschedules.csv \
 *     > backend/tools/out/import.sql
 *
 * Either flag may be omitted to import just one table. Input may be:
 *   - JSON: an array of row objects, or `wrangler d1 execute --json` output
 *     (`[{ "results": [ ... ] }]`), keyed by the D1 column names.
 *   - CSV:  a header row using the D1 column names, RFC 4180 quoting.
 *
 * The generated script is idempotent: removed_members upserts on the primary key, and
 * task_reschedules keeps its original ids and skips any that already exist. It ends by resetting the
 * identity sequence, without which the next application insert would collide with an imported id.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const COLUMNS = {
  removed_members: ['person_id', 'removed_at'],
  task_reschedules: [
    'id', 'task_key', 'person_id', 'task_title',
    'from_start', 'to_start', 'reason', 'changed_by', 'changed_at',
  ],
};
const NUMERIC = new Set(['id', 'from_start', 'to_start']);
const TIMESTAMP = new Set(['removed_at', 'changed_at']);

function parseArgs(argv) {
  const args = { output: null, removedMembers: null, taskReschedules: null };
  for (let at = 0; at < argv.length; at += 1) {
    const flag = argv[at];
    const value = argv[at + 1];
    if (flag === '--removed-members') { args.removedMembers = value; at += 1; }
    else if (flag === '--task-reschedules') { args.taskReschedules = value; at += 1; }
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
    throw new Error(`${table} row ${index + 1}: ${column} is empty, but the column is NOT NULL`);
  }
  if (NUMERIC.has(column)) {
    const number = Number(value);
    if (!Number.isInteger(number)) throw new Error(`${table} row ${index + 1}: ${column} is not an integer`);
    return String(number);
  }
  if (TIMESTAMP.has(column)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error(`${table} row ${index + 1}: ${column} is not a timestamp`);
    /* D1 stored these as ISO-8601 text; PostgreSQL takes the same string as timestamptz. */
    return `${quote(parsed.toISOString())}::timestamptz`;
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
if (args.help || (!args.removedMembers && !args.taskReschedules)) {
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

lines.push('COMMIT;');
const sql = `${lines.join('\n')}\n`;

if (args.output) {
  writeFileSync(args.output, sql);
  console.error(`wrote ${args.output}`);
} else {
  process.stdout.write(sql);
}
