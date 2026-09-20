/**
 * Trail ribbons: a camera-facing strip through time-stamped samples (render units, sim seconds).
 * One RibbonGeometry can be drawn by several materials: a thin path line and a smoke plume.
 * The shader fades by age (uTime − sample time), so trails behave the same live and in replay.
 */
import { BufferAttribute, BufferGeometry, Color, Mesh, NormalBlending, ShaderMaterial } from 'three';
import { FRAG_END, FRAG_PRELUDE, ORDER, type SharedUniforms, VERT_END, VERT_PRELUDE } from './shared';

const vert = /* glsl */ `
${VERT_PRELUDE}
uniform float uPxScale;
uniform float uTime;
uniform float uWidthPx;
uniform float uWidthWorld;
uniform float uGrow;
uniform float uGrowPx;
attribute vec3 aTan;
attribute float aSide;
attribute float aT;
attribute float aSmoke;
varying float vAge;
varying float vSide;
varying float vSmoke;
varying float vT;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 tv = normalize((modelViewMatrix * vec4(aTan, 0.0)).xyz + vec3(1e-6));
  vec3 toCam = normalize(-mv.xyz);
  vec3 n = cross(tv, toCam);
  float nl = length(n);
  n = nl > 1e-4 ? n / nl : vec3(0.0, 1.0, 0.0);
  float age = uTime - aT;
  float depth = max(-mv.z, 1e-5);
  float ageC = max(age, 0.0);
  float w = max(uWidthWorld + ageC * uGrow, (uWidthPx + min(ageC * uGrowPx, uWidthPx * 3.0)) * uPxScale * depth);
  mv.xyz += n * aSide * w * 0.5;
  gl_Position = projectionMatrix * mv;
  vAge = age;
  vSide = aSide;
  vSmoke = aSmoke;
  vT = aT;
  ${VERT_END}
}`;

const frag = /* glsl */ `
${FRAG_PRELUDE}
uniform vec3 uColor;
uniform float uAlpha;
uniform float uFade;
uniform float uSmokeMode;
uniform float uTime;
uniform float uDeathT;
uniform float uDeathFade;
varying float vAge;
varying float vSide;
varying float vSmoke;
varying float vT;
void main() {
  if (vAge < -0.02) discard;
  float a = uAlpha;
  if (uFade > 0.0) a *= 1.0 - smoothstep(uFade * 0.35, uFade, vAge);
  if (uSmokeMode > 0.5) {
    a *= vSmoke;
    a *= 1.0 - vSide * vSide;
    a *= 0.9 + 0.1 * sin(vT * 2.3);
    a *= smoothstep(0.0, 0.25, vAge + 0.02);
  }
  if (uDeathFade > 0.0) a *= 1.0 - clamp((uTime - uDeathT) / uDeathFade, 0.0, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  ${FRAG_END}
}`;

export interface RibbonStyle {
  color: Color;
  alpha: number;
  /** Minimum width in CSS px. */
  widthPx: number;
  /** Physical width in render units at age 0. */
  widthWorld?: number;
  /** Physical growth in units per second of age (smoke spreading). */
  grow?: number;
  /** Pixel growth per second of age (capped at 3× widthPx). */
  growPx?: number;
  /** Seconds of age after which the sample has faded out (0 = never). */
  fade?: number;
  /** Multiply alpha by the per-sample smoke flag (motor burning). */
  smoke?: boolean;
  renderOrder?: number;
}

export function createRibbonMaterial(shared: SharedUniforms, s: RibbonStyle): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uPxScale: shared.uPxScale,
      uTime: { value: 0 },
      uWidthPx: { value: s.widthPx },
      uWidthWorld: { value: s.widthWorld ?? 0 },
      uGrow: { value: s.grow ?? 0 },
      uGrowPx: { value: s.growPx ?? 0 },
      uColor: { value: s.color.clone() },
      uAlpha: { value: s.alpha },
      uFade: { value: s.fade ?? 0 },
      uSmokeMode: { value: s.smoke ? 1 : 0 },
      uDeathT: { value: 1e9 },
      uDeathFade: { value: 0 },
    },
    vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false, blending: NormalBlending, toneMapped: false,
  });
}

/**
 * Growable strip of samples. Draws samples [first, n). Append with track(); for replay, fill once with
 * push() and then show a prefix with setVisible().
 */
export class RibbonGeometry {
  readonly geometry = new BufferGeometry();
  private cap: number;
  private first = 0;
  private n = 0;
  private visibleEnd = -1; // -1 = all
  private pos!: Float32Array;
  private tan!: Float32Array;
  private tt!: Float32Array;
  private sm!: Float32Array;
  private dirtyLo = Infinity;
  private dirtyHi = -1;
  private override: { i: number; x: number; y: number; z: number; t: number } | null = null;

  constructor(capacity = 256, readonly minInterval = 0.1) {
    this.cap = Math.max(8, capacity);
    this.alloc(this.cap);
  }

  private alloc(cap: number, keep?: { pos: Float32Array; tan: Float32Array; tt: Float32Array; sm: Float32Array; n: number }): void {
    const g = this.geometry;
    const pos = new Float32Array(cap * 6), tan = new Float32Array(cap * 6), tt = new Float32Array(cap * 2), sm = new Float32Array(cap * 2);
    const side = new Float32Array(cap * 2);
    for (let i = 0; i < cap; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
    const idx = new Uint32Array((cap - 1) * 6);
    for (let i = 0; i < cap - 1; i++) {
      const a = i * 2, o = i * 6;
      idx[o] = a; idx[o + 1] = a + 1; idx[o + 2] = a + 2;
      idx[o + 3] = a + 1; idx[o + 4] = a + 3; idx[o + 5] = a + 2;
    }
    if (keep) {
      pos.set(keep.pos.subarray(0, keep.n * 6)); tan.set(keep.tan.subarray(0, keep.n * 6));
      tt.set(keep.tt.subarray(0, keep.n * 2)); sm.set(keep.sm.subarray(0, keep.n * 2));
    }
    g.dispose();
    g.setAttribute('position', new BufferAttribute(pos, 3).setUsage(35048));
    g.setAttribute('aTan', new BufferAttribute(tan, 3).setUsage(35048));
    g.setAttribute('aT', new BufferAttribute(tt, 1).setUsage(35048));
    g.setAttribute('aSmoke', new BufferAttribute(sm, 1).setUsage(35048));
    g.setAttribute('aSide', new BufferAttribute(side, 1));
    g.setIndex(new BufferAttribute(idx, 1));
    this.pos = pos; this.tan = tan; this.tt = tt; this.sm = sm;
    this.cap = cap;
    this.markAll();
  }

  get count(): number { return this.n - this.first; }
  get lastTime(): number { return this.n > 0 ? this.tt[(this.n - 1) * 2] : -Infinity; }
  get firstTime(): number { return this.n > this.first ? this.tt[this.first * 2] : Infinity; }
  timeAt(i: number): number { return this.tt[i * 2]; }
  get size(): number { return this.n; }

  clear(): void {
    this.first = 0; this.n = 0; this.visibleEnd = -1; this.override = null;
    this.updateRange();
  }

  private markAll(): void { this.dirtyLo = 0; this.dirtyHi = Math.max(0, this.n - 1); }
  private mark(i: number): void { if (i < this.dirtyLo) this.dirtyLo = i; if (i > this.dirtyHi) this.dirtyHi = i; }

  private write(i: number, x: number, y: number, z: number, t: number, smoke: number): void {
    const p = this.pos, o = i * 6;
    p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = x; p[o + 4] = y; p[o + 5] = z;
    this.tt[i * 2] = t; this.tt[i * 2 + 1] = t;
    this.sm[i * 2] = smoke; this.sm[i * 2 + 1] = smoke;
    this.mark(i);
  }

  private tangent(i: number): void {
    if (this.n < 2) return;
    const p = this.pos;
    const a = Math.max(this.first, i - 1), b = Math.min(this.n - 1, i + 1);
    if (a === b) return;
    let dx = p[b * 6] - p[a * 6], dy = p[b * 6 + 1] - p[a * 6 + 1], dz = p[b * 6 + 2] - p[a * 6 + 2];
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-9) return;
    dx /= l; dy /= l; dz /= l;
    const o = i * 6, T = this.tan;
    T[o] = dx; T[o + 1] = dy; T[o + 2] = dz; T[o + 3] = dx; T[o + 4] = dy; T[o + 5] = dz;
    this.mark(i);
  }

  /** Append a sample unconditionally. */
  push(x: number, y: number, z: number, t: number, smoke = 0): void {
    if (this.n >= this.cap) this.makeRoom();
    const i = this.n++;
    this.write(i, x, y, z, t, smoke);
    this.tangent(i);
    if (i > this.first) this.tangent(i - 1);
    if (i === this.first + 1) this.tangent(this.first);
    this.updateRange();
  }

  /**
   * Live tracking: moves the head sample to (x, y, z) every call, and commits a new sample when
   * `minInterval` sim seconds passed since the previous one. Time going backwards clears the trail.
   */
  track(x: number, y: number, z: number, t: number, smoke = 0): void {
    if (this.n > 0 && t < this.lastTime - 1e-6) this.clear();
    if (this.n - this.first < 2) { this.push(x, y, z, t, smoke); return; }
    const prevT = this.tt[(this.n - 2) * 2];
    if (t - prevT >= this.minInterval) {
      this.push(x, y, z, t, smoke);
    } else {
      const i = this.n - 1;
      this.write(i, x, y, z, t, smoke);
      this.tangent(i); this.tangent(i - 1);
    }
  }

  /** Drop samples older than tMin (keeps at least two). */
  trimBefore(tMin: number): void {
    let f = this.first;
    while (f < this.n - 2 && this.tt[(f + 1) * 2] < tMin) f++;
    if (f !== this.first) { this.first = f; this.tangent(f); this.updateRange(); }
  }

  /**
   * Replay: show samples up to index `end` (inclusive) and move sample end+1 to the interpolated head
   * (x, y, z, t) so the ribbon reaches the entity. Pass end < 0 to hide everything.
   */
  setVisible(end: number, head?: { x: number; y: number; z: number; t: number }, startTime = -Infinity): void {
    this.restoreOverride();
    let first = 0;
    while (first < end && this.tt[(first + 1) * 2] < startTime) first++;
    this.first = first;
    if (end < 0) { this.visibleEnd = 0; this.updateRange(); return; }
    let last = Math.min(end, this.n - 1);
    if (head && last + 1 < this.n) {
      const i = last + 1, o = i * 6;
      this.override = { i, x: this.pos[o], y: this.pos[o + 1], z: this.pos[o + 2], t: this.tt[i * 2] };
      const sm = this.sm[i * 2];
      this.write(i, head.x, head.y, head.z, head.t, sm);
      this.tangent(i);
      last = i;
    }
    this.visibleEnd = last + 1;
    this.updateRange();
  }

  private restoreOverride(): void {
    const o = this.override;
    if (!o) return;
    this.override = null;
    this.write(o.i, o.x, o.y, o.z, o.t, this.sm[o.i * 2]);
    this.tangent(o.i);
  }

  private makeRoom(): void {
    if (this.first > this.cap / 4) {
      // Drop the trimmed head of the buffer.
      const f = this.first, k = this.n - f;
      this.pos.copyWithin(0, f * 6, this.n * 6); this.tan.copyWithin(0, f * 6, this.n * 6);
      this.tt.copyWithin(0, f * 2, this.n * 2); this.sm.copyWithin(0, f * 2, this.n * 2);
      this.first = 0; this.n = k;
      this.markAll();
      return;
    }
    if (this.cap < 4096) {
      this.alloc(this.cap * 2, { pos: this.pos, tan: this.tan, tt: this.tt, sm: this.sm, n: this.n });
      return;
    }
    // Decimate: keep every other sample of the older part, keep the last 32 samples intact.
    const keepTail = 32;
    let w = this.first;
    const oldEnd = this.n - keepTail;
    for (let r = this.first; r < this.n; r++) {
      if (r < oldEnd && (r - this.first) % 2 === 1) continue;
      if (w !== r) {
        this.pos.copyWithin(w * 6, r * 6, r * 6 + 6); this.tan.copyWithin(w * 6, r * 6, r * 6 + 6);
        this.tt.copyWithin(w * 2, r * 2, r * 2 + 2); this.sm.copyWithin(w * 2, r * 2, r * 2 + 2);
      }
      w++;
    }
    this.n = w;
    for (let i = this.first; i < this.n; i++) this.tangent(i);
    this.markAll();
  }

  private updateRange(): void {
    const end = this.visibleEnd >= 0 ? Math.min(this.visibleEnd, this.n) : this.n;
    const segs = Math.max(0, end - this.first - 1);
    this.geometry.setDrawRange(this.first * 6, segs * 6);
  }

  /** Upload changed samples. Call once per frame after tracking. */
  flush(): void {
    if (this.dirtyHi < this.dirtyLo) return;
    const lo = this.dirtyLo, hi = Math.min(this.dirtyHi, this.cap - 1);
    const g = this.geometry;
    for (const [k, per] of [['position', 6], ['aTan', 6], ['aT', 2], ['aSmoke', 2]] as const) {
      const a = g.getAttribute(k) as BufferAttribute;
      a.addUpdateRange(lo * per, (hi - lo + 1) * per);
      a.needsUpdate = true;
    }
    this.dirtyLo = Infinity; this.dirtyHi = -1;
    if (this.visibleEnd < 0) this.updateRange();
  }

  dispose(): void { this.geometry.dispose(); }
}

/** A ribbon geometry drawn by one or more ribbon materials. Add `object` to the scene. */
export class Trail {
  readonly meshes: Mesh<BufferGeometry, ShaderMaterial>[] = [];
  constructor(readonly ribbon: RibbonGeometry, materials: ShaderMaterial[], renderOrder = ORDER.trails) {
    for (const m of materials) {
      const mesh = new Mesh(ribbon.geometry, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = renderOrder;
      this.meshes.push(mesh);
    }
  }
  setTime(t: number): void { for (const m of this.meshes) m.material.uniforms.uTime.value = t; }
  setDeath(t: number, fade: number): void {
    for (const m of this.meshes) { m.material.uniforms.uDeathT.value = t; m.material.uniforms.uDeathFade.value = fade; }
  }
  set visible(v: boolean) { for (const m of this.meshes) m.visible = v; }
  dispose(): void {
    this.ribbon.dispose();
    for (const m of this.meshes) { m.removeFromParent(); m.material.dispose(); }
  }
}
