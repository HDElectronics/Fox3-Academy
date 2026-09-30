/**
 * Builds the React binding: one ESM bundle, the declaration tree, and the kit's stylesheet.
 * React stays external — the design tooling supplies it.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const styles = join(here, '..', 'src', 'styles');

mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [join(here, 'index.tsx')],
  outfile: join(dist, 'design-system', 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react-dom'],
  logLevel: 'info',
});

execFileSync(join(here, 'node_modules', '.bin', 'tsc'), ['-p', join(here, 'tsconfig.json')], { stdio: 'inherit' });

// The app self-hosts its four families (src/styles/fonts.css). This standalone kit has no font files, so
// its stylesheet loads them from Google Fonts: a design rendered with it gets Russo One, IBM Plex Sans and B612 Mono.
const FONTS = "@import url('https://fonts.googleapis.com/css2?family=Russo+One&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&family=B612+Mono:wght@400;700&display=swap');\n\n";
const sheet = FONTS + ['tokens.css', 'base.css', 'components.css']
  .map(f => `/* ---- src/styles/${f} ---- */\n${readFileSync(join(styles, f), 'utf8')}`)
  .join('\n');
writeFileSync(join(dist, 'styles.css'), sheet);
console.log(`styles.css  ${(sheet.length / 1024).toFixed(1)}kb`);
