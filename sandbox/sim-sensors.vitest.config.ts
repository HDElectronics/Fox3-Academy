import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
// Probe runner for sim-sensors (not part of npm test): npx vitest run -c sandbox/sim-sensors.vitest.config.ts
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  test: { environment: 'node', include: ['sandbox/sim-sensors-*.test.ts'], root: fileURLToPath(new URL('..', import.meta.url)) },
});
