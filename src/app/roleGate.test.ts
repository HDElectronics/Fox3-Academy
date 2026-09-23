import { afterEach, describe, expect, it } from 'vitest';
import { AIRCRAFT, AIRCRAFT_ORDER, ATTACK_ORDER, FIGHTER_ORDER } from '../data/aircraft';
import { PROCEDURES } from '../data/procedures';
import { RWRS } from '../data/rwr';
import { getJetModel, JET_DIMENSIONS } from '../render/jets';
import { jetAllowed, pickerJets, routeRoles } from './roleGate';
import { ROUTES } from './routes';
import { AppStore } from './store';

describe('fighter and attack roles', () => {
  it('keeps the Su-25T out of every BVR list and in the full jet list', () => {
    expect(ATTACK_ORDER).toEqual(['su25t']);
    expect(FIGHTER_ORDER).not.toContain('su25t' as never);
    expect(AIRCRAFT_ORDER).toEqual([...FIGHTER_ORDER, ...ATTACK_ORDER]);
    for (const id of FIGHTER_ORDER) expect(AIRCRAFT[id].role, id).toBe('fighter');
    expect(AIRCRAFT.su25t.role).toBe('attack');
    expect(AIRCRAFT.su25t.radar).toBeNull();
  });

  it('gives the Su-25T manual keys, the SPO-15 and attack procedures', () => {
    const p = PROCEDURES.su25t;
    expect(p.binds.map(b => b.keys)).toEqual(expect.arrayContaining(['O', 'RCtrl + O', '; , . /', 'Enter', '= / -', 'RShift + O', '7', '8']));
    for (const b of p.binds) {
      expect(['weapons', 'defence', 'targeting']).toContain(b.group);
      expect(b.keyboard, b.action).not.toBeNull();
    }
    expect(p.procedures.map(x => x.id)).toEqual(['shkval-lock', 'laser-shot', 'tv-shot', 'sead']);
    expect(RWRS[AIRCRAFT.su25t.rwr].aircraft).toContain('su25t');
  });

  it('builds the Su-25T model with gear, flaps and airbrakes', () => {
    const m = getJetModel('su25t');
    expect(m.lengthM).toBe(JET_DIMENSIONS.su25t.length);
    const drives = new Set(m.parts?.list.map(p => p.drive));
    for (const d of ['gearLeg', 'gearDoor', 'flaps', 'brake'] as const) expect(drives.has(d), d).toBe(true);
  });
});

describe('route role gate and picker', () => {
  it('treats every route but the attack lessons as fighter-only', () => {
    for (const r of ROUTES.filter(x => x.path !== 'strike')) {
      expect(routeRoles(r), r.path).toEqual(['fighter']);
      expect(jetAllowed(r, 'su25t'), r.path).toBe(false);
      expect(jetAllowed(r, 'f15c'), r.path).toBe(true);
    }
  });

  it('filters the picker by route role and always keeps the selected jet', () => {
    expect(pickerJets({}, 'f15c')).toEqual(FIGHTER_ORDER);
    expect(pickerJets({}, 'su25t')).toEqual(AIRCRAFT_ORDER);
    expect(pickerJets({ roles: ['attack'] }, 'su25t')).toEqual(['su25t']);
    expect(pickerJets({ roles: ['attack'] }, 'f16c')).toEqual(['f16c', 'su25t']);
    expect(pickerJets({ roles: ['fighter', 'attack'] }, 'su27')).toEqual(AIRCRAFT_ORDER);
  });
});

describe('store keeps the picked jet apart from the BVR fighter', () => {
  afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });
  function install(seed: Record<string, string> = {}) {
    const data = new Map(Object.entries(seed));
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, v); },
      removeItem: (k: string) => { data.delete(k); },
    };
    return data;
  }

  it('selecting the Su-25T keeps the last fighter for BVR pages and survives a reload', () => {
    const data = install();
    const app = new AppStore();
    app.setAircraft('f16c');
    app.setAircraft('su25t');
    expect(app.jet).toBe('su25t');
    expect(app.aircraft).toBe('f16c');
    expect(app.spec.id).toBe('f16c');
    expect(app.jetSpec.id).toBe('su25t');
    expect(app.units).toBe('metric');
    const again = new AppStore();
    expect(again.jet).toBe('su25t');
    expect(again.aircraft).toBe('f16c');
    expect(JSON.parse(data.get('fox3academy:v1')!).fighter).toBe('f16c');
  });

  it('falls back to the Su-27 when no fighter was stored', () => {
    install({ 'fox3academy:v1': JSON.stringify({ aircraft: 'su25t' }) });
    const app = new AppStore();
    expect(app.jet).toBe('su25t');
    expect(app.aircraft).toBe('su27');
  });
});
