// Dev-only vitest config for the sortie reviewer's print harness (sandbox/sortie-*.test.ts).
// Run: npx vitest run --config sandbox/sortie.vitest.config.ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  test: { environment: 'node', include: ['sandbox/sortie-*.test.ts'], root: fileURLToPath(new URL('..', import.meta.url)) },
});
