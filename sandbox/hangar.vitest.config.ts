import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['sandbox/hangar-*.test.ts'] } });
