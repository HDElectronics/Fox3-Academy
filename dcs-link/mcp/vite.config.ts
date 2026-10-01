// Bundles the DCS MCP server for Node: npm run dcs-mcp:build → dcs-link/mcp/dist/fox3-dcs-mcp.mjs.
// The app modules it reuses (src/dcs, src/copilot, src/sim, src/data) are bundled; npm packages stay external
// and load from node_modules.
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  publicDir: false,
  build: {
    ssr: fileURLToPath(new URL('./server.ts', import.meta.url)),
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    rolldownOptions: { output: { entryFileNames: 'fox3-dcs-mcp.mjs', format: 'es' } },
  },
  logLevel: 'warn',
});
