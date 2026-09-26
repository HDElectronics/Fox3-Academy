/**
 * Dev harness for the attack-scene target marks: a Su-25T with the Shkval on the target area, blue friendlies with an
 * orange smoke and an IR pointer, red vehicles with a white smoke and a laser spot, and the attack geometry (IP,
 * target cross, allowed attack headings 330..030). The Shkval TV picture sits bottom right.
 * Params: ?cam=target|close|jet, &t=<pre-roll seconds, default 30>, &ir=1, &cockpit=ru|us.
 */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import { World } from '../src/sim/world';
import { shkvalDir, shkvalFovDeg } from '../src/sim/shkval';
import { Stage, WorldView, CameraRig, FramePriority } from '../src/render';
import { AttackScene, ShkvalTv, createAttackField } from '../src/render/attack';

const q = new URLSearchParams(location.search);
document.documentElement.dataset.cockpit = q.get('cockpit') === 'us' ? 'us' : 'ru';
const preroll = Math.max(0, Math.min(300, Number(q.get('t') ?? 30) || 0));

const TARGET = { x: 0, z: 0 };
const FRIENDLY = { x: 150, z: 1300 };
const field = createAttackField({ seed: 25, pads: [{ x: TARGET.x, z: TARGET.z, radiusM: 900 }, { x: FRIENDLY.x, z: FRIENDLY.z, radiusM: 400 }] });

const world = new World(5);
const stage = new Stage(document.getElementById('viewport')!, {
  autoPause: 'render', maxDpr: 1.5, environment: { surface: 'land', grid: false, hazeKm: 60 },
  ariaLabel: 'Target marks: smoke, laser spot and IR pointer on the ground',
});
const view = new WorldView(stage, world, { units: 'metric', layers: { dropLines: false, shadows: false } });
// The scene installs the terrain hook, so spawns below sit on the ground.
const scene = new AttackScene(stage, world, view, { field, layers: { gimbal: false } });
const gy = (x: number, z: number) => world.groundHeight(x, z);

const startZ = 9000;
const me = world.spawnAircraft({
  id: 'SU25', side: 'blue', type: 'su25t', controller: 'player', agLoadout: 'vikhr',
  pos: { x: 0, y: gy(0, startZ) + 1500, z: startZ }, heading: 0, speed: 150,
});
me.cmd.heading = 0; me.cmd.altitude = me.pos.y; me.cmd.speed = 150; me.cmd.afterburner = false;
scene.setShooter(me.id);

// Red vehicles at the target, blue friendlies 1.3 km south with the JTAC.
const red = [[-60, 0], [-20, -25], [25, 10], [70, -15]] as const;
red.forEach(([dx, dz], i) => world.spawnGroundUnit({ id: `R${i + 1}`, kind: i < 2 ? 'tank' : 'apc', side: 'red', name: `Red ${i + 1}`, pos: { x: TARGET.x + dx, z: TARGET.z + dz }, heading: Math.PI / 2 }));
const blue = [[-40, 0], [0, 20], [40, -10]] as const;
blue.forEach(([dx, dz], i) => world.spawnGroundUnit({ id: `B${i + 1}`, kind: i === 0 ? 'truck' : 'apc', side: 'blue', name: `Blue ${i + 1}`, pos: { x: FRIENDLY.x + dx, z: FRIENDLY.z + dz }, heading: 0 }));

world.spawnMark({ type: 'smoke', colour: 'white', side: 'blue', ownerId: 'B2', pos: { x: TARGET.x - 150, z: TARGET.z + 60 } });
world.spawnMark({ type: 'smoke', colour: 'orange', side: 'blue', ownerId: 'B2', pos: { x: FRIENDLY.x + 90, z: FRIENDLY.z - 40 } });
world.spawnMark({ type: 'laser', side: 'blue', ownerId: 'B2', code: 1688, pos: { x: TARGET.x - 20, z: TARGET.z - 25 } });
world.spawnMark({ type: 'ir', side: 'blue', ownerId: 'B2', pos: { x: TARGET.x + 25, z: TARGET.z + 10 } });

scene.setGeometry({ ip: { x: -2500, z: 7000 }, target: TARGET, attackHeadingDeg: [330, 30] });
scene.markLayer.setLayer('ir', q.get('ir') === '1');

world.setAgMaster(me.id, 'ag');
world.shkvalPower(me.id, true);
world.shkvalPointAt(me.id, { x: TARGET.x - 60, y: gy(TARGET.x, TARGET.z), z: TARGET.z + 20 });
world.shkvalStabilise(me.id, true);

for (let t = 0; t < preroll; t += 1 / 60) {
  world.step(1 / 60);
  // Keep the sight on the target area during the pre-roll.
  if (Math.round(t * 60) % 60 === 0) world.shkvalPointAt(me.id, { x: TARGET.x - 60, y: gy(TARGET.x, TARGET.z), z: TARGET.z + 20 });
}

const tv = new ShkvalTv(stage, { width: 320, height: 240, every: 2, hidden: () => scene.tvHidden() });
document.getElementById('tv')!.append(tv.image);
const rig = new CameraRig(stage, { source: view, mode: 'chase' });

type Cam = 'target' | 'close' | 'jet';
function setCam(c: Cam): void {
  if (c === 'target') {
    rig.setMode('orbit', { focus: { x: TARGET.x, y: gy(TARGET.x, TARGET.z), z: TARGET.z + 600 }, distance: 2600, instant: true });
    rig.setView({ headingDeg: 200, elevationDeg: 22 }, true);
  } else if (c === 'close') {
    rig.setMode('orbit', { focus: { x: TARGET.x, y: gy(TARGET.x, TARGET.z), z: TARGET.z }, distance: 650, instant: true });
    rig.setView({ headingDeg: 200, elevationDeg: 18 }, true);
  } else {
    rig.setMode('orbit', { focus: me.id, distance: 380, instant: true });
    rig.setView({ headingDeg: 20, elevationDeg: 6 }, true);
  }
  stage.requestRender();
}
setCam(q.get('cam') === 'jet' ? 'jet' : q.get('cam') === 'close' ? 'close' : 'target');

const offTv = stage.onFrame(() => {
  const sh = me.ag?.shkval;
  if (sh?.on) tv.render(me.pos, shkvalDir(me), shkvalFovDeg(sh.zoom).v);
}, { priority: FramePriority.env + 50 });

const btnT = document.getElementById('cam-target')!, btnJ = document.getElementById('cam-jet')!, btnIr = document.getElementById('ir')!;
btnIr.setAttribute('aria-pressed', String(scene.markLayer.show.ir));
const onT = () => setCam('target'), onJ = () => setCam('jet');
const onIr = () => { const on = !scene.markLayer.show.ir; scene.markLayer.setLayer('ir', on); btnIr.setAttribute('aria-pressed', String(on)); stage.requestRender(); };
btnT.addEventListener('click', onT); btnJ.addEventListener('click', onJ); btnIr.addEventListener('click', onIr);

let disposed = false;
function dispose(): void {
  if (disposed) return;
  disposed = true;
  offTv();
  btnT.removeEventListener('click', onT); btnJ.removeEventListener('click', onJ); btnIr.removeEventListener('click', onIr);
  window.removeEventListener('pagehide', dispose);
  tv.dispose(); scene.dispose(); stage.dispose();
}
window.addEventListener('pagehide', dispose);
if (import.meta.hot) import.meta.hot.dispose(dispose);
console.log(`marks harness: t=${world.t.toFixed(1)} s, marks=${world.marks.size}, units=${world.groundUnits.size}`);
