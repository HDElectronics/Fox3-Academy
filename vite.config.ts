import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath, URL } from 'node:url';

// Two production builds share this config:
// - default (`npm run build`): the whole app, three.js included, inlines into one dist/index.html that opens
//   offline or from any static host. Dynamic page imports are inlined too.
// - web (`npm run build:web`, mode "web"): code split for normal static hosts. The shell loads first, each
//   route in src/app/routes.ts is its own chunk, and three.js is a shared vendor chunk, all in dist-web/.
// `npm run dev` serves the app normally in either case.
export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  return {
    base: './',
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    plugins: web ? [] : [viteSingleFile()],
    build: web
      ? {
          target: 'es2022',
          outDir: 'dist-web',
          rolldownOptions: {
            output: { codeSplitting: { groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }] } },
          },
        }
      : { target: 'es2022', chunkSizeWarningLimit: 4000, assetsInlineLimit: 100_000_000 },
    test: { environment: 'node', include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
  };
}) as any;
