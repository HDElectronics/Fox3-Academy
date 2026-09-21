import { describe, expect, test } from 'vitest';
import { AIRCRAFT_ORDER } from '../../data/aircraft';
import { parseKeyList } from '../../ui/keys';
import { jetKeyMap, trainerKeys, usedChords } from './keys';

describe('jetKeyMap', () => {
  test('retains the known DCS key when another trainer action owns that chord', () => {
    const mode = jetKeyMap('fa18c').keys.modeToggle;
    expect(mode?.keys).toBeNull();
    expect(mode?.sharedKeys).toBe('Enter');
  });
  test('FC3 Flankers use the FC3 keyboard defaults', () => {
    const k = jetKeyMap('su27').keys;
    expect(k.modeToggle?.keys).toBe('RAlt + I');
    expect(k.designate?.keys).toBe('Enter');
    expect(k.unlock?.keys).toBe('Backspace');
    expect(k.launch?.keys).toBe('Space');
    expect(k.launch?.holdS).toBe(1);
    expect(k.weaponCycle?.keys).toBe('D');
    expect(k.chaff?.keys).toBe('Insert');
    expect(k.flare?.keys).toBe('Delete');
    expect(k.rangeIn?.keys).toBe('=');
    expect(k.rangeOut?.keys).toBe('-');
    expect(k.cursorUp?.keys).toBe(';');
    expect(k.cursorLeft?.keys).toBe(',');
    expect(k.cursorDown?.keys).toBe('.');
    expect(k.cursorRight?.keys).toBe('/');
    expect(k.elevUp?.keys).toBe('RShift + ;');
    expect(k.elevDown?.keys).toBe('RShift + .');
  });

  test('F-15C differs from the Flankers on the launch key', () => {
    const k = jetKeyMap('f15c').keys;
    expect(k.launch?.keys).toBe('RAlt + Space');
    expect(k.launch?.holdS).toBeUndefined();
    expect(k.modeToggle?.keys).toBe('RAlt + I');
    expect(k.designate?.keys).toBe('Enter');
  });

  test('Hornet: HOTAS names with keyboard defaults, select by missile family', () => {
    const m = jetKeyMap('fa18c');
    expect(m.keys.designate?.keys).toBe('Enter');
    expect(m.keys.designate?.dcsName).toMatch(/Throttle Designator Controller/);
    expect(m.keys.unlock?.keys).toBe('S');
    expect(m.keys.unlock?.stepsInTws).toBe(true);
    expect(m.keys.launch?.keys).toBe('Space');
    expect(m.keys.chaff?.keys).toBe('E');
    expect(m.keys.flare?.keys).toBe('D');
    expect(m.keys.lockPrimary?.keys).toBe('RAlt + /');
    // The mode legend needs the TDC over it: Enter is already designate.
    expect(m.keys.modeToggle?.keys).toBeNull();
    const amraam = m.selects.find(s => /AMRAAM/.test(s.family));
    expect(amraam?.keys).toBe('LShift + D');
    expect(amraam?.missiles).toContain('aim120c');
    // Each select names its own HOTAS function, not the whole list.
    expect(amraam?.dcsName).toBe('Select AMRAAM');
    expect(m.selects.find(s => /Sidewinder/.test(s.family))?.dcsName).toBe('Select Sidewinder');
  });

  test('Viper: TMS keys, hold TMS Right for TWS', () => {
    const k = jetKeyMap('f16c').keys;
    expect(k.designate?.keys).toBe('RCtrl + Up');
    expect(k.unlock?.keys).toBe('RCtrl + Down');
    expect(k.modeToggle?.keys).toBe('RCtrl + Right');
    expect(k.modeToggle?.holdS).toBe(1);
    expect(k.modeToggle?.tap).toBe('step');
    expect(k.launch?.keys).toBe('RAlt + Space');
    expect(k.weaponCycle?.keys).toBe('S');
    expect(k.chaff).toBeUndefined();
    expect(k.decoys?.keys).toBeNull();
  });

  test('Mirage and Tomcat say plainly what has no default key', () => {
    const m2k = jetKeyMap('m2000c').keys;
    expect(m2k.designate?.keys).toBeNull();
    expect(m2k.launch?.keys).toBe('Space');
    expect(m2k.launch?.holdS).toBe(2);
    expect(m2k.decoys?.keys).toBe('Delete');
    const f14 = jetKeyMap('f14b').keys;
    expect(f14.launch?.keys).toBeNull();
    expect(f14.designate?.dcsName).toMatch(/Jester/);
  });

  test('every jet: no chord bound twice, launch and designate exist', () => {
    for (const ac of AIRCRAFT_ORDER) {
      const m = jetKeyMap(ac);
      expect(m.keys.launch, ac).toBeDefined();
      expect(m.keys.designate, ac).toBeDefined();
      const seen = new Set<string>();
      for (const k of Object.values(m.keys)) {
        if (!k?.keys) continue;
        for (const c of parseKeyList(k.keys)) {
          expect(seen.has(c.text), `${ac} ${c.text}`).toBe(false);
          seen.add(c.text);
        }
      }
    }
  });

  test('trainer steering keys avoid the jet keys', () => {
    expect(trainerKeys(jetKeyMap('su27')).left).toBe('Left');          // D is weapon cycle
    expect(trainerKeys(jetKeyMap('su27')).climb).toBe('Up / W');
    expect(trainerKeys(jetKeyMap('fa18c')).climb).toBe('Up');           // S is undesignate
    expect(trainerKeys(jetKeyMap('f14b')).left).toBe('Left / A');
    for (const ac of AIRCRAFT_ORDER) {
      const used = usedChords(jetKeyMap(ac));
      const t = trainerKeys(jetKeyMap(ac));
      for (const s of [t.left, t.right, t.climb, t.descend, t.afterburner ?? '']) {
        for (const c of parseKeyList(s)) expect(used.has(c.text), `${ac} ${c.text}`).toBe(false);
      }
    }
  });
});
