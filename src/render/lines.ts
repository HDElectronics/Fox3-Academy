/**
 * LineBatch: an immediate-mode batch of screen-space thick line segments (one draw call).
 * Width is in CSS pixels, dashes are in screen pixels and can flow (animated), colours are RGBA per end.
 * Call reset(), add segments (seg / line / polyline), commit() — every frame or only when something changes.
 * Positions are in the batch's local space (render units); the batch is a normal Object3D.
 */
import {
  AdditiveBlending, BufferAttribute, Color, InstancedBufferAttribute, InstancedBufferGeometry, Mesh,
  NormalBlending, ShaderMaterial,
} from 'three';
import { FRAG_END, FRAG_PRELUDE, ORDER, type SharedUniforms, VERT_END, VERT_PRELUDE } from './shared';
import type { XYZ } from './units';

export interface LineStyle {
  color: Color;
  alpha?: number;
  /** Colour/alpha at the B end (gradient). Defaults to the A end. */
  colorB?: Color;
  alphaB?: number;
  /** CSS px. Default 1.5. */
  width?: number;
  /** Dash period in px (0 = solid). */
  dash?: number;
  /** Fraction of the period that is drawn (0..1). Default 0.55. */
  fill?: number;
  /** Dash flow speed in px/s from A toward B (0 = static). */
  flow?: number;
}

const vert = /* glsl */ `
${VERT_PRELUDE}
uniform vec2 uViewport;
attribute vec3 iA;
attribute vec3 iB;
attribute vec4 iColA;
attribute vec4 iColB;
attribute vec4 iStyle; // width px, dash period px, flow px/s, dash fill
varying vec4 vCol;
varying float vAlongW;
varying float vW;
varying vec4 vStyle;
varying float vSide;
void main() {
  vec4 va = modelViewMatrix * vec4(iA, 1.0);
  vec4 vb = modelViewMatrix * vec4(iB, 1.0);
  // Trim against the near plane (perspective: near = m[3][2] / (m[2][2] - 1)).
  float nearP = projectionMatrix[3][2] / (projectionMatrix[2][2] - 1.0);
  float zn = -nearP * 1.001;
  bool behindA = va.z > zn;
  bool behindB = vb.z > zn;
  if (behindA && behindB) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec4(0.0); vAlongW = 0.0; vW = 1.0; vStyle = iStyle; vSide = 0.0; return; }
  if (behindA) { float k = (va.z - zn) / (va.z - vb.z); va.xyz = mix(va.xyz, vb.xyz, k); }
  if (behindB) { float k = (vb.z - zn) / (vb.z - va.z); vb.xyz = mix(vb.xyz, va.xyz, k); }
  vec4 ca = projectionMatrix * va;
  vec4 cb = projectionMatrix * vb;
  vec2 half_ = uViewport * 0.5;
  vec2 sa = ca.xy / ca.w * half_;
  vec2 sb = cb.xy / cb.w * half_;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  float w = max(iStyle.x, 0.5) + 0.5; // +0.5 px for the AA fringe
  vec4 c = position.x < 0.5 ? ca : cb;
  vec2 off = n * position.y * w * 0.5 + dir * (position.x * 2.0 - 1.0) * 0.5;
  c.xy += off / half_ * c.w;
  gl_Position = c;
  float along = position.x * len;
  vAlongW = along * c.w;
  vW = c.w;
  vCol = mix(iColA, iColB, position.x);
  vStyle = iStyle;
  vSide = position.y * w * 0.5;
  ${VERT_END}
}`;

const frag = /* glsl */ `
${FRAG_PRELUDE}
uniform float uClock;
varying vec4 vCol;
varying float vAlongW;
varying float vW;
varying vec4 vStyle;
varying float vSide;
void main() {
  float a = vCol.a;
  if (vStyle.y > 0.0) {
    float along = vAlongW / vW;
    float ph = fract((along - uClock * vStyle.z) / vStyle.y);
    float fill = vStyle.w;
    float edge = 1.0 / vStyle.y;
    a *= 1.0 - smoothstep(fill - edge, fill, ph);
  }
  float halfW = max(vStyle.x, 0.5) * 0.5;
  a *= clamp(halfW + 0.5 - abs(vSide), 0.0, 1.0);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol.rgb, a);
  ${FRAG_END}
}`;

export interface LineBatchOptions {
  capacity?: number;
  depthTest?: boolean;
  additive?: boolean;
  renderOrder?: number;
}

export class LineBatch extends Mesh<InstancedBufferGeometry, ShaderMaterial> {
  private cap: number;
  private n = 0;
  private a!: Float32Array; private b!: Float32Array;
  private ca!: Float32Array; private cb!: Float32Array; private st!: Float32Array;

  constructor(shared: SharedUniforms, opts: LineBatchOptions = {}) {
    const mat = new ShaderMaterial({
      uniforms: { uViewport: shared.uViewport, uClock: shared.uClock },
      vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false, depthTest: opts.depthTest ?? true,
      blending: opts.additive ? AdditiveBlending : NormalBlending,
      toneMapped: false,
    });
    super(LineBatch.makeGeometry(opts.capacity ?? 64), mat);
    this.cap = opts.capacity ?? 64;
    this.bindArrays();
    this.frustumCulled = false;
    this.renderOrder = opts.renderOrder ?? ORDER.lines;
    this.geometry.instanceCount = 0;
  }

  private static makeGeometry(cap: number): InstancedBufferGeometry {
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0]), 3));
    g.setIndex([0, 2, 1, 2, 3, 1]);
    g.setAttribute('iA', new InstancedBufferAttribute(new Float32Array(cap * 3), 3));
    g.setAttribute('iB', new InstancedBufferAttribute(new Float32Array(cap * 3), 3));
    g.setAttribute('iColA', new InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    g.setAttribute('iColB', new InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    g.setAttribute('iStyle', new InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    for (const k of ['iA', 'iB', 'iColA', 'iColB', 'iStyle']) (g.getAttribute(k) as InstancedBufferAttribute).setUsage(35048 /* DynamicDrawUsage */);
    return g;
  }

  private bindArrays(): void {
    const g = this.geometry;
    this.a = g.getAttribute('iA').array as Float32Array;
    this.b = g.getAttribute('iB').array as Float32Array;
    this.ca = g.getAttribute('iColA').array as Float32Array;
    this.cb = g.getAttribute('iColB').array as Float32Array;
    this.st = g.getAttribute('iStyle').array as Float32Array;
  }

  private grow(): void {
    const old = this.geometry;
    const cap = this.cap * 2;
    const g = LineBatch.makeGeometry(cap);
    for (const k of ['iA', 'iB', 'iColA', 'iColB', 'iStyle']) {
      (g.getAttribute(k).array as Float32Array).set(old.getAttribute(k).array as Float32Array);
    }
    this.geometry = g;
    old.dispose();
    this.cap = cap;
    this.bindArrays();
  }

  /** Number of segments in the batch. */
  get segmentCount(): number { return this.n; }

  /** Start a new batch (drops every segment). */
  reset(): void { this.n = 0; }

  /** Add one segment with raw numbers (no allocation). Colours are linear RGB. */
  seg(
    ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    r: number, g: number, bl: number, alpha: number,
    r2: number, g2: number, b2: number, alpha2: number,
    width = 1.5, dash = 0, flow = 0, fill = 0.55,
  ): void {
    if (this.n >= this.cap) this.grow();
    const i = this.n++;
    const i3 = i * 3, i4 = i * 4;
    const A = this.a, B = this.b, CA = this.ca, CB = this.cb, S = this.st;
    A[i3] = ax; A[i3 + 1] = ay; A[i3 + 2] = az;
    B[i3] = bx; B[i3 + 1] = by; B[i3 + 2] = bz;
    CA[i4] = r; CA[i4 + 1] = g; CA[i4 + 2] = bl; CA[i4 + 3] = alpha;
    CB[i4] = r2; CB[i4 + 1] = g2; CB[i4 + 2] = b2; CB[i4 + 3] = alpha2;
    S[i4] = width; S[i4 + 1] = dash; S[i4 + 2] = flow; S[i4 + 3] = fill;
  }

  /** Add a segment from A to B (render units) with a style. `alphaMul` scales both alphas. */
  line(a: XYZ, b: XYZ, s: LineStyle, alphaMul = 1): void {
    const c1 = s.color, c2 = s.colorB ?? s.color;
    const a1 = (s.alpha ?? 1) * alphaMul, a2 = (s.alphaB ?? s.alpha ?? 1) * alphaMul;
    this.seg(a.x, a.y, a.z, b.x, b.y, b.z, c1.r, c1.g, c1.b, a1, c2.r, c2.g, c2.b, a2,
      s.width ?? 1.5, s.dash ?? 0, s.flow ?? 0, s.fill ?? 0.55);
  }

  /** Add a polyline through `pts` (render units). */
  polyline(pts: ArrayLike<XYZ>, s: LineStyle, closed = false, alphaMul = 1): void {
    const n = pts.length;
    for (let i = 0; i + 1 < n; i++) this.line(pts[i], pts[i + 1], s, alphaMul);
    if (closed && n > 2) this.line(pts[n - 1], pts[0], s, alphaMul);
  }

  /** Upload what was added since reset(). */
  commit(): void {
    const g = this.geometry;
    g.instanceCount = this.n;
    const n = this.n;
    if (n === 0) return;
    for (const [k, size] of [['iA', 3], ['iB', 3], ['iColA', 4], ['iColB', 4], ['iStyle', 4]] as const) {
      const attr = g.getAttribute(k) as InstancedBufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * size);
      attr.needsUpdate = true;
    }
  }

  override dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
