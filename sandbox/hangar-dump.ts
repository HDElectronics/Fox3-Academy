import { AIRCRAFT, AIRCRAFT_ORDER, PROCEDURES } from '../src/data';
import { headlineBind, capFacts, lessonLine, weaponsSummary, weaponFacts, twsRule, LESSON_PATH } from '../src/pages/hangar/facts';
for (const id of AIRCRAFT_ORDER) {
  const s = AIRCRAFT[id];
  const u = s.units;
  console.log('=====', id, u);
  console.log('bind', JSON.stringify(headlineBind(s)));
  const c = capFacts(s, u);
  console.log('modes', c.modes.map(m => m.label + (m.missing ? '(x)' : '')).join(' | '), 'scan', JSON.stringify(c.scan));
  console.log('tracks', c.twsTracks, 'targets', c.targetsAtOnce, 'twsl', c.tws.answer, '|', c.tws.rule);
  console.log('summary', weaponsSummary(s));
  for (const r of [...LESSON_PATH, 'reference'] as const) console.log(' ', r, ':', lessonLine(r, s, u));
  for (const w of weaponFacts(s, u)) console.log('  W', w.name, w.seeker, w.midcourse, w.pitbull, w.loft, w.loadCount, '|', w.rule);
}
