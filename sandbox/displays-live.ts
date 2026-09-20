/**
 * Displays driven by the real simulation (World + buildRadarPicture + RWR), as pages will use them.
 *   ?jet=f15c   player aircraft (any AircraftId)      ?t=40   pre-roll seconds before showing
 *   ?pause=1    freeze after the pre-roll
 * The player auto-flies: TWS (or RWS on the Mirage), designates up to two firm tracks once each (the
 * Mirage locks), fires when canLaunch() says ok, two missiles at most.
 */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import { AIRCRAFT } from '../src/data/aircraft';
import { RWRS } from '../src/data/rwr';
import type { AircraftId } from '../src/data/types';
import { World } from '../src/sim/world';
import { pair } from '../src/sim/scenarios';
import { buildRadarPicture } from '../src/sim/picture';
import type { Aircraft } from '../src/sim/types';
import { DlzBar, MissileTimeline, RadarDisplay, RwrDisplay } from '../src/ui/displays';

const qs = new URLSearchParams(location.search);
const jet = (qs.get('jet') ?? 'f15c') as AircraftId;
const spec = AIRCRAFT[jet];
document.documentElement.dataset.cockpit = spec.cockpit;

const world = new World(7);
const eng = pair(world, jet, undefined, 'regular', { range: 90000 });
const me = world.get(eng.playerId) as Aircraft;
const bandit = world.get(eng.enemyIds[0]) as Aircraft;
world.setRadarMode(me.id, spec.radar.tws ? 'tws' : 'rws');
const log: string[] = [];
world.on(e => {
  if (e.type === 'launch' || e.type === 'pitbull' || e.type === 'lock' || e.type === 'hit' || e.type === 'miss' || e.type === 'ai')
    log.push(`${e.t.toFixed(1)} ${e.type} ${'text' in e ? e.text : JSON.stringify({ ...e, t: undefined, type: undefined })}`);
  if (log.length > 8) log.shift();
});

const designated = new Set<string>();
let lastShot = -99, shots = 0, nextThink = 0;
function autopilot(): void {
  if (world.t < nextThink) return;
  nextThink = world.t + 0.5;
  const r = me.radar;
  if (spec.radar.tws && r.mode === 'tws') {
    for (const t of r.tracks) {
      if (designated.size >= 2 || !t.firm || designated.has(t.targetId)) continue;
      world.designate(me.id, t.targetId);
      designated.add(t.targetId);
    }
  } else if (!spec.radar.tws && r.mode === 'rws' && r.bricks.length) {
    world.lock(me.id, r.bricks[0].targetId);
  }
  if (shots < 2 && world.t - lastShot > 6 && world.canLaunch(me.id).ok) {
    world.launch(me.id);
    lastShot = world.t;
    shots++;
  }
}

// ---------------------------------------------------------------- page
const root = document.getElementById('root') as HTMLElement;
const card = (title: string, sub: string, cls = '') => {
  const c = document.createElement('div');
  c.className = 'lv-card';
  const p = document.createElement('div');
  p.innerHTML = `<span>${title}</span><span>${sub}</span>`;
  const g = document.createElement('div');
  g.className = 'lv-glass ' + cls;
  const cv = document.createElement('canvas');
  g.append(cv);
  c.append(p, g);
  return { c, cv };
};
const row = document.createElement('div');
row.className = 'lv-row';
root.append(row);
const rc = card(`${spec.short} radar`, spec.display);
const ownR = card('Own RWR', RWRS[spec.rwr].name);
const banR = card(`${bandit.callsign} RWR (${AIRCRAFT[bandit.type].short})`, RWRS[AIRCRAFT[bandit.type].rwr].name);
row.append(rc.c, ownR.c, banR.c);
const radar = new RadarDisplay(rc.cv, { format: spec.display });
const rwrOwn = new RwrDisplay(ownR.cv, { rwr: spec.rwr });
const rwrBandit = new RwrDisplay(banR.cv, { rwr: AIRCRAFT[bandit.type].rwr });
const strip = document.createElement('div');
strip.className = 'lv-row';
root.append(strip);
const dz = card('DLZ', 'selected weapon vs primary', 'lv-strip');
const tl = card('Missiles', 'in flight', 'lv-tl');
strip.append(dz.c, tl.c);
const dlz = new DlzBar(dz.cv, { units: spec.units });
const timeline = new MissileTimeline(tl.cv);
const pre = document.createElement('pre');
root.append(pre);

rc.cv.addEventListener('click', ev => {
  const id = radar.pick(ev.clientX, ev.clientY);
  if (id) world.designate(me.id, id);
});

const t0 = Number(qs.get('t') ?? 40);
for (let i = 0; i < t0 * 60; i++) { autopilot(); world.step(1 / 60); }
const paused = qs.get('pause') === '1';

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    let k = Math.round(dt * 60);
    while (k-- > 0) { autopilot(); world.step(1 / 60); }
  }
  const pic = buildRadarPicture(world, me.id);
  radar.draw(pic, { ownHeading: me.heading });
  rwrOwn.draw(me.rwr, world.t);
  rwrBandit.draw(bandit.rwr, world.t);
  dlz.draw(pic?.dlz ?? null, { closure: pic?.stt?.closure ?? pic?.tracks.find(t => t.designation === 'primary')?.closure ?? null, shoot: pic?.shootCue, cue: pic?.cueLabel });
  timeline.draw(pic?.missilesInFlight ?? [], world.t);
  pre.textContent = `t ${world.t.toFixed(1)}  mode ${pic?.modeLabel ?? '-'}  tracks ${pic?.tracks.length ?? 0}  bricks ${pic?.bricks.length ?? 0}  ` +
    `shoot ${pic?.shootCue ? pic.cueLabel : '-'} (${pic?.launchBlockedReason ?? ''})\n` + log.join('\n');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
