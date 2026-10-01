/**
 * F/A-18C copilot profile: the numbers the calls use and the rules. Numbers come from src/data (ED F/A-18C
 * Early Access Guide via flightOps.ts) and docs/research/fa18c-copilot.md; each carries its source and
 * `verified` flag so the page can label what is not verified. Gameplay level only (AGENTS.md rule 1).
 */
import { AIRCRAFT } from '../data/aircraft';
import { FLIGHT_OPS } from '../data/flightOps';
import type { Sourced } from '../sim/flightOps/types';
import type { Rule } from './engine';
import { GEAR_DOWN, GEAR_UP, type Situation } from './situation';

export type LandingMode = 'field' | 'carrier';

export interface HornetConfig {
  mode: LandingMode;
  /** ifei: use the BINGO read from the IFEI when the export sends it, else bingoLb. manual: always bingoLb. */
  bingoSource: 'ifei' | 'manual';
  /** Bingo when the IFEI value is not available (or the source is manual). */
  bingoLb: number;
  /** Joker call this many pounds above bingo. */
  jokerMarginLb: number;
}

export const HORNET_DEFAULTS: HornetConfig = { mode: 'field', bingoSource: 'ifei', bingoLb: 3000, jokerMarginLb: 1500 };

const GUIDE = 'ED F/A-18C Early Access Guide (24 Mar 2024)';

const ops = FLIGHT_OPS.fa18c;
const perfNote = 'Rough public figure in src/data/aircraft.ts, not checked in DCS.';

/** The numbers behind the calls, with provenance for the page. */
export const HORNET_FACTS = {
  dcsTypes: ['FA-18C_hornet'],
  onSpeedAoaDeg: ops.aoa.onSpeed,
  aoaBandDeg: ops.aoa.band,
  carrierConfigMaxKt: ops.carrier!.pattern.gearFlapsMaxKt,
  gearMaxKt: { value: 250, source: GUIDE + ', p102', verified: true, note: 'Gear and FULL flaps below 250 kt in the field pattern.' } satisfies Sourced<number>,
  /** Indexer symbols and colours: slow green upper chevron, on speed amber doughnut, fast red lower chevron. */
  indexerColors: { value: { slow: 'green', on: 'amber', fast: 'red' }, source: GUIDE + ', p44-45', verified: true } satisfies Sourced<Record<'slow' | 'on' | 'fast', string>>,
  fuelLoLb: { value: 800, source: GUIDE + ', p65', verified: true, note: 'FUEL LO: either feed tank below 800 lb.' } satisfies Sourced<number>,
  maxG: { value: AIRCRAFT.fa18c.perf.maxG, source: 'src/data/aircraft.ts', verified: false, note: perfNote } satisfies Sourced<number>,
} as const;

const airborne = (s: Situation) => s.phase !== 'ground';
const lamp = (s: Situation, name: keyof NonNullable<Situation['cockpit']>['lamps']) => s.cockpit?.lamps[name] === true;

/** Hook down? The hook handle when the cockpit is exported, else the hook position. undefined = unknown. */
export function hookDown(s: Situation): boolean | undefined {
  const h = s.cockpit?.switches.hookHandle;
  if (h) return h === 'DOWN';
  return s.hook === undefined ? undefined : s.hook >= GEAR_DOWN;
}
/** Flaps FULL? The flap switch when exported, else the flap position near 1 (mapping not verified). */
export function flapsFull(s: Situation): boolean | undefined {
  const f = s.cockpit?.switches.flapSwitch;
  if (f) return f === 'FULL';
  return s.flaps === undefined ? undefined : s.flaps >= 0.9;
}
/** The bingo the calls use, and where it came from. */
export function effectiveBingo(s: Situation, cfg: HornetConfig): { lb: number; from: 'ifei' | 'setting' } {
  const ifei = s.cockpit?.ifei.bingoLb;
  return cfg.bingoSource === 'ifei' && ifei !== undefined ? { lb: ifei, from: 'ifei' } : { lb: cfg.bingoLb, from: 'setting' };
}
const inApproach = (s: Situation) => s.phase === 'approach';
const fmtLb = (lb: number) => `${Math.round(lb / 10) * 10} lb`;

/** AoA relative to the indexer band: slow above it, fast below it, edges on speed (0.1° resolution). */
export function aoaState(aoaDeg: number): 'slow' | 'on' | 'fast' {
  const [lo, hi] = HORNET_FACTS.aoaBandDeg.value;
  const a = Math.round(aoaDeg * 10) / 10;
  return a > hi ? 'slow' : a < lo ? 'fast' : 'on';
}

export const HORNET_RULES: readonly Rule<HornetConfig>[] = [
  {
    id: 'master-warning', severity: 'warning', holdS: 0.3, repeatS: 10,
    test: s => s.masterWarning,
    text: () => 'MASTER WARNING', say: () => 'Master warning.',
  },
  { id: 'fire-left', severity: 'warning', holdS: 0.3, silent: true, test: s => lamp(s, 'fireL'), text: () => 'FIRE LEFT ENGINE' },
  { id: 'fire-right', severity: 'warning', holdS: 0.3, silent: true, test: s => lamp(s, 'fireR'), text: () => 'FIRE RIGHT ENGINE' },
  { id: 'fire-apu', severity: 'warning', holdS: 0.3, silent: true, test: s => lamp(s, 'fireApu'), text: () => 'APU FIRE' },
  {
    id: 'master-caution', severity: 'caution', holdS: 0.5, repeatS: 20,
    test: s => lamp(s, 'masterCaution'),
    text: () => 'MASTER CAUTION', say: () => 'Master caution. Check the DDI cautions.',
  },
  { id: 'fuel-lo', severity: 'caution', holdS: 1, silent: true, test: s => lamp(s, 'fuelLo'), text: () => 'FUEL LO, FEED TANK BELOW 800 LB' },
  {
    id: 'gear-up-low', severity: 'warning', holdS: 1, repeatS: 5,
    // Descending through 1000 ft slow with the gear up: the classic forgotten gear.
    test: s => airborne(s) && s.gear !== undefined && s.gear <= GEAR_UP && (s.aglFt ?? Infinity) < 1000
      && (s.iasKt ?? Infinity) < 200 && (s.vviFpm ?? 0) < -300,
    text: () => 'GEAR UP, LOW AND SLOW', say: () => 'Check gear.',
  },
  {
    id: 'over-g', severity: 'warning', holdS: 0.2, rearmS: 5,
    test: s => s.g !== undefined && s.g > HORNET_FACTS.maxG.value,
    text: s => `OVER G ${s.g!.toFixed(1)}`, say: () => 'Over G.',
  },
  {
    id: 'bingo', severity: 'warning', holdS: 2, repeatS: 120,
    test: (s, { cfg }) => airborne(s) && s.fuelLb !== undefined && s.fuelLb <= effectiveBingo(s, cfg).lb,
    text: s => `BINGO  ${fmtLb(s.fuelLb!)}`, say: () => 'Bingo fuel. Head home.',
  },
  {
    id: 'joker', severity: 'caution', holdS: 2,
    test: (s, { cfg }) => {
      const b = effectiveBingo(s, cfg).lb;
      return airborne(s) && s.fuelLb !== undefined && s.fuelLb > b && s.fuelLb <= b + cfg.jokerMarginLb;
    },
    text: s => `JOKER  ${fmtLb(s.fuelLb!)}`, say: () => 'Joker fuel.',
  },
  {
    id: 'gear-speed', severity: 'caution', holdS: 1, repeatS: 8,
    test: s => airborne(s) && s.gear !== undefined && s.gear > GEAR_UP && (s.iasKt ?? 0) > HORNET_FACTS.gearMaxKt.value,
    text: s => `GEAR OUT AT ${Math.round(s.iasKt!)} KT`, say: () => 'Gear speed.',
  },
  {
    id: 'carrier-config-speed', severity: 'caution', holdS: 1, rearmS: 10,
    test: (s, { cfg }) => cfg.mode === 'carrier' && inApproach(s) && (s.iasKt ?? 0) > HORNET_FACTS.carrierConfigMaxKt.value + 10,
    text: s => `${Math.round(s.iasKt!)} KT, CONFIGURE BELOW ${HORNET_FACTS.carrierConfigMaxKt.value}`, say: () => 'Fast for the gear.',
  },
  {
    id: 'check-hook', severity: 'caution', holdS: 2, repeatS: 10,
    test: (s, { cfg }) => cfg.mode === 'carrier' && inApproach(s) && hookDown(s) === false,
    text: () => 'HOOK UP', say: () => 'Check hook.',
  },
  {
    id: 'check-flaps', severity: 'caution', holdS: 3, repeatS: 15,
    test: s => inApproach(s) && flapsFull(s) === false,
    text: () => 'FLAPS NOT FULL', say: () => 'Check flaps.',
  },
  {
    id: 'aoa-slow', severity: 'advisory', holdS: 1, repeatS: 4, rearmS: 1,
    test: s => inApproach(s) && s.aoaDeg !== undefined && aoaState(s.aoaDeg) === 'slow',
    text: s => `SLOW  AOA ${s.aoaDeg!.toFixed(1)}`, say: () => 'Slow.',
  },
  {
    id: 'aoa-fast', severity: 'advisory', holdS: 1, repeatS: 4, rearmS: 1,
    test: s => inApproach(s) && s.aoaDeg !== undefined && aoaState(s.aoaDeg) === 'fast',
    text: s => `FAST  AOA ${s.aoaDeg!.toFixed(1)}`, say: () => 'Fast.',
  },
  {
    id: 'aoa-on', severity: 'advisory', holdS: 1.5, rearmS: 3,
    test: s => inApproach(s) && s.aoaDeg !== undefined && aoaState(s.aoaDeg) === 'on',
    text: s => `ON SPEED  AOA ${s.aoaDeg!.toFixed(1)}`, say: () => 'On speed.',
  },
];
