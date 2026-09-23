/**
 * Sortie key map, built from the jet's own binds in data/procedures.ts (never hard-coded per jet).
 * Keyboard defaults come from KeyBind.keyboard; null means absent or unverified.
 * Trainer keys (steering, throttle, time, camera) are added only where they do not collide with the jet's keys.
 */
import type { FighterId, KeyBind, MissileId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { PROCEDURES } from '../../data/procedures';
import { parseChord, parseKeyList, splitAlternatives } from '../../ui/keys';

export type ActionId =
  | 'radarPower' | 'bvrMode' | 'modeToggle' | 'designate' | 'lockPrimary' | 'unlock' | 'step'
  | 'rangeIn' | 'rangeOut' | 'cursorUp' | 'cursorDown' | 'cursorLeft' | 'cursorRight' | 'cursorCenter'
  | 'elevUp' | 'elevDown' | 'weaponCycle' | 'launch' | 'chaff' | 'flare' | 'decoys';

export interface JetKey {
  action: ActionId;
  /** Keyboard chord in DCS spelling ('RAlt + I'), or null when DCS has no default key for it. */
  keys: string | null;
  /** The DCS name: controls-menu action (FC3) or HOTAS / cockpit function (full fidelity). */
  dcsName: string;
  /** Seconds the key must be held (FC3 Russian launch: 1 s; M-2000C 530: 2 s; F-16 TMS Right for TWS: 1 s). */
  holdS?: number;
  /** A short press does this instead (F-16 TMS Right: tap = step bug, hold = TWS). */
  tap?: ActionId;
  /** Hornet Undesignate: steps L&S in TWS, leaves STT otherwise. */
  stepsInTws?: boolean;
  note?: string;
  /** DCS key used by another trainer action; keep its identity without parsing prose. */
  sharedKeys?: string;
}

export interface WeaponSelectKey {
  keys: string;
  family: string;          // 'AMRAAM', 'Sparrow', 'AIM-120' ...
  missiles: MissileId[];   // ids of the jet's missiles in that family
  dcsName: string;
}

export interface JetKeyMap {
  aircraft: FighterId;
  module: 'fc3' | 'full';
  keys: Partial<Record<ActionId, JetKey>>;
  selects: WeaponSelectKey[];
}

interface Matcher { action: ActionId | 'rangeInOut' | 'cursor' | 'elev'; re: RegExp }
const MATCHERS: Matcher[] = [
  { action: 'radarPower', re: /^Radar on \/ off|^Radar emission/i },
  { action: 'bvrMode', re: /^BVR mode$|^BVR search/i },
  { action: 'modeToggle', re: /^RWS \/ TWS|^TWS on \/ off|^Radar mode RWS|^Mode RWS|^Radar on, mode/i },
  { action: 'designate', re: /^Designate|^Upgrade \/ bug|^Bug HPT|^Lock \(PSIC\)|^Lock \/ unlock \(through Jester\)/i },
  { action: 'lockPrimary', re: /in TWS: STT on the L&S/i },
  { action: 'unlock', re: /^Unlock|^Undesignate|^Reject, downgrade, unlock/i },
  { action: 'rangeInOut', re: /^Display range in \/ out|^Range scale$|^Range up \/ down/i },
  { action: 'cursor', re: /^Cursor( \([^)]*\))? slew/i },
  { action: 'cursorCenter', re: /^Cursor to centre/i },
  { action: 'elev', re: /^Antenna elevation|^Scan elevation/i },
  { action: 'weaponCycle', re: /^Weapon cycle|^Missile step|^Missile type \/ missile step|^Sparrow ↔ Phoenix/i },
  { action: 'launch', re: /^Launch(?! permission)/i },
  { action: 'chaff', re: /^Chaff/i },
  { action: 'flare', re: /^Flares/i },
  { action: 'decoys', re: /^Countermeasure program|^Countermeasures(:|$)/i },
];

/** Missile families by the names DCS menus use. */
const FAMILIES: { re: RegExp; prefix: string }[] = [
  { re: /AMRAAM|AIM-120/i, prefix: 'aim120' },
  { re: /Sparrow|AIM-7/i, prefix: 'aim7' },
  { re: /Sidewinder|AIM-9/i, prefix: 'aim9' },
  { re: /Phoenix|AIM-54/i, prefix: 'aim54' },
];

function holdOf(action: string): number | undefined {
  const m = /hold (?:at least )?(\d+(?:\.\d+)?) s/i.exec(action);
  return m ? Number(m[1]) : undefined;
}

/** Build the sortie key map for one jet. */
export function jetKeyMap(ac: FighterId): JetKeyMap {
  const module = AIRCRAFT[ac].module;
  const binds = PROCEDURES[ac].binds;
  const keys: Partial<Record<ActionId, JetKey>> = {};
  const selects: WeaponSelectKey[] = [];
  const set = (k: JetKey) => {
    const cur = keys[k.action];
    // Prefer a bind that has a keyboard default over one that does not.
    if (!cur || (!cur.keys && k.keys)) keys[k.action] = k;
  };

  for (const b of binds) {
    const kb = b.keyboard;
    const dcsName = module === 'fc3' ? b.action : b.keys;

    // Weapon select by family (Hornet 'Weapon select AMRAAM / Sparrow / …', Viper 'AIM-120 (missile override)').
    if (/^Weapon select|missile override/i.test(b.action) && kb) {
      const names = b.action.replace(/^Weapon select\s*/i, '').split(/\s*\/\s*/);
      const alts = splitAlternatives(kb);
      // One HOTAS / menu name per family when the bind lists them all ('Select AMRAAM / Select Sparrow / …').
      const hotas = b.keys.split(/\s+\/\s+/);
      const pairs = alts.length === names.length ? names.map((n, i) => [n, alts[i], hotas.length === names.length ? hotas[i] : b.keys] as const) : [[b.action, alts[0], b.keys] as const];
      for (const [name, k, dcs] of pairs) {
        const fam = FAMILIES.find(f => f.re.test(name));
        if (!fam || !k) continue;
        const missiles = AIRCRAFT[ac].missiles.filter(m => m.startsWith(fam.prefix));
        if (missiles.length) selects.push({ keys: k, family: name.trim(), missiles, dcsName: dcs });
      }
      continue;
    }

    const m = MATCHERS.find(x => x.re.test(b.action));
    if (!m) continue;
    const alts = kb ? splitAlternatives(kb) : [];
    const base = { dcsName, note: b.note };
    switch (m.action) {
      case 'rangeInOut':
        set({ ...base, action: 'rangeIn', keys: alts[0] ?? null });
        set({ ...base, action: 'rangeOut', keys: alts[1] ?? null });
        break;
      case 'elev':
        set({ ...base, action: 'elevUp', keys: alts[0] ?? null });
        set({ ...base, action: 'elevDown', keys: alts[1] ?? null });
        break;
      case 'cursor': {
        // ';' up, '.' down, ',' left, '/' right, whatever order the data lists them in.
        const toks = kb ? kb.split(/\s+/) : [];
        const has = (c: string) => toks.includes(c);
        set({ ...base, action: 'cursorUp', keys: has(';') ? ';' : null });
        set({ ...base, action: 'cursorDown', keys: has('.') ? '.' : null });
        set({ ...base, action: 'cursorLeft', keys: has(',') ? ',' : null });
        set({ ...base, action: 'cursorRight', keys: has('/') ? '/' : null });
        break;
      }
      case 'modeToggle': {
        const hold = /hold 1 s/i.test(b.action) ? 1 : undefined;
        set({ ...base, action: 'modeToggle', keys: alts[0] ?? null, holdS: hold, tap: hold && /step bug/i.test(b.action) ? 'step' : undefined });
        break;
      }
      case 'unlock':
        set({ ...base, action: 'unlock', keys: alts[0] ?? null, stepsInTws: /^Undesignate: step/i.test(b.action) || undefined });
        break;
      case 'launch':
        set({ ...base, action: 'launch', keys: alts[0] ?? null, holdS: holdOf(b.action) });
        break;
      case 'decoys':
        set({ ...base, action: 'decoys', keys: alts[0] ?? null });
        break;
      default:
        set({ ...base, action: m.action, keys: alts[0] ?? null });
    }
  }

  // A key already taken by an earlier action is not bound twice (Hornet: Enter designates; the mode
  // legend needs the TDC over it, so the mode change stays a click here).
  const order: ActionId[] = ['designate', 'launch', 'unlock', 'lockPrimary', 'cursorUp', 'cursorDown', 'cursorLeft', 'cursorRight', 'cursorCenter',
    'modeToggle', 'bvrMode', 'radarPower', 'rangeIn', 'rangeOut', 'elevUp', 'elevDown', 'weaponCycle', 'chaff', 'flare', 'decoys', 'step'];
  const used = new Set<string>();
  for (const a of order) {
    const k = keys[a];
    if (!k?.keys) continue;
    const texts = parseKeyList(k.keys).map(c => c.text);
    if (!texts.length || texts.some(t => used.has(t))) {
      keys[a] = { ...k, keys: null, sharedKeys: k.keys, note: `Shares ${k.keys} with another function in DCS; click it here. ${k.note ?? ''}`.trim() };
      continue;
    }
    texts.forEach(t => used.add(t));
  }
  for (const s of selects) {
    const t = parseKeyList(s.keys).map(c => c.text);
    t.forEach(x => used.add(x));
  }
  return { aircraft: ac, module, keys, selects };
}

/** Every chord the jet's map binds (normalised 'RAlt+I' texts), for collision checks. */
export function usedChords(map: JetKeyMap): Set<string> {
  const out = new Set<string>();
  for (const k of Object.values(map.keys)) if (k?.keys) for (const c of parseKeyList(k.keys)) out.add(c.text);
  for (const s of map.selects) for (const c of parseKeyList(s.keys)) out.add(c.text);
  return out;
}

export interface TrainerKeys {
  left: string; right: string; climb: string; descend: string;
  faster: string; slower: string; afterburner: string | null;
  timeFaster: string; timeSlower: string; timeNormal: string; pause: string;
  chase: string | null; map: string | null; weaponView: string | null;
}

/**
 * Steering and time keys. Arrows always steer; A/D and W/S are added only when the jet does not use those
 * letters (FC3 D = weapon cycle, Hornet S = undesignate, Viper S = missile step). Time keys are DCS's own
 * (LCtrl + Z faster, LAlt + Z slower, LShift + Z normal, Pause), plus P for keyboards without Pause.
 */
export function trainerKeys(map: JetKeyMap): TrainerKeys {
  const used = usedChords(map);
  const free = (...k: string[]) => k.every(x => !used.has(parseChord(x)?.text ?? x));
  const ad = free('A', 'D');
  const ws = free('W', 'S');
  const fk = (k: string) => (free(k) ? k : null);
  return {
    left: ad ? 'Left / A' : 'Left',
    right: ad ? 'Right / D' : 'Right',
    climb: ws ? 'Up / W' : 'Up',
    descend: ws ? 'Down / S' : 'Down',
    faster: 'LShift',
    slower: 'LCtrl',
    afterburner: fk('B'),
    timeFaster: 'LCtrl + Z',
    timeSlower: 'LAlt + Z',
    timeNormal: 'LShift + Z',
    pause: free('P') ? 'Pause / P' : 'Pause',
    chase: fk('F2'),
    map: fk('F10'),
    weaponView: fk('F6'),
  };
}
