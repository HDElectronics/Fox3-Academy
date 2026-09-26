import { describe, expect, it } from 'vitest';
import { buildCasScenario, bearingDeg, distM, type CasLessonId } from './scenario';
import { DANGER_CLOSE_M, gradeKneeboard, lineText, makeNineLine, NINE_LINE_ORDER, trainerGrid, cardinal } from './nineLine';
import { classifyImpact, headingErrorDeg } from './safety';
import { CAS_LESSON_ORDER, LESSONS, progressKey, scoreCas } from './lessons';

const LESSON_IDS: CasLessonId[] = ['nine-line', 'talk-on', 'geometry', 'danger-close', 'sortie'];

describe('CAS scenario', () => {
  it.each(LESSON_IDS)('%s: JTAC sees the target, friendlies are blue, target and decoys red', lesson => {
    const sc = buildCasScenario(lesson);
    const w = sc.world;
    const jtac = w.groundUnits.get(sc.jtac)!;
    const eye = { x: jtac.pos.x, y: jtac.pos.y + 3, z: jtac.pos.z };
    for (const id of sc.targets) {
      const t = w.groundUnits.get(id)!;
      expect(w.lineOfSight(eye, { x: t.pos.x, y: t.pos.y + 2, z: t.pos.z })).toBe(true);
      expect(t.side).toBe('red');
    }
    for (const id of sc.friendlies) expect(w.groundUnits.get(id)!.side).toBe('blue');
    for (const id of sc.decoys) expect(w.groundUnits.get(id)!.side).toBe('red');
    expect(sc.me.type).toBe('su25t');
    expect(sc.me.pos.y - w.groundHeight(sc.me.pos.x, sc.me.pos.z)).toBeGreaterThan(1000);
  });

  it('puts the IP on the allowed attack heading and the friendlies off the run-in', () => {
    const sc = buildCasScenario('geometry');
    const run = bearingDeg(sc.ip, sc.target);
    expect(headingErrorDeg(run, sc.attackHdgDeg)).toBe(0);
    // Friendlies are not under the run-in line: their bearing from the target differs from the reciprocal by > 45°.
    const f = sc.world.groundUnits.get(sc.friendlies[1]!)!.pos;
    const fromTgt = bearingDeg(sc.target, f), recip = (run + 180) % 360;
    expect(Math.abs(((fromTgt - recip + 540) % 360) - 180)).toBeGreaterThan(45);
  });

  it('adds the threats only in the sortie', () => {
    expect(buildCasScenario('sortie').sams).toHaveLength(1);
    expect(buildCasScenario('talk-on').sams).toHaveLength(0);
    expect(buildCasScenario('sortie', 11, { threats: false }).aaa).toBeNull();
  });
});

describe('9-line', () => {
  it('reads the scenario in DCS order with sensible values', () => {
    const sc = buildCasScenario('nine-line');
    const nl = makeNineLine(sc);
    expect(nl.ip).toBe('ASH');
    expect(nl.headingDeg).toBeGreaterThanOrEqual(40);
    expect(nl.headingDeg).toBeLessThanOrEqual(50);
    expect(nl.distanceNm).toBeCloseTo(distM(sc.ip, sc.target) / 1852, 0);
    expect(nl.mark).toBe('wp');
    expect(nl.friendlies.dir).toBe('southeast');
    expect(nl.dangerClose).toBe(false);
    expect(NINE_LINE_ORDER.map(f => lineText(nl, f))).toHaveLength(9);
    expect(lineText(nl, 'elevation')).toMatch(/^\d+ ft MSL$/);
  });

  it('flags danger close when friendlies are inside the trainer distance', () => {
    const nl = makeNineLine(buildCasScenario('danger-close'));
    expect(nl.dangerClose).toBe(true);
    expect(nl.friendlies.distM).toBeLessThan(DANGER_CLOSE_M);
    expect(nl.remarks).toContain('Danger close');
  });

  it('grades the kneeboard with tolerances and passes on the key lines', () => {
    const nl = makeNineLine(buildCasScenario('nine-line'));
    const perfect = Object.fromEntries(NINE_LINE_ORDER.map(f => [f, lineText(nl, f)]));
    expect(gradeKneeboard(nl, perfect).passed).toBe(true);
    expect(gradeKneeboard(nl, perfect).wrong).toEqual([]);
    const sloppy = { ...perfect, heading: String(nl.headingDeg + 2), elevation: `${nl.elevationFt + 40}`, mark: 'smoke', distance: '' };
    const g = gradeKneeboard(nl, sloppy);
    expect(g.passed).toBe(true);
    expect(g.wrong).toEqual(['distance']);
    expect(gradeKneeboard(nl, { ...perfect, location: 'GH 0000 0000' }).passed).toBe(false);
  });

  it('formats grids and directions', () => {
    expect(trainerGrid({ x: 0, z: 0 })).toBe('GH 5000 5000');
    expect(trainerGrid({ x: 1230, z: -450 })).toBe('GH 5123 5045');
    expect(cardinal(0)).toBe('north');
    expect(cardinal(135)).toBe('southeast');
    expect(cardinal(350)).toBe('north');
  });
});

describe('safety rules', () => {
  const sc = buildCasScenario('danger-close');
  const sides = { targets: sc.targets, friendlies: sc.friendlies };
  const at = (id: string) => { const p = sc.world.groundUnits.get(id)!.pos; return [p.x, p.y, p.z]; };

  it('classifies impacts', () => {
    expect(classifyImpact(sc.world, { pos: at(sc.targets[0]!), killed: [sc.targets[0]!] }, sides).cls).toBe('on-target');
    expect(classifyImpact(sc.world, { pos: at(sc.friendlies[0]!), killed: [sc.friendlies[0]!, sc.targets[0]!] }, sides).cls).toBe('fratricide');
    expect(classifyImpact(sc.world, { pos: at(sc.decoys[0]!), killed: [sc.decoys[0]!] }, sides).cls).toBe('wrong-target');
    const nearFriend = at(sc.friendlies[1]!); nearFriend[0]! += 60;
    expect(classifyImpact(sc.world, { pos: nearFriend, killed: [] }, sides).cls).toBe('danger-close');
    expect(classifyImpact(sc.world, { pos: [-5000, 0, -5000], killed: [] }, sides).cls).toBe('miss');
  });

  it('measures heading error against the window, across north', () => {
    expect(headingErrorDeg(45, [20, 70])).toBe(0);
    expect(headingErrorDeg(80, [20, 70])).toBe(10);
    expect(headingErrorDeg(10, [20, 70])).toBe(10);
    expect(headingErrorDeg(355, [340, 20])).toBe(0);
    expect(headingErrorDeg(30, [340, 20])).toBe(10);
  });
});

describe('CAS scoring', () => {
  const base = { lesson: 'geometry' as const, targets: 3, targetsKilled: 3, impacts: { 'on-target': 3 }, releases: 3, violations: [], aborts: 0, shotDown: false };
  it('gives three stars to a clean cleared-hot attack', () => {
    expect(scoreCas(base)).toMatchObject({ stars: 3, passed: true, title: 'Clean CAS' });
  });
  it('caps a release without clearance at one star with coaching', () => {
    const d = scoreCas({ ...base, violations: ['no-clearance'] });
    expect(d.stars).toBe(1);
    expect(d.passed).toBe(false);
    expect(d.coaching.join(' ')).toMatch(/without cleared hot/);
  });
  it('fails any fratricide at zero stars', () => {
    expect(scoreCas({ ...base, impacts: { 'on-target': 2, fratricide: 1 } }).stars).toBe(0);
  });
  it('drops a danger-close impact to two stars', () => {
    expect(scoreCas({ ...base, impacts: { 'on-target': 3, 'danger-close': 1 } }).stars).toBe(2);
  });
  it('grades the kneeboard card', () => {
    const card = (correct: number, passed: boolean) => scoreCas({ ...base, lesson: 'nine-line', card: { correct, passed } });
    expect(card(9, true).stars).toBe(3);
    expect(card(7, true).stars).toBe(2);
    expect(card(7, false).passed).toBe(false);
  });
  it('keys progress per lesson and jet', () => {
    expect(progressKey('talk-on')).toBe('cas:talk-on:su25t');
    expect(CAS_LESSON_ORDER.every(id => LESSONS[id].steps.length > 0)).toBe(true);
  });
});
