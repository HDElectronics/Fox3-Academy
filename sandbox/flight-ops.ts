/**
 * Flight-ops render harness: FlightOpsScene with a scripted state (a jet on a 3° final, gear and flaps
 * down) and a flown trail. Params: ?cam=chase|side|tower|cockpit, ?ac=<any AircraftId>, ?d=metres before
 * the aim point (default 1400), ?alt=metres (overrides the glide-path height), ?gear=0..1, ?flaps=0..1,
 * ?brake=0..1, ?sweep=deg (F-14), ?nav=x,z (steer-point marker, runway metres), ?navlabel=text,
 * ?inspect=1|low (close three-quarter view of the jet from above or just below, overrides the camera), ?cockpit=us|ru, ?fly=1 (animate).
 * ?ship=cvn|kuznetsov: the carrier instead of the runway (sea, wake, the ship steaming north at 15 kt, the jet in the
 * groove on the ship's glide slope, hook down; ?d defaults to 600, ?hook=0..1). Cameras add lso for the ship.
 */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import { FlightOpsScene, FramePriority, glidePoint, Stage, type FlightOpsCamera } from '../src/render';
import { AIRCRAFT_ORDER } from '../src/data/aircraft';
import type { FlightOpsJetId, FlightOpsState, ShipId } from '../src/sim/flightOps/types';
import { SHIPS } from '../src/data/ships';
import { aimPointU, landingToWorld } from '../src/sim/flightOps/carrier';

const q = new URLSearchParams(location.search);
document.documentElement.dataset.cockpit = q.get('cockpit') === 'ru' ? 'ru' : 'us';
const inspect = q.get('inspect') === '1' || q.get('inspect') === 'low';
const low = q.get('inspect') === 'low';
const shipId: ShipId | null = (['cvn', 'kuznetsov'] as const).find(id => id === q.get('ship')) ?? null;
const CAMS = shipId ? ['chase', 'side', 'lso', 'cockpit'] : ['chase', 'side', 'tower', 'cockpit'];
const cam = (inspect ? 'chase' : CAMS.includes(q.get('cam') ?? '') ? q.get('cam') : 'side') as FlightOpsCamera;
const ac = ((AIRCRAFT_ORDER as string[]).includes(q.get('ac') ?? '') ? q.get('ac') : 'fa18c') as FlightOpsJetId;
const num = (k: string, d: number) => { const v = Number(q.get(k)); return q.has(k) && Number.isFinite(v) ? v : d; };
const d0 = num('d', shipId ? 600 : 1400);
const ship = shipId ? SHIPS[shipId] : null;
const GLIDE = ship ? ship.glideDeg.value : 3, AIM = ship ? aimPointU(ship) : 300, D2R = Math.PI / 180;
const SHIP_MS = 15 * 0.514444;

const host = document.getElementById('viewport') as HTMLElement;
const hud = document.getElementById('hud') as HTMLElement;
for (const c of CAMS) {
  const a = document.createElement('a');
  const u = new URLSearchParams(q); u.set('cam', c);
  a.href = '?' + u.toString(); a.textContent = c;
  if (c === cam) a.setAttribute('aria-current', 'true');
  hud.appendChild(a);
}

const stage = new Stage(host, { environment: { surface: 'land', grid: false }, autoPause: 'render' });
const scene = new FlightOpsScene(stage, ac, { camera: cam, glideDeg: GLIDE, aimPointM: AIM });
if (shipId) scene.setCarrier(shipId);

/** Scripted wobble around the glide path so the trail shows all three error colours. */
const wobble = (d: number) => 18 * Math.sin(d / 900) * Math.min(1, d / 3000);
const lateral = (d: number) => 25 * Math.sin(d / 1300 + 1) * Math.min(1, d / 4000);

function stateAt(d: number, t: number): FlightOpsState {
  const g = glidePoint(d, GLIDE, AIM);
  const speed = 70;
  let pos = { x: lateral(d), y: q.has('alt') ? num('alt', 0) : g.y + wobble(d), z: g.z };
  let heading = 0;
  let shipState: FlightOpsState['ship'];
  if (shipId && ship) {
    // Ship steaming north from the origin; the jet on the landing axis, d metres before the hook aim point.
    shipState = { id: shipId, x: 0, z: -SHIP_MS * t, heading: 0, speedMs: SHIP_MS };
    heading = (2 * Math.PI - ship.angledDeckDeg.value * D2R) % (2 * Math.PI);
    const p = landingToWorld({ ship: shipState } as FlightOpsState, AIM - d, lateral(d) * 0.2);
    pos = { x: p.x, y: q.has('alt') ? num('alt', 0) : ship.deckHeightM + g.y + wobble(d) * 0.2, z: p.z };
  }
  return {
    t, aircraft: ac, pos, ship: shipState, hookPos: shipId ? num('hook', 1) : undefined,
    heading, pitch: 5 * D2R, bank: 0, gamma: -GLIDE * D2R, speed, aoa: 8.1, vs: -speed * Math.tan(GLIDE * D2R),
    throttle: 0.7, afterburner: false,
    gearDown: true, gearPos: num('gear', 1), flapIndex: 2, flapPos: num('flaps', 1),
    speedbrakeOut: num('brake', 0) > 0, speedbrakePos: num('brake', 0), phase: 'air',
  };
}

const START = shipId ? 1.5 * 1852 : 4 * 1852;
for (let d = START; d >= d0; d -= 20) {
  // Trail: runway metres on the airfield, the landing frame (x = v, y above the deck, z = −u) at sea.
  const p = shipId ? { x: lateral(d) * 0.2, y: glidePoint(d, GLIDE, AIM).y + wobble(d) * 0.2, z: -(AIM - d) } : stateAt(d, 0).pos;
  const err = Math.abs(p.y - glidePoint(d, GLIDE, AIM).y) / Math.max(d, 1) / D2R;
  scene.overlay.pushTrail(p, err < 0.25 ? 0 : err < 0.5 ? 1 : 2);
}
if (!shipId) scene.overlay.setGates([
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
console.log(`flight-ops harness: ${ac} cam=${cam} d=${d0} m${shipId ? ' ship=' + shipId : ''}`);
