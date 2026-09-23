/**
 * Attack-jet (Su-25T) state: loadout, master mode, store selection. The Shkval lives in shkval.ts and weapon
 * release in agWeapons.ts. Selection follows S1: [D] cycles the stores, [C] selects the cannon.
 */
import type { AgLoadout, AgWeaponId } from '../data/types';
import { AG_WEAPON_ORDER, SU25T_GUN_ROUNDS, SU25T_LOADOUTS } from '../data/agWeapons';
import type { AttackState } from './types';
import { createShkvalState } from './shkval';

/** A-G state for a freshly spawned attack jet with one of the SU25T_LOADOUTS (default: the first). */
export function createAttackState(loadoutId?: string): AttackState {
  const lo: AgLoadout = SU25T_LOADOUTS.find(l => l.id === loadoutId) ?? SU25T_LOADOUTS[0];
  const stores: AttackState['stores'] = { gun25t: lo.gunRounds ?? SU25T_GUN_ROUNDS };
  const stations = lo.stations.map(s => ({ ...s }));
  for (const s of stations) {
    if (s.weapon === 'l081' || s.weapon === 'r60' || s.weapon === 'r73') continue;
    stores[s.weapon] = (stores[s.weapon] ?? 0) + s.count;
  }
  const ag: AttackState = {
    master: 'nav', stores, stations, selected: null, station: null, pair: false,
    pod: stations.some(s => s.weapon === 'l081'), arm: { detecting: false, emitterId: null }, ccrpHeld: false, ccrpReleased: false,
    shkval: createShkvalState(),
  };
  selectAgWeapon(ag, AG_WEAPON_ORDER.find(w => w !== 'gun25t' && (stores[w] ?? 0) > 0) ?? null);
  return ag;
}

/** Stations still carrying `w`, in station order. */
export const stationsWith = (ag: AttackState, w: AgWeaponId) => ag.stations.filter(s => s.weapon === w && s.count > 0);

/** Select a store (null = none). The cannon has no station. */
export function selectAgWeapon(ag: AttackState, w: AgWeaponId | null): AgWeaponId | null {
  if (w && (ag.stores[w] ?? 0) <= 0) return ag.selected;
  ag.selected = w;
  ag.station = w && w !== 'gun25t' ? (stationsWith(ag, w)[0]?.station ?? null) : null;
  return w;
}

/** [D]: next store with rounds left (the cannon is on [C], not in the cycle). */
export function cycleAgWeapon(ag: AttackState): AgWeaponId | null {
  const avail = AG_WEAPON_ORDER.filter(w => w !== 'gun25t' && (ag.stores[w] ?? 0) > 0);
  if (!avail.length) return selectAgWeapon(ag, null);
  const i = ag.selected ? avail.indexOf(ag.selected) : -1;
  return selectAgWeapon(ag, avail[(i + 1) % avail.length]);
}
