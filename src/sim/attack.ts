/**
 * Attack-jet state (Su-25T, A-10C II): loadout, master mode, store selection. The Su-25T Shkval lives in shkval.ts,
 * the A-10C II targeting pod in tgp.ts, weapon release in agWeapons.ts. Su-25T selection follows S1: [D] cycles the
 * stores, [C] selects the cannon.
 */
import { Vector3 } from 'three';
import type { AgLoadout, AgWeaponId, AttackId } from '../data/types';
import { AG_LOADOUTS, AG_WEAPONS, AG_WEAPON_ORDER, GUN_ROUNDS } from '../data/agWeapons';
import type { AgSalvo, AttackState } from './types';
import { createShkvalState } from './shkval';
import { createTgp } from './tgp';
import { createMav } from './maverick';

/** Each attack jet's cannon store. */
export const GUN_OF: Record<AttackId, AgWeaponId> = { su25t: 'gun25t', a10c: 'gau8' };
const isGun = (w: AgWeaponId) => AG_WEAPONS[w].kind === 'gun';

/** A-G state for a freshly spawned attack jet with one of its AG_LOADOUTS (default: the first). */
export function createAttackState(type: AttackId, loadoutId?: string): AttackState {
  const list = AG_LOADOUTS[type];
  const lo: AgLoadout = list.find(l => l.id === loadoutId) ?? list[0];
  const stores: AttackState['stores'] = { [GUN_OF[type]]: lo.gunRounds ?? GUN_ROUNDS[type] };
  const stations = lo.stations.map(s => ({ ...s }));
  for (const s of stations) {
    if (s.weapon === 'l081' || s.weapon === 'r60' || s.weapon === 'r73' || s.weapon === 'tgp' || s.weapon === 'aim9m') continue;
    stores[s.weapon] = (stores[s.weapon] ?? 0) + s.count;
  }
  const ag: AttackState = {
    master: 'nav', stores, stations, selected: null, station: null, pair: false, salvo: 1,
    pod: stations.some(s => s.weapon === 'l081'), arm: { detecting: false, emitterId: null }, ccrpHeld: false, ccrpReleased: false,
    shkval: createShkvalState(),
    tgp: stations.some(s => s.weapon === 'tgp') ? createTgp(new Vector3()) : null,
    mav: (stores.agm65d ?? 0) + (stores.agm65h ?? 0) > 0 ? createMav() : null,
    spi: null,
    laserCodes: {},
  };
  for (const w of AG_WEAPON_ORDER) {
    const code = AG_WEAPONS[w].defaultLaserCode;
    if (code != null && (stores[w] ?? 0) > 0) ag.laserCodes[w] = code;
  }
  selectAgWeapon(ag, AG_WEAPON_ORDER.find(w => !isGun(w) && (stores[w] ?? 0) > 0) ?? null);
  return ag;
}

/** Salvo sizes in the order [LCtrl-Space] cycles them (S1). */
export const AG_SALVO_ORDER: readonly AgSalvo[] = [1, 2, 4, 'all'];
/** Cockpit label of a salvo size (S1). */
export const salvoLabel = (s: AgSalvo): string => (s === 'all' ? 'ВСЕ' : `ПО ${s}`);

/** Next salvo size (ПО 1 → ПО 2 → ПО 4 → ВСЕ → ПО 1). */
export function cycleAgSalvo(ag: AttackState): AgSalvo {
  ag.salvo = AG_SALVO_ORDER[(AG_SALVO_ORDER.indexOf(ag.salvo) + 1) % AG_SALVO_ORDER.length]!;
  return ag.salvo;
}

/** Rockets or bombs one press releases: the salvo size, capped by what is left. */
export function salvoCount(ag: AttackState, w: AgWeaponId): number {
  const left = ag.stores[w] ?? 0;
  return ag.salvo === 'all' ? left : Math.min(ag.salvo, left);
}

/** Stations still carrying `w`, in station order. */
export const stationsWith = (ag: AttackState, w: AgWeaponId) => ag.stations.filter(s => s.weapon === w && s.count > 0);

/** Select a store (null = none). The cannon has no station. */
export function selectAgWeapon(ag: AttackState, w: AgWeaponId | null): AgWeaponId | null {
  if (w && (ag.stores[w] ?? 0) <= 0) return ag.selected;
  ag.selected = w;
  ag.station = w && !isGun(w) ? (stationsWith(ag, w)[0]?.station ?? null) : null;
  return w;
}

/** [D]: next store with rounds left (the cannon is on [C], not in the cycle). */
export function cycleAgWeapon(ag: AttackState): AgWeaponId | null {
  const avail = AG_WEAPON_ORDER.filter(w => !isGun(w) && (ag.stores[w] ?? 0) > 0);
  if (!avail.length) return selectAgWeapon(ag, null);
  const i = ag.selected ? avail.indexOf(ag.selected) : -1;
  return selectAgWeapon(ag, avail[(i + 1) % avail.length]);
}
