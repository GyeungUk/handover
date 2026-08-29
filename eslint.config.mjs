import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // `dist/` and `tmp/` hold build output and one-off generation scripts, not application code.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'dist/**', 'tmp/**', 'next-env.d.ts']),
]);

export default eslintConfig;
