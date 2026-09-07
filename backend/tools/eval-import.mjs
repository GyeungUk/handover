/**
 * Opt-in, paid prompt evaluation on synthetic documents (no personal data).
 * node backend/tools/eval-import.mjs [--curl] [--prompt=/path/import.txt] [--schema=/path/import.json]
 * Optional --output=/path/report.json saves the raw answers for human review or service replay.
 * --fixtures=/path/cases.json runs a focused fixture set instead of both bundled suites.
 * Measures fact coverage AND section assignment; equal section counts are never a target.
 * This evaluates model output before service filtering; the backend tests cover acceptance rules.
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
  'classification.json', 'advanced-classification.json',
].map((name) => join(root, 'backend/tools/fixtures/import', name));
const fixtures = fixtureFiles.flatMap((path) => JSON.parse(readFileSync(path, 'utf8')));
const output = flags.find((flag) => flag.startsWith('--output='))?.slice(9);
const forwarded = flags.filter((flag) => flag === '--curl' || /^--(prompt|schema)=/.test(flag));
const directory = mkdtempSync(join(tmpdir(), 'handover-import-eval-'));
const normalize = (value) => value.replace(/\s+/g, ' ').trim();
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
      const prose = (item) => [item.title, ...(item.paragraphs ?? [])].join(' ');
      const matches = fixture.expected.map((expected) => items.flatMap((item, index) =>
        new RegExp(expected.match, 'u').test(prose(item)) ? [index] : []));
      const checks = fixture.expected.map((expected, index) => {
        const indices = matches[index];
        const matchedItems = indices.map((at) => items[at]);
        const only = matchedItems.length === 1 ? matchedItems[0] : null;
        const failures = [];
        if (!only) failures.push('missing-or-duplicate');
        if (only && only.category !== expected.category) failures.push('wrong-section');
        if (only && matches.filter((candidates) => candidates.includes(indices[0])).length > 1) failures.push('merged-facts');
        if (only && expected.confidence && only.confidence !== expected.confidence) failures.push('confidence');
        for (const pattern of expected.contentMustMatch ?? []) {
          if (only && !new RegExp(pattern, 'u').test(prose(only))) failures.push(`missing-content: ${pattern}`);
        }
        for (const pattern of expected.contentMustNotMatch ?? []) {
          if (only && new RegExp(pattern, 'u').test(prose(only))) failures.push(`incorrect-content: ${pattern}`);
        }
        return {
          id: expected.id, expected: expected.category,
          actual: matchedItems.map((item) => item.category), failures,
          passed: failures.length === 0,
        };
      });
      const extraItems = items.filter((item) => !fixture.expected.some((expected) =>
        new RegExp(expected.match, 'u').test([item.title, ...(item.paragraphs ?? [])].join(' '))));
      const ungrounded = items.filter((item) => !item.sourceQuote?.trim()
        || !normalize(fixture.source).includes(normalize(item.sourceQuote)));
      const missingUnmapped = (fixture.unmappedMatch ?? []).filter((pattern) =>
        !new RegExp(pattern, 'u').test((answer.unmapped ?? []).join(' ')));
      const report = { id: fixture.id, checks, extraItems: extraItems.length,
        ungrounded: ungrounded.length, missingUnmapped, answer };
      console.log(`${fixture.id}: ${checks.filter((check) => check.passed).length}/${checks.length}`
        + ` · 예상 밖 항목 ${extraItems.length} · 원문 불일치 근거 ${ungrounded.length}`
        + ` · 미분류 보존 누락 ${missingUnmapped.length}`);
      checks.filter((check) => !check.passed).forEach((check) => console.log(
        `  ${check.id}: expected=${check.expected}, actual=${check.actual.join(',') || 'missing'} (${check.failures.join('; ')})`));
      console.error(stderr.trim());
      return report;
    }));
    batch.filter((result) => result.status === 'fulfilled').forEach((result) => reports.push(result.value));
    const failures = batch.filter((result) => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map((failure) => failure.reason), 'Import evaluation calls failed');
  }
  const checks = reports.flatMap((report) => report.checks);
  const passed = checks.filter((check) => check.passed).length;
  console.log(`총 ${passed}/${checks.length} 사실의 누락·중복 없는 섹션 배정`);
  if (output) writeFileSync(resolve(output), JSON.stringify(reports, null, 2) + '\n');
  if (passed !== checks.length || reports.some((report) => report.extraItems || report.ungrounded || report.missingUnmapped.length)) {
    process.exitCode = 1;
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
