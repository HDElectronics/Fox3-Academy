/** Copilot page model: settings storage, readout text and preview frames. Pure apart from storage. */
import type { DcsFrame } from '../../dcs/protocol';
import { HORNET_DEFAULTS, HORNET_FACTS, aoaState, effectiveBingo, type HornetConfig } from '../../copilot/hornet';
import { enduranceMin, GEAR_DOWN, GEAR_UP, type Situation } from '../../copilot/situation';
import { clockOf, type LockPicture, type Threat, type Zone } from '../../copilot/threats';

export type CopilotSettings = HornetConfig;
export const DEFAULT_SETTINGS: CopilotSettings = { ...HORNET_DEFAULTS };
const KEY = 'fox3academy:copilot:v1';

export function loadSettings(storage: Pick<Storage, 'getItem'> | null = safeStorage()): CopilotSettings {
  try {
    const d = JSON.parse(storage?.getItem(KEY) ?? '{}') as Partial<CopilotSettings>;
    return {
      mode: d.mode === 'carrier' ? 'carrier' : 'field',
      bingoSource: d.bingoSource === 'manual' ? 'manual' : 'ifei',
      bingoLb: clampLb(d.bingoLb, DEFAULT_SETTINGS.bingoLb),
      jokerMarginLb: clampLb(d.jokerMarginLb, DEFAULT_SETTINGS.jokerMarginLb),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: CopilotSettings, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try { storage?.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked: settings last this visit */ }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function clampLb(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(20000, Math.max(0, Math.round(v / 100) * 100)) : fallback;
}

const DASH = '—';

/** DOWN / UP / IN TRANSIT for a 0..1 position; null when the export does not give it. */
export function positionText(v: number | undefined, down = 'DOWN', up = 'UP'): { text: string; lit: boolean } | null {
  if (v === undefined) return null;
  return v >= GEAR_DOWN ? { text: down, lit: true } : v <= GEAR_UP ? { text: up, lit: false } : { text: 'TRANSIT', lit: true };
}

/** Flap position named as the cockpit does. The 0..1 mapping is not verified: HALF is the middle. */
export function flapsText(v: number | undefined): string {
  if (v === undefined) return DASH;
  return v >= 0.9 ? 'FULL' : v >= 0.3 ? 'HALF' : 'AUTO';
}

export interface AoaView { state: 'slow' | 'on' | 'fast' | 'off'; label: string; value: string }
export function aoaView(s: Situation): AoaView {
  if (s.aoaDeg === undefined) return { state: 'off', label: 'NO AOA', value: DASH };
  const value = s.aoaDeg.toFixed(1) + '°';
  if (s.phase !== 'approach') return { state: 'off', label: 'GEAR UP', value };
  const st = aoaState(s.aoaDeg);
  return { state: st, label: st === 'on' ? 'ON SPEED' : st.toUpperCase(), value };
}

export interface FuelView { total: string; bingo: string; bingoFrom: 'ifei' | 'setting'; joker: string; flow: string; endurance: string; state: 'ok' | 'joker' | 'bingo' | 'off' }
export function fuelView(s: Situation, cfg: HornetConfig): FuelView {
  const lb = (n: number) => `${Math.round(n / 10) * 10}`;
  const bingo = effectiveBingo(s, cfg);
  const end = enduranceMin(s, bingo.lb);
  return {
    total: s.fuelLb === undefined ? DASH : lb(s.fuelLb),
    bingo: lb(bingo.lb),
    bingoFrom: bingo.from,
    joker: lb(bingo.lb + cfg.jokerMarginLb),
    flow: s.fuelFlowLbH === undefined ? DASH : `${lb(s.fuelFlowLbH)} lb/h`,
    endurance: end === undefined ? DASH : `${Math.floor(end)} min`,
    state: s.fuelLb === undefined ? 'off' : s.fuelLb <= bingo.lb ? 'bingo' : s.fuelLb <= bingo.lb + cfg.jokerMarginLb ? 'joker' : 'ok',
  };
}

export interface ThreatRow { id: number; state: Threat['state']; tag: string; where: string; name: string }
const TAG: Record<Threat['state'], string> = { launch: 'LAUNCH', lock: 'LOCK', track: 'TRACK', search: 'SEARCH' };
export function threatRows(threats: readonly Threat[]): ThreatRow[] {
  return threats.map(t => ({ id: t.id, state: t.state, tag: TAG[t.state], where: t.clock ? `${t.clock} o'clock` : '—', name: t.name }));
}

export interface LockView {
  name: string; mode: string; range: string; closure: string; aspect: string; alt: string; where: string;
  dlz?: { label: string; zone: Zone; zoneText: string; marks: { rmin: number; rne: number; rmax: number; now: number } };
}
const ZONE_TEXT: Record<Zone, string> = { out: 'OUT OF RANGE', in: 'IN RANGE', 'no-escape': 'NO ESCAPE', min: 'INSIDE MIN' };
/** Lock readouts, and the launch-zone bar as fractions of the bar length (0 = here, 1 = 1.25 x Rmax). */
export function lockView(p: LockPicture | null): LockView | null {
  if (!p) return null;
  const view: LockView = {
    name: p.name,
    mode: (p.stt ? 'STT' : 'TRACK') + (p.jamming ? '  JAM' : ''),
    range: `${p.rangeNm.toFixed(1)} nm`,
    closure: p.closureKt === undefined ? DASH : `${Math.round(p.closureKt)} kt`,
    aspect: p.aspect ? `${p.aspect} ${Math.round(p.aspectDeg!)}°` : DASH,
    alt: p.altFt === undefined ? DASH : `${Math.round(p.altFt / 100) * 100} ft`,
    where: p.relDeg === undefined ? DASH : `${clockOf(p.relDeg)} o'clock`,
  };
  if (p.dlz) {
    const scale = p.dlz.rmaxNm * 1.25;
    const fr = (nm: number) => Math.max(0, Math.min(1, nm / scale));
    view.dlz = {
      label: p.dlz.missile.toUpperCase().replace(/^AIM/, 'AIM-'),
      zone: p.dlz.zone, zoneText: ZONE_TEXT[p.dlz.zone],
      marks: { rmin: fr(p.dlz.rminNm), rne: fr(p.dlz.rneNm), rmax: fr(p.dlz.rmaxNm), now: fr(p.rangeNm) },
    };
  }
  return view;
}

export const PHASE_TEXT: Record<Situation['phase'], string> = { ground: 'ON GROUND', airborne: 'AIRBORNE', approach: 'APPROACH' };

/** Is the jet in DCS the one this profile is for? null when DCS did not say. */
export function profileMatches(s: Situation): boolean | null {
  return s.type === undefined ? null : (HORNET_FACTS.dcsTypes as readonly string[]).includes(s.type);
}

/** ?shot=approach|carrier|bingo|threat|off: fixed frames for screenshots. AoA in degrees, as the export sends it. */
export function previewFrame(shot: string | null): { frame: DcsFrame | null; settings?: Partial<CopilotSettings> } | null {
  const base: DcsFrame = {
    type: 'frame', seq: 1, t: 1520, script: '0.2.0', allow: { ownship: true, sensor: true, object: true },
    self: { name: 'FA-18C_hornet', hdg: 0.1, pitch: -0.05, bank: 0 }, pilot: 'Preview',
    mach: 0.22, mcp: [], cm: { chaff: 60, flare: 60 },
  };
  switch (shot) {
    case 'off': return { frame: null };
    case 'approach':
      return { frame: { ...base, ias: 72, altAgl: 180, vv: -3.6, aoa: 9.4, acc: { y: 1 }, mech: { gear: 1, flaps: 1, hook: 0, speedbrakes: 0 }, engine: { fuelInt: 2300, fuelExt: 0, ffL: 0.25, ffR: 0.25 } } };
    case 'carrier':
      return { frame: { ...base, ias: 74, altAgl: 140, vv: -3.6, aoa: 8.1, acc: { y: 1 }, mech: { gear: 1, flaps: 1, hook: 0, speedbrakes: 0 }, engine: { fuelInt: 2300, fuelExt: 0, ffL: 0.25, ffR: 0.25 } }, settings: { mode: 'carrier' } };
    case 'bingo':
      return {
        frame: {
          ...base, ias: 150, mach: 0.75, altAgl: 9000, vv: 0, aoa: 4, acc: { y: 1 },
          mech: { gear: 0, flaps: 0, hook: 0, speedbrakes: 0 }, engine: { fuelInt: 1100, fuelExt: 0, ffL: 0.4, ffR: 0.4 },
          args: { 13: 1, 49: 0, 226: 1, 233: 0, 234: 1, 293: 1, 304: 0 }, ind: { bingo: '2500', fuelUp: '  2420T', fuelDown: '  2420I' },
        },
      };
    case 'threat': {
      const nm = 1852;
      return {
        frame: {
          ...base, ias: 160, tas: 230, mach: 0.8, altAgl: 7600, altMsl: 7600, vv: 0, aoa: 3, acc: { y: 1 },
          self: { ...base.self, x: 0, y: 7600, z: 0, hdg: 0, pitch: 0 },
          mech: { gear: 0, flaps: 0, speedbrakes: 0 }, engine: { fuelInt: 0.6 }, ind: { bingo: '3000', fuelUp: '  9200T', fuelDown: '  9200I' },
          args: { 226: 1, 234: 1, 293: 1, 49: 1, 13: 0, 304: 0 },
          stores: { counts: { 'AIM-120C': 4, 'AIM-9X': 2 }, sel: 'AIM-120C', gun: 578 },
          rwr: { mode: 0, emitters: [
            { id: 2, name: 'Su-27', signal: 'lock', az: 0.35 },
            { id: 3, name: 'MiG-29S', signal: 'scan', az: -1.1 },
            { id: 4, name: 'SA-11 Buk', signal: 'scan', az: 2.4 },
          ] },
          lock: [{ id: 2, name: 'Su-27', flags: 0x0008, dist: 28 * nm, closure: 480, pos: { x: 26.3 * nm, y: 8200, z: 9.6 * nm }, vel: { x: -240, y: 0, z: -40 } }],
        },
      };
    }
    default: return null;
  }
}
