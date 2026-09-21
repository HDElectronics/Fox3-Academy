/**
 * [OWNER: page-tws] The keys this lesson uses, read from the jet's PROCEDURES binds (src/data/procedures.ts).
 * Keyboard defaults come from the bind's `keyboard` field. Where DCS has no default key, the page
 * uses a stand-in and says so (source 'page').
 */
import { PROCEDURES } from '../../data/procedures';
import { AIRCRAFT } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import type { AircraftId, KeyBind, MissileId } from '../../data/types';
import { parseChord, splitAlternatives } from '../../ui/keys';

export type PageAct =
  | 'mode'        // RWS <-> TWS (FC3 RAlt + I, F-16 TMS Right held)
  | 'designate'   // designate / bug / lock the contact under the cursor
  | 'stt'         // lock the primary (Hornet SCS toward the radar DDI)
  | 'unlock'      // back to search / drop designations
  | 'undesignate' // remove one designation (F-15C "Unlock TWS Target")
  | 'cycle'       // next primary: Hornet Undesignate, F-16 TMS Right, JF-17 S2 Left
  | 'fire'
  | 'weapon'
  | 'range'
  | 'scanLR'
  | 'scanWidth';

export interface ActBind {
  act: PageAct;
  /** What DCS calls it: the controls-menu action (FC3) or the HOTAS / cockpit function (full fidelity). */
  name: string;
  /** Key string to show and bind. null = click only. */
  keys: string | null;
  /** 'dcs' = the DCS default key; 'page' = DCS has no default, this page's stand-in. */
  source: 'dcs' | 'page' | null;
  /** Seconds the key must be held (FC3 launch 1 s, M-2000C 530D 2 s, F-16 TMS Right 1 s for TWS). */
  holdS?: number;
  note?: string;
}

export interface CursorKeys { up: string; down: string; left: string; right: string; name: string; source: 'dcs' | 'page' }

export interface JetBinds {
  acts: Partial<Record<PageAct, ActBind>>;
  cursor: CursorKeys | null;
  /** Weapon-select keys by missile, where the jet has one key per weapon (Hornet LShift + D / W / S). */
  weaponKeys: Partial<Record<MissileId, string>>;
}

/** True when every alternative in the string parses as a key chord (not prose like 'No default key'). */
export function isBindable(keys: string | null | undefined): keys is string {
  if (!keys) return false;
  const alts = splitAlternatives(keys);
  return alts.length > 0 && alts.every(a => parseChord(a.trim()) !== null);
}

/** Alternative `i` of a key string ('D / C' → 'D'), or null. */
export function alternative(keys: string | null, i: number): string | null {
  if (!keys) return null;
  const alts = splitAlternatives(keys).map(s => s.trim());
  const k = alts[i];
  return k && parseChord(k) ? k : null;
}

function find(binds: KeyBind[], re: RegExp): KeyBind | undefined {
  return binds.find(b => re.test(b.action));
}

/** Holding time written in the action text ("hold at least 2 s"). */
function holdOf(b: KeyBind | undefined): number | undefined {
  const m = b ? /hold at least (\d+(?:\.\d+)?)\s*s/i.exec(b.action) : null;
  return m ? Number(m[1]) : undefined;
}

/** DCS keyboard default from the shared catalogue. */
function dcsKey( b: KeyBind | undefined, alt = -1): string | null {
  if (!b) return null;
  const raw = isBindable(b.keyboard) ? b.keyboard : null;
  if (!raw) return null;
  return alt >= 0 ? alternative(raw, alt) : raw;
}

function make(ac: AircraftId, act: PageAct, b: KeyBind | undefined, o: { alt?: number; fallback?: string; name?: string; note?: string; holdS?: number; noKey?: boolean } = {}): ActBind | undefined {
  if (!b && !o.fallback) return undefined;
  const k = o.noKey ? null : dcsKey(b, o.alt ?? -1);
  const fc3 = AIRCRAFT[ac].module === 'fc3';
  const name = o.name ?? (b ? (fc3 ? b.action : b.keys) : act);
  if (k) return { act, name, keys: k, source: 'dcs', holdS: o.holdS ?? holdOf(b), note: o.note };
  if (o.fallback) return { act, name, keys: o.fallback, source: 'page', holdS: o.holdS ?? holdOf(b), note: o.note ?? 'No DCS default key: this page uses a stand-in.' };
  return { act, name, keys: null, source: null, note: o.note ?? b?.note };
}

/** Cursor keys, in the order the bind names the directions ("Up / Left / Down / Right"). */
function cursorOf(ac: AircraftId, binds: KeyBind[]): CursorKeys | null {
  const b = find(binds, /^Cursor/i);
  if (!b) return { up: ';', down: '.', left: ',', right: '/', name: 'Trainer radar cursor', source: 'page' };
  const fc3 = AIRCRAFT[ac].module === 'fc3';
  const raw = b.keyboard;
  const dirsText = fc3 ? (b.note ?? '') : b.keys;
  const dirs = (dirsText.match(/\b(Up|Down|Left|Right)\b/gi) ?? []).map(d => d.toLowerCase());
  const src = raw ? 'dcs' as const : 'page' as const;
  const tokens = (raw ?? '; . , /').trim().split(/\s+/);
  const order = dirs.length === 4 && raw ? dirs : ['up', 'down', 'left', 'right'];
  if (tokens.length !== 4 || !tokens.every(t => parseChord(t))) return null;
  const map: Record<string, string> = {};
  order.forEach((d, i) => { map[d] = tokens[i]; });
  if (!map.up || !map.down || !map.left || !map.right) return null;
  return { up: map.up, down: map.down, left: map.left, right: map.right, name: fc3 ? b.action : b.keys, source: src };
}

/** Every key the TWS lesson binds for this jet, from its PROCEDURES. */
export function resolveBinds(ac: AircraftId): JetBinds {
  const binds = PROCEDURES[ac].binds;
  const acts: Partial<Record<PageAct, ActBind>> = {};
  const put = (a: ActBind | undefined) => { if (a) acts[a.act] = a; };
  const spec = AIRCRAFT[ac];
  const weaponKeys: Partial<Record<MissileId, string>> = {};

  if (spec.module === 'fc3') {
    put(make(ac, 'mode', find(binds, /^RWS \/ TWS/)));
    put(make(ac, 'designate', find(binds, /^Designate/)));
    put(make(ac, 'unlock', find(binds, /^Unlock/)));
    put(make(ac, 'undesignate', find(binds, /Remove one TWS designation/)));
    put(make(ac, 'fire', find(binds, /^Launch/)));
    put(make(ac, 'weapon', find(binds, /^Weapon cycle/), { alt: 0 }));
    put(make(ac, 'range', find(binds, /^(Display range|Range scale)/)));
    put(make(ac, 'scanLR', find(binds, /^Scan zone left/)));
    put(make(ac, 'scanWidth', find(binds, /^Scan width/)));
  } else if (ac === 'fa18c') {
    put(make(ac, 'mode', find(binds, /^Radar mode/), { noKey: true, name: 'TDC Depress on the PB5 mode legend', note: 'In DCS: slew the TDC over the mode legend and press Enter. Here: click.' }));
    put(make(ac, 'designate', find(binds, /^Designate/)));
    const und = find(binds, /^Undesignate/);
    put(make(ac, 'cycle', und));
    put(make(ac, 'unlock', und));
    put(make(ac, 'stt', find(binds, /^TDC to the radar DDI/)));
    put(make(ac, 'fire', find(binds, /^Launch/)));
    const w = find(binds, /^Weapon select/);
    const wk = w?.keyboard;
    if (wk) {
      const alts = splitAlternatives(wk).map(s => s.trim());
      for (const id of spec.missiles) {
        const nm = MISSILES[id].name;
        const i = nm.startsWith('AIM-120') ? 0 : nm.startsWith('AIM-7') ? 1 : nm.startsWith('AIM-9') ? 2 : -1;
        if (i >= 0 && alts[i] && parseChord(alts[i])) weaponKeys[id] = alts[i];
      }
    }
  } else if (ac === 'f16c') {
    const tmsR = find(binds, /^TWS on \/ off/);
    put(make(ac, 'mode', tmsR, { holdS: 1, name: `${tmsR?.keys ?? 'TMS Right'} (hold 1 s)` }));
    put(make(ac, 'cycle', tmsR, { name: `${tmsR?.keys ?? 'TMS Right'} (short)` }));
    put(make(ac, 'designate', find(binds, /^Upgrade \/ bug/)));
    put(make(ac, 'unlock', find(binds, /^Reject/)));
    put(make(ac, 'weapon', find(binds, /^Missile step/)));
    put(make(ac, 'fire', find(binds, /^Launch/)));
  } else if (ac === 'f14b') {
    const jr = find(binds, /^Radar on, mode/);
    put(make(ac, 'mode', jr, { name: jr?.keys ?? 'Jester radar menu', note: 'In DCS the RIO (or Jester, menu key A) runs the radar. Here: click.' }));
    const lk = find(binds, /^Lock \/ unlock/);
    put(make(ac, 'designate', lk, { fallback: 'Enter', name: 'NEXT LAUNCH / Jester: lock from the TWS list', note: 'No pilot key in DCS: the RIO hooks tracks. This page uses Enter.' }));
    put(make(ac, 'unlock', lk, { fallback: 'Backspace', name: 'Jester: unlock', note: 'No pilot key in DCS. This page uses Backspace.' }));
    const tr = find(binds, /^Launch/);
    put(make(ac, 'fire', tr, { fallback: 'Space', note: 'DCS default key not verified (candidate: Space). This page uses Space.' }));
  } else if (ac === 'jf17') {
    const s2l = find(binds, /^Mode RWS \/ TWS/);
    put(make(ac, 'mode', s2l, { fallback: 'RAlt + I', name: s2l?.keys ?? 'S2 LEFT' }));
    put(make(ac, 'cycle', s2l, { fallback: 'N', name: `${s2l?.keys ?? 'S2 LEFT'} (swap HPT and SPT)` }));
    put(make(ac, 'designate', find(binds, /^Bug HPT/)));
    put(make(ac, 'unlock', find(binds, /^Unlock/), { fallback: 'Backspace' }));
    put(make(ac, 'fire', find(binds, /^Launch/)));
  } else if (ac === 'm2000c') {
    put(make(ac, 'designate', find(binds, /^Lock \(PSIC\)/), { fallback: 'Enter' }));
    put(make(ac, 'unlock', find(binds, /^Unlock/), { fallback: 'Backspace' }));
    put(make(ac, 'fire', find(binds, /^Launch/)));
  }
  return { acts, cursor: cursorOf(ac, binds), weaponKeys };
}
