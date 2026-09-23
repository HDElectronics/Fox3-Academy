/**
 * RadarVolume: the 3D scan volume of one radar (azimuth × bar pattern × range), stabilised to the
 * horizon and following the aircraft heading. The current bar is highlighted with a phosphor-like sweep
 * trail behind the beam, the beam itself is drawn as a narrow wedge, and altitude-coverage frames with
 * labels show the band the scan covers at chosen ranges (the "40/10" number pilots read off the cursor).
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, ConeGeometry, DoubleSide, Group, Mesh, Quaternion,
  ShaderMaterial, Vector3,
} from 'three';
import type { RadarModeId, RadarSpec } from '../data/types';
import type { Units } from '../app/format';
import { M_PER_FT, M_PER_NM } from '../sim/math';
import type { Stage } from './stage';
import { LineBatch } from './lines';
import { LabelPriority, Note, type LabelHost } from './tags';
import { FRAG_END, FRAG_PRELUDE, ORDER, VERT_END, VERT_PRELUDE } from './shared';
import { headingQuaternion, UNIT_PER_M, type XYZ } from './units';

const D2R = Math.PI / 180;

/** The scan fields RadarVolume reads (sim RadarState satisfies it). Angles in rad, ranges in m. */
export interface ScanStateLike {
  mode: RadarModeId;
  azCenter: number;
  azHalf: number;
  elCenter: number;
  bars: number;
  rangeScale: number;
  beamAz: number;
  beamEl: number;
  sweepDir: 1 | -1;
  bar: number;
  cursor: { az: number; range: number };
}

export interface RadarVolumeOptions {
  /** Drawn range: 'scale' = display range (default), 'detect' = head-on detection range, or metres. */
  range?: 'scale' | 'detect' | number;
  /** Horizontal ranges (m) for altitude-coverage frames; 'cursor' follows the radar cursor. Default ['cursor']. */
  coverageAt?: (number | 'cursor')[];
  units?: Units;
  /** Default: the phosphor symbology colour (--sym). */
  color?: Color;
  showBeam?: boolean;
  /** Coverage altitude labels. Default true. */
  labels?: boolean;
  /** Face opacity. Default 0.035. */
  opacity?: number;
}

// ------------------------------------------------------------------------------------------ pure maths

/** Elevation limits (rad, rel horizon) of a bar pattern: bar centres ± half a beam width at the edges. */
export function scanElevationLimits(elCenter: number, bars: number, barSpacing: number, beamWidth: number): { hi: number; lo: number } {
  const half = ((Math.max(1, bars) - 1) / 2) * barSpacing + beamWidth / 2;
  return { hi: elCenter + half, lo: elCenter - half };
}

/** Altitude band (m) covered at horizontal range `rangeM` for elevation limits (flat earth). */
export function altitudeCoverage(ownAltM: number, rangeM: number, elHi: number, elLo: number): { top: number; bottom: number } {
  const clampEl = (e: number) => Math.max(-1.45, Math.min(1.45, e));
  return { top: ownAltM + rangeM * Math.tan(clampEl(elHi)), bottom: ownAltM + rangeM * Math.tan(clampEl(elLo)) };
}

/** Bar centre elevation for bar index (0 = top bar). */
export function barElevation(elCenter: number, bars: number, bar: number, barSpacing: number): number {
  return elCenter + ((bars - 1) / 2 - bar) * barSpacing;
}

/**
 * Advance a synthetic antenna sweep (for pages without a running radar sim, e.g. the hangar hero).
 * Moves beamAz at the spec scan rate, reverses at the scan edges and steps bars top → bottom.
 */
export function stepSyntheticScan(s: ScanStateLike, spec: RadarSpec, dt: number): void {
  const rate = spec.scanRateDegPerS * D2R;
  const lo = s.azCenter - s.azHalf, hi = s.azCenter + s.azHalf;
  s.beamAz += rate * dt * s.sweepDir;
  if (s.beamAz > hi || s.beamAz < lo) {
    s.beamAz = s.beamAz > hi ? hi - (s.beamAz - hi) : lo + (lo - s.beamAz);
    s.sweepDir = s.sweepDir === 1 ? -1 : 1;
    s.bar = (s.bar + 1) % Math.max(1, s.bars);
  }
  s.beamEl = barElevation(s.elCenter, s.bars, s.bar, spec.barSpacingDeg * D2R);
}

// ------------------------------------------------------------------------------------------ shaders

const volVert = /* glsl */ `
${VERT_PRELUDE}
varying vec3 vL;
void main() {
  vL = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  ${VERT_END}
}`;

const volFrag = /* glsl */ `
${FRAG_PRELUDE}
uniform vec3 uColor;
uniform float uAlpha;
uniform float uR;
uniform float uBeamAz;
uniform float uBeamEl;
uniform float uSweepDir;
uniform float uHalfSpacing;
uniform float uBeamHalf;
uniform float uScan;
varying vec3 vL;
void main() {
  float r = length(vL);
  vec3 d = vL / max(r, 1e-5);
  float az = atan(d.x, -d.z);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float k = r / uR;
  float a = uAlpha * (0.45 + 0.55 * (1.0 - k));
  float q = k * 4.0;
  float rr = fract(q);
  float ring = 1.0 - smoothstep(0.0, fwidth(q) * 1.5, min(rr, 1.0 - rr));
  a += ring * 0.035 * step(0.03, k) * step(k, 0.995);
  if (uScan > 0.5) {
    float inBar = 1.0 - smoothstep(uHalfSpacing * 0.8, uHalfSpacing * 1.05, abs(el - uBeamEl));
    float dd = (uBeamAz - az) * uSweepDir;
    float trail = dd >= 0.0 ? exp(-dd / 0.09) : 0.0;
    float core = 1.0 - smoothstep(uBeamHalf * 0.5, uBeamHalf * 1.3, abs(az - uBeamAz));
    a += inBar * (0.025 + 0.2 * trail + 0.22 * core);
  }
  a = min(a, 0.75);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
  ${FRAG_END}
}`;

const beamVert = /* glsl */ `
${VERT_PRELUDE}
varying float vK;
void main() {
  vK = -position.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  ${VERT_END}
}`;
const beamFrag = /* glsl */ `
${FRAG_PRELUDE}
uniform vec3 uColor;
uniform float uAlpha;
varying float vK;
void main() {
  float a = uAlpha * pow(1.0 - vK, 1.6);
  gl_FragColor = vec4(uColor, a);
  ${FRAG_END}
}`;

// ------------------------------------------------------------------------------------------ class

const _dir = (az: number, el: number, r: number, out: Vector3) =>
  out.set(Math.sin(az) * Math.cos(el) * r, Math.sin(el) * r, -Math.cos(az) * Math.cos(el) * r);

const _a = new Vector3();
const _b = new Vector3();
const _w = new Vector3();
/** A coverage note belongs to its frame: past this many CSS px it would read as another object's label. */
const COVERAGE_MAX_MOVE = 80;

export class RadarVolume {
  /** Root object (in the scene); follows the aircraft, yaw only. */
  readonly object = new Group();
  private stage: Stage;
  private spec: RadarSpec;
  private opts: Required<Omit<RadarVolumeOptions, 'color'>> & { color: Color };
  private faces: Mesh<BufferGeometry, ShaderMaterial>;
  private beam: Mesh<ConeGeometry, ShaderMaterial>;
  private lines: LineBatch;
  private notes: Note[] = [];
  private labelHost: LabelHost | null = null;
  private noteOffs: (() => void)[] = [];
  /** Geometry key (azLo, azHi, elLo, elHi, R, stt); NaN forces a rebuild. No per-frame strings. */
  private key = [NaN, NaN, NaN, NaN, NaN, NaN];
  private q = new Quaternion();
  private pos = new Vector3();
  private disposed = false;

  constructor(stage: Stage, spec: RadarSpec, opts: RadarVolumeOptions = {}) {
    this.stage = stage;
    this.spec = spec;
    this.opts = {
      range: opts.range ?? 'scale',
      coverageAt: opts.coverageAt ?? ['cursor'],
      units: opts.units ?? 'metric',
      color: opts.color ?? stage.palette.sym,
      showBeam: opts.showBeam ?? true,
      labels: opts.labels ?? true,
      opacity: opts.opacity ?? 0.035,
    };
    this.object.name = 'radar-volume';
    const c = this.opts.color;
    this.faces = new Mesh(new BufferGeometry(), new ShaderMaterial({
      uniforms: {
        uColor: { value: c.clone() }, uAlpha: { value: this.opts.opacity }, uR: { value: 1 },
        uBeamAz: { value: 0 }, uBeamEl: { value: 0 }, uSweepDir: { value: 1 }, uHalfSpacing: { value: 0.02 },
        uBeamHalf: { value: 0.03 }, uScan: { value: 1 },
      },
      vertexShader: volVert, fragmentShader: volFrag,
      transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
    }));
    this.faces.renderOrder = ORDER.volume;
    this.faces.frustumCulled = false;
    const beamGeo = new ConeGeometry(1, 1, 4, 1, true);
    beamGeo.rotateY(Math.PI / 4);
    beamGeo.rotateX(Math.PI / 2);
    beamGeo.translate(0, 0, -0.5);
    this.beam = new Mesh(beamGeo, new ShaderMaterial({
      uniforms: { uColor: { value: c.clone() }, uAlpha: { value: 0.2 } },
      vertexShader: beamVert, fragmentShader: beamFrag,
      transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending, toneMapped: false,
    }));
    this.beam.renderOrder = ORDER.volume + 0.5;
    this.beam.frustumCulled = false;
    this.lines = new LineBatch(stage.shared, { capacity: 160, renderOrder: ORDER.volume + 1 });
    this.object.add(this.faces, this.beam, this.lines);
    stage.scene.add(this.object);
    stage.track(this);
  }

  setSpec(spec: RadarSpec): void { this.spec = spec; this.key[0] = NaN; }
  setOptions(o: RadarVolumeOptions): void {
    Object.assign(this.opts, Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)));
    if (o.color) { (this.faces.material.uniforms.uColor.value as Color).copy(o.color); (this.beam.material.uniforms.uColor.value as Color).copy(o.color); }
    if (o.opacity !== undefined) this.faces.material.uniforms.uAlpha.value = o.opacity;
    this.key[0] = NaN;
  }
  set visible(v: boolean) { this.object.visible = v; for (const n of this.notes) n.visible = v; }

  /**
   * Join the coverage notes to a view's shared label layout (WorldView does this for its own volume).
   * They take the lowest priority, so aircraft, missile and lesson tags keep their spot; a crowded
   * coverage note moves a short way or hides until space is free. null leaves the layout.
   */
  setLabelHost(host: LabelHost | null): void {
    if (host === this.labelHost) return;
    this.releaseNotes();
    this.labelHost = host;
    for (const n of this.notes) this.joinLayout(n);
  }

  private joinLayout(note: Note): void {
    if (this.labelHost) this.noteOffs.push(this.labelHost.registerLabel(note, { priority: LabelPriority.coverage, maxMove: COVERAGE_MAX_MOVE }));
  }

  private releaseNotes(): void {
    for (const off of this.noteOffs) off();
    this.noteOffs = [];
  }
  get visible(): boolean { return this.object.visible; }

  /** Drawn range in metres for a state. */
  rangeFor(s: ScanStateLike): number {
    const r = this.opts.range;
    if (r === 'detect') return this.spec.detectKm.headOn * 1000;
    if (typeof r === 'number') return r;
    return s.rangeScale;
  }

  /** Update from the radar state, the aircraft position (sim metres) and heading (rad). Call every frame. */
  update(s: ScanStateLike, posM: XYZ, heading: number): void {
    if (this.disposed) return;
    const off = s.mode === 'off';
    this.object.visible = !off;
    if (off) { for (const n of this.notes) n.visible = false; return; }
    const spec = this.spec;
    const spacing = spec.barSpacingDeg * D2R;
    const bw = spec.beamWidthDeg * D2R;
    const Rm = this.rangeFor(s);
    const R = Rm * UNIT_PER_M;
    const stt = s.mode === 'stt';
    this.pos.set(posM.x, posM.y, posM.z).multiplyScalar(UNIT_PER_M);
    headingQuaternion(heading, this.q);
    this.object.position.copy(this.pos);
    this.object.quaternion.copy(this.q);

    const lim = scanElevationLimits(s.elCenter, s.bars, spacing, bw);
    const azLo = s.azCenter - s.azHalf, azHi = s.azCenter + s.azHalf;
    const k = this.key, sttN = stt ? 1 : 0;
    const near = (a: number, b: number) => Math.abs(a - b) < 5e-5; // NaN never matches
    if (!(near(k[0], azLo) && near(k[1], azHi) && near(k[2], lim.lo) && near(k[3], lim.hi) && near(k[4], R) && k[5] === sttN)) {
      k[0] = azLo; k[1] = azHi; k[2] = lim.lo; k[3] = lim.hi; k[4] = R; k[5] = sttN;
      this.rebuild(azLo, azHi, lim.lo, lim.hi, R);
    }
    this.faces.visible = !stt;

    const u = this.faces.material.uniforms;
    u.uR.value = R;
    u.uBeamAz.value = s.beamAz;
    u.uBeamEl.value = s.beamEl;
    u.uSweepDir.value = s.sweepDir;
    u.uHalfSpacing.value = Math.max(spacing, bw) / 2;
    u.uBeamHalf.value = bw / 2;

    // Beam wedge (hidden when the camera sits at its apex, e.g. cockpit view).
    this.beam.visible = this.opts.showBeam && this.stage.camera.position.distanceTo(this.pos) > Math.max(0.02, R * 0.005);
    const bh = Math.tan(bw / 2) * R;
    this.beam.scale.set(bh, bh, R);
    this.beam.rotation.set(s.beamEl, -s.beamAz, 0, 'YXZ');
    this.beam.material.uniforms.uAlpha.value = stt ? 0.4 : 0.2;

    // Edges.
    const L = this.lines, c = this.opts.color;
    L.reset();
    const edgeA = 0.42, n = 24;
    if (!stt) {
      for (const [az, el] of [[azLo, lim.lo], [azLo, lim.hi], [azHi, lim.lo], [azHi, lim.hi]] as const) {
        _dir(az, el, R, _b);
        L.seg(0, 0, 0, _b.x, _b.y, _b.z, c.r, c.g, c.b, edgeA * 0.9, c.r, c.g, c.b, edgeA * 0.5, 1.1);
      }
      for (const el of [lim.lo, lim.hi]) this.arcAz(azLo, azHi, el, R, n, edgeA, 1.2);
      for (const az of [azLo, azHi]) this.arcEl(az, lim.lo, lim.hi, R, 6, edgeA, 1.2);
      // Bar separators on the far cap, and the current bar outline.
      for (let b = 1; b < s.bars; b++) {
        const el = barElevation(s.elCenter, s.bars, b, spacing) + spacing / 2;
        this.arcAz(azLo, azHi, el, R, n, 0.16, 1);
      }
      const half = Math.max(spacing, bw) / 2;
      this.arcAz(azLo, azHi, s.beamEl + half, R, n, 0.75, 1.5);
      this.arcAz(azLo, azHi, s.beamEl - half, R, n, 0.75, 1.5);
    }
    // Beam centre ray.
    _dir(s.beamAz, s.beamEl, R, _b);
    const hi = this.stage.palette.symHi;
    const bc = stt ? hi : c;
    L.seg(0, 0, 0, _b.x, _b.y, _b.z, bc.r, bc.g, bc.b, 0.95, bc.r, bc.g, bc.b, 0.35, 1.8);

    // Altitude coverage frames at horizontal ranges.
    const ranges = stt ? [] : this.opts.coverageAt.map(r => (r === 'cursor' ? s.cursor.range : r)).filter(r => r > 0 && r <= Rm * 1.05);
    while (this.notes.length < ranges.length) {
      const note = new Note(this.stage.labels, 'r3-center r3-above', this.stage.theme.symHi);
      this.notes.push(note);
      this.joinLayout(note);
    }
    this.notes.forEach((nt, i) => { nt.visible = this.opts.labels && i < ranges.length; });
    ranges.forEach((rm, i) => {
      const rh = rm * UNIT_PER_M;
      const cov = altitudeCoverage(posM.y, rm, lim.hi, lim.lo);
      const yTop = (cov.top - posM.y) * UNIT_PER_M, yBot = (Math.max(0, cov.bottom) - posM.y) * UNIT_PER_M;
      const hiC = this.stage.palette.symHi;
      let px = 0, pz = 0;
      for (let k = 0; k <= n; k++) {
        const az = azLo + ((azHi - azLo) * k) / n;
        const x = Math.sin(az) * rh, z = -Math.cos(az) * rh;
        if (k > 0) {
          L.seg(px, yTop, pz, x, yTop, z, hiC.r, hiC.g, hiC.b, 0.7, hiC.r, hiC.g, hiC.b, 0.7, 1.3);
          L.seg(px, yBot, pz, x, yBot, z, hiC.r, hiC.g, hiC.b, 0.7, hiC.r, hiC.g, hiC.b, 0.7, 1.3);
        }
        px = x; pz = z;
      }
      for (const az of [azLo, azHi]) {
        const x = Math.sin(az) * rh, z = -Math.cos(az) * rh;
        L.seg(x, yTop, z, x, yBot, z, hiC.r, hiC.g, hiC.b, 0.5, hiC.r, hiC.g, hiC.b, 0.5, 1, 6, 0, 0.5);
      }
      if (this.opts.labels) {
        const az = s.azCenter;
        _w.set(Math.sin(az) * rh, yTop, -Math.cos(az) * rh).applyQuaternion(this.q).add(this.pos);
        const nt = this.notes[i];
        nt.obj.position.copy(_w);
        nt.set(coverageText(cov.top, cov.bottom, rm, this.opts.units));
      }
    });
    L.commit();
  }

  private arcAz(a0: number, a1: number, el: number, R: number, n: number, alpha: number, w: number): void {
    const c = this.opts.color;
    _dir(a0, el, R, _a);
    for (let k = 1; k <= n; k++) {
      _dir(a0 + ((a1 - a0) * k) / n, el, R, _b);
      this.lines.seg(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, c.r, c.g, c.b, alpha, c.r, c.g, c.b, alpha, w);
      _a.copy(_b);
    }
  }

  private arcEl(az: number, e0: number, e1: number, R: number, n: number, alpha: number, w: number): void {
    const c = this.opts.color;
    _dir(az, e0, R, _a);
    for (let k = 1; k <= n; k++) {
      _dir(az, e0 + ((e1 - e0) * k) / n, R, _b);
      this.lines.seg(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, c.r, c.g, c.b, alpha, c.r, c.g, c.b, alpha, w);
      _a.copy(_b);
    }
  }

  private rebuild(azLo: number, azHi: number, elLo: number, elHi: number, R: number): void {
    const nA = 28, nE = 6;
    const p: number[] = [];
    const v = (az: number, el: number, r: number) => { _dir(az, el, r, _a); return [_a.x, _a.y, _a.z]; };
    const tri = (a: number[], b: number[], c: number[]) => p.push(...a, ...b, ...c);
    const O = [0, 0, 0];
    for (let i = 0; i < nA; i++) {
      const a0 = azLo + ((azHi - azLo) * i) / nA, a1 = azLo + ((azHi - azLo) * (i + 1)) / nA;
      // top & bottom fans
      tri(O, v(a0, elHi, R), v(a1, elHi, R));
      tri(O, v(a1, elLo, R), v(a0, elLo, R));
      // far cap
      for (let j = 0; j < nE; j++) {
        const e0 = elLo + ((elHi - elLo) * j) / nE, e1 = elLo + ((elHi - elLo) * (j + 1)) / nE;
        const A = v(a0, e0, R), B = v(a1, e0, R), C = v(a1, e1, R), D = v(a0, e1, R);
        tri(A, B, C); tri(A, C, D);
      }
    }
    for (const az of [azLo, azHi]) {
      for (let j = 0; j < nE; j++) {
        const e0 = elLo + ((elHi - elLo) * j) / nE, e1 = elLo + ((elHi - elLo) * (j + 1)) / nE;
        tri(O, v(az, e0, R), v(az, e1, R));
      }
    }
    const g = this.faces.geometry;
    g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3));
    g.computeBoundingSphere();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.object.removeFromParent();
    this.faces.geometry.dispose(); this.faces.material.dispose();
    this.beam.geometry.dispose(); this.beam.material.dispose();
    this.lines.dispose();
    this.releaseNotes();
    this.labelHost = null;
    for (const n of this.notes) n.dispose();
    this.notes = [];
    this.stage.untrack(this);
  }
}

/** "↑ 12.4 km  ↓ 5.1 km @ 50 km" / "↑ 40k ft  ↓ 10k ft @ 30 nm". */
export function coverageText(top: number, bottom: number, rangeM: number, u: Units): string {
  const alt = (m: number) => (u === 'metric' ? (Math.max(0, m) / 1000).toFixed(1) : Math.round(Math.max(0, m) / M_PER_FT / 1000) + 'k');
  const rng = u === 'metric' ? Math.round(rangeM / 1000) + ' km' : Math.round(rangeM / M_PER_NM) + ' nm';
  const unit = u === 'metric' ? ' km' : ' ft';
  return `↑${alt(top)} ↓${alt(bottom)}${unit} @${rng}`;
}
