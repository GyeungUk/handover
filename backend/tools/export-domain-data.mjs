/**
 * Exports the TypeScript domain data (org chart, academic calendar, handover schema) to the JSON
 * resources the Spring backend loads at startup, so the two runtimes never drift by hand-copying.
 *
 * Usage, from the repository root:
 *   node backend/tools/export-domain-data.mjs
 *
 * It compiles the three source modules with the repo's own TypeScript, imports the output and
 * writes backend/src/main/resources/domain/*.json. Re-run it whenever the TS data changes.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = join(repoRoot, 'backend/src/main/resources/domain');
const build = mkdtempSync(join(tmpdir(), 'handover-domain-'));

try {
  execFileSync(
    'npx',
    ['tsc', 'app/org-data.ts', 'app/academic-calendar.ts', 'app/handover-schema.ts',
     '--outDir', build, '--module', 'esnext', '--target', 'es2022', '--moduleResolution', 'bundler', '--rootDir', '.'],
    { cwd: repoRoot, stdio: 'inherit' },
  );

  // tsc emits extensionless relative specifiers; Node's ESM loader needs the '.js' back.
  for (const name of ['org-data', 'academic-calendar', 'handover-schema']) {
    const file = join(build, `app/${name}.js`);
    writeFileSync(file, readFileSync(file, 'utf8').replace(/(from '\.\/[^']+)'/g, "$1.js'"));
  }

  const org = await import(pathToFileURL(join(build, 'app/org-data.js')).href);
  const calendar = await import(pathToFileURL(join(build, 'app/academic-calendar.js')).href);
  const schema = await import(pathToFileURL(join(build, 'app/handover-schema.js')).href);

  mkdirSync(outDir, { recursive: true });
  const write = (name, value) => {
    writeFileSync(join(outDir, name), `${JSON.stringify(value, null, 2)}\n`);
    console.log(`wrote domain/${name}`);
  };

  write('org-data.json', { weeksInYear: org.WEEKS_IN_YEAR, months: org.months, teams: org.seedTeams });
  write('academic-calendar.json', {
    baseYear: calendar.baseAcademicYear,
    years: calendar.academicYears,
    alignmentActionLabels: calendar.alignmentActionLabels,
  });
  write('handover-schema.json', {
    categories: schema.handoverCategories,
    categoryLabels: schema.handoverCategoryLabels,
    propertyFieldsByCategory: schema.propertyFieldsByCategory,
    findingKinds: schema.findingKinds,
    annualActionLabels: schema.annualActionLabels,
  });
} finally {
  rmSync(build, { recursive: true, force: true });
}
