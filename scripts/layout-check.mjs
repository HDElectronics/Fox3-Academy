#!/usr/bin/env node
/**
 * Layout check: visits every route in headless Chrome at a desktop and a tablet width and reports
 *   - clipped controls: a visible cap, segment, lesson step, Next cap, key, select, slider head or readout row
 *     whose text is wider (or, for caps, taller) than its box, the "never clip a control's text" rule;
 *   - horizontal page scroll;
 *   - console errors, failed loads and uncaught exceptions.
 * Each page is measured as it opens, then again with every disclosure (<details>) open.
 * Exit 0 when clean, 1 with a list (route, width, element, sizes) when not, 2 when the check itself cannot run.
 *
 *   npm run check:layout                         # every route, 1440x900 and 820x1180
 *   npm run check:layout -- --only sortie        # visits whose URL contains "sortie" (e.g. "ac=jf17", "shot=fly")
 *   npm run check:layout -- --width 820          # one width (1440 and 820 use their usual heights, others 900)
 *   npm run check:layout -- --jobs 2 --verbose   # fewer parallel browsers, one line per visit
 *   npm run check:layout -- --list               # print the visits and stop
 *   SHOT_PORT=5191 npm run check:layout          # dev server port, as scripts/shot.sh (default 5190)
 *   CHROME=/path/to/chrome npm run check:layout  # another Chrome or Chromium binary
 *
 * Uses the dev server on SHOT_PORT and starts one (and stops it at the end) when none is running; --base <url>
 * points it at another server instead, e.g. `npm run preview:web`. Each visit is a fresh document load with empty
 * storage, as a first-time visitor sees it; parallel jobs run in separate headless Chromes (see launchChrome).
 * No npm dependencies: Chrome DevTools Protocol over Node's built-in WebSocket and fetch (Node 22 or newer).
 *
 * Route coverage: routes are parsed from src/app/routes.ts (one `{ path: '...', ... }` entry per line, with its
 * optional `roles` and `jets`) and jet ids from src/data/types.ts, so a new route or jet is visited without
 * editing this script. The script cannot import the TypeScript sources, and both files are plain tables, so a
 * small parser is enough; it stops with an error if it finds no routes or a route line it cannot read.
 * Page states that reveal more controls (a lesson, a ?shot= pre-roll, lab=free) are listed in EXTRA below:
 * add one when a page gains a state with controls of its own.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------------------------- what to visit

/** Viewports: a laptop and a tablet / narrow window (AGENTS.md, "Visual checks"). */
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 820, height: 1180 }];

/**
 * Jets visited on every route that accepts them: both cockpit skins (su27 metric, Russian paint), the multi-target
 * US jets, the edge cases (f14b, m2000c, jf17) and both attack jets. A route that names its own `jets` gets those.
 */
const SAMPLE_JETS = ['su27', 'f15c', 'fa18c', 'f14b', 'm2000c', 'jf17', 'su25t', 'a10c'];

/**
 * Extra states per route, each visited at both widths. `jets`: 'every' = every jet the route accepts,
 * a list = those jets (when the route accepts them), omitted = the first sample jet the route accepts.
 */
const EXTRA = {
  hangar: [],
  practice: [],
  radar: [{ q: 'lab=free' }],
  tws: [{ q: 'lab=free', jets: ['f15c', 'su27'] }],
  missiles: [{ q: 'lab=free' }],
  defense: [{ q: 'lab=free' }],
  'flight-ops': [{ q: 'mode=fly' }, { q: 'shot=debrief' }],
  merge: [{ q: 'lab=free' }, { q: 'shot=debrief' }],
  strike: [{ q: 'lesson=sortie' }, { q: 'shot=debrief' }, { q: 'lesson=sortie&shot=debrief' }],
  tgp: [{ q: 'shot=mav-page' }, { q: 'shot=debrief' }],
  cas: [{ q: 'shot=card', jets: ['su25t'] }, { q: 'shot=debrief', jets: ['su25t'] }, { q: 'shot=a10-cdu', jets: ['a10c'] }, { q: 'shot=a10-debrief', jets: ['a10c'] }],
  jdam: [{ q: 'shot=hit' }],
  atflir: [{ q: 'shot=track' }],
  harm: [{ q: 'shot=live' }, { q: 'shot=appendix' }],
  rwr: [{ q: 'mode=quiz' }],
  // The fly screen has the most caps of any page and every jet labels them with its own keys.
  sortie: [{ q: 'shot=fly', jets: 'every' }, { q: 'shot=debrief', jets: ['f15c', 'su27'] }],
};

// ---------------------------------------------------------------------------------------------- what to measure

/**
 * Elements that must show all of their text: the controls, and the parts inside them that clip on their own
 * (a legend with overflow hidden, the Next text, a slider's label and readout), plus readout rows and bezel labels.
 */
const CONTROLS = [
  'button', 'a.ui-btn', '.ui-seg__opt', '.ui-chip', '.ui-tab', '.ui-switch', '.ui-lessons__item', '.ui-lessons__free',
  '.pathbar__step', '.pathnext', '.ui-btn__legend', '.ui-btn__keys', '.ui-seg__legend', '.pathnext__text',
  '.ui-slider', '.ui-slider__head', '.ui-readouts dt', '.ui-readouts dd', '.ui-bezel__label', 'kbd', 'select',
].join(', ');
/** Caps also fail when their content is taller than the cap (a legend that wrapped inside a fixed height). */
const CAPS = 'button, a.ui-btn, .ui-seg__opt, .ui-chip, .ui-tab, .pathbar__step, .pathnext';
/**
 * Deliberate exclusions:
 *   .ui-sr          screen-reader-only text, clipped to 1 px on purpose;
 *   .ui-tabs__list  a scroll strip: tabs that do not fit scroll into view (the tabs themselves are still checked);
 *   any element that is itself a scroll container (overflow auto or scroll): its overflow is reachable.
 */
const EXCLUDE = '.ui-sr, .ui-tabs__list';
/** Console noise that is not a page defect: SwiftShader and WebGL driver chatter in headless Chrome. */
const CONSOLE_NOISE = [/GL Driver Message/i, /GPU stall due to ReadPixels/i, /\[\.WebGL-[^\]]*\]/i, /swiftshader/i];

// ---------------------------------------------------------------------------------------------- options

const args = process.argv.slice(2);
const opt = { only: [], width: null, jobs: Math.max(1, Math.min(6, Math.floor(availableParallelism() / 2))), base: null, verbose: false, settle: 900 };
for (let i = 0; i < args.length; i++) {
  const a = args[i], next = () => { const v = args[++i]; if (v === undefined) usage(`${a} needs a value`); return v; };
  if (a === '--only') opt.only.push(next());
  else if (a === '--width') opt.width = Number(next());
  else if (a === '--jobs') opt.jobs = Math.max(1, Number(next()) || 1);
  else if (a === '--base') opt.base = next().replace(/\/$/, '');
  else if (a === '--settle') opt.settle = Math.max(0, Number(next()) || 0);
  else if (a === '--verbose' || a === '-v') opt.verbose = true;
  else if (a === '--list') opt.list = true;
  else if (a === '--help' || a === '-h') usage();
  else usage(`unknown option ${a}`);
}
if (opt.width !== null && !(opt.width >= 500)) usage('--width must be a number of CSS px, at least 500 (headless Chrome lays out no narrower)');

function usage(err) {
  // The usage is the top of this file's header comment, up to "Uses the dev server".
  const head = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2);
  const text = head.slice(0, head.findIndex(l => l.includes('Uses the dev server'))).map(l => l.replace(/^ \* ?/, '')).join('\n');
  (err ? process.stderr : process.stdout).write((err ? `layout-check: ${err}\n\n` : '') + text + '\n');
  process.exit(err ? 2 : 0);
}

const PORT = Number(process.env.SHOT_PORT || 5190);
const BASE = opt.base ?? `http://localhost:${PORT}`;

// ---------------------------------------------------------------------------------------------- route table

function parseUnion(src, name) {
  const m = src.match(new RegExp(`export type ${name}\\s*=([^;]+);`));
  return m ? [...m[1].matchAll(/'([\w-]+)'/g)].map(x => x[1]) : [];
}
function readJets() {
  const src = readFileSync(join(ROOT, 'src/data/types.ts'), 'utf8');
  const fighter = parseUnion(src, 'FighterId'), attack = parseUnion(src, 'AttackId');
  if (!fighter.length || !attack.length) fail('could not read FighterId / AttackId from src/data/types.ts');
  return { fighter, attack };
}
function readRoutes() {
  const src = readFileSync(join(ROOT, 'src/app/routes.ts'), 'utf8');
  const body = src.slice(src.indexOf('export const ROUTES'));
  const list = (s, key) => { const m = s.match(new RegExp(`\\b${key}:\\s*\\[([^\\]]*)\\]`)); return m ? [...m[1].matchAll(/'([\w-]+)'/g)].map(x => x[1]) : null; };
  const routes = [];
  for (const line of body.split('\n')) {
    if (!/^\s*\{\s*path:/.test(line)) continue;
    const path = line.match(/path:\s*'([\w-]+)'/)?.[1];
    if (!path) fail(`cannot read a route in src/app/routes.ts: ${line.trim().slice(0, 100)}`);
    routes.push({ path, roles: list(line, 'roles') ?? ['fighter'], jets: list(line, 'jets') });
  }
  if (!routes.length) fail('found no routes in src/app/routes.ts (expected one `{ path: ... }` entry per line)');
  return routes;
}

function buildVisits() {
  const jets = readJets(), routes = readRoutes();
  const known = new Set([...jets.fighter, ...jets.attack]);
  for (const j of SAMPLE_JETS) if (!known.has(j)) fail(`sample jet ${j} is not in src/data/types.ts`);
  const visits = [];
  for (const r of routes) {
    const accepts = r.jets ?? r.roles.flatMap(role => jets[role] ?? []);
    if (!accepts.length) fail(`route ${r.path} accepts no jet`);
    const sample = SAMPLE_JETS.filter(j => accepts.includes(j));
    const base = sample.length ? sample : accepts;
    const states = [{ q: '', jets: base }];
    for (const e of EXTRA[r.path] ?? []) {
      const js = e.jets === 'every' ? accepts : e.jets ? e.jets.filter(j => accepts.includes(j)) : [base[0]];
      states.push({ q: e.q, jets: js });
    }
    for (const s of states) for (const jet of s.jets) {
      const url = `#/${r.path}?ac=${jet}${s.q ? '&' + s.q : ''}`;
      for (const vp of VIEWPORTS) visits.push({ route: r.path, url, ...vp });
    }
  }
  const widths = opt.width ? [{ width: opt.width, height: VIEWPORTS.find(v => v.width === opt.width)?.height ?? 900 }] : null;
  let out = visits;
  if (widths) out = [...new Map(visits.map(v => [v.url, { ...v, ...widths[0] }])).values()];
  if (opt.only.length) out = out.filter(v => opt.only.some(s => v.url.includes(s)));
  return out;
}

// ---------------------------------------------------------------------------------------------- processes

/** What this run started, stopped on any exit: connections, then each Chrome and its profile, then the server. */
const owned = { cdps: [], chromes: [], vite: null };
let cleaned = false;
function shutdown() {
  if (cleaned) return;
  cleaned = true;
  for (const c of owned.cdps) c.close();
  for (const c of owned.chromes) killGroup(c.proc);
  for (const c of owned.chromes) {
    try { rmSync(c.profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* left in tmp */ }
  }
  if (owned.vite) killGroup(owned.vite);
}
process.on('exit', shutdown);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { shutdown(); process.exit(130); });

function fail(msg) { process.stderr.write(`layout-check: ${msg}\n`); shutdown(); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function killGroup(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
}

async function reachable(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(2000) }); return r.ok; } catch { return false; }
}

async function ensureServer() {
  if (await reachable(BASE + '/')) return;
  if (opt.base) fail(`no server at ${BASE}`);
  process.stderr.write(`layout-check: starting the dev server on :${PORT}\n`);
  const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, detached: true, stdio: 'ignore' });
  owned.vite = vite;
  for (let i = 0; i < 120; i++) {
    if (await reachable(BASE + '/')) return;
    if (vite.exitCode !== null) fail(`the dev server exited (code ${vite.exitCode}); is port ${PORT} taken?`);
    await sleep(250);
  }
  fail(`the dev server did not answer on :${PORT}`);
}

function findChrome() {
  const names = [process.env.CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
  for (const n of names) {
    if (n.includes('/') || n.includes('\\')) { if (existsSync(n)) return n; continue; }
    for (const dir of (process.env.PATH ?? '').split(delimiter)) if (dir && existsSync(join(dir, n))) return join(dir, n);
  }
  fail('Chrome not found: set CHROME=/path/to/chrome');
}

/**
 * One headless Chrome per parallel job: WebGL runs on SwiftShader in the browser's single GPU process, so tabs
 * of one Chrome take turns on it, while separate Chromes render in parallel. Returns its DevTools socket URL.
 */
async function launchChrome(binary) {
  const profile = mkdtempSync(join(tmpdir(), 'fox3-layout-'));
  // The WebGL flags are scripts/shot.sh's.
  const proc = spawn(binary, [
    '--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio', '--hide-scrollbars',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    'about:blank',
  ], { detached: true, stdio: 'ignore' });
  owned.chromes.push({ proc, profile });
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200; i++) {
    if (existsSync(portFile)) {
      const [port, path] = readFileSync(portFile, 'utf8').split('\n');
      if (port && path) return `ws://127.0.0.1:${port.trim()}${path.trim()}`;
    }
    if (proc.exitCode !== null) fail(`Chrome exited at start (code ${proc.exitCode})`);
    await sleep(100);
  }
  fail('Chrome did not open its DevTools port');
}

// ---------------------------------------------------------------------------------------------- CDP

class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.sessions = new Map(); }
  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = () => reject(new Error('cannot connect to Chrome')); });
    this.ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id !== undefined) {
        const p = this.pending.get(d.id);
        if (!p) return;
        this.pending.delete(d.id);
        if (d.error) p.reject(new Error(`${p.method}: ${d.error.message}`)); else p.resolve(d.result);
      } else if (d.sessionId) this.sessions.get(d.sessionId)?.(d.method, d.params);
    };
  }
  send(method, params = {}, sessionId, timeout = 30000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: no answer in ${timeout} ms`)); }, timeout);
      this.pending.set(id, { method, resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  close() { try { this.ws.close(); } catch { /* closed */ } }
}

/** A Chrome with one tab, its storage cleared at every document start. */
async function openTab(binary) {
  const cdp = new Cdp(await launchChrome(binary));
  owned.cdps.push(cdp);
  await cdp.open();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const tab = {
    errors: [], viewport: '',
    send: (m, p, t) => cdp.send(m, p, sessionId, t),
    async eval(expression, timeout = 15000) {
      const r = await tab.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeout);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
  };
  const noise = s => CONSOLE_NOISE.some(re => re.test(s));
  const push = s => { s = s.replace(/\s+/g, ' ').trim().slice(0, 300); if (!noise(s) && !tab.errors.includes(s)) tab.errors.push(s); };
  cdp.sessions.set(sessionId, (method, p) => {
    if (method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'assert')) {
      push('console.error: ' + p.args.map(a => a.value ?? a.description ?? a.type).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      const e = p.exceptionDetails;
      push('uncaught: ' + (e.exception?.description?.split('\n')[0] ?? e.text));
    } else if (method === 'Log.entryAdded' && p.entry.level === 'error') {
      push(`${p.entry.source}: ${p.entry.text}${p.entry.url ? ' ' + p.entry.url : ''}`);
    } else if (method === 'Page.javascriptDialogOpening') {
      push(`dialog: ${p.message}`);
      tab.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
  });
  await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable'].map(m => tab.send(m)));
  await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: DOCUMENT_START });
  await tab.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  return tab;
}

/**
 * Runs before the app in every document: empty storage (a first-time visitor), and the page's animation frames
 * capped at one per FRAME_MS. A SwiftShader frame of a 3D page costs a CPU core for about 150 ms, so uncapped
 * pages in parallel Chromes starve each other; layout does not depend on the frame rate. All callbacks of one
 * frame share its timestamp, so every rAF loop of the page runs in the same allowed frame; cancelAnimationFrame
 * keeps working through the id map. The check itself waits on the uncapped rAF (window.__layoutCheckRaf).
 */
const FRAME_MS = 250;
const DOCUMENT_START = `(() => {
  try { localStorage.clear(); sessionStorage.clear(); } catch {}
  const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
  const live = new Map();
  let seq = 0, allowed = -Infinity;
  window.__layoutCheckRaf = raf;
  window.requestAnimationFrame = cb => {
    const id = ++seq;
    const tick = t => {
      if (t !== allowed) {
        if (t - allowed < ${FRAME_MS}) { live.set(id, raf(tick)); return; }
        allowed = t;
      }
      live.delete(id);
      cb(t);
    };
    live.set(id, raf(tick));
    return id;
  };
  window.cancelAnimationFrame = id => { const n = live.get(id); if (n !== undefined) { caf(n); live.delete(id); } };
})();`;

// ---------------------------------------------------------------------------------------------- one visit

/** In the page: the clipped controls and the page's horizontal overflow. */
const MEASURE = `(() => {
  const CONTROLS = ${JSON.stringify(CONTROLS)}, CAPS = ${JSON.stringify(CAPS)}, EXCLUDE = ${JSON.stringify(EXCLUDE)};
  const name = el => {
    const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim();
    return t.slice(0, 60) + (t.length > 60 ? '...' : '');
  };
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    [...el.classList].slice(0, 3).map(c => '.' + c).join('');
  const clipped = [];
  for (const el of document.querySelectorAll(CONTROLS)) {
    if (el.closest(EXCLUDE) || !el.checkVisibility({ visibilityProperty: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    const scrollX = /auto|scroll/.test(cs.overflowX), scrollY = /auto|scroll/.test(cs.overflowY);
    const wide = !scrollX && el.scrollWidth > el.clientWidth + 2;
    const tall = !scrollY && el.matches(CAPS) && el.scrollHeight > el.clientHeight + 2;
    if (wide || tall) clipped.push({
      el: desc(el), text: name(el),
      size: wide ? 'content ' + el.scrollWidth + ' px wide in ' + el.clientWidth + ' px'
                 : 'content ' + el.scrollHeight + ' px tall in ' + el.clientHeight + ' px',
    });
  }
  const se = document.scrollingElement, vw = se.clientWidth;
  let hscroll = null;
  if (se.scrollWidth > vw + 1) {
    // Name the outermost elements that stick out past the right edge.
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 1 || r.width === 0) continue;
      const p = el.parentElement, pr = p && p.getBoundingClientRect();
      if (p && p !== document.body && pr.right > vw + 1) continue;
      out.push(desc(el) + ' right ' + Math.round(r.right));
      if (out.length >= 3) break;
    }
    hscroll = { size: 'page ' + se.scrollWidth + ' px wide in ' + vw + ' px', by: out };
  }
  return { clipped, hscroll };
})()`;

/** Fonts loaded and two rendering updates done (layout, ResizeObserver callbacks). */
const SETTLED = `new Promise(resolve => {
  const raf = window.__layoutCheckRaf ?? requestAnimationFrame;
  setTimeout(() => resolve(false), 5000);
  document.fonts.ready.then(() => raf(() => raf(() => resolve(true))));
})`;

let visitSeq = 0;
async function visit(tab, v) {
  const nonce = `lc${++visitSeq}`;
  if (tab.viewport !== `${v.width}x${v.height}`) {
    await tab.send('Emulation.setDeviceMetricsOverride', { width: v.width, height: v.height, deviceScaleFactor: 1, mobile: false });
    tab.viewport = `${v.width}x${v.height}`;
  }
  tab.errors.length = 0;
  const t0 = Date.now();
  await tab.send('Page.navigate', { url: `${BASE}/?${nonce}${v.url}` });
  const issues = [];
  const deadline = Date.now() + 40000;
  let state = '';
  for (;;) {
    state = await tab.eval(`(() => {
      if (!location.search.includes(${JSON.stringify(nonce)})) return 'navigating';
      const o = document.getElementById('outlet');
      if (!o) return document.querySelector('.phone-gate') ? 'phone gate' : 'loading';
      if (o.querySelector('.page-error')) return 'error: ' + o.innerText.replace(/\\s+/g, ' ').trim();
      if (o.querySelector('.role-gate')) return 'role gate';
      if (!o.dataset.page || o.querySelector('.page-loading')) return 'loading';
      return 'mounted';
    })()`).catch(() => 'navigating');
    if (state === 'mounted' || state.startsWith('error') || state.endsWith('gate')) break;
    if (Date.now() > deadline) { state = 'timeout'; break; }
    await sleep(100);
  }
  if (state !== 'mounted') {
    issues.push({ kind: 'load', text: state === 'timeout' ? 'the page did not mount in 40 s' : state });
    return { ...v, issues, errors: [...tab.errors] };
  }
  const tMount = Date.now();
  await tab.eval(SETTLED, 10000);
  await sleep(opt.settle);
  const seen = new Set();
  const take = m => {
    for (const c of m.clipped) {
      const key = c.el + '|' + c.text;
      if (!seen.has(key)) { seen.add(key); issues.push({ kind: 'clipped', ...c }); }
    }
    if (m.hscroll && !issues.some(i => i.kind === 'hscroll')) issues.push({ kind: 'hscroll', ...m.hscroll });
  };
  take(await tab.eval(MEASURE));
  // Second look with every disclosure open (key lists, accuracy notes, caveats).
  const opened = await tab.eval(`(() => { const d = [...document.querySelectorAll('details:not([open])')].filter(x => x.checkVisibility()); d.forEach(x => { x.open = true; }); return d.length; })()`);
  if (opened) { await tab.eval(SETTLED, 10000); await sleep(150); take(await tab.eval(MEASURE)); }
  await sleep(50); // late console messages from the measurement frame
  return { ...v, issues, errors: [...tab.errors], ms: { mount: tMount - t0, total: Date.now() - t0 } };
}

// ---------------------------------------------------------------------------------------------- run

const visits = buildVisits();
if (!visits.length) fail('no visit matches the options');
if (opt.list) {
  process.stdout.write(visits.map(v => `${v.url}  @ ${v.width}x${v.height}`).join('\n') + `\n${visits.length} visits\n`);
  process.exit(0);
}
const t0 = Date.now();
await ensureServer();
const chrome = findChrome();
const jobs = Math.min(opt.jobs, visits.length);
const tabs = await Promise.all(Array.from({ length: jobs }, () => openTab(chrome)));
const results = new Array(visits.length);
let nextIndex = 0, finished = 0;
const tty = process.stderr.isTTY && !opt.verbose;
await Promise.all(tabs.map(async tab => {
  for (;;) {
    const i = nextIndex++;
    if (i >= visits.length) return;
    const v = visits[i];
    let r;
    try { r = await visit(tab, v); }
    catch (e) {
      // One retry: a dev-server dependency reload or a slow first transform can drop a visit.
      try { r = await visit(tab, v); } catch (e2) { r = { ...v, issues: [{ kind: 'load', text: String(e2.message ?? e2) }], errors: [...tab.errors] }; }
    }
    results[i] = r;
    finished++;
    const bad = r.issues.length + r.errors.length;
    if (opt.verbose) process.stderr.write(`${bad ? 'FAIL' : 'ok  '}  ${v.url} @${v.width}${r.ms ? `  (mounted ${r.ms.mount} ms, done ${r.ms.total} ms)` : ''}\n`);
    else if (tty) process.stderr.write(`\rlayout-check: ${finished}/${visits.length} visits`);
  }
}));
if (tty) process.stderr.write('\n');

const failed = results.filter(r => r.issues.length || r.errors.length);
const lines = [];
for (const r of failed) {
  lines.push(`${r.url}  @ ${r.width}x${r.height}`);
  for (const i of r.issues) {
    if (i.kind === 'clipped') lines.push(`  clipped  "${i.text}"  ${i.size}  (${i.el})`);
    else if (i.kind === 'hscroll') lines.push(`  h-scroll ${i.size}${i.by.length ? '  (' + i.by.join(', ') + ')' : ''}`);
    else lines.push(`  load     ${i.text}`);
  }
  for (const e of r.errors) lines.push(`  console  ${e}`);
}
const secs = ((Date.now() - t0) / 1000).toFixed(0);
const routes = new Set(results.map(r => r.route)).size;
if (lines.length) process.stdout.write(lines.join('\n') + '\n\n');
process.stdout.write(`layout-check: ${results.length} visits over ${routes} routes in ${secs} s: ` +
  (failed.length ? `${failed.length} with problems\n` : 'clean\n'));
shutdown();
process.exit(failed.length ? 1 : 0);
