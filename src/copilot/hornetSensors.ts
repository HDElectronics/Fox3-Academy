/**
 * F/A-18C threats and radar lock from what the jet displays: the RWR display, HUD and radar attack-format text
 * (frame.disp, exported by Fox3Link.lua) and the ALR-67 threat lights (cockpit args). The FC3 sensor functions
 * return nothing for the Hornet (observed 2026-10-01). Element names and their meaning come from in-game
 * recordings: docs/research/dcs-export.md, "Hornet displays". The RWR text has no bearing, so neither do the calls.
 * Light meanings: AI = hostile AI radar lock, CW = CW radar, probably guiding a missile (ED guide p414).
 */
import { AIRCRAFT } from '../data/aircraft';
import { RWRS } from '../data/rwr';
import type { FighterId } from '../data/types';
import type { DcsFrame } from '../dcs/protocol';
import type { ActiveAlert, Callout } from './engine';
import { decodeHornet } from './hornetCockpit';

const SAM_NAMES: Record<string, string> = { 'sam-long': 'long-range SAM', 'sam-medium': 'medium-range SAM', 'sam-short': 'short-range SAM', awacs: 'AWACS', missile: 'missile', unknown: 'unknown' };

/** What an ALR-67 symbol stands for, from the app's RWR table: '29' → ['Su-27', 'Su-33', 'J-11A', 'MiG-29S']. */
export function alr67Names(symbol: string): string[] {
  return RWRS.alr67.symbols
    .filter(s => s.symbol === symbol)
    .map(s => (s.emitter in AIRCRAFT ? AIRCRAFT[s.emitter as FighterId].short : SAM_NAMES[s.emitter] ?? s.emitter));
}

const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
/** Spoken the way pilots read RWR codes: '29' → 'two niner'; letters as they are. */
export function sayCode(symbol: string): string {
  return [...symbol].map(c => (/\d/.test(c) ? DIGITS[Number(c)] : c)).join(' ');
}

export interface HornetThreat { slot: number; symbol: string; names: string[]; locked: boolean }
export interface HornetThreats {
  threats: HornetThreat[];
  /** Threat lights: AI lock, CW guidance, SAM, AAA. */
  ai: boolean; cw: boolean; sam: boolean; aaa: boolean;
}

const slotOf = (k: string, prefix: string) => (k.startsWith(prefix) ? Number(k.slice(prefix.length)) : NaN);

export function hornetThreats(f: DcsFrame | null): HornetThreats | null {
  if (!f?.disp?.rwr && !f?.args) return null;
  const lamps = decodeHornet(f)?.lamps ?? {};
  const rwr = f.disp?.rwr ?? {};
  const hud = f.disp?.hud ?? {};
  // HUD repeats the RWR symbols; its STT special symbol marks the threat that has locked us.
  const sttSlots = new Set(Object.keys(hud).map(k => slotOf(k, 'HUD_EW_SpecialSymbolsStt')).filter(n => !Number.isNaN(n)));
  const hudSymbols = new Map(Object.entries(hud).map(([k, v]) => [slotOf(k, 'HUD_EW_ThreatSymbol'), v.trim()] as const).filter(([n]) => !Number.isNaN(n)));
  // RWR symbols by slot; a flashing symbol is missing in some reads, so the HUD repeat fills the gap.
  const symbols = new Map<number, string>();
  for (const [k, v] of Object.entries(rwr)) {
    const slot = slotOf(k, 'RWR_ThreatSymbol');
    if (!Number.isNaN(slot) && v.trim()) symbols.set(slot, v.trim());
  }
  for (const [slot, sym] of hudSymbols) if (sym && !symbols.has(slot)) symbols.set(slot, sym);
  const threats: HornetThreat[] = [...symbols].map(([slot, symbol]) => ({
    slot, symbol, names: alr67Names(symbol), locked: [...sttSlots].some(s => hudSymbols.get(s) === symbol),
  }));
  threats.sort((a, b) => Number(b.locked) - Number(a.locked) || a.slot - b.slot);
  return { threats, ai: lamps.threatAi === true, cw: lamps.threatCw === true, sam: lamps.threatSam === true, aaa: lamps.threatAaa === true };
}

const describe = (t: HornetThreat | undefined) => (t ? `${t.symbol}${t.names.length ? ` (${t.names.slice(0, 2).join(', ')})` : ''}` : '');

/**
 * Calls the RWR picture like a backseater: a new symbol, a spike (AI light), missile guidance (CW light), a SAM
 * lock. Searches only get a short "new threat" call, once per symbol.
 */
export class HornetThreatTracker {
  private lastSeen = new Map<string, number>();
  private ai = false;
  private cw = false;
  private sam = false;

  update(p: HornetThreats | null, t: number): { calls: Callout[]; active: ActiveAlert[] } {
    const calls: Callout[] = [];
    const active: ActiveAlert[] = [];
    if (!p) return { calls, active };
    for (const th of p.threats) {
      const seen = this.lastSeen.get(th.symbol);
      // The symbol blinks while it flashes, so "new" means not seen for 20 s.
      if (seen === undefined || t - seen > 20) {
        calls.push({ id: `rwr-new-${th.symbol}`, severity: 'advisory', text: `NEW THREAT ${describe(th)}`, say: `New threat, ${sayCode(th.symbol)}.`, t });
      }
      this.lastSeen.set(th.symbol, t);
    }
    const lockedBy = p.threats.find(x => x.locked) ?? (p.threats.length === 1 ? p.threats[0] : undefined);
    if (p.cw) {
      active.push({ id: 'rwr-cw', severity: 'warning', text: `MISSILE GUIDING (CW)  ${describe(lockedBy)}`.trim(), sinceS: t });
      if (!this.cw) calls.push({ id: 'rwr-cw', severity: 'warning', text: `CW LIGHT, MISSILE GUIDING ${describe(lockedBy)}`.trim(), say: 'Missile guiding. Defend.', t });
    } else if (p.ai) {
      active.push({ id: 'rwr-ai', severity: 'caution', text: `SPIKE  ${describe(lockedBy)}`.trim(), sinceS: t });
      if (!this.ai) calls.push({ id: 'rwr-ai', severity: 'caution', text: `SPIKE, AI LOCK ${describe(lockedBy)}`.trim(), say: lockedBy ? `Spike, ${sayCode(lockedBy.symbol)}.` : 'Spike.', t });
    }
    if (p.sam) {
      active.push({ id: 'rwr-sam', severity: 'warning', text: 'SAM LOCK', sinceS: t });
      if (!this.sam) calls.push({ id: 'rwr-sam', severity: 'warning', text: 'SAM LIGHT, SAM RADAR LOCKED', say: 'SAM lock.', t });
    }
    this.ai = p.ai;
    this.cw = p.cw;
    this.sam = p.sam;
    return { calls, active };
  }

  reset(): void { this.lastSeen.clear(); this.ai = this.cw = this.sam = false; }
}

export interface HornetMissile { slot: number; ttgS?: number; active: boolean }
export interface HornetLock {
  rangeNm?: number;
  closureKt?: number;
  inLar: boolean;
  /** "MEM 7": the radar is coasting the track; the lock is about to drop. */
  memory?: string;
  targetAltFt?: number;
  /** Attack-format ASPECT and HUD target angle as displayed; meaning not verified. */
  aspectRaw?: string;
  targetAngleRaw?: string;
  targetHeadingDeg?: number;
  /** HUD missile timer: TTG / ACT label and seconds. */
  tof?: { label: string; s: number };
  missiles: HornetMissile[];
}

const numIn = (s: string | undefined) => {
  const m = s?.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : undefined;
};

/** The radar lock as the HUD and attack format show it; null when the HUD shows no target range. */
export function hornetLock(f: DcsFrame | null): HornetLock | null {
  const hud = f?.disp?.hud, radar = f?.disp?.radar ?? {};
  const rng = hud?.HUD_AA_targetRange_FLOOD;
  if (!hud || !rng) return null;
  const missiles: HornetMissile[] = [];
  for (const [k, v] of Object.entries(radar)) {
    const slot = slotOf(k, 'AA_MSL_Symb_Mode');
    if (Number.isNaN(slot)) continue;
    missiles.push({ slot, ttgS: numIn(radar[`MissileTTG${slot}`]), active: v.trim() === 'A' });
  }
  missiles.sort((a, b) => a.slot - b.slot);
  const tofS = numIn(hud.TOF_TTG_VAL);
  const altK = numIn(radar.TUC_PlaceholderTUC_Altitude);
  return {
    rangeNm: numIn(rng),
    closureKt: numIn(hud.HUD_AA_targetRangeRate),
    inLar: (hud.HUD_AA_TD_box_IN_LAR_cue ?? radar.IN_LAR_DDI ?? '').includes('LAR'),
    memory: hud.MEM_RMEM_Label?.trim() || radar.MEM_RMEM_JAM_RJAM_Label?.trim() || undefined,
    targetAltFt: altK === undefined ? undefined : altK * 1000,
    aspectRaw: radar.ASPECT_DDI?.trim() || undefined,
    targetAngleRaw: hud.HUD_TargetAngleReadout?.trim() || undefined,
    targetHeadingDeg: numIn(radar.TargetHeading),
    tof: tofS === undefined ? undefined : { label: hud.AA_MSL_label?.trim() || 'TOF', s: tofS },
    missiles,
  };
}

/** Lock calls: a new lock with range and closure, IN LAR, memory, pitbull per missile, lock lost, Fox three. */
export class HornetLockTracker {
  private had: number | null = null;
  private inLar = false;
  private memory = false;
  private active = new Set<number>();
  private amraams: number | null = null;
  private others = '';

  update(lock: HornetLock | null, f: DcsFrame | null, t: number): { calls: Callout[]; active: ActiveAlert[] } {
    const calls: Callout[] = [];
    const active: ActiveAlert[] = [];
    // Fox three: the AIM-120 count went down and nothing else on the jet changed (a hit or a reload changes more).
    const counts = Object.entries(f?.stores?.counts ?? {});
    const n = counts.filter(([k]) => /AIM-?120/i.test(k)).reduce((a, [, c]) => a + c, 0);
    const others = counts.filter(([k]) => !/AIM-?120/i.test(k)).map(([k, c]) => `${k}:${c}`).sort().join(',');
    if (f?.stores && this.amraams !== null && n < this.amraams && n >= this.amraams - 2 && others === this.others) {
      calls.push({ id: 'fox3', severity: 'advisory', text: 'FOX THREE', say: 'Fox three.', t });
    }
    if (f?.stores) { this.amraams = n; this.others = others; }

    if (!lock) {
      if (this.had !== null && t - this.had > 1.5) {
        calls.push({ id: 'lock-lost', severity: 'advisory', text: 'LOCK LOST', say: 'Lock lost.', t });
        this.had = null;
        this.inLar = this.memory = false;
      }
      return { calls, active };
    }
    if (this.had === null && lock.rangeNm !== undefined) {
      const nm = Math.round(lock.rangeNm);
      const vc = lock.closureKt !== undefined ? `, closing ${Math.round(lock.closureKt)}` : '';
      calls.push({ id: 'lock-new', severity: 'advisory', text: `LOCKED ${nm} NM${lock.closureKt !== undefined ? ` VC ${Math.round(lock.closureKt)}` : ''}`, say: `Locked, ${nm} miles${vc}.`, t });
    }
    this.had = t;
    if (lock.inLar && !this.inLar) calls.push({ id: 'in-lar', severity: 'advisory', text: 'IN LAR', say: 'In LAR.', t });
    this.inLar = lock.inLar;
    const mem = lock.memory !== undefined;
    if (mem) active.push({ id: 'lock-mem', severity: 'caution', text: `RADAR ${lock.memory}`, sinceS: t });
    if (mem && !this.memory) calls.push({ id: 'lock-mem', severity: 'caution', text: `RADAR MEMORY (${lock.memory})`, say: 'Memory. Re-lock.', t });
    this.memory = mem;
    const nowActive = new Set(lock.missiles.filter(m => m.active).map(m => m.slot));
    for (const s of nowActive) if (!this.active.has(s)) calls.push({ id: `pitbull-${s}`, severity: 'advisory', text: `PITBULL, MISSILE ${s}`, say: 'Pitbull.', t });
    this.active = nowActive;
    return { calls, active };
  }

  reset(): void { this.had = null; this.inLar = this.memory = false; this.active.clear(); this.amraams = null; this.others = ''; }
}
