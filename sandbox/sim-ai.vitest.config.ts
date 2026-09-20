// Dev-only vitest config for sandbox/sim-ai-dev.test.ts (AI flow with stand-in flight/missile models).
// Run: npx vitest run --config sandbox/sim-ai.vitest.config.ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  test: { environment: 'node', include: ['sandbox/sim-ai-*.test.ts'], root: fileURLToPath(new URL('..', import.meta.url)) },
});
