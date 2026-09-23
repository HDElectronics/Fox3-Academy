/**
 * Render kit harness. Views:
 *   ?view=gallery  all ten jets side by side (&side=red|blue|neutral, &cam=top, &spin=1)
 *   ?view=world    a small live World driven by this script (&cam=orbit|chase|top|cockpit, &warp=seconds)
 *   ?view=hero     one jet with its radar volume sweeping (&ac=su27)
 *   ?view=replay   the world demo recorded and replayed (&t=seconds)
 * Common: &cockpit=ru|us (token skin), &units=metric|imperial
 */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import { Vector3 } from 'three';
import {
  CameraRig, createMissileMesh, JetMesh, JET_DIMENSIONS, RadarVolume, ReplayView, rosterFromWorld, Stage, stepSyntheticScan, Tag, WorldView,
  type CameraMode,
} from '../src/render';
import { AIRCRAFT, AIRCRAFT_ORDER, FIGHTER_ORDER } from '../src/data/aircraft';
import { MISSILES } from '../src/data/missiles';
import type { AircraftId, FighterId, MissileId } from '../src/data/types';
import { World } from '../src/sim/world';
import { fighterSpec } from '../src/sim/jet';
import type { Aircraft, Missile, RecordFrame, TrackFile } from '../src/sim/types';
import { dirFrom, D2R, wrap2Pi } from '../src/sim/math';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'world';
const units = (q.get('units') === 'imperial' ? 'imperial' : 'metric') as 'metric' | 'imperial';
document.documentElement.dataset.cockpit = q.get('cockpit') === 'ru' ? 'ru' : 'us';

const host = document.getElementById('viewport') as HTMLElement;
const hud = document.getElementById('hud') as HTMLElement;
for (const v of ['gallery', 'world', 'hero', 'replay']) {
  const a = document.createElement('a');
  const p = new URLSearchParams(q); p.set('view', v);
  a.href = '?' + p.toString(); a.textContent = v; a.setAttribute('aria-current', String(v === view));
  hud.appendChild(a);
}
const fpsEl = document.createElement('span'); fpsEl.className = 'fps'; hud.appendChild(fpsEl);

const stage = new Stage(host, { environment: { surface: q.get('surface') === 'land' ? 'land' : 'sea', clouds: q.get('clouds') === '1' } });
let frames = 0, acc = 0;
stage.onFrame(dt => { frames++; acc += dt; if (acc >= 0.5) { fpsEl.textContent = Math.round(frames / acc) + ' fps'; frames = 0; acc = 0; } });
(window as unknown as { stage: Stage }).stage = stage;

// ------------------------------------------------------------------------------------------ gallery
function gallery(): void {
  const side = (q.get('side') ?? 'blue') as 'blue' | 'red' | 'neutral';
  const alt = 9; // km
  const jets: JetMesh[] = [];
  const only = q.get('only') as AircraftId | null;
  const list = only ? [only] : AIRCRAFT_ORDER;
  const rot = -Number(q.get('rot') ?? 228) * D2R;
  list.forEach((id, i) => {
    const col = only ? 2 : i % 5, row = only ? 0.5 : Math.floor(i / 5);
    const j = new JetMesh(id, side, stage.palette);
    j.scale.setScalar(0.001);
    j.position.set((col - 2) * 0.03, alt, (row - 0.5) * 0.05);
    j.rotation.y = rot;
    if (id === 'f14b') j.setSweep(q.get('sweep') ? Number(q.get('sweep')) : 20);
    stage.scene.add(j);
    jets.push(j);
    const tag = new Tag(stage.labels, 'aircraft', side);
    tag.el.classList.add('r3-below');
    const spec = AIRCRAFT[id];
    tag.set(spec.short, '', spec.module === 'fc3' ? 'FC3' : 'Full fidelity');
    tag.obj.position.set(j.position.x, alt - 0.0035, j.position.z + 0.009);
  });
  if (q.get('missiles') === '1') {
    const ids = Object.keys(MISSILES) as MissileId[];
    ids.forEach((mid, i) => {
      const m = createMissileMesh(mid, stage.palette);
      m.scale.setScalar(0.001);
      m.position.set(0, alt + 0.03, -0.06 + (i - (ids.length - 1) / 2) * 0.0016);
      m.rotation.y = -Math.PI / 2;
      stage.scene.add(m);
    });
  }
  const top = q.get('cam') === 'top';
  const mis = q.get('missiles') === '1';
  const rig = new CameraRig(stage, { focus: mis ? { x: 0, y: alt * 1000 + 30, z: -60 } : { x: 0, y: alt * 1000, z: 0 }, view: { headingDeg: Number(q.get('hdg') ?? 0), elevationDeg: Number(q.get('el') ?? (top ? 89.9 : 26)), distance: Number(q.get('dist') ?? (only ? 36 : 138)) } });
  (window as unknown as { rig: CameraRig }).rig = rig;
  if (q.get('spin') === '1') stage.onFrame(dt => { for (const j of jets) j.rotation.y += dt * 0.3; });
}

// ------------------------------------------------------------------------------------------ demo world
interface Demo { world: World; me: Aircraft; b1: Aircraft; b2: Aircraft; step(dt: number): void; frames: RecordFrame[] }

function buildDemo(): Demo {
  const world = new World(7);
  world.record = false;
  const me = world.spawnAircraft({ side: 'blue', type: (q.get('ac') as FighterId) ?? 'f15c', controller: 'script', callsign: 'VIPER 1', pos: { x: 0, y: 9500, z: 0 }, heading: 10 * D2R, speed: 270 });
  const b1 = world.spawnAircraft({ side: 'red', type: 'su27', controller: 'script', callsign: 'BANDIT 1', pos: { x: 9000, y: 8200, z: -52000 }, heading: 195 * D2R, speed: 250 });
  const b2 = world.spawnAircraft({ side: 'red', type: 'mig29s', controller: 'script', callsign: 'BANDIT 2', pos: { x: -14000, y: 6100, z: -64000 }, heading: 170 * D2R, speed: 240 });
  const frames: RecordFrame[] = [];
  let lastRec = -1;

  // Radar: TWS, 4 bars ±60°, 80 nm scale, cursor at 60 km.
  const r = me.radar;
  r.mode = 'tws'; r.azHalf = 60 * D2R; r.bars = 4; r.elCenter = -1.5 * D2R; r.rangeScale = 148000; r.cursor = { az: 0, range: 50000 };
  r.designated = [b1.id];
  const track = (tgt: Aircraft, label: string): TrackFile => ({ label, targetId: tgt.id, pos: tgt.pos.clone(), vel: tgt.vel.clone(), firstHit: 0, lastHit: 0, hits: 3, firm: true, coasting: false });
  r.tracks = [track(b1, 'T1'), track(b2, 'T2')];
  b1.radar.mode = 'rws';

  const mk = (id: string, shooter: Aircraft, target: Aircraft, type: MissileId): Missile => {
    const spec = MISSILES[type];
    return {
      kind: 'missile', id, type, side: shooter.side, shooterId: shooter.id, targetId: target.id,
      pos: shooter.pos.clone().add(new Vector3(0, -3, 0)), vel: shooter.vel.clone(), launchedAt: world.t, alive: true,
      guidance: spec.seeker === 'sarh' ? 'sarh' : spec.seeker === 'ir' ? 'ir' : 'datalink',
      aimPos: target.pos.clone(), aimVel: target.vel.clone(), seekerOn: null, motorLeft: spec.burnS, mass: spec.massKg,
      lofting: false, timeToActive: null, timeToImpact: null, result: null, closestApproach: Infinity,
    };
  };

  const fly = (ac: Aircraft, dt: number, turnRate: number, climb = 0) => {
    ac.heading = wrap2Pi(ac.heading + turnRate * dt);
    ac.roll += (Math.atan(turnRate * ac.vel.length() / 9.81) - ac.roll) * Math.min(1, dt * 2);
    ac.pitch += (Math.atan2(climb, ac.vel.length()) - ac.pitch) * Math.min(1, dt * 2);
    const s = ac.vel.length();
    dirFrom(ac.heading, ac.pitch, ac.vel).multiplyScalar(s);
    ac.pos.addScaledVector(ac.vel, dt);
  };

  let chaffT = 0;
  const steerMissile = (m: Missile, tgt: Aircraft, dt: number) => {
    if (!m.alive) return;
    const spec = MISSILES[m.type];
    const age = world.t - m.launchedAt;
    m.motorLeft = Math.max(0, spec.burnS - age);
    const speed = m.vel.length();
    const want = m.motorLeft > 0 ? Math.min(1250, speed + 95 * dt * 10) : Math.max(350, speed - 12 * dt);
    const dist = tgt.pos.distanceTo(m.pos);
    const lead = Math.min(2, dist / Math.max(300, speed) * 0.5);
    const to = tgt.pos.clone().addScaledVector(tgt.vel, lead).sub(m.pos);
    const dir = m.vel.clone().normalize().lerp(to.normalize(), Math.min(1, dt * (dist < 6000 ? 8 : 2.2))).normalize();
    m.vel.copy(dir).multiplyScalar(want);
    m.pos.addScaledVector(m.vel, dt);
    const closure = Math.max(200, want);
    if (spec.seeker === 'arh') {
      const pit = (spec.pitbullKm ?? 15) * 1000;
      if (dist < pit) { m.guidance = 'active'; m.timeToActive = null; m.seekerOn = tgt.id; }
      else m.timeToActive = (dist - pit) / closure;
    }
    m.timeToImpact = dist / closure;
    if (dist < Math.max(120, want * dt * 1.5) && tgt.alive) {
      m.alive = false; m.result = { kind: 'hit', reason: 'hit', t: world.t };
      world.kill(tgt.id, m.shooterId);
    }
  };

  const demo: Demo = {
    world, me, b1, b2, frames,
    step(dt: number) {
      world.t += dt;
      const t = world.t;
      if (me.alive) fly(me, dt, t < 14 ? 0.0 : 0.035, 0);
      if (b1.alive) fly(b1, dt, t > 16 ? -0.06 : 0.004, t > 16 ? -40 : 0);
      if (b2.alive) fly(b2, dt, 0.012, 0);
      stepSyntheticScan(me.radar, fighterSpec(me).radar, dt);
      // Track estimates drift away from truth and snap back on each "hit".
      for (const tr of me.radar.tracks) {
        const tgt = world.aircraft.get(tr.targetId);
        if (!tgt || !tgt.alive) continue;
        const since = (t % 2.6);
        tr.pos.copy(tgt.pos).add(new Vector3(Math.sin(t * 0.7 + tr.label.length) * 900 * since, 120 * since, Math.cos(t * 0.5) * 700 * since));
        tr.vel.copy(tgt.vel);
        tr.coasting = tr.label === 'T2' && since > 1.8;
      }
      if (t > 3 && !world.missiles.has('M1')) world.missiles.set('M1', mk('M1', me, b1, 'aim120c'));
      if (t > 6 && !world.missiles.has('M2')) { world.missiles.set('M2', mk('M2', b1, me, 'r27er')); b1.radar.mode = 'stt'; b1.radar.stt.targetId = me.id; }
      const m1 = world.missiles.get('M1'), m2 = world.missiles.get('M2');
      if (m1) steerMissile(m1, b1, dt);
      if (m2) {
        steerMissile(m2, me, dt);
        if (m2.alive && t > 26) { m2.alive = false; m2.result = { kind: 'miss', reason: 'notched', t }; b1.radar.stt.targetId = null; }
      }
      if (m1 && m1.guidance === 'active' && b1.alive) {
        chaffT -= dt;
        if (chaffT <= 0) { chaffT = 0.55; world.chaff(b1.id); if (Math.random() < 0.4) world.flare(b1.id); }
      }
      // Countermeasure drift (the sim's own step may be a stub right now).
      world.countermeasures = world.countermeasures.filter(c => t - c.t0 < c.life);
      for (const c of world.countermeasures) { c.pos.addScaledVector(c.vel, dt); c.pos.y -= 8 * dt; }
      if (t - lastRec >= 0.25) {
        lastRec = t;
        frames.push({
          t,
          aircraft: [...world.aircraft.values()].map(a => ({ id: a.id, side: a.side, type: a.type, pos: [a.pos.x, a.pos.y, a.pos.z] as [number, number, number], heading: a.heading, pitch: a.pitch, roll: a.roll, alive: a.alive, radarMode: a.radar.mode, sttTarget: a.radar.stt.targetId,
            radar: { azCenter: a.radar.azCenter, azHalf: a.radar.azHalf, elCenter: a.radar.elCenter, bars: a.radar.bars, beamAz: a.radar.beamAz, beamEl: a.radar.beamEl },
            designated: a.radar.designated.slice() })),
          missiles: [...world.missiles.values()].map(m => ({ id: m.id, type: m.type, side: m.side, shooterId: m.shooterId, targetId: m.targetId, pos: [m.pos.x, m.pos.y, m.pos.z] as [number, number, number], guidance: m.guidance, alive: m.alive, timeToActive: m.timeToActive })),
        });
      }
    },
  };
  return demo;
}

function worldView(): void {
  const demo = buildDemo();
  const warp = Number(q.get('warp') ?? 14);
  const wv = new WorldView(stage, demo.world, {
    units, observer: demo.me.id, radarVolumeOf: q.get('volume') === '0' ? null : demo.me.id,
    layers: { tracks: true, notch: q.get('notch') === '1', velocity: q.get('vel') === '1', rwrLines: q.get('rwr') === '1', truth: q.get('truth') !== '0' },
    radarVolume: { coverageAt: ['cursor'] },
  });
  (window as unknown as { wv: WorldView }).wv = wv;
  for (let i = 0; i < warp * 30; i++) { demo.step(1 / 30); wv.syncNow(); }
  const cam = (q.get('cam') ?? 'orbit') as CameraMode;
  const rig = new CameraRig(stage, { source: wv, focus: demo.me.id, view: { headingDeg: 35, elevationDeg: 24, distance: 60000 } });
  (window as unknown as { rig: CameraRig }).rig = rig;
  const fid = q.get('focus');
  if (cam === 'orbit' && fid) rig.focusOn(fid, { distance: Number(q.get('dist') ?? 3000), instant: true });
  else if (cam === 'orbit') rig.frame([demo.me.id, demo.b1.id, demo.b2.id], { headingDeg: 28, elevationDeg: 26, instant: true, padding: 1.05 });
  if (q.get('hdg')) rig.setView({ headingDeg: Number(q.get('hdg')), elevationDeg: Number(q.get('el') ?? 20) }, true);
  else if (cam === 'chase') rig.setMode('chase', { focus: demo.me.id, lookAt: q.get('look') ?? 'M2', instant: true });
  else rig.setMode(cam, { focus: demo.me.id, instant: true });
  const speed = Number(q.get('speed') ?? 1);
  stage.onFrame(dt => demo.step(dt * speed));
  stage.onTap((x, y) => { const id = wv.pickEntity(x, y); wv.select(id); if (id) console.log('picked', id); });
  if (q.get('debug') === '1') setTimeout(() => {
    const ms = (wv as unknown as { missiles: Map<string, { ribbon: { geometry: { drawRange: unknown; attributes: Record<string, { count: number }> }; size: number; count: number }; trail: { meshes: { visible: boolean; material: { uniforms: Record<string, { value: unknown }> } }[] } }> }).missiles;
    for (const [id, v] of ms) console.error('DBG', id, JSON.stringify(v.ribbon.geometry.drawRange), v.ribbon.size, v.ribbon.count, v.trail.meshes.map(m => m.visible), JSON.stringify(v.trail.meshes[1].material.uniforms.uTime.value), JSON.stringify(v.trail.meshes[1].material.uniforms.uWidthPx.value));
  }, 1500);
}

function heroView(): void {
  // Hangar-style hero: the jet at true size with a stylised short-range scan volume sweeping ahead.
  const id = (q.get('ac') as FighterId) ?? 'su27';
  const spec = AIRCRAFT[id];
  const jet = new JetMesh(id, 'blue', stage.palette);
  jet.scale.setScalar(0.001);
  jet.position.set(0, 9, 0);
  stage.scene.add(jet);
  const state = {
    mode: 'rws' as const, azCenter: 0, azHalf: 60 * D2R, elCenter: 0, bars: 4, rangeScale: 20000,
    beamAz: 0, beamEl: 0, sweepDir: 1 as 1 | -1, bar: 0, cursor: { az: 0, range: 12000 },
  };
  const vol = new RadarVolume(stage, spec.radar, { units, range: 260, labels: false, coverageAt: [], opacity: 0.05 });
  const L = JET_DIMENSIONS[id].length;
  // &interactive=0: no drag/zoom/wheel, the page scrolls through it (landing-page hero); &orbit=deg/s auto-orbits.
  const rig = new CameraRig(stage, {
    focus: { x: 0, y: 9000, z: -L * 1.2 }, view: { headingDeg: 322, elevationDeg: 17, distance: L * 3.1 },
    interactive: q.get('interactive') !== '0', autoOrbit: Number(q.get('orbit') ?? 0),
  });
  if (q.get('interactive') === '0') console.log('hero: interactive', rig.isInteractive, 'touch-action', stage.canvas.style.touchAction);
  (window as unknown as { rig: CameraRig }).rig = rig;
  stage.onFrame(dt => {
    stepSyntheticScan(state, spec.radar, dt);
    vol.update(state, { x: 0, y: 9000, z: 0 }, 0);
  });
}

function replayView(): void {
  const demo = buildDemo();
  const dur = Number(q.get('warp') ?? 40);
  for (let i = 0; i < dur * 30; i++) demo.step(1 / 30);
  const events = demo.world.events;
  if (q.get('log') === '1') console.error('events', JSON.stringify(events.filter(e => e.type === 'kill')), JSON.stringify([...demo.world.missiles.values()].map(m => [m.id, m.alive, m.result])));
  const rv = new ReplayView(stage, { frames: demo.frames, roster: rosterFromWorld(demo.world), events, units });
  (window as unknown as { rv: ReplayView }).rv = rv;
  rv.setTime(Number(q.get('t') ?? 22));
  const rig = new CameraRig(stage, { source: rv, focus: demo.me.id, view: { headingDeg: 20, elevationDeg: 30, distance: 60000 } });
  rig.frame([demo.me.id, demo.b1.id, demo.b2.id], { headingDeg: 60, elevationDeg: 30, instant: true, follow: false, padding: 1.05 });
  if (q.get('play') === '1') stage.onFrame(dt => { rv.setTime(rv.currentTime + dt); });
}

function stressView(): void {
  // 10 jets and 20 missiles in flight with smoke, chaff and flares; logs the kit's JS time per frame.
  const world = new World(3);
  world.record = false;
  const jets: Aircraft[] = [];
  FIGHTER_ORDER.forEach((id, i) => {
    const ang = (i / 10) * Math.PI * 2;
    jets.push(world.spawnAircraft({ side: i % 2 ? 'red' : 'blue', type: id, controller: 'script', callsign: id.toUpperCase(),
      pos: { x: Math.sin(ang) * 30000, y: 4000 + i * 900, z: -Math.cos(ang) * 30000 }, heading: ang + Math.PI / 2, speed: 240 + i * 5 }));
  });
  const me = jets[0];
  me.radar.mode = 'tws'; me.radar.azHalf = 60 * D2R; me.radar.bars = 4;
  me.radar.tracks = jets.filter(j => j.side === 'red').map((j, k) => ({ label: 'T' + (k + 1), targetId: j.id, pos: j.pos.clone(), vel: j.vel.clone(), firstHit: 0, lastHit: 0, hits: 3, firm: true, coasting: false }));
  me.radar.designated = [jets[1].id];
  const missiles: Missile[] = [];
  const types: MissileId[] = ['aim120c', 'r77', 'r27er', 'aim54c', 'sd10', 'aim7m', 'r73', 'aim9x', 's530d', 'r27et'];
  for (let k = 0; k < 20; k++) {
    const sh = jets[k % 10], tg = jets[(k + 3) % 10], type = types[k % types.length], spec = MISSILES[type];
    const m: Missile = {
      kind: 'missile', id: 'S' + k, type, side: sh.side, shooterId: sh.id, targetId: tg.id, pos: sh.pos.clone(), vel: sh.vel.clone(),
      launchedAt: 0, alive: true, guidance: spec.seeker === 'arh' ? (k % 3 ? 'datalink' : 'active') : spec.seeker === 'sarh' ? 'sarh' : 'ir',
      aimPos: tg.pos.clone(), aimVel: tg.vel.clone(), seekerOn: null, motorLeft: spec.burnS, mass: spec.massKg, lofting: false,
      timeToActive: 12, timeToImpact: 30, result: null, closestApproach: Infinity,
    };
    missiles.push(m); world.missiles.set(m.id, m);
  }
  const wv = new WorldView(stage, world, { units, observer: me.id, radarVolumeOf: me.id, layers: { tracks: true, velocity: true, notch: true } });
  const rig = new CameraRig(stage, { source: wv });
  rig.frame(jets.map(j => j.id), { headingDeg: 20, elevationDeg: 35, instant: true, padding: 1.0 });
  let cmT = 0;
  const step = (dt: number) => {
    world.t += dt;
    for (const j of jets) {
      j.heading = wrap2Pi(j.heading + 0.02 * dt);
      j.roll = Math.atan(0.02 * 250 / 9.81);
      dirFrom(j.heading, 0, j.vel).multiplyScalar(250);
      j.pos.addScaledVector(j.vel, dt);
    }
    stepSyntheticScan(me.radar, fighterSpec(me).radar, dt);
    for (const m of missiles) {
      const tg = world.aircraft.get(m.targetId ?? '');
      if (!tg) continue;
      const age = world.t - m.launchedAt;
      m.motorLeft = Math.max(0, MISSILES[m.type].burnS - age);
      const to = tg.pos.clone().sub(m.pos);
      if (to.length() < 1500 || age > 60) { // relaunch
        const sh = world.aircraft.get(m.shooterId);
        if (sh) { m.pos.copy(sh.pos); m.vel.copy(sh.vel); m.launchedAt = world.t; }
        continue;
      }
      m.vel.lerp(to.normalize().multiplyScalar(900), Math.min(1, dt * 0.6));
      m.pos.addScaledVector(m.vel, dt);
    }
    cmT -= dt;
    if (cmT <= 0) { cmT = 0.4; for (const j of jets) if (j.side === 'red') { world.chaff(j.id); world.flare(j.id); } }
    world.countermeasures = world.countermeasures.filter(c => world.t - c.t0 < c.life);
    for (const c of world.countermeasures) c.pos.addScaledVector(c.vel, dt);
  };
  for (let i = 0; i < 30 * 20; i++) { step(1 / 30); wv.syncNow(); }
  stage.onFrame(dt => step(dt), { priority: 0 });
  let t0 = 0, sum = 0, n = 0, worst = 0;
  stage.onFrame(() => { t0 = performance.now(); }, { priority: 50 });
  stage.onFrame(() => {
    const ms = performance.now() - t0;
    sum += ms; n++; worst = Math.max(worst, ms);
    if (n % 5 === 0) console.error(`kit JS per frame: avg ${(sum / n).toFixed(2)} ms, worst ${worst.toFixed(2)} ms, jets ${world.aircraft.size}, missiles ${world.missiles.size}, cms ${world.countermeasures.length}`);
  }, { priority: 450 });
}

function contextLossView(): void {
  worldView();
  const gl = stage.renderer.getContext();
  const ext = gl.getExtension('WEBGL_lose_context');
  if (!ext) { console.error('no WEBGL_lose_context'); return; }
  setTimeout(() => { ext.loseContext(); console.error('context lost; overlay:', !!document.querySelector('.r3-message')); }, 600);
  setTimeout(() => { ext.restoreContext(); }, 1400);
  setTimeout(() => { console.error('after restore; overlay:', !!document.querySelector('.r3-message'), 'running:', stage.running); }, 2600);
}

function disposeView(): void {
  // Mount/unmount repeatedly; checks for leaked DOM, loops and contexts.
  const world = new World(1);
  world.spawnAircraft({ side: 'blue', type: 'f16c', controller: 'script', pos: { x: 0, y: 8000, z: 0 }, heading: 0, speed: 250 });
  stage.dispose();
  for (let i = 0; i < 6; i++) {
    const s = new Stage(host);
    const wv = new WorldView(s, world, { radarVolumeOf: world.aircraft.keys().next().value ?? null });
    const rig = new CameraRig(s, { source: wv });
    s.renderOnce();
    rig.dispose(); wv.dispose(); s.dispose();
  }
  const left = host.querySelectorAll('*').length;
  console.error('after 6 mount/unmount cycles: DOM nodes left in host =', left);
}

if (view === 'stress') stressView();
else if (view === 'lose') contextLossView();
else if (view === 'dispose') disposeView();
else if (view === 'gallery') gallery();
else if (view === 'hero') heroView();
else if (view === 'replay') replayView();
else worldView();
