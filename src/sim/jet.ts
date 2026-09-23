/**
 * Role helpers for sim entities. `Aircraft.type` is any jet in the picker (AircraftId); fighter-only modules
 * (radar, launch zones, AI, radar picture) narrow it here. Attack jets (Su-25T) carry `ag` state instead.
 */
import { AIRCRAFT, isFighter } from '../data/aircraft';
import type { AircraftSpec, FighterId } from '../data/types';
import type { Aircraft } from './types';

/** An aircraft entity whose type is a fighter (has an air-to-air radar). */
export type FighterAircraft = Aircraft & { type: FighterId };

export const isFighterAc = <T extends Pick<Aircraft, 'type'>>(ac: T): ac is T & { type: FighterId } => isFighter(ac.type);

/** The fighter id of `ac`. Throws for attack jets: callers are radar-only code that must never see one. */
export function fighterType(ac: Pick<Aircraft, 'type'>): FighterId {
  if (!isFighter(ac.type)) throw new Error(`${ac.type} has no air-to-air radar`);
  return ac.type;
}

/** The fighter spec of `ac` (throws for attack jets, see fighterType). */
export const fighterSpec = (ac: Pick<Aircraft, 'type'>): AircraftSpec => AIRCRAFT[fighterType(ac)];
