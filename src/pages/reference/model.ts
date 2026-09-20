/**
 * [OWNER: page-reference] Pure logic for the Cockpit reference page: bind grouping and key parsing,
 * text matching for the quick filter, missile sorting, unit formatting and radar arithmetic.
 * No DOM here, so it is unit-tested in model.test.ts.
 */
import type { AircraftId, AircraftSpec, KeyBind, MissileId, MissileSpec, RwrSpec, RwrSymbol } from '../../data/types';
import { AIRCRAFT, AIRCRAFT_ORDER } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';

export type Units = 'metric' | 'imperial';

// ---- quick filter ------------------------------------------------------------------------------

/** Lower-cased query words; an empty list matches everything. */
export function queryTokens(q: string): string[] {
  return q.toLowerCase().replace(/[“”"«»]/g, ' ').split(/\s+/).map(s => s.trim()).filter(Boolean);
}

/** Every token must appear somewhere in the haystack (case-insensitive, Cyrillic included). */
export function matches(haystack: string, tokens: readonly string[]): boolean {
  if (!tokens.length) return true;
  const h = haystack.toLowerCase();
  return tokens.every(t => h.includes(t));
}

/**
 * Split text into plain and matched pieces for highlighting: [{ text, hit }].
 * Overlapping token hits are merged; order is preserved.
 */
export function splitHits(text: string, tokens: readonly string[]): { text: string; hit: boolean }[] {
  if (!tokens.length || !text) return [{ text, hit: false }];
  const low = text.toLowerCase();
  const marks = new Array<boolean>(text.length).fill(false);
  for (const t of tokens) {
    if (!t) continue;
    let i = low.indexOf(t);
    while (i >= 0) {
      for (let k = i; k < i + t.length; k++) marks[k] = true;
      i = low.indexOf(t, i + t.length);
    }
  }
  const out: { text: string; hit: boolean }[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marks[i] !== marks[start]) {
      out.push({ text: text.slice(start, i), hit: marks[start] });
      start = i;
    }
  }
  return out;
}

// ---- units -------------------------------------------------------------------------------------

export const KM_PER_NM = 1.852;
export const KMH_PER_KT = 1.852;

/** Range value (no unit) from km: metric keeps the km figure, imperial converts to nm. */
export function rangeNum(km: number, units: Units): string {
  // Metric keeps the data's own precision (25.5 km); nm are rounded to whole miles from 20 nm up.
  const v = units === 'metric' ? km : km / KM_PER_NM;
  if (units === 'imperial' && v >= 20) return String(Math.round(v));
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
export const rangeUnit = (units: Units) => (units === 'metric' ? 'km' : 'nm');
export const rangeText = (km: number, units: Units) => `${rangeNum(km, units)} ${rangeUnit(units)}`;

/** Speed from knots: metric km/h rounded to 10, imperial kt. */
export function speedText(kts: number, units: Units): string {
  return units === 'metric' ? `${Math.round((kts * KMH_PER_KT) / 10) * 10} km/h` : `${Math.round(kts)} kt`;
}

/** Beam window half-width (deg) for a Doppler gate at a ground speed: asin(gate / speed). */
export function beamWindowDeg(gateKts: number, groundSpeedKts: number): number {
  if (groundSpeedKts <= 0) return 90;
  const r = Math.min(1, gateKts / groundSpeedKts);
  return (Math.asin(r) * 180) / Math.PI;
}

// ---- key binds ---------------------------------------------------------------------------------

export type BindGroup = 'radar' | 'weapons' | 'defence';
export const BIND_GROUP_TITLE: Record<BindGroup, string> = {
  radar: 'Radar and sensors',
  weapons: 'Weapons',
  defence: 'Countermeasures and RWR',
};

const DEFENCE_RE = /chaff|flare|countermeasure|decoy|\becm\b|jammer|dispense|\brwr\b/i;
const WEAPON_RE = /weapon|launch|missile|master arm|\baim-|uncage|\bcage\b|trigger|sparrow|phoenix|\bgun\b|magic|pl-5|\bmsl\b|override|dogfight/i;

/**
 * Which kneeboard column a bind belongs to. The data has no groups, so it is read from the action
 * (and, for countermeasures, the key or switch name: "Manual program 5" is the CHAFF/FLARE button).
 */
export function bindGroup(b: KeyBind): BindGroup {
  if (DEFENCE_RE.test(b.action + ' ' + b.keys)) return 'defence';
  if (WEAPON_RE.test(b.action)) return 'weapons';
  return 'radar';
}

export function groupBinds(binds: readonly KeyBind[]): Record<BindGroup, KeyBind[]> {
  const out: Record<BindGroup, KeyBind[]> = { radar: [], weapons: [], defence: [] };
  for (const b of binds) out[bindGroup(b)].push(b);
  return out;
}

/**
 * Full-fidelity binds keep the keyboard default in the note ("Keyboard: RAlt + /. rest…").
 * Split it into the key string and whatever prose follows. Returns null when there is no default.
 */
export function keyboardFromNote(note: string | undefined): { keys: string; rest: string } | null {
  if (!note) return null;
  const m = /^Keyboard:\s*(.*)$/s.exec(note.trim());
  if (!m) return null;
  const body = m[1].trim();
  // Where the key list ends: ". " before a capital or quote, " (" parenthetical, ", " before a lower-case
  // word, or " for " / " with " prose. A lone trailing "." is the key itself ("RAlt + .").
  const cut = /\.\s+(?=["“A-Z])|\s+\(|,\s+(?=[a-z]{2,})|\s+(?=(?:for|with|to)\s)/.exec(body);
  let keys = cut ? body.slice(0, cut.index) : body;
  let rest = cut ? body.slice(cut.index).replace(/^[.,]?\s*/, '') : '';
  keys = keys.trim();
  rest = rest.trim();
  if (!keys) return null;
  return { keys, rest };
}

/** FC3 notes: the controls-menu name(s) in quotes, then caveats. */
export function splitControlsName(note: string | undefined): { menu: string; rest: string } {
  if (!note) return { menu: '', rest: '' };
  const quoted = note.match(/"[^"]+"/g);
  if (!quoted) return { menu: '', rest: note };
  // Keep the leading run of quoted names ('"A" / "B"'), the remainder is prose.
  const lead = /^(?:Listed as\s+)?("[^"]+"(?:\s*\/\s*"[^"]+")*)\.?\s*(.*)$/s.exec(note);
  if (lead) return { menu: lead[1], rest: lead[2].replace(/^[:;,.]\s*/, '').trim() };
  return { menu: '', rest: note };
}

// ---- missiles ----------------------------------------------------------------------------------

export type MissileSortKey = 'name' | 'nato' | 'fox' | 'seeker' | 'midcourse' | 'loft' | 'pitbull' | 'hi' | 'cold' | 'lo';
export interface MissileSort { key: MissileSortKey; dir: 1 | -1 }

export const SEEKER_LABEL: Record<MissileSpec['seeker'], string> = { sarh: 'SARH', arh: 'ARH', ir: 'IR' };
export const MIDCOURSE_LABEL: Record<MissileSpec['midcourse'], string> = { none: 'None', inertial: 'Inertial', datalink: 'Datalink' };

export const ALL_MISSILES: MissileId[] = Object.keys(MISSILES) as MissileId[];

export function carriersOfMissile(id: MissileId): AircraftId[] {
  return AIRCRAFT_ORDER.filter(ac => AIRCRAFT[ac].missiles.includes(id));
}

function sortValue(m: MissileSpec, key: MissileSortKey): string | number {
  switch (key) {
    case 'name': return m.name;
    case 'nato': return m.nato ?? '';
    case 'fox': return m.fox;
    case 'seeker': return SEEKER_LABEL[m.seeker];
    case 'midcourse': return MIDCOURSE_LABEL[m.midcourse];
    case 'loft': return m.lofts ? 1 : 0;
    case 'pitbull': return m.pitbullKm ?? -1;
    case 'hi': return m.ref.highHeadOnKm;
    case 'cold': return m.ref.highColdKm;
    case 'lo': return m.ref.lowHeadOnKm;
  }
}

/** Sorted copy. Ties fall back to Fox, then longest high head-on range, then name. */
export function sortMissiles(list: readonly MissileSpec[], s: MissileSort): MissileSpec[] {
  const cmp = (a: string | number, b: string | number) =>
    typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en');
  return [...list].sort((a, b) =>
    s.dir * cmp(sortValue(a, s.key), sortValue(b, s.key))
    || a.fox - b.fox
    || b.ref.highHeadOnKm - a.ref.highHeadOnKm
    || a.name.localeCompare(b.name, 'en'));
}

/** Everything the quick filter searches in a missile row. */
export function missileHaystack(m: MissileSpec): string {
  return [
    m.name, m.nato ?? '', `fox ${m.fox}`, `fox${m.fox}`, SEEKER_LABEL[m.seeker], MIDCOURSE_LABEL[m.midcourse],
    m.lofts ? 'loft' : '', m.guidanceRule, ...m.notes, ...carriersOfMissile(m.id).map(a => AIRCRAFT[a].short),
  ].join(' • ');
}

export interface MissileFilter { scope: 'jet' | 'all'; fox: 0 | 1 | 2 | 3; tokens: string[] }

export function filterMissiles(aircraft: AircraftId, f: MissileFilter): MissileSpec[] {
  const own = new Set(AIRCRAFT[aircraft].missiles);
  return ALL_MISSILES.map(id => MISSILES[id]).filter(m =>
    (f.scope === 'all' || own.has(m.id)) && (f.fox === 0 || m.fox === f.fox) && matches(missileHaystack(m), f.tokens));
}

// ---- aircraft ----------------------------------------------------------------------------------

export function fox3Of(spec: AircraftSpec): MissileId[] {
  return spec.missiles.filter(id => MISSILES[id].fox === 3);
}

/**
 * Jets whose multi-target cap is not published: the trainer uses the trackfile count
 * (AIRCRAFT_CAVEATS: "ED gives no cap on simultaneous AIM-120s"; hornet-viper.md, confidence low-med).
 */
const NO_PUBLISHED_CAP: ReadonlySet<AircraftId> = new Set<AircraftId>(['fa18c']);

/** True when the jet's "targets at once" is the trainer's stand-in, not a published DCS limit. */
export const capUnpublished = (spec: AircraftSpec) => NO_PUBLISHED_CAP.has(spec.id);

/** Targets you can have missiles guiding on at once, in plain words. */
export function simultaneousText(spec: AircraftSpec): string {
  const tws = spec.radar.tws;
  if (!tws) return '1 (PSIC)';
  if (tws.autoSttAtRmaxFraction != null) return tws.maxSimultaneousTargets > 1 ? `${tws.maxSimultaneousTargets} (СНП2)` : '1 (STT)';
  if (capUnpublished(spec)) return 'No published cap';
  return String(tws.maxSimultaneousTargets);
}

export function aircraftHaystack(spec: AircraftSpec, rwrName: string): string {
  return [
    spec.name, spec.short, spec.module === 'fc3' ? 'fc3 flaming cliffs' : 'full fidelity', spec.developer,
    spec.radar.name, rwrName, ...spec.missiles.map(id => MISSILES[id].name),
    spec.radar.tws ? 'tws' : 'no tws', fox3Of(spec).length ? 'fox 3' : 'no fox 3',
  ].join(' • ');
}

// ---- radar -------------------------------------------------------------------------------------

export function frameTimeS(spec: AircraftSpec, azHalfDeg: number, bars: number): number {
  return (bars * 2 * azHalfDeg) / spec.radar.scanRateDegPerS;
}

/**
 * The [azHalfDeg, bars] patterns DCS offers in TWS, for jets where research lists them and the sim's
 * frame-time rule alone would allow more:
 * - F-14 AWG-9: ±20° 4-bar or ±40° 2-bar only (tomcat-thunder-mirage.md, high).
 * - F/A-18C: 2B at 20/40/60/80° wide, 4B at 20/40°, 6B at 20°; no 1-bar TWS (hornet-viper.md, high).
 * - JF-17 KLJ-7: ±60° 2-bar, ±25° 3-bar, ±10° 4-bar (Chuck and FlyAndWire disagree slightly; medium).
 */
/** The TWS patterns DCS lists for this jet, or null when only the sim's limits apply. */
export function twsPatternsOf(ac: AircraftId): readonly (readonly [number, number])[] | null {
  return AIRCRAFT[ac].radar.twsPatterns ?? null;
}

/**
 * A TWS pattern list in words: exact for short lists ("±20° 4-bar or ±40° 2-bar"), otherwise the widest
 * azimuth per bar count ("2 bars up to ±40°, 4 bars up to ±20°, 6 bars at ±10°").
 */
export function twsPatternText(list: readonly (readonly [number, number])[]): string {
  if (list.length <= 3) {
    const parts = list.map(([a, b]) => `±${a}° ${b}-bar`);
    return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}` : parts.join('');
  }
  const byBars = new Map<number, number[]>();
  for (const [a, b] of list) byBars.set(b, [...(byBars.get(b) ?? []), a]);
  return [...byBars.entries()].sort((x, y) => x[0] - y[0]).map(([b, az]) => {
    const max = Math.max(...az);
    return az.length > 1 ? `${b} bars up to ±${max}°` : `${b} bars at ±${max}°`;
  }).join(', ');
}

/** Can this scan pattern run in TWS (DCS's list where research has one, else the sim's az / bars / frame-time limits)? */
export function twsAllows(spec: AircraftSpec, azHalfDeg: number, bars: number): boolean {
  const r = spec.radar, tws = r.tws;
  if (!tws) return false;
  const only = r.twsPatterns;
  if (only) return only.some(([a, b]) => a === azHalfDeg && b === bars);
  if (azHalfDeg > Math.min(tws.maxAzHalfWidthDeg ?? Infinity, r.gimbalAzDeg) + 1e-9) return false;
  if (bars > (tws.maxBars ?? Infinity)) return false;
  if (tws.maxFrameTimeS != null && frameTimeS(spec, azHalfDeg, bars) > tws.maxFrameTimeS + 1e-9) return false;
  return true;
}

export interface ScanCell { azHalfDeg: number; bars: number; frameS: number; tws: boolean }

/** Search patterns: every azimuth × bar option, minus the ones that exist only as a TWS bug scan. */
export function scanMatrix(spec: AircraftSpec, bugScan: { azHalfDeg: number; bars: number } | null): {
  az: number[]; bars: number[]; cells: ScanCell[][];
} {
  const r = spec.radar;
  const az = [...r.azHalfWidthOptionsDeg].filter(a => !bugScan || a !== bugScan.azHalfDeg).sort((a, b) => b - a);
  const bars = [...r.barOptions].filter(b => !bugScan || b !== bugScan.bars).sort((a, b) => a - b);
  const cells = bars.map(b => az.map(a => ({ azHalfDeg: a, bars: b, frameS: frameTimeS(spec, a, b), tws: twsAllows(spec, a, b) })));
  return { az, bars, cells };
}

// ---- RWR ---------------------------------------------------------------------------------------

export const EMITTER_NAME: Record<Exclude<RwrSymbol['emitter'], AircraftId>, string> = {
  missile: 'Active radar missile seeker',
  awacs: 'AWACS',
  'sam-long': 'Long-range SAM',
  'sam-medium': 'Medium-range SAM',
  'sam-short': 'Short-range SAM',
  unknown: 'Unknown radar',
};

export function emitterName(e: RwrSymbol['emitter']): string {
  return (AIRCRAFT as Record<string, AircraftSpec | undefined>)[e]?.short ?? EMITTER_NAME[e as keyof typeof EMITTER_NAME] ?? e;
}

export interface RwrRow { symbol: string; emitters: RwrSymbol['emitter'][]; airborne: boolean }

/**
 * One row per symbol and emitter kind, emitters in data order. A symbol shared by a jet and a SAM
 * ("15": F-15C with the airborne hat, SA-15 without) stays two rows, because that is the lesson.
 */
export function rwrRows(rwr: RwrSpec): RwrRow[] {
  const rows = new Map<string, RwrRow>();
  for (const s of rwr.symbols) {
    const isAir = s.emitter in AIRCRAFT;
    const key = `${s.symbol}|${isAir ? 'air' : s.emitter === 'missile' ? 'missile' : 'other'}`;
    const row = rows.get(key);
    if (row) row.emitters.push(s.emitter);
    else rows.set(key, { symbol: s.symbol, emitters: [s.emitter], airborne: isAir });
  }
  return [...rows.values()];
}
