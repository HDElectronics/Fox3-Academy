import { describe, expect, it } from 'vitest';
import { AIRCRAFT_ORDER } from '../../data/aircraft';
import { PROCEDURES } from '../../data/procedures';
import { parseKeyList } from '../../ui/keys';
import { alternative, isBindable, keyboardFromNote, resolveBinds } from './binds';
import { pageKeyTag, stepsFor } from './lesson';

describe('tws binds', () => {
  it('reads keyboard defaults from full-fidelity notes', () => {
    expect(keyboardFromNote('Keyboard: RAlt + /. "Toward the radar DDI", normally the right DDI.')).toBe('RAlt + /');
    expect(keyboardFromNote('Keyboard: Enter, with the TDC over the mode legend.')).toBe('Enter');
    expect(keyboardFromNote('Keyboard: Space. A/A missiles fire on the trigger')).toBe('Space');
    expect(keyboardFromNote('Keyboard: LShift + D / LShift + W / LShift + S / LShift + X')).toBe('LShift + D / LShift + W / LShift + S / LShift + X');
    expect(keyboardFromNote('No default key.')).toBeNull();
    expect(keyboardFromNote('Default key not verified (candidate: Space).')).toBeNull();
    expect(isBindable('No default key')).toBe(false);
    expect(alternative('D / C', 0)).toBe('D');
  });

  it('takes FC3 keys straight from the data', () => {
    const su = resolveBinds('su27');
    expect(su.acts.mode?.keys).toBe('RAlt + I');
    expect(su.acts.designate?.keys).toBe('Enter');
    expect(su.acts.unlock?.keys).toBe('Backspace');
    expect(su.acts.fire?.keys).toBe('Space');
    expect(su.acts.fire?.holdS).toBe(1);
    expect(su.acts.weapon?.keys).toBe('D');
    expect(su.cursor).toMatchObject({ up: ';', left: ',', down: '.', right: '/' });
    const f15 = resolveBinds('f15c');
    expect(f15.acts.fire?.keys).toBe('RAlt + Space');
    expect(f15.acts.undesignate?.keys).toBeNull();
    expect(f15.acts.scanWidth?.keys).toBe('RCtrl + = / RCtrl + -');
  });

  it('maps full-fidelity HOTAS functions to their keyboard defaults, with named stand-ins', () => {
    const hornet = resolveBinds('fa18c');
    expect(hornet.acts.designate?.keys).toBe('Enter');
    expect(hornet.acts.cycle?.keys).toBe('S');
    expect(hornet.acts.cycle?.name).toMatch(/Undesignate/);
    expect(hornet.acts.stt?.keys).toBe('RAlt + /');
    expect(hornet.acts.mode?.keys).toBeNull();
    expect(hornet.weaponKeys.aim120c).toBe('LShift + D');
    expect(hornet.weaponKeys.aim9x).toBe('LShift + S');
    expect(hornet.cursor).toMatchObject({ up: ';', down: '.', left: ',', right: '/' });
    const viper = resolveBinds('f16c');
    expect(viper.acts.mode?.holdS).toBe(1);
    expect(viper.acts.mode?.keys).toBe('RCtrl + Right');
    expect(viper.acts.designate?.keys).toBe('RCtrl + Up');
    expect(viper.acts.unlock?.keys).toBe('RCtrl + Down');
    const m2k = resolveBinds('m2000c');
    expect(m2k.acts.fire?.holdS).toBe(2);
    expect(m2k.acts.designate?.source).toBe('page');
    const f14 = resolveBinds('f14b');
    expect(f14.acts.fire?.source).toBe('page');
    expect(f14.acts.fire?.keys).toBe('Space');
  });

  it('gives every jet a bindable designate, unlock and fire key, and never binds one key twice by accident', () => {
    for (const ac of AIRCRAFT_ORDER) {
      const b = resolveBinds(ac);
      for (const act of ['designate', 'unlock', 'fire'] as const) {
        const k = b.acts[act]?.keys;
        expect(k, `${ac} ${act}`).toBeTruthy();
        expect(parseKeyList(k ?? '').length, `${ac} ${act}`).toBeGreaterThan(0);
      }
      // Shared keys are only allowed where DCS shares them (Hornet Undesignate, Viper TMS Right).
      const seen = new Map<string, string>();
      for (const a of Object.values(b.acts)) {
        if (!a?.keys) continue;
        const prev = seen.get(a.keys);
        if (prev) expect([`${prev}+${a.act}`, `${a.act}+${prev}`].some(p => ['cycle+unlock', 'mode+cycle'].includes(p)), `${ac}: ${a.keys} on ${prev} and ${a.act}`).toBe(true);
        seen.set(a.keys, a.act);
      }
      expect(PROCEDURES[ac].binds.length).toBeGreaterThan(0);
    }
  });

  it('says "not verified" for a stand-in key where DCS may have a default, and "no default" where it has none', () => {
    const f14 = resolveBinds('f14b');
    const fire = f14.acts.fire;
    expect(fire && pageKeyTag(fire)).toMatch(/not verified/);
    const des = f14.acts.designate;
    expect(des && pageKeyTag(des)).toMatch(/no DCS default/);
    const step = stepsFor('f14b', f14).find(s => s.id === 'fire');
    expect(step?.note).toMatch(/not verified/);
    expect(step?.note).not.toMatch(/No default key in DCS/);
  });
});
