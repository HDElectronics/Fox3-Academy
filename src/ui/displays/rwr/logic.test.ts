import { describe, expect, it } from 'vitest';
import type { RwrContact } from '../../../sim/types';
import { alr67LampStates, jf17ThreatFrame } from './logic';

const contact = (emitterType: RwrContact['emitterType'], state: RwrContact['state'] = 'search'): RwrContact => ({
  emitterId: `${emitterType}-${state}`,
  emitterType,
  state,
  bearing: 0,
  elevation: 0,
  strength: 0.5,
  firstSeen: 0,
  lastSeen: 0,
});

describe('JF-17 RWR threat frames', () => {
  it('separates known surface circles from airborne rectangles', () => {
    for (const emitterType of ['sam-long', 'sam-medium', 'sam-short'] as const)
      expect(jf17ThreatFrame(contact(emitterType))).toBe('surface');
    expect(jf17ThreatFrame(contact('f15c'))).toBe('air');
    expect(jf17ThreatFrame(contact('awacs'))).toBe('air');
    expect(jf17ThreatFrame(contact('missile', 'missile'))).toBe('none');
    expect(jf17ThreatFrame(contact('unknown'))).toBe('none');
  });
});

describe('ALR-67 warning lamps', () => {
  it('keeps airborne locks on AI and surface locks on SAM', () => {
    expect(alr67LampStates([contact('f15c', 'lock')])).toEqual({ ai: 'steady', sam: 'off', cw: 'off' });
    expect(alr67LampStates([contact('sam-medium', 'lock')])).toEqual({ ai: 'off', sam: 'steady', cw: 'off' });
  });

  it('flashes the matching category on launch without treating an active seeker as the shooter', () => {
    expect(alr67LampStates([contact('sam-long', 'launch')])).toEqual({ ai: 'off', sam: 'flash', cw: 'flash' });
    expect(alr67LampStates([contact('f16c', 'launch')])).toEqual({ ai: 'flash', sam: 'off', cw: 'flash' });
    expect(alr67LampStates([contact('missile', 'missile')])).toEqual({ ai: 'off', sam: 'off', cw: 'off' });
  });
});
