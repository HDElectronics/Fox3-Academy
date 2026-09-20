import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath, URL } from 'node:url';

// Single-file build: the whole app (three.js included) inlines into dist/index.html,
// suitable for deployment on any static host. `npm run dev` serves it normally.
export default defineConfig({
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [viteSingleFile()],
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, assetsInlineLimit: 100_000_000 },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
} as any);
