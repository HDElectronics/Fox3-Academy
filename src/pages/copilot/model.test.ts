import { describe, expect, it } from 'vitest';
import { situationOf } from '../../copilot/situation';
import { CopilotEngine } from '../../copilot/engine';
import { HORNET_RULES } from '../../copilot/hornet';
import { jetAllowed, pickerJets } from '../../app/roleGate';
import { routeFor } from '../../app/routes';
import { contextualLinks, destinationFor } from '../../app/navigation';
import { DEFAULT_SETTINGS, aoaView, flapsText, fuelView, loadSettings, positionText, previewFrame, profileMatches, saveSettings } from './model';

describe('copilot page model', () => {
  it('stores settings defensively', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    saveSettings({ mode: 'carrier', bingoSource: 'manual', bingoLb: 2450, jokerMarginLb: 1000, aoaUnit: 'deg' }, storage);
    expect(loadSettings(storage)).toEqual({ mode: 'carrier', bingoSource: 'manual', bingoLb: 2500, jokerMarginLb: 1000, aoaUnit: 'deg' });
    store.set('fox3academy:copilot:v1', '{"mode":"x","bingoLb":-5,"aoaUnit":7}');
    expect(loadSettings(storage)).toEqual({ ...DEFAULT_SETTINGS, bingoLb: 0 });
    store.set('fox3academy:copilot:v1', 'not json');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('names positions and flap settings', () => {
    expect(positionText(undefined)).toBeNull();
    expect(positionText(1)).toEqual({ text: 'DOWN', lit: true });
    expect(positionText(0)).toEqual({ text: 'UP', lit: false });
    expect(positionText(0.5)).toEqual({ text: 'TRANSIT', lit: true });
    expect([0, 0.5, 1, undefined].map(flapsText)).toEqual(['AUTO', 'HALF', 'FULL', '—']);
  });

  it('shows the preview approach as slow with the hook up, fuel above joker', () => {
    const p = previewFrame('approach')!;
    const s = situationOf(p.frame);
    expect(aoaView(s)).toEqual({ state: 'slow', label: 'SLOW', value: '9.4°' });
    expect(fuelView(s, DEFAULT_SETTINGS)).toMatchObject({ total: '5070', state: 'ok', bingo: '3000', bingoFrom: 'setting', joker: '4500' });
    expect(profileMatches(s)).toBe(true);
    const e = new CopilotEngine(HORNET_RULES, { ...DEFAULT_SETTINGS, mode: 'carrier' });
    e.step(s, 0);
    expect(e.step(s, 10).active.map(a => a.id)).toEqual(['check-hook', 'aoa-slow']);
  });

  it('bingo preview is in bingo; gear-up AoA is not judged', () => {
    const s = situationOf(previewFrame('bingo')!.frame);
    expect(fuelView(s, DEFAULT_SETTINGS).state).toBe('bingo');
    expect(aoaView(s).state).toBe('off');
    expect(profileMatches(situationOf({ ...previewFrame('bingo')!.frame!, self: { name: 'Su-27' } }))).toBe(false);
    expect(previewFrame('nope')).toBeNull();
  });

  it('is a Hornet-only reference page', () => {
    expect(jetAllowed(routeFor('copilot'), 'fa18c')).toBe(true);
    expect(jetAllowed(routeFor('copilot'), 'f16c')).toBe(false);
    expect(pickerJets(routeFor('copilot'), 'fa18c')).toEqual(['fa18c']);
    expect(destinationFor('copilot')).toBe('reference');
    expect(contextualLinks('reference').map(l => l.path)).toEqual(['reference', 'copilot', 'dcs']);
  });
});
