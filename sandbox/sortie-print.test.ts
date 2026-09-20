import { test } from 'vitest';
import { AIRCRAFT_ORDER } from '../src/data/aircraft';
import { briefFacts, defaultSetup } from '../src/pages/sortie/setup';
import { AIRCRAFT } from '../src/data/aircraft';
test('print', () => {
  for (const ac of AIRCRAFT_ORDER) {
    const s = defaultSetup(ac);
    const f = briefFacts(ac, s, AIRCRAFT[ac].units);
    console.log(`\n=== ${ac} vs ${s.enemy}\n${f.you}\n${f.them}\n${f.skill}\nRADAR: ${f.radar}\nTHREATS:\n - ${f.threats.join('\n - ')}\nJET:\n - ${f.yourJet.join('\n - ')}\nZONES: ${f.zones.map(z => `${z.who} ${z.name} rne ${Math.round(z.rne)} rmax ${Math.round(z.rmax)}`).join(' | ')}\nEDGE: ${f.edge}`);
  }
});
