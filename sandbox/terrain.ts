/** Dev harness: ?seed=17&focus=x,z (metres), &view=close, &zoom=23, &density=1, &cockpit=ru|us. */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import { Group, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Stage, FramePriority } from '../src/render/stage';
import { createHeightField, heightAt, TerrainMesh, TerrainProps } from '../src/render/terrain';

const q = new URLSearchParams(location.search);
const num = (key: string, fallback: number) => q.has(key) && Number.isFinite(Number(q.get(key))) ? Number(q.get(key)) : fallback;
document.documentElement.dataset.cockpit = q.get('cockpit') === 'ru' || q.get('ac') === 'su27' ? 'ru' : 'us';
const seed = num('seed', 17);
const focusParam = (q.get('focus') ?? '0,0').split(',').map(Number);
const focus = focusParam.length === 2 && focusParam.every(Number.isFinite) ? focusParam : [0, 0];
const field = createHeightField({ seed });
focus[0] = Math.max(-19500, Math.min(19500, focus[0]));
focus[1] = Math.max(-19500, Math.min(19500, focus[1]));
field.flatten(focus[0], focus[1], 220, heightAt(field, focus[0], focus[1]));
const stage = new Stage(document.getElementById('viewport')!, {
  environment: { surface: 'land', grid: false }, autoPause: 'render', maxDpr: 1.5,
  ariaLabel: 'Procedural terrain with hills, tree clumps, buildings and access roads',
});
stage.camera.near = 0.0005;
stage.camera.updateProjectionMatrix();
const root = new Group(); root.scale.setScalar(0.001); stage.scene.add(root);
const terrain = new TerrainMesh(field, stage.palette);
const props = new TerrainProps(field, stage.palette, { density: Math.max(0, num('density', 1)) });
root.add(terrain, props);
const controls = new OrbitControls(stage.camera, stage.canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 0.015;
controls.maxDistance = 70;
const stats = document.getElementById('stats')!;
const zoomButton = document.getElementById('zoom')!;
let zoomed = q.get('zoom') === '23';
function setZoom(): void {
  // Optical magnification relative to the overview's 50° vertical field of view.
  stage.camera.fov = 2 * Math.atan(Math.tan(25 * Math.PI / 180) / (zoomed ? 23 : 1)) * 180 / Math.PI;
  stage.camera.updateProjectionMatrix();
  zoomButton.setAttribute('aria-pressed', String(zoomed));
  stage.requestRender();
}
function view(close: boolean): void {
  const y = heightAt(field, focus[0], focus[1]);
  controls.target.set(focus[0] / 1000, y / 1000, focus[1] / 1000);
  stage.camera.position.copy(controls.target).add(new Vector3(close ? 0.65 : 8, close ? 0.35 : 6, close ? 0.8 : 10));
  controls.update();
  terrain.setFocus(focus[0], focus[1]); props.setFocus(focus[0], focus[1]);
  stage.requestRender();
}
view(q.get('view') === 'close'); setZoom();
const onOverview = () => { zoomed = false; setZoom(); view(false); };
const onClose = () => { zoomed = false; setZoom(); view(true); };
const onZoom = () => { zoomed = !zoomed; setZoom(); };
const overviewButton = document.getElementById('overview')!, closeButton = document.getElementById('close')!;
overviewButton.addEventListener('click', onOverview);
closeButton.addEventListener('click', onClose);
zoomButton.addEventListener('click', onZoom);
const onChange = () => stage.requestRender();
controls.addEventListener('change', onChange);
let lastX = Infinity, lastZ = Infinity, elapsed = 1;
const offFrame = stage.onFrame(dt => {
  controls.update();
  // Prevent orbit/pan from putting the eye underneath raised ground.
  const p = stage.camera.position;
  p.y = Math.max(p.y, (heightAt(field, p.x * 1000, p.z * 1000) + 2) / 1000);
  const x = controls.target.x * 1000, z = controls.target.z * 1000;
  if (Math.hypot(x - lastX, z - lastZ) > 50) {
    terrain.setFocus(x, z); props.setFocus(x, z); lastX = x; lastZ = z;
  }
  elapsed += dt;
  if (elapsed >= 0.5 || dt === 0) {
    elapsed = 0;
    const levels = [0, 0, 0]; terrain.chunks.forEach(c => levels[c.level]++);
    stats.textContent = `Seed ${seed} · focus ${Math.round(x)}, ${Math.round(z)} m · LOD ${levels.join('/')} · ${stage.renderer.info.render.calls} calls · ${Math.round(stage.renderer.info.render.triangles / 1000)}k triangles`;
  }
}, { priority: FramePriority.camera, always: true });
let disposed = false;
function dispose(): void {
  if (disposed) return;
  disposed = true;
  offFrame(); controls.removeEventListener('change', onChange); controls.dispose();
  overviewButton.removeEventListener('click', onOverview); closeButton.removeEventListener('click', onClose);
  zoomButton.removeEventListener('click', onZoom); window.removeEventListener('pagehide', dispose);
  terrain.dispose(); props.dispose(); root.removeFromParent(); stage.dispose();
}
window.addEventListener('pagehide', dispose);
if (import.meta.hot) import.meta.hot.dispose(dispose);
console.log(`terrain harness: seed=${seed}, chunks=${terrain.chunks.length}, trees=${props.counts.tree}, buildings=${props.counts.building}`);
