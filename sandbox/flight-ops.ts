/**
 * Flight-ops render harness: FlightOpsScene with a scripted state (a jet on a 3° final, gear and flaps
 * down) and a flown trail. Params: ?cam=chase|side|tower|cockpit, ?ac=<any AircraftId>, ?d=metres before
 * the aim point (default 1400), ?alt=metres (overrides the glide-path height), ?gear=0..1, ?flaps=0..1,
 * ?brake=0..1, ?sweep=deg (F-14), ?nav=x,z (steer-point marker, runway metres), ?navlabel=text,
 * ?inspect=1|low (close three-quarter view of the jet from above or just below, overrides the camera), ?cockpit=us|ru, ?fly=1 (animate).
 */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import { FlightOpsScene, FramePriority, glidePoint, Stage, type FlightOpsCamera } from '../src/render';
import { AIRCRAFT_ORDER } from '../src/data/aircraft';
import type { FlightOpsJetId, FlightOpsState } from '../src/sim/flightOps/types';

const q = new URLSearchParams(location.search);
document.documentElement.dataset.cockpit = q.get('cockpit') === 'ru' ? 'ru' : 'us';
const inspect = q.get('inspect') === '1' || q.get('inspect') === 'low';
const low = q.get('inspect') === 'low';
const cam = (inspect ? 'chase' : ['chase', 'side', 'tower', 'cockpit'].includes(q.get('cam') ?? '') ? q.get('cam') : 'side') as FlightOpsCamera;
const ac = ((AIRCRAFT_ORDER as string[]).includes(q.get('ac') ?? '') ? q.get('ac') : 'fa18c') as FlightOpsJetId;
const num = (k: string, d: number) => { const v = Number(q.get(k)); return q.has(k) && Number.isFinite(v) ? v : d; };
const d0 = num('d', 1400);
const GLIDE = 3, AIM = 300, D2R = Math.PI / 180;

const host = document.getElementById('viewport') as HTMLElement;
const hud = document.getElementById('hud') as HTMLElement;
for (const c of ['chase', 'side', 'tower', 'cockpit']) {
  const a = document.createElement('a');
  const u = new URLSearchParams(q); u.set('cam', c);
  a.href = '?' + u.toString(); a.textContent = c;
  if (c === cam) a.setAttribute('aria-current', 'true');
  hud.appendChild(a);
}

const stage = new Stage(host, { environment: { surface: 'land', grid: false }, autoPause: 'render' });
const scene = new FlightOpsScene(stage, ac, { camera: cam, glideDeg: GLIDE, aimPointM: AIM });

/** Scripted wobble around the glide path so the trail shows all three error colours. */
const wobble = (d: number) => 18 * Math.sin(d / 900) * Math.min(1, d / 3000);
const lateral = (d: number) => 25 * Math.sin(d / 1300 + 1) * Math.min(1, d / 4000);

function stateAt(d: number, t: number): FlightOpsState {
  const g = glidePoint(d, GLIDE, AIM);
  const speed = 70;
  return {
    t, aircraft: ac,
    pos: { x: lateral(d), y: q.has('alt') ? num('alt', 0) : g.y + wobble(d), z: g.z },
    heading: 0, pitch: 5 * D2R, bank: 0, gamma: -GLIDE * D2R, speed, aoa: 8.1, vs: -speed * Math.tan(GLIDE * D2R),
    throttle: 0.7, afterburner: false,
    gearDown: true, gearPos: num('gear', 1), flapIndex: 2, flapPos: num('flaps', 1),
    speedbrakeOut: num('brake', 0) > 0, speedbrakePos: num('brake', 0), phase: 'air',
  };
}

const START = 4 * 1852;
for (let d = START; d >= d0; d -= 20) {
  const s = stateAt(d, 0);
  const err = Math.abs(s.pos.y - glidePoint(d, GLIDE, AIM).y) / Math.max(d, 1) / D2R;
  scene.overlay.pushTrail(s.pos, err < 0.25 ? 0 : err < 0.5 ? 1 : 2);
}
scene.overlay.setGates([
  { id: 'ninety', pos: { x: 0, y: glidePoint(3000, GLIDE, AIM).y, z: -AIM + 3000 }, radiusM: 30, state: 'miss' },
  { id: 'groove', pos: { x: 0, y: glidePoint(1852, GLIDE, AIM).y, z: -AIM + 1852 }, radiusM: 25, state: 'ok' },
  { id: 'touchdown', pos: { x: 0, y: 8, z: -AIM }, radiusM: 12, state: 'pending' },
]);
scene.update(stateAt(d0, 0));
if (q.has('sweep')) scene.jet.setSweep(num('sweep', 20));
const nav = (q.get('nav') ?? '').split(',').map(Number);
if (nav.length === 2 && nav.every(Number.isFinite)) scene.setNavTarget({ x: nav[0], z: nav[1] }, q.get('navlabel') ?? undefined);

if (inspect) {
  // Close three-quarter view from the left rear quarter, slightly high, true size (chase scale).
  stage.onFrame(() => {
    const j = scene.jet, L = j.lengthM / 1000;
    stage.camera.position.set(j.position.x - L * 0.95, j.position.y + L * (low ? -0.06 : 0.28), j.position.z + L * 0.75);
    stage.camera.lookAt(j.position);
  }, { priority: FramePriority.camera + 1, always: true });
}

if (q.get('fly') === '1') {
  let d = d0;
  stage.onFrame(dt => {
    if (dt <= 0) return;
    d = d - 70 * dt;
    if (d < 0) d = START;
    const s = stateAt(d, stage.elapsed);
    scene.overlay.pushTrail(s.pos, 0);
    scene.update(s);
  });
}
console.log(`flight-ops harness: ${ac} cam=${cam} d=${d0} m`);
