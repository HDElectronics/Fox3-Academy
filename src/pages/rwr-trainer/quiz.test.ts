import { describe, expect, it } from 'vitest';
import type { AircraftId, RwrId } from '../../data/types';
import { AIRCRAFT_ORDER, AIRCRAFT } from '../../data/aircraft';
import { rwrPriority } from '../../ui/displays/geometry';
import {
  type Threat, acceptedClocks, canBe, clockOf, contactsAt, emitterKindsFor, isAircraft, isSam, missilesFor, normalizeThreat, rad, statesFor,
  RwrFeed, stateAt,
} from './threats';
import {
  type Difficulty, type QuestionKind, QUESTION_KINDS, applyAnswer, decideAction, grade, makeQuestion, mulberry32, newRun,
  notchTurn, onBeam, runOver, symbolGroups, verify, MAX_MISSES, DONE_AT,
} from './quiz';
import { chaffBinds } from './common';

const th = (p: Partial<Threat> & Pick<Threat, 'id' | 'kind' | 'state'>): Threat =>
  normalizeThreat({ bearing: 0, range: 40_000, altRel: 0, missile: null, ...p });

describe('threat model', () => {
  it('knows what each jet can put on your RWR', () => {
    expect(canBe('su27', 'active')).toBe(false);          // no R-77 on the Su-27 in DCS
    expect(canBe('su27', 'launch')).toBe(true);           // R-27R/ER SARH
    expect(canBe('j11a', 'active')).toBe(true);           // R-77
    expect(canBe('jf17', 'launch')).toBe(false);          // SD-10 only: no launch warning
    expect(canBe('f16c', 'launch')).toBe(false);          // no AIM-7 on the DCS Viper
    expect(canBe('f14b', 'launch')).toBe(true);
    expect(missilesFor('f14b', 'launch')).toContain('aim54c'); // Phoenix from PD-STT warns at launch
    expect(canBe('m2000c', 'active')).toBe(false);        // Super 530D is SARH
    expect(canBe('awacs', 'lock')).toBe(false);
    expect(canBe('sam-long', 'launch')).toBe(true);
    expect(statesFor('su27').find(s => s.state === 'active')?.reason).toMatch(/no Fox 3/);
  });

  it('builds contacts with sim-like strengths and an active missile contact', () => {
    const list = contactsAt([
      th({ id: 'A', kind: 'f15c', state: 'active', bearing: rad(40) }),
      th({ id: 'B', kind: 'su27', state: 'lock', bearing: rad(-60), range: 20_000 }),
    ], 10);
    const ranked = rwrPriority(list);
    expect(ranked[0].state).toBe('missile');
    expect(ranked[0].emitterId).toBe('A-M');
    expect(ranked[0].missileType).toBe('aim120c');
    expect(list.find(c => c.emitterId === 'A')?.state).toBe('search');   // shooter keeps searching (TWS)
    const lock = list.find(c => c.emitterId === 'B');
    expect(lock?.strength).toBeGreaterThanOrEqual(0.5);
    expect(lock?.strength).toBeLessThanOrEqual(0.9);
  });

  it('follows a threat timeline', () => {
    const t = th({ id: 'A', kind: 'su27', state: 'launch', phases: [{ at: 0, state: 'search' }, { at: 1, state: 'lock' }, { at: 2, state: 'launch' }] });
    expect(stateAt(t, 0.5)).toBe('search');
    expect(stateAt(t, 1.5)).toBe('lock');
    expect(stateAt(t, 5)).toBe('launch');
  });

  it('keeps firstSeen and paints search contacts once per sweep', () => {
    const feed = new RwrFeed();
    const threats = [th({ id: 'A', kind: 'f15c', state: 'search' })];
    const a = feed.update(threats, 0, 100)[0];
    const b = feed.update(threats, 0, 104)[0];
    expect(b.firstSeen).toBe(a.firstSeen);
    expect(104 - b.lastSeen).toBeLessThanOrEqual(feed.sweepS);
  });

  it('reads clock positions the way each RWR allows', () => {
    expect(acceptedClocks('alr67', rad(60))).toEqual([2]);
    expect(acceptedClocks('alr67', rad(45))).toEqual([1, 2]);       // on the half-hour line
    expect(acceptedClocks('alr67', rad(-90))).toEqual([9]);
    expect(acceptedClocks('spo15', rad(30))).toEqual([1]);          // 30 lamp alone
    expect(acceptedClocks('spo15', rad(50))).toEqual([2]);          // 50 lamp alone
    expect(acceptedClocks('spo15', rad(140))).toEqual([4, 5, 6]);   // right rear quadrant lamp
    expect(clockOf(rad(-170))).toBe(6);
  });
});

describe('what do you do now', () => {
  it('beams a SARH shooter the short way', () => {
    const d = decideAction('alr67', [th({ id: 'A', kind: 'su27', state: 'launch', bearing: rad(30) })], null);
    expect(d.correct).toEqual(['notch-left']);
    expect(Math.round(d.turnDeg)).toBe(-60);
    const r = decideAction('alr67', [th({ id: 'A', kind: 'su27', state: 'launch', bearing: rad(-120) })], null);
    expect(r.correct).toEqual(['notch-left']);                     // left rear: turn toward the beam
    expect(Math.round(r.turnDeg)).toBe(-30);
  });

  it('chaffs when already on the beam, drags when already cold', () => {
    expect(decideAction('alr56c', [th({ id: 'A', kind: 'su27', state: 'launch', bearing: rad(92) })], null).correct).toEqual(['chaff']);
    expect(decideAction('spo15', [th({ id: 'A', kind: 'f15c', state: 'launch', bearing: rad(100) })], null).correct).toEqual(['chaff']);
    const tail = th({ id: 'A', kind: 'f15c', state: 'active', bearing: rad(175), missileBearingOffset: 0 });
    expect(decideAction('alr67', [tail], null).correct).toEqual(['drag']);
  });

  it('drags when the missile is below you on RWRs that show it', () => {
    const low = th({ id: 'A', kind: 'mig29s', state: 'active', bearing: rad(40), altRel: -6000, missileAltRel: -4500, missileRange: 12_000 });
    expect(decideAction('spo15', [low], null).correct).toEqual(['drag']);
    expect(decideAction('alr67', [low], null).correct).toEqual(['notch-left']);   // the scope cannot show it
  });

  it('continues on search only, cranks while supporting', () => {
    const s = [th({ id: 'A', kind: 'f16c', state: 'search', bearing: rad(20) })];
    expect(decideAction('spo15', s, null).correct).toEqual(['continue']);
    const c = decideAction('spo15', s, { missile: 'r27er', targetId: 'A' });
    expect(c.correct).toEqual(['crank']);
    expect(Math.round(c.turnDeg)).toBe(-30);
  });

  it('treats a lock from a Fox 3 jet as a shot', () => {
    const d = decideAction('spo15', [th({ id: 'A', kind: 'f15c', state: 'lock', bearing: rad(-40) })], null);
    expect(d.correct).toEqual(['notch-right']);
    expect(d.why).toMatch(/AIM-120/);
  });

  it('does not credit a jet without a Fox 3 with a silent shot', () => {
    const d = decideAction('alr56c', [th({ id: 'A', kind: 'su27', state: 'lock', bearing: rad(40) })], null);
    expect(d.correct).toEqual(['notch-left']);
    expect(d.why).not.toMatch(/Fox 3|no launch warning/);
    // The F-14 warns at launch even from STT: no "silent" claim either.
    expect(decideAction('alr56c', [th({ id: 'A', kind: 'f14b', state: 'lock', bearing: rad(40) })], null).why).not.toMatch(/no launch warning/);
  });

  it('helpers', () => {
    expect(notchTurn(rad(10))).toBeCloseTo(-80);
    expect(notchTurn(rad(-150))).toBeCloseTo(-60);
    expect(onBeam('spo15', rad(95))).toBe(true);
    expect(onBeam('spo15', rad(70))).toBe(false);
  });
});

describe('question generator', () => {
  const rwrs: { rwr: RwrId; own: AircraftId }[] = [
    { rwr: 'spo15', own: 'su27' }, { rwr: 'alr56c', own: 'f15c' }, { rwr: 'alr67', own: 'fa18c' },
    { rwr: 'alr56m', own: 'f16c' }, { rwr: 'jf17rwr', own: 'jf17' }, { rwr: 'serval', own: 'm2000c' },
  ];
  const diffs: Difficulty[] = ['easy', 'medium', 'hard'];

  it('is deterministic per seed', () => {
    const a = makeQuestion({ rwr: 'spo15', own: 'su27', difficulty: 'hard', seed: 42 });
    const b = makeQuestion({ rwr: 'spo15', own: 'su27', difficulty: 'hard', seed: 42 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(mulberry32(7)()).toBe(mulberry32(7)());
  });

  it('builds verified, answerable questions for every RWR, level and kind', () => {
    for (const { rwr, own } of rwrs) for (const difficulty of diffs) for (const kind of QUESTION_KINDS as QuestionKind[]) {
      for (let seed = 1; seed <= 12; seed++) {
        const q = makeQuestion({ rwr, own, difficulty, seed: seed * 7919 + kind.length, kind });
        expect(q.kind, `${rwr} ${difficulty} ${kind}`).toBe(kind);
        expect(verify(rwr, q)).toBe(true);
        expect(q.threats.length).toBeGreaterThan(0);
        expect(q.explain.length).toBeGreaterThan(10);
        expect(q.explain).not.toMatch(/!/);
        const a = q.answer;
        if (a.type === 'clock') expect(a.correct.length).toBeGreaterThan(0);
        if (a.type === 'choice') {
          expect(a.correct.every(c => a.options.some(o => o.id === c))).toBe(true);
          expect(new Set(a.options.map(o => o.label)).size).toBe(a.options.length);
        }
        if (a.type === 'tap') {
          expect(grade(q, { type: 'tap', id: a.correct[0] })).toBe(true);
          expect(a.candidates.some(c => a.correct.includes(c.id))).toBe(true);
          expect(new Set(a.candidates.map(c => c.label)).size).toBe(a.candidates.length);
          expect(a.candidates.some(c => /yellow|green/i.test(c.label))).toBe(false);
        }
        // Scenario only uses states the emitters can really produce.
        for (const t of q.threats) expect(canBe(t.kind, t.state, rwr), `${rwr} ${t.kind} ${t.state}`).toBe(true);
        // Missile questions are about fighters: no SAM shooters.
        if (q.kind === 'seeker' || q.kind === 'launch-clock') expect(q.threats.every(t => t.state === 'search' || isAircraft(t.kind))).toBe(true);
      }
    }
  });

  it('offers ground radars where the display draws them right', () => {
    expect(emitterKindsFor('alr56c')).toContain('sam-short');
    expect(emitterKindsFor('spo15')).toContain('sam-long');
    expect(emitterKindsFor('jf17rwr')).toContain('sam-short');
    expect(canBe('sam-medium', 'lock', 'alr56c')).toBe(true);
    expect(canBe('sam-medium', 'lock', 'alr67')).toBe(true);
    expect(canBe('sam-medium', 'launch', 'alr67')).toBe(true);
    const seen = new Set<string>();
    for (let seed = 1; seed < 200; seed++) {
      const q = makeQuestion({ rwr: 'alr56c', own: 'f15c', difficulty: 'hard', seed });
      q.threats.forEach(t => seen.add(t.kind));
    }
    expect([...seen].some(k => k.startsWith('sam'))).toBe(true);
  });

  it('explains JF-17 SAM identities as surface circles', () => {
    let found = false;
    for (let seed = 1; seed <= 300 && !found; seed++) {
      const q = makeQuestion({ rwr: 'jf17rwr', own: 'jf17', difficulty: 'hard', seed, kind: 'identify' });
      const target = q.threats.find(t => t.id === q.focusId);
      if (!target || !isSam(target.kind)) continue;
      found = true;
      expect(q.explain).toMatch(/surface-threat circle/);
      expect(q.explain).not.toMatch(/air-threat rectangle/);
    }
    expect(found).toBe(true);
  });

  it('teaches the ALR-67 SAM lamp for a surface tap-lock question', () => {
    let found = false;
    for (let seed = 1; seed <= 300 && !found; seed++) {
      const q = makeQuestion({ rwr: 'alr67', own: 'fa18c', difficulty: 'hard', seed, kind: 'tap-lock' });
      const target = q.threats.find(t => t.id === q.focusId);
      if (!target || !isSam(target.kind)) continue;
      found = true;
      expect(q.explain).toMatch(/SAM lights steady/);
      expect(q.explain).toMatch(/AI stays off/);
    }
    expect(found).toBe(true);
  });

  it('tells "15" with a hat (F-15) from "15" without one (SA-15)', () => {
    const g = symbolGroups('alr56c');
    const f15 = g.find(x => x.kinds.includes('f15c'));
    const sa15 = g.find(x => x.kinds.includes('sam-short'));
    expect(f15?.symbol).toBe('15');
    expect(sa15?.symbol).toBe('15');
    expect(f15?.id).not.toBe(sa15?.id);
    expect(f15?.hat).toBe(true);
    expect(sa15?.hat).toBe(false);
    expect(f15?.label).not.toBe(sa15?.label);
    expect(symbolGroups('jf17rwr').every(x => !x.hat)).toBe(true);
  });

  it('grades clock answers and timeouts', () => {
    const q = makeQuestion({ rwr: 'alr67', own: 'fa18c', difficulty: 'medium', seed: 5, kind: 'launch-clock' });
    if (q.answer.type !== 'clock') throw new Error('expected a clock answer');
    expect(grade(q, { type: 'clock', clock: q.answer.correct[0] })).toBe(true);
    const wrong = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find(c => q.answer.type === 'clock' && !q.answer.correct.includes(c)) ?? 1;
    expect(grade(q, { type: 'clock', clock: wrong })).toBe(false);
    expect(grade(q, { type: 'timeout' })).toBe(false);
  });

  it('SPO-15 identify asks about the primary threat', () => {
    for (let seed = 1; seed < 40; seed++) {
      const q = makeQuestion({ rwr: 'spo15', own: 'su27', difficulty: 'hard', seed, kind: 'identify' });
      expect(rwrPriority(contactsAt(q.threats, 1e6))[0].emitterId).toBe(q.focusId);
    }
  });

  it('reaches every "what now" answer', () => {
    for (const { rwr, own } of [{ rwr: 'spo15' as RwrId, own: 'su27' as AircraftId }, { rwr: 'alr67' as RwrId, own: 'fa18c' as AircraftId }]) {
      const seen = new Set<string>();
      for (let seed = 1; seed < 400; seed++) {
        const q = makeQuestion({ rwr, own, difficulty: 'hard', seed, kind: 'action' });
        if (q.answer.type === 'choice') q.answer.correct.forEach(c => seen.add(c));
      }
      expect([...seen].sort(), rwr).toEqual(['chaff', 'continue', 'crank', 'drag', 'notch-left', 'notch-right']);
    }
  });

  it('works for every jet in the top bar', () => {
    for (const own of AIRCRAFT_ORDER) {
      const q = makeQuestion({ rwr: AIRCRAFT[own].rwr, own, difficulty: 'hard', seed: 99, kind: 'action' });
      expect(q.answer.type).toBe('choice');
    }
  });
});

describe('binds', () => {
  it('names the chaff keys each jet really has', () => {
    expect(chaffBinds('su27')).toEqual([{ keys: 'Insert', hotas: null, note: null }]);
    const m2k = chaffBinds('m2000c');
    expect(m2k.map(b => b.keys)).toEqual(['Delete', 'Insert']);        // program release, then PANIC
    expect(m2k[1].hotas).toMatch(/PANIC/);
    expect(chaffBinds('fa18c')[0].keys).toBe('E');
    const viper = chaffBinds('f16c');
    expect(viper[0].keys).toBe('');
    expect(viper[0].hotas).toMatch(/Fwd$/);
    expect(viper[0].note).toMatch(/no default key/);
  });
});

describe('run scoring', () => {
  it('counts score, streak and misses', () => {
    let r = newRun();
    for (let i = 0; i < DONE_AT; i++) r = applyAnswer(r, true);
    expect(r.score).toBe(DONE_AT);
    expect(r.streak).toBe(DONE_AT);
    r = applyAnswer(r, false);
    expect(r.streak).toBe(0);
    expect(r.bestStreak).toBe(DONE_AT);
    for (let i = 1; i < MAX_MISSES; i++) r = applyAnswer(r, false);
    expect(runOver(r)).toBe(true);
  });
});
