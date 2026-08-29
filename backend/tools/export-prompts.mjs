/**
 * Copies the Korean system prompts out of the Next.js route handlers into the resource files the
 * Spring services load, so the wording stays byte-identical across the two backends.
 *
 * Usage, from the repository root:
 *   node backend/tools/export-prompts.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = join(repoRoot, 'backend/src/main/resources/ai/prompt');
const routes = ['draft', 'import', 'quality', 'annual', 'calendar-check'];

mkdirSync(outDir, { recursive: true });
for (const route of routes) {
  const source = readFileSync(join(repoRoot, `app/api/${route}/route.ts`), 'utf8');
  const match = source.match(/const systemPrompt = `([\s\S]*?)`;\n/);
  if (!match) throw new Error(`no systemPrompt found in app/api/${route}/route.ts`);
  if (/\$\{/.test(match[1])) throw new Error(`prompt in ${route} interpolates a value; port it by hand`);
  writeFileSync(join(outDir, `${route}.txt`), match[1]);
  console.log(`wrote ai/prompt/${route}.txt (${match[1].length} chars)`);
}
