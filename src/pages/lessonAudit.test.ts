/**
 * Every lesson must fit the jet in the top bar.
 *
 * A step that names a scan setting the selected jet cannot select is unpassable in practice: the
 * player reads "3-bar", finds 3B greyed out on the radar page, and stops. This walks every graded
 * lesson for every jet and checks each number a step prints against that jet's own radar options.
 */
import { describe, expect, it } from 'vitest';
import { AIRCRAFT, FIGHTER_ORDER } from '../data/aircraft';
import { MISSILES } from '../data/missiles';
import type { FighterId, MissileId } from '../data/types';
import { EXERCISE_DEFS, EXERCISES, type StepKeys } from './radar-lab/exercises';
import { bugOnlyOptions } from './radar-lab/geometry';
import { stepsFor } from './tws/lesson';
import { resolveBinds } from './tws/binds';

const KEYS: StepKeys = { elev: 'Q / A', zone: 'Z / X', width: 'C / V', cursor: '; , . /', expRange: 'N / M' };

/** `auto` marks a step describing a scan the radar sets by itself, which may be one the player cannot. */
interface Named { id: string; text: string; auto?: true }

/** Every graded step the player reads, tagged with where it comes from. */
function lessonSteps(ac: FighterId): { lesson: string; steps: Named[] }[] {
  const out: { lesson: string; steps: Named[] }[] = [];
  for (const id of EXERCISES) {
    const def = EXERCISE_DEFS[id];
    if (def.unavailable(ac)) continue; // hidden for this jet: nothing to read
    out.push({ lesson: `radar-lab/${id}`, steps: def.steps(ac, AIRCRAFT[ac].units, KEYS) });
  }
  out.push({ lesson: 'tws', steps: stepsFor(ac, resolveBinds(ac)) });
  return out;
}

/** Bar counts a step asks for: "3-bar", "3 bars", "4B". */
function barsNamed(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d+)\s*(?:-|\s)?bars?\b/gi)) out.push(Number(m[1]));
  for (const m of text.matchAll(/\b(\d+)B\b/g)) out.push(Number(m[1]));
  return out;
}

/** Scan half-widths a step asks for: "±25°". Full-width "50°" forms are not used in steps. */
function azNamed(text: string): number[] {
  return [...text.matchAll(/±\s*(\d+)\s*°/g)].map(m => Number(m[1]));
}

describe('lessons fit the selected jet', () => {
  for (const ac of FIGHTER_ORDER) {
    const spec = AIRCRAFT[ac];
    const bug = bugOnlyOptions(ac);

    it(`${ac}: no step names a bar count the jet cannot select`, () => {
      const bad: string[] = [];
      for (const { lesson, steps } of lessonSteps(ac)) {
        for (const s of steps) {
          for (const n of barsNamed(s.text)) {
            if (!spec.radar.barOptions.includes(n)) bad.push(`${lesson}/${s.id}: ${n} bars, but ${spec.short} offers ${spec.radar.barOptions.join(', ')} — "${s.text}"`);
            else if (bug.bars.includes(n) && !s.auto) bad.push(`${lesson}/${s.id}: ${n} bars is bug-only on the ${spec.short}, so the control is greyed. Mark the step \`auto\` if the radar sets it — "${s.text}"`);
          }
        }
      }
      expect(bad, bad.join('\n')).toEqual([]);
    });

    it(`${ac}: no step names a missile the jet does not carry`, () => {
      const carried = new Set(spec.missiles.map(id => MISSILES[id].name));
      const bad: string[] = [];
      for (const { lesson, steps } of lessonSteps(ac)) {
        for (const s of steps) {
          for (const id of Object.keys(MISSILES) as MissileId[]) {
            const name = MISSILES[id].name;
            // Word-boundary match so "R-27E" does not fire on "R-27ER".
            if (!new RegExp(`(^|[^\\w-])${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?![\\w-])`).test(s.text)) continue;
            if (!carried.has(name)) bad.push(`${lesson}/${s.id}: names the ${name}, which the ${spec.short} does not carry — "${s.text}"`);
          }
        }
      }
      expect(bad, bad.join('\n')).toEqual([]);
    });

    it(`${ac}: no step names a scan width the jet cannot select`, () => {
      const bad: string[] = [];
      for (const { lesson, steps } of lessonSteps(ac)) {
        for (const s of steps) {
          for (const a of azNamed(s.text)) {
            if (!spec.radar.azHalfWidthOptionsDeg.includes(a)) bad.push(`${lesson}/${s.id}: ±${a}°, but ${spec.short} offers ±${spec.radar.azHalfWidthOptionsDeg.join('°, ±')}° — "${s.text}"`);
            else if (bug.az.includes(a) && !s.auto) bad.push(`${lesson}/${s.id}: ±${a}° is bug-only on the ${spec.short}, so the control is greyed. Mark the step \`auto\` if the radar sets it — "${s.text}"`);
          }
        }
      }
      expect(bad, bad.join('\n')).toEqual([]);
    });
  }
});
