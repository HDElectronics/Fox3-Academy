/**
 * [OWNER: displays] Small, testable decisions shared by the round-scope RWR renderer.
 * Research: docs/research/rwr-surface-threats.md.
 */
import type { RwrContact } from '../../../sim/types';
import { isAirborne } from '../geometry';

export type Jf17ThreatFrame = 'air' | 'surface' | 'none';

const SURFACE_EMITTERS = new Set<RwrContact['emitterType']>(['sam-long', 'sam-medium', 'sam-short']);

/** JF-17 HSD enclosure: airborne radars use rectangles; known surface radars use circles. */
export function jf17ThreatFrame(c: Pick<RwrContact, 'emitterType'>): Jf17ThreatFrame {
  if (SURFACE_EMITTERS.has(c.emitterType)) return 'surface';
  if (isAirborne(c)) return 'air';
  return 'none';
}

export type WarningLampState = 'off' | 'steady' | 'flash';

export interface Alr67LampStates {
  ai: WarningLampState;
  sam: WarningLampState;
  cw: WarningLampState;
}

const stateFor = (contacts: readonly RwrContact[], match: (c: RwrContact) => boolean): WarningLampState => {
  if (contacts.some(c => match(c) && c.state === 'launch')) return 'flash';
  if (contacts.some(c => match(c) && c.state === 'lock')) return 'steady';
  return 'off';
};

/**
 * ALR-67 panel categories. AI belongs only to airborne emitters; SAM belongs only to known surface
 * emitters. An active-seeker M contact does not light either shooter's category here.
 */
export function alr67LampStates(contacts: readonly RwrContact[]): Alr67LampStates {
  return {
    ai: stateFor(contacts, isAirborne),
    sam: stateFor(contacts, c => SURFACE_EMITTERS.has(c.emitterType)),
    cw: contacts.some(c => c.state === 'launch') ? 'flash' : 'off',
  };
}
