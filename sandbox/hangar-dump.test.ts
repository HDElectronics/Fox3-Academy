import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { AIRCRAFT, AIRCRAFT_ORDER, AIRCRAFT_CAVEATS } from '../src/data';
import { headlineBind, capFacts, lessonLine, weaponsSummary, weaponFacts, LESSON_PATH } from '../src/pages/hangar/facts';
it('dump', () => {
  const out: string[] = [];
  for (const id of AIRCRAFT_ORDER) {
    const s = AIRCRAFT[id];
    const u = s.units;
    out.push('===== ' + id + ' ' + u);
    out.push('bind ' + JSON.stringify(headlineBind(s)));
    const c = capFacts(s, u);
    out.push('modes ' + c.modes.map(m => m.label + (m.missing ? '(x)' : '')).join(' | ') + ' scan ' + JSON.stringify(c.scan) + ' gimbal ' + c.gimbalDeg + ' det ' + c.detectHeadOnM + '/' + c.detectTailM + ' rwr ' + c.rwrName + ' cms ' + c.chaff + '/' + c.flares);
    out.push('tracks ' + c.twsTracks + ' targets ' + c.targetsAtOnce + ' twsl ' + c.tws.answer + ' | ' + c.tws.rule);
    out.push('summary ' + weaponsSummary(s));
    for (const r of [...LESSON_PATH, 'reference'] as const) out.push('  ' + r + ': ' + lessonLine(r, s, u));
    for (const w of weaponFacts(s, u)) out.push('  W ' + [w.name, w.seeker, w.midcourse, w.pitbull, w.loft, w.loadCount].join(' / ') + ' | ' + w.rule);
    out.push('  caveats: ' + AIRCRAFT_CAVEATS[id].join(' || '));
  }
  writeFileSync("/tmp/hangar-dump.txt", out.join("\n"));
});
