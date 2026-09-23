/**
 * [OWNER: page-rwr-trainer] Shared bits for the Learn and Quiz modes: the RWR bezel, per-jet binds
 * (RWR mode, chaff) read from PROCEDURES, and the mode-controller contract.
 */
import type { FighterId, AircraftSpec, RwrId } from '../../data/types';
import { PROCEDURES } from '../../data/procedures';
import { RWRS } from '../../data/rwr';
import type { RwrContact } from '../../sim/types';
import { h, screenBezel, type ScreenBezelHandle } from '../../ui';
import type { AppStore } from '../../app/store';

/** Placard on the RWR bezel, as the cockpit labels it. */
export const RWR_PLACARD: Record<RwrId, string> = {
  spo15: 'СПО-15',
  alr56c: 'TEWS',
  alr67: 'ALR-67',
  alr56m: 'ALR-56M',
  jf17rwr: 'RWR · MAWS',
  serval: 'VCM · SERVAL',
};

/** Short everyday name for copy ('the SPO', 'the TEWS'). */
export const RWR_SHORT: Record<RwrId, string> = {
  spo15: 'the SPO', alr56c: 'the TEWS', alr67: 'the ALR-67', alr56m: 'the ALR-56M', jf17rwr: 'the RWR', serval: 'the Serval',
};

/** FC3 jets: the RWR/SPO mode bind (All / Lock only). Null where the jet's binds have none. */
export function rwrModeKeys(ac: FighterId): string | null {
  const b = PROCEDURES[ac].binds.find(x => /^RWR mode/i.test(x.action));
  if (!b) return null;
  const first = b.keys.split(' / ')[0]?.trim();
  return first && /^[A-Za-z]+\s*\+\s*\w$/.test(first) ? first.replace(/\s+/g, '') : null;
}

/** One way to dispense chaff: a keyboard chord (may be empty), the HOTAS / controls-menu name, and a caveat. */
export interface ChaffBind { keys: string; hotas: string | null; note: string | null }

/**
 * The jet's chaff keyboard defaults from PROCEDURES (paired
 * alternatives such as the Mirage's "Decoy Program release / Decoy PANIC" = "Delete / Insert" come back
 * as two binds). Without a known default key the HOTAS name comes back with a caveat.
 */
export function chaffBinds(ac: FighterId): ChaffBind[] {
  const binds = PROCEDURES[ac].binds;
  const b = binds.find(x => /^chaff/i.test(x.action)) ?? binds.find(x => /countermeasure|decoy/i.test(x.action));
  if (!b) return [];
  const keys = b.keys.trim();
  if (/^(Insert|Delete|[A-Z])$/.test(keys)) return [{ keys, hotas: null, note: null }];
  const kb = b.keyboard;
  const names = keys.split(' / ').map(x => x.trim());
  if (kb) {
    const ks = kb.split(' / ').map(x => x.trim());
    if (ks.length > 1 && ks.length === names.length) return ks.map((k, i) => ({ keys: k, hotas: names[i], note: null }));
    return [{ keys: kb, hotas: keys, note: null }];
  }
  // No default key: name the switch position that dispenses (first of a "Switch - Fwd / Left / ..." list).
  const first = names.length > 1 && /\s-\s/.test(names[0]) ? names[0] : keys;
  const unverified = /not in research/i.test(b.note ?? '');
  return [{ keys: '', hotas: first, note: unverified ? 'name not confirmed: check your controls' : 'no default key: bind it' }];
}

export interface RwrBezel {
  bezel: ScreenBezelHandle;
  canvas: HTMLCanvasElement;
  /** Wrapper that sizes the bezel as a big square in the centre column. */
  el: HTMLElement;
}

export function rwrBezel(spec: AircraftSpec, id: string): RwrBezel {
  const canvas = h('canvas', { class: 'rwrt-rwr__canvas' });
  const bezel = screenBezel({ id, label: RWR_PLACARD[spec.rwr], aspect: '1', content: canvas, status: RWRS[spec.rwr].name });
  const el = h('div', { class: 'rwrt-rwrbox' }, h('div', { class: 'rwrt-rwr' }, bezel.el));
  return { bezel, canvas, el };
}

/** A mode (Learn / Quiz) fills the three columns and runs inside the page loop. */
export interface ModeController {
  /** Called every animation frame with page time (s). */
  frame(t: number): void;
  /** Current RWR contacts (for audio). */
  contacts(): readonly RwrContact[];
  unmount(): void;
}

export interface ModeHost {
  app: AppStore;
  spec: AircraftSpec;
  left: HTMLElement;
  centre: HTMLElement;
  right: HTMLElement;
  params: URLSearchParams;
  /** Page clock (s) now. */
  now(): number;
}
