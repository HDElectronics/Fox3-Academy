// Harness config for the data agent's consistency checks (the project config only includes src/ and tests/).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['sandbox/data-*.test.ts'] },
});
