/**
 * [OWNER: page-rwr-trainer] Anatomy guide: the parts of the selected jet's RWR, where they sit on the
 * display (in the display's 0..100 square, matching src/ui/displays/rwr/*), and a numbered SVG
 * overlay that points at them. Symbol parts (code, hat, diamond, lock, launch, M) follow the live
 * contacts, so the guide points at what the sandbox is showing right now.
 */
import type { RwrId } from '../../data/types';
import { RWRS } from '../../data/rwr';
import { AIRCRAFT } from '../../data/aircraft';
import type { RwrContact } from '../../sim/types';
import { scopeRadius, spoLamps, SPO_FWD_LAMPS } from '../../ui/displays/geometry';
import { symbolGroups } from './quiz';
import { isAircraft } from './threats';

export type Shape =
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'ring'; r: number };

export interface Part {
  id: string;
  title: string;
  text: string;
  /** Where it is now; null = not on the display at the moment (see `missing`). */
  shape: Shape | null;
  missing?: string;
  /** Preferred direction to push the numbered badge (default: outward from the centre). */
  dir?: [number, number];
  /** Fixed badge position (display units), for parts whose outward push would land on other text. */
  badge?: { x: number; y: number };
}

const SVG = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------------------------------- SPO-15

/** Lamp centre, as spo15.ts draws it: arc centre (50, 60), radius 40 (big) / 32.6 (small), angle x 0.88. */
function spoLamp(deg: number, small = false): { x: number; y: number } {
  const a = (deg * 0.88 * Math.PI) / 180;
  const r = small ? 40 - 7.4 : 40;
  return { x: 50 + Math.sin(a) * r, y: 60 - Math.cos(a) * r };
}
function spoLampPos(i: number, small: boolean): { x: number; y: number } {
  if (i === 8) return small ? { x: 23.5, y: 80.5 } : { x: 16, y: 76 };
  if (i === 9) return small ? { x: 76.5, y: 80.5 } : { x: 84, y: 76 };
  return spoLamp(SPO_FWD_LAMPS[i], small);
}

function spoParts(ranked: readonly RwrContact[]): Part[] {
  const prim = ranked[0];
  const sec = ranked.slice(1).find(c => spoLamps(c.bearing).every(i => i < 8)) ?? ranked[1];
  const big = prim ? spoLampPos(spoLamps(prim.bearing)[0], false) : spoLamp(30);
  const small = sec ? spoLampPos(spoLamps(sec.bearing)[0], true) : spoLamp(50, true);
  return [
    { id: 'dir', title: 'Direction lamps', shape: { kind: 'circle', ...big, r: 5.2 },
      text: 'Eight lamps: 10, 30, 50 and 90° on each side. The big yellow one is the primary threat; between two angles both light.' },
    { id: 'sec', title: 'Small green lamps', shape: { kind: 'circle', ...small, r: 2.8 }, dir: [small.x < 50 ? 0.35 : -0.35, 1],
      text: 'The other threats. A green lamp gives a bearing and nothing else: no type, no lock, no elevation.' },
    { id: 'rear', title: 'Rear quadrant lamps', shape: { kind: 'circle', x: 84, y: 76, r: 5.2 },
      text: 'Two lamps cover everything behind the 90° lamps. 4 and 6 o\'clock look the same here.' },
    { id: 'power', title: 'Power column', shape: { kind: 'rect', x: 47.5, y: 31, w: 5, h: 37 }, dir: [1, -0.4],
      text: 'Signal strength of the primary threat. It climbs as he closes and jumps when an active missile appears. A hint, not a range.' },
    { id: 'elev', title: 'В / Н lamps', shape: { kind: 'circle', x: 27, y: 58, r: 5.6 }, dir: [-0.6, 1],
      text: 'В: the primary threat is above you. Н: below. Both lit: within about 15° of your level.' },
    { id: 'red', title: 'Red lamp', shape: { kind: 'circle', x: 50, y: 78.5, r: 5.6 }, dir: [1, -0.25],
      text: 'Steady: lock. Flashing: SARH launch (here it also flashes for an active missile; simplified). It always belongs to the primary threat.' },
    { id: 'type', title: 'Type letters', shape: { kind: 'rect', x: 14, y: 86.4, w: 72, h: 7.2 },
      text: 'П airborne radar (every fighter, and an active missile), З long-range SAM, Х medium SAM, Н short SAM, F early warning, С AWACS. Yellow = primary, green = the others.' },
  ];
}

// ---------------------------------------------------------------------------------------- scopes

const R = 44;
const RING_TEXT: Record<Exclude<RwrId, 'spo15'>, { r: number; text: string }> = {
  alr56c: { r: 0.42, text: 'In DCS, distance from the centre is signal strength: stronger nearer the centre. Not range, not lethality. Locks, launches and M sit in the inner ring; EW and AWACS never do.' },
  alr67: { r: 0.86, text: 'Outer band = critical (lock, launch, M). Middle = lethal (search). Inner = non-lethal. The opposite of the Viper.' },
  alr56m: { r: 0.34, text: 'Nearer the centre = more lethal: search on the outer ring, track (boxed) just outside the solid circle, guidance inside it. The opposite of the Hornet.' },
  jf17rwr: { r: 0.6, text: 'Inner ring = lethal (tracking you), outer ring = non-lethal (search). Colour carries the state too: yellow search, red lock.' },
  serval: { r: 0.36, text: 'Nearer the centre = more dangerous, not closer. High-threat zone inside, low-threat outside.' },
};

const LAMPS: Partial<Record<RwrId, { shape: Shape; badge: { x: number; y: number }; text: string }>> = {
  alr67: { shape: { kind: 'rect', x: 1, y: 1, w: 98, h: 5.5 }, badge: { x: 10, y: 3.8 }, text: 'AI: steady when an airborne radar locks you, flashing on its launch. CW: continuous-wave illumination, probably guiding a missile.' },
  alr56m: { shape: { kind: 'rect', x: 1, y: 93.5, w: 98, h: 5.5 }, badge: { x: 17, y: 96.2 }, text: 'LAUNCH flashes on a launch or an active missile. ACT/PWR lights when a radar tracks you.' },
  jf17rwr: { shape: { kind: 'rect', x: 1, y: 93.5, w: 15, h: 5.5 }, badge: { x: 19.5, y: 96.2 }, text: 'MSL LCH: missile launch warning, also shown on the HUD.' },
  serval: { shape: { kind: 'rect', x: 1, y: 1, w: 98, h: 5.5 }, badge: { x: 10, y: 3.8 }, text: 'DA: the RWR is working. D2M: the missile launch detector (up to two warnings at once).' },
};

function pos(rwr: RwrId, c: RwrContact, rank: number): { x: number; y: number } {
  const rr = scopeRadius(rwr, c, rank) * R;
  return { x: 50 + Math.sin(c.bearing) * rr, y: 50 - Math.cos(c.bearing) * rr };
}

function scopeParts(rwr: Exclude<RwrId, 'spo15'>, ranked: readonly RwrContact[], t: number): Part[] {
  const spec = RWRS[rwr];
  const find = (f: (c: RwrContact) => boolean) => {
    const i = ranked.findIndex(f);
    return i < 0 ? null : { c: ranked[i], p: pos(rwr, ranked[i], i) };
  };
  const air = find(c => c.emitterType !== 'missile');
  const searches = ranked.map((c, i) => ({ c, p: pos(rwr, c, i), i })).filter(x => x.c.state === 'search');
  const isJet = (c: RwrContact) => c.emitterType !== 'missile' && c.emitterType !== 'unknown' && isAircraft(c.emitterType);
  const airborne = (c: RwrContact) => isJet(c) || c.emitterType === 'awacs';
  const codeAt = searches.find(x => x.i > 0 && isJet(x.c)) ?? searches.find(x => x.i > 0) ?? air;
  const hatAt = searches.find(x => x !== codeAt && x.i > 0 && airborne(x.c))
    ?? (codeAt && airborne(codeAt.c) ? codeAt : searches.find(x => airborne(x.c)) ?? null);
  const lock = find(c => c.state === 'lock');
  const launch = find(c => c.state === 'launch');
  const missile = find(c => c.state === 'missile');
  const top = ranked[0] ? { c: ranked[0], p: pos(rwr, ranked[0], 0) } : null;
  const fresh = find(c => t - c.firstSeen < 2.5);
  const ring = RING_TEXT[rwr];
  const groups = symbolGroups(rwr);
  const codes = groups.filter(g => g.kinds.some(isAircraft)).slice(0, 5).map(g => {
    const jets = g.kinds.filter(isAircraft);
    return `${g.symbol} ${jets.length > 2 ? `${AIRCRAFT[jets[0]].short} family` : jets.map(k => AIRCRAFT[k].short).join(', ')}`;
  }).join(' · ');
  const sams = groups.filter(g => !g.hat && g.kinds.some(k => k.startsWith('sam-'))).map(g => g.symbol);
  const ground = sams.length && rwr !== 'jf17rwr' ? ` Ground radars (${sams.join(', ')}) wear no hat.` : '';

  const parts: Part[] = [
    { id: 'rings', title: rwr === 'alr67' ? 'Bands' : 'Rings', shape: { kind: 'ring', r: ring.r * R }, text: ring.text },
    { id: 'own', title: 'You', shape: { kind: 'circle', x: 50, y: 50, r: 4 }, dir: [0.7, 0.7],
      text: 'Your jet, nose up. A symbol\'s angle is its bearing; the ticks are every 30°, one clock hour each.' },
    { id: 'code', title: 'Threat code', shape: codeAt ? { kind: 'circle', ...codeAt.p, r: 4.6 } : null, missing: 'Add a threat to see a code.',
      text: `The code names the radar type: ${codes}.${ground}` },
  ];
  if (rwr === 'jf17rwr') {
    parts.push({ id: 'frame', title: 'Threat frame', shape: top && top.c.state !== 'missile' ? { kind: 'circle', ...top.p, r: 5.5 } : air ? { kind: 'circle', ...air.p, r: 5.5 } : null,
      missing: 'Add a threat to see it.',
      text: 'Air threats use rectangles; known surface threats use circles. Four outward ticks mark the main threat.' });
  } else {
    parts.push(
      { id: 'hat', title: 'Airborne hat', shape: hatAt ? { kind: 'circle', x: hatAt.p.x, y: hatAt.p.y - 3, r: 3.4 } : null, dir: [0.3, -1], missing: 'Add a threat to see it.',
        text: 'The hat marks an airborne radar. Ground radars have none: 15 with a hat is an F-15, without one an SA-15.' },
      { id: 'diamond', title: 'Priority diamond', shape: top ? { kind: 'circle', ...top.p, r: 5.4 } : null, missing: 'Add a threat to see it.',
        text: 'The diamond marks the priority threat: missile or launch first, then lock, then type and strength.' },
      { id: 'new', title: 'New threat mark', shape: fresh ? { kind: 'circle', x: fresh.p.x, y: fresh.p.y - 1, r: 6.2 } : null,
        missing: 'Shows for a few seconds when a threat appears: add one.',
        text: 'An upper semicircle marks a threat that just appeared, for a few seconds.' },
    );
  }
  parts.push(
    { id: 'lock', title: 'Lock', shape: lock ? { kind: 'circle', ...lock.p, r: 5.4 } : null, missing: 'Set a threat to Lock to see it.', text: spec.cues.lock },
    { id: 'launch', title: 'Launch', shape: launch ? { kind: 'circle', ...launch.p, r: 6 } : null, missing: 'Set a threat to Launch to see it.', text: spec.cues.launch },
    { id: 'missile', title: 'Active missile', shape: missile ? { kind: 'circle', ...missile.p, r: 6 } : null, missing: 'Set a threat to Missile active to see it.', text: spec.cues.missile },
  );
  const lamps = LAMPS[rwr];
  if (lamps) parts.push({ id: 'lamps', title: 'Warning lamps', shape: lamps.shape, badge: lamps.badge, text: lamps.text });
  if (rwr === 'alr67') parts.push({
    id: 'sam-lamp', title: 'SAM lamp', shape: { kind: 'rect', x: 1, y: 93.5, w: 15, h: 5.5 }, badge: { x: 19.5, y: 96.2 },
    text: 'Steady when a surface-to-air radar locks you; flashing here when that surface threat launches.',
  });
  return parts;
}

/** Symbol and lamp centres the numbered badges should not cover (display units). */
export function obstaclesFor(rwr: RwrId, ranked: readonly RwrContact[]): { x: number; y: number }[] {
  if (rwr === 'spo15') {
    const out = [...SPO_FWD_LAMPS.map(d => spoLamp(d)), { x: 16, y: 76 }, { x: 84, y: 76 }, { x: 50, y: 78.5 }, { x: 27, y: 58 }];
    for (let i = 0; i < 6; i++) out.push({ x: 50 + (i - 2.5) * 12.4, y: 90 });
    return out;
  }
  return ranked.map((c, i) => pos(rwr, c, i));
}

export function anatomyFor(rwr: RwrId, ranked: readonly RwrContact[], t: number): Part[] {
  return rwr === 'spo15' ? spoParts(ranked) : scopeParts(rwr, ranked, t);
}

// ---------------------------------------------------------------------------------------- overlay

function anchorOf(s: Shape, i: number): { ax: number; ay: number; push: number } {
  if (s.kind === 'ring') {
    const a = ((200 + i * 3) * Math.PI) / 180;
    return { ax: 50 + Math.sin(a) * s.r, ay: 50 - Math.cos(a) * s.r, push: 5 };
  }
  if (s.kind === 'rect') return { ax: s.x + s.w / 2, ay: s.y + s.h / 2, push: Math.min(s.h, s.w) / 2 + 4.2 };
  return { ax: s.x, ay: s.y, push: s.r + 4.2 };
}

const BADGE_GAP = 6.4;

/**
 * Where each numbered badge goes: pushed out from its part (outward from the centre, or the part's
 * preferred direction), rotated in steps until it clears the badges already placed and the glass edge.
 */
function placeBadges(parts: readonly Part[], obstacles: readonly { x: number; y: number }[]): ({ x: number; y: number; ax: number; ay: number } | null)[] {
  const placed: { x: number; y: number }[] = [];
  return parts.map((p, i) => {
    const s = p.shape;
    if (!s) return null;
    const { ax, ay, push } = anchorOf(s, i);
    if (p.badge) { placed.push(p.badge); return { ...p.badge, ax, ay }; }
    let dx: number, dy: number;
    if (p.dir) { [dx, dy] = p.dir; }
    else if (s.kind === 'rect' && s.w > 40) { dx = 1; dy = 0; }
    else { dx = ax - 50; dy = ay - 50; if (Math.hypot(dx, dy) < 1) { dx = 0.7; dy = -0.7; } }
    const n = Math.hypot(dx, dy) || 1;
    dx /= n; dy /= n;
    const base = Math.atan2(dy, dx);
    const wide = s.kind === 'rect' && s.w > 40;
    let best = { x: 0, y: 0 }, bestScore = -Infinity;
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
      const a = base + (k * 38 * Math.PI) / 180;
      let x = ax + Math.cos(a) * push, y = ay + Math.sin(a) * push;
      if (wide && k === 0) { x = s.x + s.w + 3.6; y = ay; if (x > 96.8) x = s.x - 3.6; }
      const inside = x >= 3.2 && x <= 96.8 && y >= 3.2 && y <= 96.8;
      const clear = placed.reduce((m, q) => Math.min(m, Math.hypot(q.x - x, q.y - y)), Infinity);
      // Symbols and lamps other than the part itself should stay visible.
      const onSymbol = obstacles.reduce((m, q) => (Math.hypot(q.x - ax, q.y - ay) < 1.5 ? m : Math.min(m, Math.hypot(q.x - x, q.y - y))), Infinity);
      const score = (inside ? 0 : -100) + Math.min(clear, BADGE_GAP) * 10 + Math.min(onSymbol, 5.5) * 6 - Math.abs(k);
      if (score > bestScore) { bestScore = score; best = { x, y }; }
      if (inside && clear >= BADGE_GAP && onSymbol >= 5.5) break;
    }
    best.x = Math.max(3.2, Math.min(96.8, best.x));
    best.y = Math.max(3.2, Math.min(96.8, best.y));
    placed.push(best);
    return { ...best, ax, ay };
  });
}

export class AnatomyOverlay {
  readonly el: SVGSVGElement;
  private sig = '';
  private active: string | null = null;
  private visible = true;

  constructor() {
    this.el = document.createElementNS(SVG, 'svg');
    this.el.setAttribute('viewBox', '0 0 100 100');
    this.el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.el.setAttribute('class', 'rwrt-anat ui-fill');
    this.el.setAttribute('aria-hidden', 'true');
  }

  setVisible(v: boolean): void { this.visible = v; this.el.style.display = v ? '' : 'none'; }
  get shown(): boolean { return this.visible; }

  /** Redraw when the parts moved or the highlighted part changed (cheap to call at a few Hz). */
  update(parts: readonly Part[], active: string | null, obstacles: readonly { x: number; y: number }[] = []): void {
    const sig = active + '|' + parts.map(p => p.id + ':' + (p.shape ? JSON.stringify(p.shape, (_k, v) => (typeof v === 'number' ? Math.round(v * 2) / 2 : v)) : '-')).join(';');
    if (sig === this.sig) return;
    this.sig = sig;
    this.active = active;
    const svg = this.el;
    svg.replaceChildren();
    const badges = placeBadges(parts, obstacles);
    parts.forEach((p, i) => {
      const b = badges[i];
      if (!p.shape || !b) return;
      const s = p.shape;
      const on = p.id === this.active;
      const g = document.createElementNS(SVG, 'g');
      g.setAttribute('class', 'rwrt-anat__part' + (on ? ' is-on' : ''));
      if (on) {
        let hl: SVGElement;
        if (s.kind === 'circle') { hl = document.createElementNS(SVG, 'circle'); set(hl, { cx: s.x, cy: s.y, r: s.r + 1 }); }
        else if (s.kind === 'rect') { hl = document.createElementNS(SVG, 'rect'); set(hl, { x: s.x - 1, y: s.y - 1, width: s.w + 2, height: s.h + 2, rx: 1.2 }); }
        else { hl = document.createElementNS(SVG, 'circle'); set(hl, { cx: 50, cy: 50, r: s.r }); }
        hl.setAttribute('class', 'rwrt-anat__hl');
        g.append(hl);
      }
      const line = document.createElementNS(SVG, 'line');
      const dx = b.x - b.ax, dy = b.y - b.ay, d = Math.hypot(dx, dy) || 1;
      // Leader from the part's edge (nearest point of a rectangle, circle rim) to the badge.
      const x1 = s.kind === 'rect' ? Math.max(s.x, Math.min(s.x + s.w, b.x)) : b.ax + (dx / d) * (s.kind === 'circle' ? s.r : 0);
      const y1 = s.kind === 'rect' ? Math.max(s.y, Math.min(s.y + s.h, b.y)) : b.ay + (dy / d) * (s.kind === 'circle' ? s.r : 0);
      set(line, { x1, y1, x2: b.x, y2: b.y });
      line.setAttribute('class', 'rwrt-anat__lead');
      const c = document.createElementNS(SVG, 'circle');
      set(c, { cx: b.x, cy: b.y, r: 2.7 });
      c.setAttribute('class', 'rwrt-anat__badge');
      const tx = document.createElementNS(SVG, 'text');
      set(tx, { x: b.x, y: b.y + 1.05 });
      tx.setAttribute('class', 'rwrt-anat__num');
      tx.textContent = String(i + 1);
      g.append(line, c, tx);
      svg.append(g);
    });
  }
}

function set(el: Element, attrs: Record<string, number>): void {
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(Math.round(v * 100) / 100));
}
