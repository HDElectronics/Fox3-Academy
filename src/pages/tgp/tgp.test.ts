import { describe, expect, it } from 'vitest';
import { ROUTES, routeFor } from '../../app/routes';
import { jetAllowed, pickerJets } from '../../app/roleGate';
import { LESSON_LINKS } from '../../app/navigation';
import { A10cHotas, type HotasHost } from '../cas/a10cHotas';
import { LESSONS, TGP_LESSON_ORDER, progressKey, debriefLines, type TgpSnap } from './lessons';
import { BUDDY_CODE, buildTgpScenario, type TgpLessonId } from './scenario';
import { TgpSession } from './session';
import { flyScript, scriptStages, type Pilot } from './script';

const LOG: string[] = [];

function setup(lesson: TgpLessonId) {
  const sc = buildTgpScenario(lesson);
  const host: HotasHost = {
    world: () => sc.world, me: () => sc.me, jtac: () => null, steerpoint: () => sc.steerpoint, targets: () => sc.targets,
    friendlies: () => (sc.buddy ? [{ id: sc.buddy, label: 'Ranger 2' }] : []), log: t => { LOG.push(t); }, canFire: () => true,
  };
  const hotas = new A10cHotas(host);
  hotas.reset();
  const session = new TgpSession(lesson, sc, hotas, t => { LOG.push(t); });
  const pilot: Pilot = {
    session, hotas,
    run(sec, stop = () => false, each) {
      for (let i = 0; i < sec * 30 && !stop(); i++) {
        each?.();
        sc.world.step(1 / 30); hotas.step(1 / 30); session.update(1 / 30);
      }
    },
  };
  return { sc, hotas, session, pilot };
}

/** A snapshot with nothing done, for the pure step checks. */
function blank(over: Partial<TgpSnap> = {}): TgpSnap {
  return {
    soi: 'hud', rightPage: 'tgp', soiSeen: new Set(['hud']), master: 'NAV', selected: null, tgpOn: true, fov: 'wide', narrowSeen: false,
    track: 'none', pointOnColumn: false, pointOnTruck: false, areaAfterPoint: false, aimToColumnM: 700, spiSource: 'steer',
    spiOnColumn: false, spiOnTarget: false, slavedBack: false, laserCode: 1688, lssCode: 1688, laserFiring: false, lasedPointS: 0,
    lss: 'off', lssDetectBuddy: false, lssTrackBuddy: false, spiOnBuddySpot: false, mavSlaved: false, mavLocked: false,
    launchOk: false, fired: {}, kills: {}, lasedWithWeapon: false, ...over,
  };
}

describe('tgp route', () => {
  it('is an attack route for the A-10C II only, right after Shkval & Vikhr', () => {
    const r = routeFor('tgp');
    expect(r.path).toBe('tgp');
    expect(r.label).toBe('Targeting pod & Mavericks');
    expect(jetAllowed(r, 'a10c')).toBe(true);
    expect(jetAllowed(r, 'su25t')).toBe(false);
    expect(jetAllowed(r, 'f15c')).toBe(false);
    expect(pickerJets(r, 'a10c')).toEqual(['a10c']);
    const paths = ROUTES.map(x => x.path);
    expect(paths.indexOf('tgp')).toBe(paths.indexOf('strike') + 1);
    expect(LESSON_LINKS.some(l => l.path === 'tgp')).toBe(true);
    // CAS & JTAC stays shared by both attack jets.
    expect(jetAllowed(routeFor('cas'), 'a10c')).toBe(true);
    expect(jetAllowed(routeFor('cas'), 'su25t')).toBe(true);
  });

  it('writes tgp:<lesson>:a10c progress keys', () => {
    expect(progressKey('mav')).toBe('tgp:mav:a10c');
    expect(TGP_LESSON_ORDER).toEqual(['soi', 'pod', 'laser', 'mav', 'lgb', 'gun']);
  });
});

describe('tgp lesson step machines', () => {
  const pass = (lesson: TgpLessonId, s: TgpSnap) => {
    const done: string[] = [];
    for (const st of LESSONS[lesson].steps) { if (!st.check(s)) break; done.push(st.id); }
    return done;
  };

  it('every lesson has steps with text, a goal and debrief lines, and nothing passes on a blank start', () => {
    for (const id of TGP_LESSON_ORDER) {
      const def = LESSONS[id];
      expect(def.steps.length, id).toBeGreaterThan(2);
      for (const st of def.steps) expect(st.text, `${id}/${st.id}`).not.toMatch(/!/);
      expect(debriefLines(id, blank()).length, id).toBeGreaterThan(0);
      expect(pass(id, blank()), id).toEqual([]);
      // The scripted pilot flies the same stages as the checklist.
      expect(scriptStages(id), id).toEqual(def.steps.map(s => s.id));
    }
  });

  it('SOI and SPI: the steps follow the Coolie and the SPI in order', () => {
    expect(pass('soi', blank({ soiSeen: new Set(['hud', 'tgp']) }))).toEqual(['tgp']);
    expect(pass('soi', blank({ soiSeen: new Set(['hud', 'tgp', 'tad']), soi: 'tad' }))).toEqual(['tgp', 'tad']);
    const all = blank({ soiSeen: new Set(['hud', 'tgp', 'tad']), soi: 'hud', spiSource: 'steer', spiOnColumn: true, slavedBack: true });
    expect(pass('soi', all)).toEqual(['tgp', 'tad', 'hud']);
    // The pod step needs the TGP as SOI with the crosshair on the column; the SPI step then needs a pod SPI.
    const step = (id: string) => LESSONS.soi.steps.find(x => x.id === id)!;
    expect(step('pod').check({ ...all, soi: 'tgp', aimToColumnM: 50 })).toBe(true);
    expect(step('pod').check({ ...all, soi: 'hud', aimToColumnM: 50 })).toBe(false);
    expect(step('spi').check({ ...all, spiSource: 'tgp' })).toBe(true);
  });

  it('Maverick: a profile without an A-G master mode does not pass the master step', () => {
    expect(pass('mav', blank({ selected: 'agm65d' }))).toEqual(['profile']);
    expect(pass('mav', blank({ selected: 'agm65d', master: 'CCIP' }))).toEqual(['profile', 'master']);
  });

  it('Laser and LSS: the LSS steps wait for the friendly code', () => {
    const s = blank({ pointOnColumn: true, lasedPointS: 2.1, lssCode: 1688 });
    expect(pass('laser', s)).toEqual(['point', 'lase']);
    expect(pass('laser', { ...s, lssCode: BUDDY_CODE, laserFiring: true })).toEqual(['point', 'lase']);
    expect(pass('laser', { ...s, lssCode: BUDDY_CODE })).toEqual(['point', 'lase', 'code']);
  });
});

describe('tgp scenario', () => {
  it('spawns the A-10C II with the pod on, no profile, the column, the trucks and the lesson loadout', () => {
    const { sc } = setup('mav');
    const ag = sc.me.ag!;
    expect(sc.me.type).toBe('a10c');
    expect(ag.tgp?.on).toBe(true);
    expect(ag.selected).toBeNull();
    expect(ag.stores.agm65d).toBe(2);
    expect(ag.stores.agm65h).toBe(2);
    expect(ag.mav).not.toBeNull();
    expect(sc.column).toHaveLength(6);
    expect(sc.trucks).toHaveLength(3);
    const lgb = setup('lgb').sc.me.ag!;
    expect(lgb.stores.gbu12).toBe(2);
    expect(lgb.stores.apkws).toBe(7);
    expect(lgb.stores.agm65l).toBe(1);
    expect(lgb.laserCodes.agm65l).toBe(1688);
  });

  it('puts the friendly spot on a truck on code 1511 in the laser lesson only', () => {
    const { sc } = setup('laser');
    const m = sc.world.marks.get(sc.buddySpot!)!;
    expect(m.code).toBe(BUDDY_CODE);
    expect(setup('pod').sc.buddySpot).toBeNull();
  });
});

describe('HOTAS: MAV page as SOI', () => {
  it('Coolie Right Short shows the MAV page, Right Long makes it SOI; China Hat Aft Short recages', () => {
    const { sc, hotas, pilot } = setup('mav');
    hotas.tap('coolieR');
    expect(hotas.rightPage).toBe('mav');
    expect(hotas.soi).toBe('hud');
    hotas.tap('coolieR', true);
    expect(hotas.soi).toBe('mav');
    // Slave to the steerpoint (no SPI set): the seeker looks there.
    hotas.tap('chF', true);
    expect(sc.me.ag!.mav!.aim).not.toBeNull();
    hotas.tap('chA');
    expect(sc.me.ag!.mav!.aim).toBeNull();
    // Slew goes to the gate with the MAV page as SOI, not to the pod.
    hotas.tap('chF', true);
    const pod0 = sc.me.ag!.tgp!.aim.clone(), mav0 = sc.me.ag!.mav!.aim!.clone();
    hotas.slew(1, 0); pilot.run(1); hotas.slew(0, 0);
    expect(sc.me.ag!.tgp!.aim.distanceTo(pod0)).toBeLessThan(1);
    expect(sc.me.ag!.mav!.aim!.distanceTo(mav0)).toBeGreaterThan(20);
    // Coolie Right Short from the MAV SOI goes back to the TGP page as SOI.
    hotas.tap('coolieR');
    expect(hotas.soi).toBe('tgp');
  });

  it('refuses a lock without a Maverick profile (SENSOR)', () => {
    const { hotas } = setup('mav');
    LOG.length = 0;
    hotas.setSoi('mav'); hotas.tap('chF', true); hotas.tap('tmsF');
    expect(LOG.some(l => /SENSOR/.test(l))).toBe(true);
  });
});

describe('scripted pilot completes every lesson', () => {
  for (const lesson of TGP_LESSON_ORDER) {
    it(`${lesson}: ${LESSONS[lesson].title}`, () => {
      const { session, pilot, sc } = setup(lesson);
      flyScript(lesson, pilot);
      pilot.run(2);
      const left = LESSONS[lesson].steps.filter(s => !session.done.has(s.id)).map(s => s.id);
      expect(left, `steps left; log: ${LOG.slice(-8).join(' | ')}`).toEqual([]);
      expect(session.complete).toBe(true);
      expect(sc.me.alive).toBe(true);
      session.dispose();
    }, 30000);
  }
});

describe('progress goals', () => {
  it('gives the A-10C II the pod lessons, then the CAS lessons; the Su-25T keeps none of them', async () => {
    const { jetProgress } = await import('../progress/model');
    const { lessonOrder } = await import('../cas/lessons');
    const a10 = jetProgress('a10c', key => (key === progressKey('pod') ? true : undefined));
    expect(a10.goals.map(g => g.id)).toEqual([...TGP_LESSON_ORDER.map(l => `tgp-${l}`), ...lessonOrder('a10c').map(l => `cas-${l}`)]);
    expect(a10.goals.slice(0, TGP_LESSON_ORDER.length).every(g => g.href.startsWith('#/tgp?lesson='))).toBe(true);
    expect(a10.completed).toBe(1);
    expect(jetProgress('su25t', () => undefined).goals.some(g => g.id.startsWith('tgp-'))).toBe(false);
  });
});
