/**
 * Verifies the Korean system prompts owned by the Spring backend.
 *
 * The Next.js API routes now proxy to Spring instead of carrying a second copy of each prompt, so
 * there is nothing left to export from TypeScript. Keeping this command in the domain-data check
 * still catches a missing or accidentally emptied resource without pretending the proxy routes are
 * a source of truth.
 *
 * Usage, from the repository root:
 *   node backend/tools/export-prompts.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = join(repoRoot, 'backend/src/main/resources/ai/prompt');
const routes = ['draft', 'import', 'quality', 'annual', 'calendar-check'];

for (const route of routes) {
  const prompt = readFileSync(join(outDir, `${route}.txt`), 'utf8');
  if (!prompt.trim()) throw new Error(`prompt resource is empty: ai/prompt/${route}.txt`);
  console.log(`verified ai/prompt/${route}.txt (${prompt.length} chars)`);
}
