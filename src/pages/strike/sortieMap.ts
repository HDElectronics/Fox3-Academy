/**
 * [OWNER: page-strike] Plan-view map of the sortie area on a canvas: the brief map (route, IP, targets, threat
 * rings) and the debrief truth replay (World.recording at time t: jet track, A-G weapons, SAMs, unit states, the
 * Shkval line with the laser). North up, metres in, design tokens via readTheme().
 */
import type { RecordFrame, EntityId } from '../../sim/types';
import { alpha, type Theme } from '../../ui/theme';
import { sampleIndex } from '../../render/replay';
import { PLAN } from './sortie';

/** A threat site; `unitId` is the ground unit whose recorded state says the site is alive. */
export interface MapSite { id: EntityId; unitId: EntityId; name: string; x: number; z: number; ringM: number; kind: 'sam' | 'aaa' }
export interface MapUnit { id: EntityId; kind: string; x: number; z: number }

export interface MapView { cx: number; cz: number; spanM: number }
/** Whole area (start to the SA-15 ring) and the target area. */
export const AREA_VIEW: MapView = { cx: 1500, cz: 1500, spanM: 44000 };
export const TARGET_VIEW: MapView = { cx: 0, cz: -200, spanM: 6500 };

export interface MapScene {
  sites: MapSite[];
  units: MapUnit[];
}

/** Replay layer: recorded frames and the time to show. */
export interface ReplayLayer { frames: RecordFrame[]; times: Float64Array; t: number; meId: EntityId }

export function frameTimes(frames: readonly RecordFrame[]): Float64Array {
  return Float64Array.from(frames, f => f.t);
}

export function drawPlan(ctx: CanvasRenderingContext2D, wPx: number, hPx: number, th: Theme, scene: MapScene, view: MapView, replay?: ReplayLayer): void {
  const s = Math.min(wPx, hPx) / view.spanM;
  const X = (x: number) => wPx / 2 + (x - view.cx) * s;
  const Y = (z: number) => hPx / 2 + (z - view.cz) * s;
  const mono = (px: number) => `${px}px ${th.fontMono || 'monospace'}`;
  ctx.save();
  ctx.fillStyle = th.screen; ctx.fillRect(0, 0, wPx, hPx);
  // grid: 5 km in the area view, 1 km in the target view
  const g = view.spanM > 15000 ? 5000 : 1000;
  ctx.strokeStyle = alpha(th.screenLine || th.symDim, 0.5); ctx.lineWidth = 1;
  ctx.beginPath();
  const x0 = view.cx - wPx / 2 / s, x1 = view.cx + wPx / 2 / s, z0 = view.cz - hPx / 2 / s, z1 = view.cz + hPx / 2 / s;
  for (let x = Math.ceil(x0 / g) * g; x <= x1; x += g) { ctx.moveTo(X(x), 0); ctx.lineTo(X(x), hPx); }
  for (let z = Math.ceil(z0 / g) * g; z <= z1; z += g) { ctx.moveTo(0, Y(z)); ctx.lineTo(wPx, Y(z)); }
  ctx.stroke();

  const f = replay ? frameAt(replay) : null;
  const siteAlive = (site: MapSite) => f?.groundUnits?.find(x => x.id === site.unitId)?.alive ?? true;

  // threat rings
  for (const site of scene.sites) {
    const alive = siteAlive(site);
    const col = site.kind === 'aaa' ? th.caution : th.hostile;
    ctx.beginPath(); ctx.arc(X(site.x), Y(site.z), site.ringM * s, 0, Math.PI * 2);
    ctx.fillStyle = alpha(col, alive ? 0.08 : 0.02); ctx.fill();
    ctx.setLineDash([6, 5]); ctx.strokeStyle = alive ? col : th.symDim; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = alive ? col : th.symDim; ctx.font = mono(11); ctx.textAlign = 'center';
    ctx.fillText(`${site.name}${alive ? '' : ' ✕'}`, X(site.x), Y(site.z) - site.ringM * s - 4 < 12 ? Y(site.z) + 16 : Y(site.z) - Math.min(site.ringM * s, 60) - 4);
    ctx.fillRect(X(site.x) - 3, Y(site.z) - 3, 6, 6);
  }

  // route: start → IP → target, IP marker
  ctx.strokeStyle = alpha(th.sym, 0.55); ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]);
  ctx.beginPath(); ctx.moveTo(X(PLAN.start.x), Y(PLAN.start.z)); ctx.lineTo(X(PLAN.ip.x), Y(PLAN.ip.z)); ctx.lineTo(X(PLAN.target.x), Y(PLAN.target.z)); ctx.stroke();
  ctx.setLineDash([]);
  const tri = (x: number, z: number, r: number) => { ctx.beginPath(); ctx.moveTo(X(x), Y(z) - r); ctx.lineTo(X(x) + r * 0.87, Y(z) + r / 2); ctx.lineTo(X(x) - r * 0.87, Y(z) + r / 2); ctx.closePath(); };
  ctx.strokeStyle = th.sym; ctx.lineWidth = 2; tri(PLAN.ip.x, PLAN.ip.z, 8); ctx.stroke();
  ctx.fillStyle = th.sym; ctx.font = mono(12); ctx.textAlign = 'left';
  ctx.fillText('IP', X(PLAN.ip.x) + 10, Y(PLAN.ip.z) + 4);
  ctx.beginPath(); ctx.arc(X(PLAN.start.x), Y(PLAN.start.z), 5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillText('Start', X(PLAN.start.x) + 9, Y(PLAN.start.z) + 4);

  // units
  const unitState = new Map<EntityId, boolean>();
  if (f?.groundUnits) for (const u of f.groundUnits) unitState.set(u.id, u.alive);
  const r = view.spanM > 15000 ? 2.5 : 4;
  for (const u of scene.units) {
    const alive = unitState.get(u.id) ?? true;
    const big = u.kind === 'bunker' ? 2 : 1;
    ctx.strokeStyle = alive ? th.hostile : th.symDim; ctx.lineWidth = 1.5;
    if (alive) { ctx.fillStyle = alpha(th.hostile, 0.5); ctx.fillRect(X(u.x) - r * big, Y(u.z) - r * big, 2 * r * big, 2 * r * big); ctx.strokeRect(X(u.x) - r * big, Y(u.z) - r * big, 2 * r * big, 2 * r * big); }
    else { ctx.beginPath(); ctx.moveTo(X(u.x) - r, Y(u.z) - r); ctx.lineTo(X(u.x) + r, Y(u.z) + r); ctx.moveTo(X(u.x) + r, Y(u.z) - r); ctx.lineTo(X(u.x) - r, Y(u.z) + r); ctx.stroke(); }
  }
  if (view.spanM <= 15000) {
    ctx.fillStyle = th.symDim; ctx.font = mono(11); ctx.textAlign = 'left';
    ctx.fillText('Column', X(PLAN.target.x) + 16, Y(PLAN.target.z) + 4);
    ctx.fillText('Bunker', X(PLAN.bunker.x) + 12, Y(PLAN.bunker.z) - 8);
  } else {
    ctx.fillStyle = th.hostile; ctx.font = mono(11); ctx.textAlign = 'left';
    ctx.fillText('Target', X(PLAN.target.x) + 10, Y(PLAN.target.z) + 16);
  }

  if (replay && f) drawReplay(ctx, th, replay, X, Y);

  // scale bar
  const barM = view.spanM > 15000 ? 5000 : 1000;
  ctx.strokeStyle = th.sym; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(12, hPx - 14); ctx.lineTo(12 + barM * s, hPx - 14); ctx.stroke();
  ctx.fillStyle = th.sym; ctx.font = mono(11); ctx.textAlign = 'left';
  ctx.fillText(`${barM / 1000} km`, 16 + barM * s, hPx - 10);
  ctx.textAlign = 'right'; ctx.fillText('N ↑', wPx - 10, 18);
  ctx.restore();
}

function frameAt(r: ReplayLayer): RecordFrame | null {
  const i = sampleIndex(r.times, r.t);
  return i < 0 ? r.frames[0] ?? null : r.frames[i]!;
}

function drawReplay(ctx: CanvasRenderingContext2D, th: Theme, r: ReplayLayer, X: (x: number) => number, Y: (z: number) => number): void {
  const i = Math.max(0, sampleIndex(r.times, r.t));
  const frames = r.frames;
  // trails: jet, A-G weapons, SAMs up to t
  const jet: [number, number][] = [];
  const ag = new Map<EntityId, [number, number][]>();
  const sam = new Map<EntityId, [number, number][]>();
  for (let k = 0; k <= i; k++) {
    const fr = frames[k]!;
    const me = fr.aircraft.find(a => a.id === r.meId);
    if (me && me.alive) jet.push([me.pos[0], me.pos[2]]);
    for (const w of fr.agWeapons ?? []) if (w.shooterId === r.meId && w.alive && fr.t > r.t - 60) push(ag, w.id, w.pos);
    for (const m of fr.samMissiles ?? []) if (m.alive && fr.t > r.t - 60) push(sam, m.id, m.pos);
  }
  const line = (pts: [number, number][], col: string, wd: number) => {
    if (pts.length < 2) return;
    ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.beginPath();
    ctx.moveTo(X(pts[0]![0]), Y(pts[0]![1]));
    for (const p of pts) ctx.lineTo(X(p[0]), Y(p[1]));
    ctx.stroke();
  };
  line(jet, alpha(th.friendly, 0.8), 2);
  const f = frames[i]!;
  for (const [id, pts] of ag) {
    line(pts, th.missile, 1.5);
    if (f.agWeapons?.some(w => w.id === id && w.alive)) { const p = pts[pts.length - 1]!; ctx.fillStyle = th.missile; ctx.fillRect(X(p[0]) - 2, Y(p[1]) - 2, 4, 4); }
  }
  for (const [id, pts] of sam) {
    line(pts, th.warning, 1.5);
    if (f.samMissiles?.some(m => m.id === id && m.alive)) { const p = pts[pts.length - 1]!; ctx.fillStyle = th.warning; ctx.fillRect(X(p[0]) - 2, Y(p[1]) - 2, 4, 4); }
  }
  // jet symbol, interpolated
  const a = f.aircraft.find(x => x.id === r.meId);
  const n = frames[i + 1]?.aircraft.find(x => x.id === r.meId);
  if (!a) return;
  const u = n && frames[i + 1] ? Math.min(1, Math.max(0, (r.t - f.t) / (frames[i + 1]!.t - f.t))) : 0;
  const px = a.pos[0] + ((n?.pos[0] ?? a.pos[0]) - a.pos[0]) * u, pz = a.pos[2] + ((n?.pos[2] ?? a.pos[2]) - a.pos[2]) * u;
  // Shkval line of sight: bright with the laser on.
  const sk = f.shkval?.find(x => x.ownerId === r.meId);
  if (sk?.point && a.alive) {
    ctx.strokeStyle = sk.laser ? th.caution : alpha(th.sym, 0.35); ctx.lineWidth = sk.laser ? 1.5 : 1; ctx.setLineDash(sk.laser ? [] : [3, 4]);
    ctx.beginPath(); ctx.moveTo(X(px), Y(pz)); ctx.lineTo(X(sk.point[0]), Y(sk.point[2])); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.save();
  ctx.translate(X(px), Y(pz)); ctx.rotate(a.heading);
  ctx.fillStyle = a.alive ? th.friendly : th.warning; ctx.strokeStyle = th.screen; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 4); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function push(m: Map<EntityId, [number, number][]>, id: EntityId, p: [number, number, number]): void {
  let a = m.get(id);
  if (!a) { a = []; m.set(id, a); }
  a.push([p[0], p[2]]);
}
