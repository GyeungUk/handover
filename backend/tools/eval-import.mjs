/**
 * Opt-in, paid prompt evaluation on synthetic documents (no personal data).
 * node backend/tools/eval-import.mjs [--curl] [--prompt=/path/import.txt] [--schema=/path/import.json]
 * Optional --output=/path/report.json saves the raw answers for human review or service replay.
 * --fixtures=/path/cases.json runs a focused fixture set instead of the bundled suites.
 * This evaluates model output before service filtering; the backend tests cover acceptance rules.
 *
 * Two kinds of fixture, because the import has two jobs and they fail separately:
 *
 * - `expected` fixtures measure section assignment: does each independent fact land in exactly one
 *   card, in the right one of the four sections. Equal section counts are never a target.
 * - `mode: "workflow"` fixtures measure the restructuring: does a document that reads as a list of
 *   headings come back as work phases in dependency order, with the schedule's deadlines and
 *   departments attached to the work they govern, the conditional rules kept as control points
 *   rather than promoted to incidents, and every paragraph and table row owned by some phase.
 *   A document can score perfectly on the first and still be useless on the second, which is the
 *   failure these were written for.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const flags = process.argv.slice(2);
const fixtureOption = flags.find((flag) => flag.startsWith('--fixtures='))?.slice(11);
const fixtureFiles = fixtureOption ? [resolve(fixtureOption)] : [
  'classification.json', 'advanced-classification.json', 'workflow-structure.json',
].map((name) => join(root, 'backend/tools/fixtures/import', name));
const fixtures = fixtureFiles.flatMap((path) => JSON.parse(readFileSync(path, 'utf8')));
const output = flags.find((flag) => flag.startsWith('--output='))?.slice(9);
const forwarded = flags.filter((flag) => flag === '--curl' || /^--(prompt|schema)=/.test(flag));
const directory = mkdtempSync(join(tmpdir(), 'handover-import-eval-'));
const normalize = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
const matches = (pattern, text) => new RegExp(pattern, 'u').test(text);

/* --- what a card and a phase say, flattened the way a check reads them --- */

const operationText = (operation) => {
  if (!operation) return '';
  const { timing = {}, resources = {} } = operation;
  return [
    operation.purpose, timing.cycle, timing.trigger, timing.deadline,
    ...(operation.collaborators ?? []).flatMap((one) => [one.department, one.role]),
    ...(resources.systems ?? []), ...(resources.documents ?? []), ...(resources.outputs ?? []),
    ...(operation.steps ?? []), ...(operation.prerequisites ?? []), ...(operation.followUp ?? []),
    ...(operation.controls ?? []).flatMap((one) => [one.condition, one.owner, one.action, one.escalation]),
  ].filter(Boolean).join(' ');
};

const itemText = (item) => [item.title, ...(item.paragraphs ?? []), operationText(item.operation),
  ...(item.questions ?? [])].join(' ');

/** The operation field a check names, including the two-level `resources.documents` form. */
function operationField(operation, path) {
  if (!operation) return '';
  const [head, tail] = path.split('.');
  const value = tail ? (operation[head] ?? {})[tail] : operation[head];
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((one) => typeof one === 'string' ? one : Object.values(one).join(' ')).join(' ');
  }
  return Object.values(value).filter(Boolean).join(' ');
}

/* --- ownership: which card was built on a given piece of the source --- */

/**
 * Whether a card is built on a unit of the upload, decided from its quotes rather than from the
 * unit numbers it reported. A model that says it used s3 has claimed something; a model whose
 * quote appears in s3 has shown it, and the service settles coverage the same way.
 */
function ownsSegment(item, segment) {
  const text = normalize(segment.text);
  const quotes = [item.sourceQuote, ...(item.evidence ?? []).map((one) => one.quote)].filter(Boolean);
  return quotes.some((quote) => {
    const needle = normalize(quote);
    return needle.length > 0 && (text.includes(needle) || (text.length >= 10 && needle.includes(text)));
  });
}

/** The phase a card ended up in, from either direction the answer can express it. */
function groupOf(item, groups) {
  return groups.find((group) => (group.itemIds ?? []).includes(item.id))
    ?? groups.find((group) => group.id === item.workflowId)
    ?? null;
}

/* --- the two kinds of check --- */

function classificationChecks(fixture, answer) {
  const items = answer.items ?? [];
  /* A card is identified by what it says it is about. `paragraphs` now carries only what the
     operation could not, and is routinely empty, so the purpose joins the title as the card's
     own statement of subject. The steps deliberately stay out: they name other cards' work
     often enough to make one card answer to two expectations. */
  const prose = (item) => [item.title, ...(item.paragraphs ?? []),
    item.operation?.purpose ?? ''].join(' ');
  /* What the card actually asserts, wherever the restructure put it. Identification still runs on
     the title and prose so one card cannot answer to two expectations, but a date or a count that
     moved out of a paragraph and into `operation` is still stated and must count as stated. */
  const facts = (item) => [item.title, ...(item.paragraphs ?? []), operationText(item.operation)].join(' ');
  const found = fixture.expected.map((expected) => items.flatMap((item, index) =>
    matches(expected.match, prose(item)) ? [index] : []));
  return fixture.expected.map((expected, index) => {
    const indices = found[index];
    const matchedItems = indices.map((at) => items[at]);
    const only = matchedItems.length === 1 ? matchedItems[0] : null;
    const failures = [];
    if (!only) failures.push('missing-or-duplicate');
    if (only && only.category !== expected.category) failures.push('wrong-section');
    if (only && found.filter((candidates) => candidates.includes(indices[0])).length > 1) failures.push('merged-facts');
    if (only && expected.confidence && only.confidence !== expected.confidence) failures.push('confidence');
    for (const pattern of expected.contentMustMatch ?? []) {
      if (only && !matches(pattern, facts(only))) failures.push(`missing-content: ${pattern}`);
    }
    for (const pattern of expected.contentMustNotMatch ?? []) {
      if (only && matches(pattern, facts(only))) failures.push(`incorrect-content: ${pattern}`);
    }
    return {
      id: expected.id, expected: expected.category,
      actual: matchedItems.map((item) => item.category), failures, passed: failures.length === 0,
    };
  });
}

function workflowChecks(fixture, answer) {
  const items = answer.items ?? [];
  const groups = answer.workflowGroups ?? [];
  const segments = answer.segments ?? [];
  const checks = [];
  const add = (id, failures, note = '') =>
    checks.push({ id, failures, note, passed: failures.length === 0 });

  /* One phase per expected phase, found by what it is called rather than by position. */
  const resolved = new Map();
  for (const expected of fixture.expectedGroups ?? []) {
    const hits = groups.filter((group) => matches(expected.match, group.title ?? ''));
    if (hits.length === 1) resolved.set(expected.id, hits[0]);
    add(`group:${expected.id}`, hits.length === 1 ? []
      : [hits.length ? `duplicate-group: ${hits.map((one) => one.title).join(' | ')}` : 'missing-group'],
    hits.map((one) => one.title).join(' | '));
  }

  for (const expected of fixture.expectedGroups ?? []) {
    const group = resolved.get(expected.id);
    if (!group) continue;
    const members = items.filter((item) => groupOf(item, groups)?.id === group.id);
    const prose = members.map(itemText).join(' ');
    const failures = [];

    if (!members.length) failures.push('empty-group');

    /* Dependencies, compared as the phases they name rather than as raw ids. */
    const declared = new Set((group.after ?? [])
      .map((id) => groups.find((one) => one.id === id)?.title ?? id));
    const wanted = new Set((expected.after ?? [])
      .map((id) => resolved.get(id)?.title).filter(Boolean));
    for (const title of wanted) {
      if (!declared.has(title)) failures.push(`missing-dependency: ${title}`);
    }
    if ((expected.after ?? []).length === 0 && declared.size > 0) {
      failures.push(`unexpected-dependency: ${[...declared].join(', ')}`);
    }

    for (const category of expected.requiredCategories ?? []) {
      if (!members.some((item) => item.category === category)) failures.push(`missing-section: ${category}`);
    }
    for (const pattern of expected.contentMustMatch ?? []) {
      if (!matches(pattern, prose)) failures.push(`missing-content: ${pattern}`);
    }
    for (const pattern of expected.factsMustNotMatch ?? []) {
      if (matches(pattern, prose)) failures.push(`invented-fact: ${pattern}`);
    }
    for (const [path, patterns] of Object.entries(expected.operationMustMatch ?? {})) {
      const field = members.map((item) => operationField(item.operation, path)).join(' ');
      for (const pattern of patterns) {
        if (!matches(pattern, field)) failures.push(`missing-operation.${path}: ${pattern}`);
      }
    }
    const questions = members.flatMap((item) => item.questions ?? []).join(' ');
    for (const pattern of expected.questionsMatch ?? []) {
      if (!matches(pattern, questions)) failures.push(`missing-question: ${pattern}`);
    }

    /* Control points, checked column by column: a rule folded into prose loses exactly the four
       facts that make it usable, and matching the whole card would not notice. */
    const controls = members.flatMap((item) => item.operation?.controls ?? []);
    for (const wantedControl of expected.controls ?? []) {
      const hit = controls.some((control) =>
        matches(wantedControl.condition, control.condition ?? '')
        && matches(wantedControl.owner, control.owner ?? '')
        && (wantedControl.action
          ? matches(wantedControl.action, control.action ?? '')
          : matches(wantedControl.actionOrEscalation, `${control.action ?? ''} ${control.escalation ?? ''}`)));
      if (!hit) failures.push(`missing-control: ${wantedControl.id}`);
    }

    add(`phase:${expected.id}`, failures, `${members.length}개 항목 · ${group.title}`);
  }

  /* Every paragraph and every schedule row lands in the phase that actually runs it. */
  for (const kind of ['requiredFactOwnership', 'requiredTableOwnership']) {
    for (const wanted of fixture[kind] ?? []) {
      const owned = segments.filter((segment) => matches(wanted.sourceMatch, segment.text));
      if (!owned.length) {
        add(`${kind}:${wanted.id}`, ['fixture-source-not-found']);
        continue;
      }
      const owners = items.filter((item) => owned.some((segment) => ownsSegment(item, segment)));
      const phases = [...new Set(owners.map((item) => groupOf(item, groups)?.id).filter(Boolean))];
      const expectedGroup = resolved.get(wanted.group);
      const failures = [];
      if (!owners.length) failures.push('source-unused');
      else if (!expectedGroup) failures.push(`unresolved-group: ${wanted.group}`);
      else if (!phases.includes(expectedGroup.id)) failures.push(`wrong-phase: ${phases.join(',') || 'none'}`);
      add(`${kind}:${wanted.id}`, failures,
        phases.map((id) => groups.find((one) => one.id === id)?.title).join(' | '));
    }
  }

  /* A manual that records no incident must not grow one, and a restructure that keeps one card
     per heading fails here even when every card is individually correct. */
  for (const category of fixture.forbiddenCategories ?? []) {
    const wrong = items.filter((item) => item.category === category);
    add(`forbidden:${category}`, wrong.length ? [`invented-section: ${wrong.map((one) => one.title).join(' | ')}`] : []);
  }
  if (fixture.itemCount) {
    const { min = 0, max = Infinity } = fixture.itemCount;
    add('itemCount', items.length < min || items.length > max
      ? [`item-count ${items.length} outside ${min}~${max}`] : [], `${items.length}건`);
  }

  /* Cards must be placed, and the placement must be a real ordering. */
  const unplaced = items.filter((item) => !groupOf(item, groups));
  add('placement', unplaced.length ? [`unplaced: ${unplaced.map((one) => one.title).join(' | ')}`] : []);
  const known = new Set(groups.map((group) => group.id));
  const danglingAfter = groups.flatMap((group) => (group.after ?? []).filter((id) => !known.has(id)));
  add('dependencies', danglingAfter.length ? [`unknown-after: ${danglingAfter.join(', ')}`] : []);

  /* Coverage the model reported, cross-checked against the units that were actually sent. */
  const sent = new Set(segments.map((segment) => segment.id));
  const reported = new Set((answer.coverage ?? []).map((entry) => entry.sourceId));
  const missing = [...sent].filter((id) => !reported.has(id));
  const invented = [...reported].filter((id) => !sent.has(id));
  add('coverage', [
    ...(missing.length ? [`uncompared: ${missing.slice(0, 8).join(',')}${missing.length > 8 ? '…' : ''}`] : []),
    ...(invented.length ? [`unknown-source-id: ${invented.slice(0, 8).join(',')}`] : []),
  ], `${reported.size}/${sent.size}`);

  return checks;
}

/* --- run --- */

const reports = [];
try {
  // Two documents at a time; each fixture fits in one production chunk.
  for (let start = 0; start < fixtures.length; start += 2) {
    const batch = await Promise.allSettled(fixtures.slice(start, start + 2).map(async (fixture) => {
      const path = join(directory, `${fixture.id}.txt`);
      writeFileSync(path, fixture.source);
      const { stdout, stderr } = await promisify(execFile)(process.execPath,
        [join(root, 'backend/tools/try-prompt.mjs'), 'import', path, '--json', ...forwarded],
        { cwd: root, timeout: 240000, maxBuffer: 4 * 1024 * 1024 });
      const answer = JSON.parse(stdout);
      const items = answer.items ?? [];
      const workflow = fixture.mode === 'workflow';
      const checks = workflow ? workflowChecks(fixture, answer) : classificationChecks(fixture, answer);

      const extraItems = workflow ? [] : items.filter((item) => !fixture.expected.some((expected) =>
        matches(expected.match, [item.title, ...(item.paragraphs ?? [])].join(' '))));
      const ungrounded = items.filter((item) => !item.sourceQuote?.trim()
        || !normalize(fixture.source).includes(normalize(item.sourceQuote)));
      const missingUnmapped = (fixture.unmappedMatch ?? []).filter((pattern) =>
        !matches(pattern, (answer.unmapped ?? []).join(' ')));
      const report = { id: fixture.id, mode: fixture.mode ?? 'classification', checks,
        extraItems: extraItems.length, ungrounded: ungrounded.length, missingUnmapped, answer };
      console.log(`${fixture.id}: ${checks.filter((check) => check.passed).length}/${checks.length}`
        + `${workflow ? ` · 업무단위 ${(answer.workflowGroups ?? []).length}개 · 항목 ${items.length}건` : ` · 예상 밖 항목 ${extraItems.length}`}`
        + ` · 원문 불일치 근거 ${ungrounded.length}`
        + ` · 미분류 보존 누락 ${missingUnmapped.length}`);
      checks.filter((check) => !check.passed).forEach((check) => console.log(
        `  ${check.id}: ${check.failures.join('; ')}${check.note ? `  [${check.note}]` : ''}`
        + `${check.expected ? ` (expected=${check.expected}, actual=${check.actual.join(',') || 'missing'})` : ''}`));
      console.error(stderr.trim());
      return report;
    }));
    batch.filter((result) => result.status === 'fulfilled').forEach((result) => reports.push(result.value));
    const failures = batch.filter((result) => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map((failure) => failure.reason), 'Import evaluation calls failed');
  }
  const checks = reports.flatMap((report) => report.checks);
  const passed = checks.filter((check) => check.passed).length;
  console.log(`총 ${passed}/${checks.length} 통과 (섹션 배정 + 업무단위 재구성)`);
  if (output) writeFileSync(resolve(output), JSON.stringify(reports, null, 2) + '\n');
  if (passed !== checks.length || reports.some((report) => report.extraItems || report.ungrounded || report.missingUnmapped.length)) {
    process.exitCode = 1;
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
