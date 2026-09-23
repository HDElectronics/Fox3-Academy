import { FIGHTER_ORDER } from '../src/data/aircraft';
import type { FighterId } from '../src/data/types';

/** Radar and BVR harnesses require a fighter, even when the URL names a known attack jet. */
export function fighterParam(params: URLSearchParams, key: string, fallback: FighterId): FighterId {
  return FIGHTER_ORDER.find(id => id === params.get(key)) ?? fallback;
}
