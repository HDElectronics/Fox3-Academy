/**
 * IFF in the sortie: the interrogate key per jet (never a collision), the brief line per jet, the coach hint for an
 * unidentified contact (own IFF only, never truth), and the 2v2 fratricide path end to end.
 */
import { describe, expect, test } from 'vitest';
import { FIGHTER_ORDER } from '../../data/aircraft';
import { IFF } from '../../data/iff';
import { parseKeyList } from '../../ui/keys';
import { Vector3 } from 'three';
import { iffKey, jammerKey, jetKeyMap, trainerKeys, usedChords } from './keys';
import { buildSortie, defaultSetup, iffBriefLines, sortieWorld } from './setup';
import { SortieRecorder } from './recorder';
import { coachSortie } from './coach';
import { flightHint, IFF_RECENT_S, type HintState } from './hints';
import { identifiedFriend } from '../../sim/radar';

describe('IFF key', () => {
  test('every fighter: the DCS interrogate key is bound when free and never collides', () => {
    for (const ac of FIGHTER_ORDER) {
      const m = jetKeyMap(ac);
      const k = iffKey(m);
      const spec = IFF[ac];
      if (spec.mode === 'auto' || !spec.key) { expect(k.key, ac).toBeNull(); expect(k.collidesWith, ac).toBeNull(); continue; }
      expect(k.collidesWith, ac).toBeNull();
      expect(k.key, ac).toBe(spec.key);
      const used = usedChords(m);
      const trainer = new Set(Object.values(trainerKeys(m)).flatMap(v => (v ? parseKeyList(v).map(c => c.text) : [])));
      const jam = jammerKey(m).key;
      const jamTexts = jam ? parseKeyList(jam).map(c => c.text) : [];
      for (const c of parseKeyList(spec.key)) {
        expect(used.has(c.text), `${ac} ${c.text}`).toBe(false);
        expect(trainer.has(c.text), `${ac} trainer ${c.text}`).toBe(false);
        expect(jamTexts.includes(c.text), `${ac} jammer ${c.text}`).toBe(false);
      }
    }
  });

  test('the DCS key wins over a trainer convenience: M-2000C S interrogates, so S does not pitch', () => {
    expect(iffKey(jetKeyMap('m2000c')).key).toBe('S');
    expect(trainerKeys(jetKeyMap('m2000c')).climb).toBe('Down');
    expect(iffKey(jetKeyMap('f16c')).key).toBe('RCtrl + Left');
    expect(iffKey(jetKeyMap('fa18c')).key).toBeNull();          // interrogates on designate; button for the rest
  });
});

describe('IFF brief', () => {
  test('one line per jet: automatic or how to interrogate, the friend cue, no reply is not hostile', () => {
    for (const ac of FIGHTER_ORDER) {
      const spec = IFF[ac];
      const lines = iffBriefLines(ac, '2v2', iffKey(jetKeyMap(ac)).key);
      const all = lines.join(' ');
      expect(all, ac).toMatch(/No reply never proves hostile/);
      expect(all, ac).toContain(spec.friendCue.slice(1));
      expect(all, ac).toMatch(/wingman/);
      expect(all, ac).not.toMatch(/[!]|undefined|NaN/);
      if (spec.mode === 'auto') expect(all, ac).toMatch(/IFF is automatic/);
      else {
        expect(all, ac).toMatch(/IFF button/);
        if (spec.key) expect(all, ac).toContain(spec.key);
        if (spec.trainerKey) expect(all, ac).toMatch(/trainer key/);
        if (!spec.verified) expect(all, ac).toMatch(/not verified/);
      }
    }
    expect(iffBriefLines('f16c', '1v1', 'RCtrl + Left').join(' ')).toMatch(/2 s/);
    expect(iffBriefLines('f16c', '1v1', 'RCtrl + Left').join(' ')).not.toMatch(/wingman/);
  });
});

describe('IFF hint', () => {
  const base = (iff: HintState['iff']): HintState => ({
    units: 'imperial', alive: true,
    jet: { short: 'F-16C', hasTws: true, twsLaunch: true, autoStt: 0, gimbalDeg: 60 },
    keys: { designate: 'RCtrl + Up', launch: 'RAlt + Space', mode: 'RCtrl + Right', chaff: null },
    radarMode: 'tws', weapon: { name: 'AIM-120C', seeker: 'arh', count: 4 }, missilesLeft: 6,
    shootCue: true, cueLabel: '', blocked: '', contacts: 3,
    primary: { label: 'T2', range: 30000, rmax: 60000, rne: 25000 },
    rwr: null, own: [], bandits: [], ownAlt: 9000, iff,
  });
  const iff = { mode: 'interrogate' as const, key: 'RCtrl + Left', wingman: true, primaryUnidentified: true, recentS: null };

  test('an unidentified primary with a wingman up: interrogate first, without naming any contact', () => {
    const h = flightHint(base(iff));
    expect(h.text).toMatch(/Interrogate before you shoot: an unidentified contact may be your wingman/);
    expect(h.text).toContain('RCtrl + Left');
    expect(`${h.text} ${h.why}`).not.toMatch(/T2|Viper|Bandit|wingman is T/);
  });

  test('silent when identified, recently interrogated, alone, or on an auto-IFF jet', () => {
    const not = /Interrogate before/;
    expect(flightHint(base({ ...iff, primaryUnidentified: false })).text).not.toMatch(not);
    expect(flightHint(base({ ...iff, recentS: IFF_RECENT_S - 1 })).text).not.toMatch(not);
    expect(flightHint(base({ ...iff, recentS: IFF_RECENT_S + 1 })).text).toMatch(not);
    expect(flightHint(base({ ...iff, wingman: false })).text).not.toMatch(not);
    expect(flightHint(base({ ...iff, mode: 'auto' })).text).not.toMatch(not);
    expect(flightHint(base(undefined)).text).not.toMatch(not);
  });
});

describe('IFF in a 2v2 sortie, end to end', () => {
  /** A 2v2 Viper sortie with the wingman flying straight 15 km ahead of the player, and the player locked on him. */
  function lockedOnWingman() {
    const setup = { ...defaultSetup('f16c'), scenario: '2v2' as const };
    const w = sortieWorld('f16c', setup);
    const eng = buildSortie(w, 'f16c', setup, 'imperial');
    const rec = new SortieRecorder(w, eng, 'f16c', 'imperial');
    const me = w.get(eng.playerId)!;
    const wing = w.get(eng.friendIds[0])!;
    wing.controller = 'script';
    const ahead = new Vector3(Math.sin(me.heading), 0, -Math.cos(me.heading));
    wing.pos.copy(me.pos).addScaledVector(ahead, 15000);
    wing.heading = me.heading; wing.cmd.heading = me.heading; wing.cmd.altitude = me.pos.y;
    wing.vel.copy(ahead).multiplyScalar(me.vel.length() * 0.8); wing.cmd.speed = me.vel.length() * 0.8;
    let locked = false;
    for (let i = 0; i < 80 && !locked; i++) {
      w.step(0.25);
      if (i > 8 && w.canLock(me.id, wing.id).ok) locked = w.lock(me.id, wing.id);
    }
    expect(locked).toBe(true);
    me.selectedWeapon = 'aim120c';
    return { w, eng, rec, me, wing };
  }

  test('interrogated: the wingman is identified and the shot on him is refused', () => {
    const { w, me, wing, rec } = lockedOnWingman();
    expect(identifiedFriend(w, me, wing.id)).toBe(false);
    expect(w.canLaunch(me.id).ok).toBe(true);                      // unidentified friend: the jet lets you shoot
    const r = w.interrogate(me.id);
    expect(r.friends).toBeGreaterThanOrEqual(1);
    expect(rec.events.some(e => e.type === 'iff' && e.ownerId === me.id)).toBe(true);
    expect(identifiedFriend(w, me, wing.id)).toBe(true);
    const check = w.canLaunch(me.id);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/friendly \(IFF\)/);
    expect('kind' in w.launch(me.id)).toBe(false);
    rec.dispose();
  });

  test('not interrogated: the shot at the wingman leaves and the debrief flags blue on blue', () => {
    const { w, me, wing, rec } = lockedOnWingman();
    const m = w.launch(me.id);
    expect('kind' in m).toBe(true);
    for (let i = 0; i < 400 && wing.alive; i++) w.step(0.25);
    rec.tick();
    const items = coachSortie(rec.input());
    const frat = items.find(i => i.title === 'Blue on blue');
    expect(frat).toBeDefined();
    expect(frat!.kind).toBe('mistake');
    expect(frat!.text).toMatch(/fired on an unidentified friend \(you never interrogated\): interrogate first/);
    if (!wing.alive) expect(frat!.severity).toBe(3);
    rec.dispose();
  });
});
