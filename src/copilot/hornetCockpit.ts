/**
 * F/A-18C cockpit decode: raw cockpit argument values and IFEI strings from the export script, named the way
 * the cockpit labels them. Argument numbers come from ED's cockpit scripts; which value means which switch
 * position comes from community exporters (Helios, DCS-BIOS) and is not verified in game.
 * Source table: docs/research/dcs-export.md, "Hornet cockpit".
 */
import type { DcsFrame } from '../dcs/protocol';

/** Discrete switch: raw value → label. The nearest listed value wins (args can sit between detents). */
type Detents<T extends string> = readonly (readonly [number, T])[];

const SWITCHES = {
  masterArm: { arg: 49, detents: [[1, 'ARM'], [0, 'SAFE']] },
  gearHandle: { arg: 226, detents: [[1, 'UP'], [0, 'DOWN']] },
  launchBar: { arg: 233, detents: [[1, 'EXTEND'], [0, 'RETRACT']] },
  antiSkid: { arg: 238, detents: [[1, 'ON'], [0, 'OFF']] },
  hookBypass: { arg: 239, detents: [[1, 'FIELD'], [0, 'CARRIER']] },
  flapSwitch: { arg: 234, detents: [[1, 'AUTO'], [0, 'HALF'], [-1, 'FULL']] },
  brakeHandle: { arg: 240, detents: [[1, 'PULLED'], [0, 'STOWED']] },
  hookHandle: { arg: 293, detents: [[1, 'UP'], [0, 'DOWN']] },
  apu: { arg: 375, detents: [[1, 'ON'], [0, 'OFF']] },
  crank: { arg: 377, detents: [[-1, 'LEFT'], [0, 'OFF'], [1, 'RIGHT']] },
  battery: { arg: 404, detents: [[1, 'ON'], [0, 'OFF'], [-1, 'ORIDE']] },
  genL: { arg: 402, detents: [[1, 'NORM'], [0, 'OFF']] },
  genR: { arg: 403, detents: [[1, 'NORM'], [0, 'OFF']] },
} as const satisfies Record<string, { arg: number; detents: Detents<string> }>;

const LAMPS = {
  lock: 1, shoot: 2, shootStrobe: 3, aoaHigh: 4, aoaCenter: 5, aoaLow: 6, fireL: 10, masterCaution: 13,
  bleedL: 17, bleedR: 18, spdBrk: 19, lbarRed: 21, lbarGreen: 23, fireR: 26, fireApu: 29,
  threatSam: 38, threatAi: 39, threatAaa: 40, threatCw: 41, armReady: 44, armDisch: 45, modeAA: 47, modeAG: 48,
  flapsAmber: 162, flapsHalf: 163, flapsFull: 164, gearLeft: 165, gearNose: 166, gearRight: 167,
  gearHandleWarn: 227, lowAlt: 290, hook: 294, fuelLo: 304, apuReady: 376,
} as const;

type SwitchName = keyof typeof SWITCHES;
type SwitchValue<K extends SwitchName> = (typeof SWITCHES)[K]['detents'][number][1];
export type LampName = keyof typeof LAMPS;

export interface HornetCockpit {
  switches: { [K in SwitchName]?: SwitchValue<K> };
  /** true lit, false dark, missing = not exported. */
  lamps: Partial<Record<LampName, boolean>>;
  ifei: { bingoLb?: number; fuelUpLb?: number; fuelDownLb?: number };
}

export const HORNET_COCKPIT_NOTE = 'Switch positions decoded with community value maps (Helios, DCS-BIOS); not verified in game.';

function nearest<T extends string>(v: number, detents: Detents<T>): T {
  let best = detents[0]![1], d = Infinity;
  for (const [x, label] of detents) {
    const dx = Math.abs(v - x);
    if (dx < d) { d = dx; best = label; }
  }
  return best;
}

/** IFEI digits as a number of pounds: " 10800T" → 10800. Blank or no digits → undefined. */
export function ifeiPounds(s: string | undefined): number | undefined {
  const m = s?.match(/\d+/);
  return m ? Number(m[0]) : undefined;
}

export function decodeHornet(f: Pick<DcsFrame, 'args' | 'ind'> | null): HornetCockpit | null {
  if (!f?.args && !f?.ind) return null;
  const a = f.args ?? {};
  const switches: Record<string, string> = {};
  for (const [name, sw] of Object.entries(SWITCHES)) {
    const v = a[sw.arg];
    if (v !== undefined) switches[name] = nearest(v, sw.detents as Detents<string>);
  }
  const lamps: Partial<Record<LampName, boolean>> = {};
  for (const [name, arg] of Object.entries(LAMPS) as [LampName, number][]) {
    const v = a[arg];
    if (v !== undefined) lamps[name] = v > 0.5;
  }
  return {
    switches: switches as HornetCockpit['switches'],
    lamps,
    ifei: { bingoLb: ifeiPounds(f.ind?.bingo), fuelUpLb: ifeiPounds(f.ind?.fuelUp), fuelDownLb: ifeiPounds(f.ind?.fuelDown) },
  };
}
