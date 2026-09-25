/**
 * Hangar facts: everything the hangar says about a jet, derived from src/data (no DOM, no three.js).
 * Pure functions so every jet can be checked in tests (facts.test.ts).
 */
import { AIRCRAFT, FIGHTER_ORDER, MISSILES, PROCEDURES, RWRS } from '../../data';
import type { FighterId, AircraftSpec, MissileId, MissileSpec, RadarModeId } from '../../data/types';
import { fmtRange, fmtSpeed, rangeUnit, rangeValue, type Units } from '../../app/format';
import { MPS_PER_KT } from '../../sim/math';
import { createRadarState } from '../../sim/radar';
import { gunSpecFor } from '../../data/wvr';

const R2D = 180 / Math.PI;

/** Where the detection numbers come from, when it is not the DCS AI sensor table. */
const DETECT_SOURCE: Partial<Record<FighterId, string>> = { f14b: 'Heatblur manual', m2000c: 'Guide figure' };
export const detectSource = (spec: AircraftSpec): string => DETECT_SOURCE[spec.id] ?? 'DCS AI table';

// ------------------------------------------------------------------------------------------ capability flags

export const fox3Missiles = (spec: AircraftSpec): MissileSpec[] =>
  spec.missiles.map(m => MISSILES[m]).filter(m => m.fox === 3);
export const hasFox3 = (spec: AircraftSpec): boolean => fox3Missiles(spec).length > 0;
/** Can the jet have missiles in the air at two or more targets at once (СНП2, TWS multi-shot)? */
export const isMultiTarget = (spec: AircraftSpec): boolean => (spec.radar.tws?.maxSimultaneousTargets ?? 0) > 1;
export const launchesFromTws = (spec: AircraftSpec): boolean => spec.radar.tws?.launchFromTws ?? false;
export const moduleLabel = (spec: AircraftSpec): string => (spec.module === 'fc3' ? 'FC3' : 'Full fidelity');
export const moduleShort = (spec: AircraftSpec): string => (spec.module === 'fc3' ? 'FC3' : 'FULL');

/** The jet's main radar missile: first radar missile in the default loadout, else the longest-reaching one. */
export function primaryRadarMissile(spec: AircraftSpec): MissileSpec | null {
  const fromLoad = spec.loadout.map(l => MISSILES[l.missile]).find(m => m.seeker !== 'ir');
  if (fromLoad) return fromLoad;
  const radar = spec.missiles.map(m => MISSILES[m]).filter(m => m.seeker !== 'ir');
  radar.sort((a, b) => b.ref.highHeadOnKm - a.ref.highHeadOnKm);
  return radar[0] ?? null;
}

/** The Fox 3 the jet carries by default (or its first Fox 3). */
export function primaryFox3(spec: AircraftSpec): MissileSpec | null {
  const fromLoad = spec.loadout.map(l => MISSILES[l.missile]).find(m => m.fox === 3);
  return fromLoad ?? fox3Missiles(spec)[0] ?? null;
}

const sttLabel = (spec: AircraftSpec) => spec.radar.modeLabels.stt ?? 'STT';
const twsLabel = (spec: AircraftSpec) => spec.radar.modeLabels.tws ?? 'TWS';
const firstSentence = (s: string) => {
  const i = s.search(/\.(\s|$)/);
  return i < 0 ? s : s.slice(0, i + 1);
};
const pct = (f: number) => Math.round(f * 100) + ' %';

// ------------------------------------------------------------------------------------------ jet tiles

export interface TileFacts {
  id: FighterId;
  short: string;
  module: string;
  fox3: boolean;
  multi: boolean;
  /** Tooltip / accessible description. */
  title: string;
}

export function tileFacts(id: FighterId): TileFacts {
  const spec = AIRCRAFT[id];
  const fox3 = hasFox3(spec), multi = isMultiTarget(spec);
  const title = `${spec.name} · ${moduleLabel(spec)} · ${fox3 ? 'Fox 3' : 'no Fox 3'} · ${multi ? 'several targets at once' : 'one target at a time'}`;
  return { id, short: spec.short, module: moduleShort(spec), fox3, multi, title };
}

export const allTiles = (): TileFacts[] => FIGHTER_ORDER.map(tileFacts);

// ------------------------------------------------------------------------------------------ radar summary

export interface ScanSummary { azHalfDeg: number; bars: number; frameS: number; modeLabel: string }

/** The default search pattern the sim starts in (same as the Radar lab). */
export function defaultScan(spec: AircraftSpec): ScanSummary {
  const st = createRadarState(spec);
  return {
    azHalfDeg: Math.round(st.azHalf * R2D),
    bars: st.bars,
    frameS: Math.round(st.frameTime * 10) / 10,
    modeLabel: spec.radar.modeLabels.rws ?? 'RWS',
  };
}

const GENERIC: Partial<Record<RadarModeId, string>> = {
  rws: 'search', tws: 'track while scan', stt: 'lock', vs: 'velocity search', acm: 'close combat',
};

export interface ModeChip {
  mode: RadarModeId; label: string; generic: string;
  /** No TWS at all (struck out). */
  missing?: boolean;
  /** A single-target TWS the jet has in DCS but this app does not model (M-2000C PSID). */
  limited?: boolean;
}

/** BVR radar modes with the cockpit's own legends. A jet without TWS gets a struck-out TWS chip. */
export function modeChips(spec: AircraftSpec): ModeChip[] {
  const order: RadarModeId[] = ['rws', 'tws', 'stt', 'vs'];
  const out: ModeChip[] = [];
  for (const m of order) {
    if (spec.radar.modes.includes(m)) out.push({ mode: m, label: spec.radar.modeLabels[m] ?? m.toUpperCase(), generic: GENERIC[m] ?? '' });
    else if (m === 'tws' && spec.radar.singleTargetTws?.label) out.push({ mode: 'tws', label: spec.radar.singleTargetTws?.label ?? 'TWS', generic: 'one target only', limited: true });
    else if (m === 'tws') out.push({ mode: 'tws', label: 'TWS', generic: 'not on this jet', missing: true });
  }
  return out;
}

export interface TwsRule {
  /** 'YES' | 'NO' | 'NO TWS' */
  answer: string;
  yes: boolean;
  /** One line in plain words. */
  rule: string;
}

export function twsRule(spec: AircraftSpec, units: Units): TwsRule {
  const tws = spec.radar.tws;
  if (!tws) {
    const one = spec.radar.singleTargetTws?.label;
    if (one) {
      return {
        answer: 'NO', yes: false,
        rule: `No multi-target TWS. ${one} tracks one target while the scan goes on, for awareness only. Every radar shot leaves from ${sttLabel(spec)} (STT), so the target sees your lock from the start.`,
      };
    }
    return { answer: 'NO TWS', yes: false, rule: `No track-while-scan. Every radar shot needs ${sttLabel(spec)} (STT), and the target sees your lock from the start.` };
  }
  if (!tws.launchFromTws) {
    const f3 = primaryFox3(spec);
    let rule = tws.autoSttAtRmaxFraction
      ? `${twsLabel(spec)} holds one designated track and locks it (${sttLabel(spec)}) by itself at ${pct(tws.autoSttAtRmaxFraction)} of Rmax, so every shot leaves from STT.`
      : `Radar missiles leave from STT only.`;
    if (tws.maxSimultaneousTargets > 1 && f3) {
      rule += ` The exception is ${spec.display === 'ru-hud' ? 'СНП2' : 'the two-target mode'}: two ${f3.name}s at two targets within 8° of each other, in one trigger pull.`;
    } else if (f3) {
      rule += ` The ${f3.name} can be let go once it is inside about ${fmtR((f3.pitbullKm ?? 15) * 1000, units)} of the target.`;
    }
    return { answer: 'NO', yes: false, rule };
  }
  const f3 = primaryFox3(spec);
  const n = tws.maxSimultaneousTargets;
  const sarh = spec.missiles.map(m => MISSILES[m]).find(m => m.seeker === 'sarh');
  const at = spec.radar.tws?.capConfidence === 'unpublished' ? `several targets (simplified: ${n} here)` : `up to ${n} targets`;
  let rule = `${f3 ? f3.name : 'Fox 3'} from TWS at ${at}, each with no lock or launch warning until its missile goes active.`;
  if (sarh) rule += ` The ${sarh.name} still needs ${sttLabel(spec)}.`;
  return { answer: 'YES', yes: true, rule };
}

export interface CapFacts {
  radarName: string;
  modes: ModeChip[];
  scan: ScanSummary;
  twsTracks: string;
  targetsAtOnce: string;
  tws: TwsRule;
  detectHeadOnM: number;
  detectTailM: number;
  gimbalDeg: number;
  rwrName: string;
  chaff: number;
  flares: number;
}

export function capFacts(spec: AircraftSpec, units: Units): CapFacts {
  const tws = spec.radar.tws;
  return {
    radarName: spec.radar.name,
    modes: modeChips(spec),
    scan: defaultScan(spec),
    twsTracks: tws ? String(tws.maxTracks) : spec.radar.singleTargetTws?.label ? `1 (${spec.radar.singleTargetTws?.label})` : 'none',
    targetsAtOnce: String(tws ? tws.maxSimultaneousTargets : 1) + (spec.radar.tws?.capConfidence === 'unpublished' ? ' (simplified)' : ''),
    tws: twsRule(spec, units),
    detectHeadOnM: spec.radar.detectKm.headOn * 1000,
    detectTailM: spec.radar.detectKm.tail * 1000,
    gimbalDeg: spec.radar.gimbalAzDeg,
    rwrName: RWRS[spec.rwr].name,
    chaff: spec.cms.chaff,
    flares: spec.cms.flares,
  };
}

// ------------------------------------------------------------------------------------------ scales for bars

export interface Scale { max: number; step: number; unit: string; ticks: number[] }

/** A round axis in the user's units that covers `maxM` metres. */
export function niceScale(maxM: number, units: Units): Scale {
  const v = rangeValue(maxM, units);
  const step = v > 120 ? 50 : v > 60 ? 20 : v > 25 ? 10 : 5;
  const max = Math.max(step, Math.ceil(v / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(t);
  return { max, step, unit: rangeUnit(units), ticks };
}

/** Fraction (0..1) of a scale for a range in metres. */
export const scaleFrac = (m: number, s: Scale, units: Units) => Math.max(0, Math.min(1, rangeValue(m, units) / s.max));

/** Detection axis shared by every jet (so switching jets shows the real difference). */
export const detectionScale = (units: Units): Scale =>
  niceScale(Math.max(...FIGHTER_ORDER.map(id => AIRCRAFT[id].radar.detectKm.headOn)) * 1000, units);

/** Number for a range readout: whole units from 10 up, one decimal below. */
export function rangeNum(m: number, units: Units): string {
  const v = rangeValue(m, units);
  return v >= 9.95 ? String(Math.round(v)) : v.toFixed(1);
}
export const fmtR = (m: number, units: Units) => rangeNum(m, units) + ' ' + rangeUnit(units);

// ------------------------------------------------------------------------------------------ weapons

export interface WeaponFacts {
  id: MissileId;
  name: string;
  nato: string | null;
  fox: 1 | 2 | 3;
  seeker: string;
  midcourse: string;
  pitbull: string;
  loft: string;
  /** Rows for the reference-range bars (metres). */
  ranges: { key: 'high' | 'cold' | 'low'; label: string; m: number }[];
  rule: string;
  notes: string[];
  /** Missiles of this type in the default loadout (0 = carried but not in the default load). */
  loadCount: number;
}

const SEEKER: Record<MissileSpec['seeker'], string> = { sarh: 'SARH', arh: 'Active radar', ir: 'Infrared' };

export function weaponFacts(spec: AircraftSpec, units: Units): WeaponFacts[] {
  return spec.missiles.map(id => {
    const m = MISSILES[id];
    const midcourse =
      m.midcourse === 'datalink' ? 'Datalink'
      : m.midcourse === 'inertial' ? 'Inertial only'
      : m.seeker === 'sarh' ? 'None (your STT)'
      : 'None (IR lock)';
    const pitbull =
      m.seeker === 'arh' && m.pitbullKm ? (m.pitbullApprox ? '~' : '') + fmtR(m.pitbullKm * 1000, units)
      : m.seeker === 'sarh' ? 'Never (SARH)'
      : 'None (IR)';
    return {
      id, name: m.name, nato: m.nato ?? null, fox: m.fox,
      seeker: SEEKER[m.seeker],
      midcourse, pitbull,
      loft: m.lofts ? 'Yes' : 'No',
      ranges: [
        { key: 'high', label: 'HI HOT', m: m.ref.highHeadOnKm * 1000 },
        { key: 'cold', label: 'HI COLD', m: m.ref.highColdKm * 1000 },
        { key: 'low', label: 'LO HOT', m: m.ref.lowHeadOnKm * 1000 },
      ],
      rule: guidanceRuleFor(m, spec),
      notes: m.notes,
      loadCount: spec.loadout.filter(l => l.missile === id).reduce((a, l) => a + l.count, 0),
    };
  });
}

/** Legend for the HI / LO range rows, in the user's units. */
export const refLegend = (units: Units): string =>
  (units === 'metric' ? 'HI = both jets at 10 km, LO = both at 1 km, shooter and target at 900 km/h.'
    : 'HI = both jets at 33,000 ft, LO = both at 3,300 ft, shooter and target at about 485 kt (900 km/h).') +
  ' HOT = target coming at you, COLD = target running away. These are ED\'s launch-table values that drive the FC3 and AI ' +
  'launch zones; the DLZ in your cockpit moves with the real altitude, speed and aspect.';

/** Weapon-card columns on a wide screen: one row up to five cards, else two even rows (never 4 + 1). */
export const weaponCols = (n: number): number => (n <= 5 ? Math.max(1, n) : Math.ceil(n / 2));

/** Range axis for this jet's weapon cards: covers its longest missile. */
export const weaponScale = (spec: AircraftSpec, units: Units): Scale =>
  niceScale(Math.max(...spec.missiles.map(m => MISSILES[m].ref.highHeadOnKm)) * 1000, units);

/** One honest line when the jet lacks a Fox 3 (or a Fox 1/2), for the weapons header. */
export function weaponsSummary(spec: AircraftSpec): string {
  const f = new Set(spec.missiles.map(m => MISSILES[m].fox));
  const radar = spec.missiles.map(m => MISSILES[m]).filter(m => m.seeker !== 'ir').map(m => m.name);
  if (!f.has(3)) return `No Fox 3 on the ${spec.short}: every radar missile (${radar.join(', ')}) is semi-active and needs your lock until impact.`;
  const names = fox3Missiles(spec).map(m => m.name);
  if (!launchesFromTws(spec)) return `${names.join(' and ')} ${names.length > 1 ? 'are the Fox 3s' : 'is the Fox 3'} here, but ${names.length > 1 ? 'they leave' : 'it leaves'} from STT, so the target sees your lock.`;
  return `Fire the ${names.join(' or ')} from TWS and the target gets no lock or launch warning until the missile goes active.`;
}

// ------------------------------------------------------------------------------------------ lessons

export { LESSON_PATH, progressKeys, isDone, doneElsewhere, nextLesson } from '../../app/learningProgress';
export type { LessonRoute, ProgressReader } from '../../app/learningProgress';
import type { LessonRoute } from '../../app/learningProgress';

export const LESSON_TITLE: Record<LessonRoute, string> = {
  radar: 'Scan volume',
  tws: 'Track while scan',
  missiles: 'Launch zones',
  defense: 'Beat a missile',
  rwr: 'Read the RWR',
  merge: 'Merge, BFM and guns',
  sortie: 'Fight and debrief',
  reference: 'Keys and procedures',
};

const TWS_VOCAB: Partial<Record<FighterId, string>> = {
  f15c: 'Learn the PDT and SDT order.',
  fa18c: 'Learn L&S, DT2 and Undesignate.',
  f16c: 'Learn the TMS shoot list: bug, fire, step.',
  f14b: 'Learn how the WCS numbers targets 1 to 6.',
  jf17: 'Learn HPT, SPT and the S2 swap.',
};

/** What this lesson teaches for this jet, in one or two short sentences. */
export function lessonLine(route: LessonRoute, spec: AircraftSpec, units: Units): string {
  const r = spec.radar;
  switch (route) {
    case 'radar': {
      const s = defaultScan(spec);
      const notch = fmtSpeed(r.notchKts * MPS_PER_KT, units);
      const scan = spec.display === 'ru-hud'
        ? `The ${r.name} scans a 60° window you move left, centre or right, ${s.bars} bars, one frame every ${s.frameS} s.`
        : `The ${r.name} searches ±${s.azHalfDeg}° in ${s.bars} bars, one frame every ${s.frameS} s.`;
      return `${scan} See what the bars cover at range, and why a bandit on the beam slower than ${notch} radial drops out${r.notchNeedsLookDown ? ' when you look down' : ''}.`;
    }
    case 'tws': {
      const tws = r.tws;
      if (!tws && spec.radar.singleTargetTws?.label) return `The ${r.name} has no multi-target TWS (${spec.radar.singleTargetTws?.label} tracks one target for awareness): every shot needs ${sttLabel(spec)} and the target sees the lock from the start. See what TWS would change.`;
      if (!tws) return `The ${r.name} has no TWS: every shot needs ${sttLabel(spec)} and the target sees the lock from the start. See what TWS would change.`;
      if (tws.autoSttAtRmaxFraction) {
        let s = `${twsLabel(spec)} holds one designated track and auto-locks it at ${tws.autoSttAtRmaxFraction} Rmax. Learn when his RWR lights up and how to time it.`;
        if (tws.maxSimultaneousTargets > 1) s += ' Then СНП2: two R-77s at two targets.';
        return s;
      }
      if (!tws.launchFromTws) return `${twsLabel(spec)} tracks ${tws.maxTracks} targets but shots leave from STT. Learn to keep the picture while you lock.`;
      const f3 = primaryFox3(spec);
      const at = spec.radar.tws?.capConfidence === 'unpublished' ? 'several targets' : `up to ${tws.maxSimultaneousTargets} targets`;
      return `${tws.maxTracks} tracks and one ${f3?.name ?? 'Fox 3'} at each of ${at}, with no lock warning until pitbull. ${TWS_VOCAB[spec.id] ?? ''}`.trim();
    }
    case 'missiles': {
      const m = primaryRadarMissile(spec);
      if (!m) return 'Learn how altitude, speed and target aspect move a launch zone.';
      const hi = fmtRange(m.ref.highHeadOnKm * 1000, units), cold = fmtRange(m.ref.highColdKm * 1000, units);
      return `${m.name}: ${hi} head-on high, only ${cold} if he runs. Learn why altitude, speed and aspect move Rmax.`;
    }
    case 'defense': {
      const few = spec.cms.chaff <= 48;
      return `Put the missile on your beam to hide in its notch and chaff there, or turn cold and drag it until it runs out of energy. You carry ${spec.cms.chaff} chaff${few ? ': make every bundle count' : ''}.`;
    }
    case 'rwr': {
      const rwr = RWRS[spec.rwr];
      return `${rwr.name}: ${firstSentence(rwr.teach[0])} Learn to tell search, lock and launch apart.`;
    }
    case 'merge': {
      const gun = gunSpecFor(spec.id);
      const corner = fmtSpeed(spec.perf.cornerKts * MPS_PER_KT, units);
      return `Turn at ${corner}, lead turn the merge, pick one or two circle, yo-yo instead of overshooting${gun ? `, then track with the ${gun.gun}` : ''}. Finish against a fighting AI.`;
    }
    case 'sortie': {
      const f3 = primaryFox3(spec);
      if (!f3) return `Fight AI that shoots back with the ${spec.short}'s rules: every radar shot from ${sttLabel(spec)}, held to impact. Then debrief it in 3D.`;
      if (!launchesFromTws(spec)) return `Fight AI with the ${spec.short}'s rules: ${f3.name} from STT, let go inside ~${fmtR((f3.pitbullKm ?? 15) * 1000, units)}, then defend. Then debrief it in 3D.`;
      return `Fight AI with the ${spec.short}'s rules: ${f3.name}s from TWS, crank, leave once they go active. Then debrief it in 3D.`;
    }
    case 'reference': {
      const p = PROCEDURES[spec.id];
      const kind = spec.module === 'fc3' ? 'Keyboard defaults' : 'HOTAS and cockpit functions';
      return `${kind} for the ${spec.short}: ${p.binds.length} binds and ${p.procedures.length} step-by-step procedures, named as DCS names them.`;
    }
  }
}

/**
 * The bind shown on the cockpit card. FC3: the search / TWS toggle key. Full fidelity: the designate or
 * lock function (HOTAS names). The action is trimmed at the first ';' so qualifiers such as "(hold 1 s)" stay.
 */
export function headlineBind(spec: AircraftSpec): { action: string; keys: string } | null {
  const binds = PROCEDURES[spec.id].binds;
  const b = spec.module === 'fc3'
    ? binds.find(x => /TWS/.test(x.action)) ?? binds.find(x => /lock/i.test(x.action))
    : binds.find(x => /^(designate|bug|lock)\b/i.test(x.action)) ?? binds.find(x => /^TWS/.test(x.action)) ?? binds.find(x => /lock/i.test(x.action));
  if (!b) return null;
  return { action: b.action.split(';')[0].trim(), keys: b.keys };
}

/**
 * The missile's guidance rule for this jet: clauses that name a different jet (e.g. the F-15C's FLOOD
 * option on the shared AIM-7M rule) are dropped.
 */
export function guidanceRuleFor(m: MissileSpec, spec: AircraftSpec): string {
  const others = FIGHTER_ORDER.filter(id => id !== spec.id).map(id => AIRCRAFT[id].short);
  const parts = m.guidanceRule.split(/;\s+/);
  let out = parts.filter((p, i) => i === 0 || !others.some(o => p.includes(o))).join('; ').trim();
  if (!/[.]$/.test(out)) out += '.';
  return out;
}
