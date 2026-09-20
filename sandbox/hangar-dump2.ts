import { AIRCRAFT_ORDER, PROCEDURES } from '../src/data';
for (const id of AIRCRAFT_ORDER) {
  console.log('=====', id);
  for (const b of PROCEDURES[id].binds) console.log('  ', b.action, ' => ', b.keys);
}
