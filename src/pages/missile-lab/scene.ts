/**
 * Missile Lab 3D: plays one shot back with the render kit's ReplayView (jets, missile, smoke, datalink /
 * illumination lines, seeker cone, chaff, explosion) and draws every kept shot's missile path in its own
 * colour, the pitbull point and the end of each flight. Camera: side view (shows the loft), orbit,
 * missile follow, top.
 */
import { Color, Vector3 } from 'three';
import {
  CameraRig, LineBatch, Note, ReplayView, Shape, Stage, SymbolLayer, UNIT_PER_M, isWebGLAvailable,
} from '../../render';
import type { Units } from '../../app/format';
import type { ShotResult } from '../../sim/dlz';
import type { ShotRecording } from './frames';
import { MISSILE_ID } from './frames';

export type CamMode = 'side' | 'orbit' | 'missile' | 'top';

export interface SceneShot {
  id: number;
  key: string;
  color: string;
  result: ShotResult;
  rec: ShotRecording;
  /** Labels for the markers. */
  pitbullText: string | null;
  endText: string;
  /** Short end tag for a narrow view ('HIT', 'MISS no energy'); the result card has the rest. */
  endShort: string;
}

const tmpA = new Vector3();

export class ShotScene {
  readonly stage: Stage | null = null;
  private replay: ReplayView | null = null;
  private rig: CameraRig | null = null;
  private lines: LineBatch | null = null;
  private syms: SymbolLayer | null = null;
  private notes: Note[] = [];
  private shots: SceneShot[] = [];
  private current: SceneShot | null = null;
  private t = 0;
  private cam: CamMode = 'side';
  private hostile = new Color();
  private friendly = new Color();
  private colors = new Map<number, Color>();
  /** What the path overlay was last drawn for (flown sample index + pitbull passed), so playback only rebuilds it when it changes. */
  private drawnKey = '';

  constructor(host: HTMLElement, private units: Units) {
    if (!isWebGLAvailable()) {
      host.append(Object.assign(document.createElement('p'), { className: 'ml-nogl', textContent: 'The 3D view needs WebGL. The plots and the result still work.' }));
      return;
    }
    try {
      this.stage = new Stage(host, { ariaLabel: '3D replay of the shot', autoStart: true });
    } catch (e) {
      console.warn('missile-lab: 3D view unavailable', e);
      return;
    }
    const st = this.stage;
    this.hostile.copy(st.palette.hostile);
    this.friendly.copy(st.palette.friendly);
    this.replay = new ReplayView(st, {
      frames: [], roster: { aircraft: {}, missiles: {} }, units,
      layers: { trails: false, aircraftTrails: false }, minJetPx: 34,
    });
    this.rig = new CameraRig(st, { source: this.replay, view: { headingDeg: 270, elevationDeg: 4, distance: 60000 } });
    this.lines = new LineBatch(st.shared, { capacity: 4096 });
    this.syms = new SymbolLayer(st.shared, { capacity: 64, depthTest: false });
    st.scene.add(this.lines, this.syms);
    st.track(this.lines);
    st.track(this.syms);
  }

  get available(): boolean { return this.stage !== null; }

  /** Replace the kept shots; `current` is played back. */
  setShots(shots: SceneShot[], currentId: number | null, reframe: boolean): void {
    this.shots = shots;
    this.current = shots.find(s => s.id === currentId) ?? null;
    this.colors.clear();
    for (const s of shots) this.colors.set(s.id, new Color(s.color));
    if (!this.stage || !this.replay) return;
    const cur = this.current;
    if (cur) this.replay.setData(cur.rec.frames, cur.rec.roster, cur.rec.events);
    else this.replay.setData([], { aircraft: {}, missiles: {} }, []);
    this.buildNotes();
    this.t = 0;
    if (cur) this.replay.setTime(0);
    this.redraw();
    if (reframe) this.setCamera(this.cam, true);
  }

  setTime(t: number): void {
    this.t = t;
    if (!this.replay || !this.current) return;
    this.replay.setTime(t);
    if (this.keyAt(t) !== this.drawnKey) this.redraw();
  }

  private keyAt(t: number): string {
    const cur = this.current;
    if (!cur) return '';
    const r = cur.result;
    return flownIndex(r, t) + (r.pitbull && t >= r.pitbull.t ? 'p' : '');
  }

  setUnits(u: Units): void { this.units = u; this.replay?.setUnits(u); }

  setCamera(mode: CamMode, instant = false): void {
    this.cam = mode;
    const rig = this.rig;
    if (!rig) return;
    const pts = this.extentPoints();
    if (!pts.length) return;
    const box = boundsOf(pts);
    if (mode === 'missile' && this.current) {
      if (rig.mode !== 'orbit') rig.setMode('orbit', { instant });
      // behind and above the missile, looking down range (the shot flies north)
      rig.focusOn(MISSILE_ID, { distance: 2600, instant });
      rig.setView({ headingDeg: 20, elevationDeg: 9, distance: 2600 }, instant);
      return;
    }
    if (mode === 'top') {
      const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 8000);
      const cam = this.stage?.camera;
      const fitH = cam ? span / 2 / Math.tan((cam.fov * Math.PI) / 360) : span * 1.1;
      rig.setMode('top', { focus: { x: (box.min.x + box.max.x) / 2, y: 0, z: (box.min.z + box.max.z) / 2 }, distance: fitH * 1.3 + box.max.y, instant });
      return;
    }
    if (mode === 'side' && this.stage) {
      // Fit the long, flat shot to the viewport width (frame() fits a sphere, which wastes a wide view).
      const cam = this.stage.camera;
      const vf = (cam.fov * Math.PI) / 180;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * Math.max(0.3, cam.aspect));
      // Tags hang to the right of every jet and marker, and they are fixed in pixels: keep about 130 px clear
      // beyond the target (the right edge) and a little behind the shooter, so a phone-wide view does not cut them.
      const W = Math.max(200, this.stage.width);
      const R = Math.min(140, W * 0.34), L = Math.min(40, W * 0.08);
      const halfW = Math.max(4000, (box.max.z - box.min.z) / 2) * W / (W - L - R) + 1500;
      const shift = ((R - L) / W) * halfW;   // metres toward the target (north, -z)
      const halfH = Math.max(2500, (box.max.y - box.min.y) / 2) * 1.5 + 1500;
      const d = Math.max(halfW / Math.tan(hf / 2), halfH / Math.tan(vf / 2)) + (box.max.x - box.min.x) / 2;
      const focus = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 - shift };
      if (rig.mode !== 'orbit') rig.setMode('orbit', { instant: true });
      rig.focusOn(focus, { distance: d, instant: true });
      rig.setView({ headingDeg: 270, elevationDeg: 2.5, distance: d }, instant);
      return;
    }
    // orbit: a closer fit than frame()'s bounding sphere, so the shot fills a wide viewport
    if (this.stage) {
      const cam = this.stage.camera;
      const vf = (cam.fov * Math.PI) / 180;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * Math.max(0.3, cam.aspect));
      const c = new Vector3().addVectors(box.min, box.max).multiplyScalar(0.5);
      let r = 4000;
      for (const p of pts) r = Math.max(r, c.distanceTo(tmpA.set(p.x, p.y, p.z)));
      const d = Math.max((r * 1.15) / Math.tan(hf / 2), (r * 0.85) / Math.tan(vf / 2));
      if (rig.mode !== 'orbit') rig.setMode('orbit', { instant: true });
      rig.focusOn({ x: c.x, y: c.y, z: c.z }, { distance: d, instant: true });
      rig.setView({ headingDeg: 315, elevationDeg: 26, distance: d }, instant);
    }
  }

  /** Points (m) that bound every kept shot. */
  private extentPoints(): { x: number; y: number; z: number }[] {
    const out: { x: number; y: number; z: number }[] = [];
    for (const s of this.shots) {
      const r = s.result;
      if (!r.missilePath.length) continue;
      const add = (p: Vector3) => out.push({ x: p.x, y: p.y, z: p.z });
      add(r.shooterPath[0]);
      add(r.targetPath[0]);
      add(r.targetPath[r.targetPath.length - 1]);
      add(r.missilePath[r.missilePath.length - 1]);
      let top = r.missilePath[0];
      for (const p of r.missilePath) if (p.y > top.y) top = p;
      add(top);
    }
    return out;
  }

  private buildNotes(): void {
    for (const n of this.notes) n.dispose();
    this.notes = [];
    const st = this.stage;
    if (!st) return;
    for (const s of this.shots) {
      const r = s.result;
      const n = r.missilePath.length;
      if (!n) continue;
      const isCur = s === this.current;
      const end = r.missilePath[n - 1];
      const endNote = new Note(st.labels, 'ml-note', s.color);
      endNote.set(isCur ? `${s.key} · ${st.width >= 520 ? s.endText : s.endShort}` : s.key);
      endNote.obj.position.set(end.x * UNIT_PER_M, end.y * UNIT_PER_M, end.z * UNIT_PER_M);
      this.notes.push(endNote);
      // on a narrow view the pitbull tag would sit on the jets' tags; the diamond and the plots still mark it
      if (isCur && r.pitbull && s.pitbullText && st.width >= 520) {
        const pb = new Note(st.labels, 'ml-note r3-center r3-above', s.color);
        pb.set(s.pitbullText);
        pb.obj.position.set(r.pitbull.pos.x * UNIT_PER_M, r.pitbull.pos.y * UNIT_PER_M, r.pitbull.pos.z * UNIT_PER_M);
        this.notes.push(pb);
      }
    }
  }

  private redraw(): void {
    const L = this.lines, S = this.syms;
    if (!L || !S) return;
    this.drawnKey = this.keyAt(this.t);
    L.reset(); S.reset();
    const U = UNIT_PER_M;
    for (const s of this.shots) {
      const r = s.result;
      const col = this.colors.get(s.id) ?? this.friendly;
      const path = r.missilePath;
      const n = path.length;
      if (n < 2) continue;
      const isCur = s === this.current;
      if (isCur) {
        const k = flownIndex(r, this.t);
        // flown part bright, the rest faint and dashed
        for (let i = 0; i + 1 < n; i++) {
          const a = path[i], b = path[i + 1];
          const flown = i < k;
          L.seg(a.x * U, a.y * U, a.z * U, b.x * U, b.y * U, b.z * U,
            col.r, col.g, col.b, flown ? 0.95 : 0.32, col.r, col.g, col.b, flown ? 0.95 : 0.32,
            flown ? 2.4 : 1.4, flown ? 0 : 9, 0, 0.5);
        }
        // target path (hostile), same split
        const tp = r.targetPath, hc = this.hostile;
        for (let i = 0; i + 1 < tp.length; i++) {
          const a = tp[i], b = tp[i + 1];
          const flown = i < k;
          L.seg(a.x * U, a.y * U, a.z * U, b.x * U, b.y * U, b.z * U,
            hc.r, hc.g, hc.b, flown ? 0.7 : 0.22, hc.r, hc.g, hc.b, flown ? 0.7 : 0.22, flown ? 1.6 : 1.1, flown ? 0 : 6, 0, 0.5);
        }
        const sp = r.shooterPath, fc = this.friendly;
        for (let i = 0; i + 1 < Math.min(k + 1, sp.length); i++) {
          const a = sp[i], b = sp[i + 1];
          L.seg(a.x * U, a.y * U, a.z * U, b.x * U, b.y * U, b.z * U, fc.r, fc.g, fc.b, 0.55, fc.r, fc.g, fc.b, 0.55, 1.4);
        }
        // launch point and pitbull
        const p0 = path[0];
        S.put(p0.x * U, p0.y * U, p0.z * U, Shape.ring, 9, col, 0.9);
        if (r.pitbull) {
          const p = r.pitbull.pos;
          S.put(p.x * U, p.y * U, p.z * U, Shape.diamond, 13, col, this.t >= r.pitbull.t ? 1 : 0.55);
        }
      } else {
        for (let i = 0; i + 1 < n; i++) {
          const a = path[i], b = path[i + 1];
          L.seg(a.x * U, a.y * U, a.z * U, b.x * U, b.y * U, b.z * U, col.r, col.g, col.b, 0.55, col.r, col.g, col.b, 0.55, 1.5, 0, 0, 0.5);
        }
      }
      const e = path[n - 1];
      S.put(e.x * U, e.y * U, e.z * U, r.hit ? Shape.boxFill : Shape.cross, r.hit ? 7 : 11, col, isCur ? 1 : 0.8);
      // drop line from the end point to the surface
      tmpA.set(e.x * U, 0, e.z * U);
      L.seg(e.x * U, e.y * U, e.z * U, tmpA.x, 0, tmpA.z, col.r, col.g, col.b, 0.35, col.r, col.g, col.b, 0.08, 1);
    }
    L.commit(); S.commit();
    this.stage?.requestRender();
  }

  dispose(): void {
    for (const n of this.notes) n.dispose();
    this.notes = [];
    this.stage?.dispose();
    (this as { stage: Stage | null }).stage = null;
    this.replay = null; this.rig = null; this.lines = null; this.syms = null;
  }
}

/** Index of the last trace sample at or before t. */
function flownIndex(r: ShotResult, t: number): number {
  const tr = r.trace;
  let lo = 0, hi = tr.length - 1;
  if (hi < 0) return 0;
  if (t >= tr[hi].t) return hi;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tr[mid].t <= t) lo = mid; else hi = mid; }
  return lo;
}

function boundsOf(pts: { x: number; y: number; z: number }[]): { min: Vector3; max: Vector3 } {
  const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of pts) { min.min(tmpA.set(p.x, p.y, p.z)); max.max(tmpA); }
  return { min, max };
}
