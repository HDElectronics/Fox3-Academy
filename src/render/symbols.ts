/**
 * SymbolLayer: immediate-mode point symbols drawn with signed-distance shapes in one draw call.
 * Used for track rings, radar bricks, selection brackets, chaff/flare puffs, explosions, plumes.
 * Size is max(sizePx, worldSize projected), so a symbol can be pixel-sized far away and physical up close.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, NormalBlending, Points, ShaderMaterial } from 'three';
import { FRAG_END, FRAG_PRELUDE, ORDER, type SharedUniforms, VERT_END, VERT_PRELUDE } from './shared';

export const Shape = {
  glow: 0,      // soft gaussian (flashes, flares, plumes)
  ring: 1,      // hollow circle (track estimate)
  box: 2,       // square outline
  boxFill: 3,   // filled square (radar brick)
  diamond: 4,   // diamond outline
  dot: 5,       // filled disc
  cross: 6,     // X
  puff: 7,      // soft lumpy disc (smoke, chaff)
  brackets: 8,  // four corner brackets (selection)
  ringDash: 9,  // dashed ring (coasting track)
  triangle: 10, // triangle outline
} as const;
export type ShapeId = typeof Shape[keyof typeof Shape];

const vert = /* glsl */ `
${VERT_PRELUDE}
uniform float uPxScale;
uniform float uDpr;
attribute vec4 aColor;
attribute vec4 aParams; // size px, shape, world size (units), seed
varying vec4 vColor;
varying float vShape;
varying float vSize;
varying float vSeed;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 1e-5);
  float worldPx = aParams.z / (uPxScale * depth);
  float s = max(aParams.x, worldPx);
  s = min(s, 900.0);
  gl_PointSize = s * uDpr;
  vSize = s;
  vColor = aColor;
  vShape = aParams.y;
  vSeed = aParams.w;
  if (aColor.a <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  ${VERT_END}
}`;

const frag = /* glsl */ `
${FRAG_PRELUDE}
varying vec4 vColor;
varying float vShape;
varying float vSize;
varying float vSeed;
float stroke(float d, float halfW, float px) { return 1.0 - smoothstep(halfW - px * 0.5, halfW + px * 0.5, abs(d)); }
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  p.y = -p.y;
  float px = 2.0 / max(vSize, 1.0);          // one CSS pixel in point space
  float lw = clamp(1.6 * px, 0.0, 0.5);        // stroke half-width ~0.8 px
  float r = length(p);
  int shape = int(vShape + 0.5);
  float a = 0.0;
  if (shape == 0) {
    a = exp(-r * r * 5.0) * (1.0 - smoothstep(0.85, 1.0, r));
  } else if (shape == 1) {
    a = stroke(r - (1.0 - 2.0 * px), lw, px);
  } else if (shape == 2) {
    float d = max(abs(p.x), abs(p.y)) - (1.0 - 2.0 * px);
    a = stroke(d, lw, px);
  } else if (shape == 3) {
    float d = max(abs(p.x), abs(p.y)) - (1.0 - px);
    a = 1.0 - smoothstep(-px, 0.0, d);
  } else if (shape == 4) {
    float d = (abs(p.x) + abs(p.y)) * 0.7071 - (0.7071 - 2.0 * px);
    a = stroke(d, lw, px);
  } else if (shape == 5) {
    a = 1.0 - smoothstep(1.0 - 2.0 * px, 1.0, r);
  } else if (shape == 6) {
    float d = min(abs(p.x - p.y), abs(p.x + p.y)) * 0.7071;
    a = stroke(d, lw, px) * (1.0 - smoothstep(0.9, 1.0, max(abs(p.x), abs(p.y))));
  } else if (shape == 7) {
    float ang = atan(p.y, p.x);
    float lump = 0.82 + 0.1 * sin(ang * 5.0 + vSeed * 6.283) + 0.06 * sin(ang * 9.0 - vSeed * 11.0);
    float d = r / lump;
    a = (1.0 - smoothstep(0.55, 1.0, d)) * (0.75 + 0.25 * (1.0 - d));
  } else if (shape == 8) {
    vec2 q = abs(p);
    float edge = 1.0 - 2.0 * px;
    float onEdge = max(stroke(q.x - edge, lw, px) * step(0.45, q.y), stroke(q.y - edge, lw, px) * step(0.45, q.x));
    a = onEdge * step(max(q.x, q.y), 1.0);
  } else if (shape == 9) {
    float ang = atan(p.y, p.x);
    float dashes = step(0.0, sin(ang * 6.0));
    a = stroke(r - (1.0 - 2.0 * px), lw, px) * dashes;
  } else {
    // triangle outline, apex up
    vec2 q = vec2(abs(p.x), p.y + 0.25);
    float d = max(q.x * 0.866 + q.y * 0.5, -q.y) - 0.5 + px;
    a = stroke(d, lw, px);
  }
  a *= vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb, a);
  ${FRAG_END}
}`;

export interface SymbolLayerOptions {
  capacity?: number;
  additive?: boolean;
  depthTest?: boolean;
  renderOrder?: number;
}

export class SymbolLayer extends Points<BufferGeometry, ShaderMaterial> {
  private cap: number;
  private n = 0;
  private pos!: Float32Array;
  private col!: Float32Array;
  private par!: Float32Array;

  constructor(shared: SharedUniforms, opts: SymbolLayerOptions = {}) {
    const mat = new ShaderMaterial({
      uniforms: { uPxScale: shared.uPxScale, uDpr: shared.uDpr },
      vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false, depthTest: opts.depthTest ?? true,
      blending: opts.additive ? AdditiveBlending : NormalBlending,
      toneMapped: false,
    });
    super(SymbolLayer.makeGeometry(opts.capacity ?? 128), mat);
    this.cap = opts.capacity ?? 128;
    this.bind();
    this.frustumCulled = false;
    this.renderOrder = opts.renderOrder ?? ORDER.points;
    this.geometry.setDrawRange(0, 0);
  }

  private static makeGeometry(cap: number): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(cap * 3), 3).setUsage(35048));
    g.setAttribute('aColor', new BufferAttribute(new Float32Array(cap * 4), 4).setUsage(35048));
    g.setAttribute('aParams', new BufferAttribute(new Float32Array(cap * 4), 4).setUsage(35048));
    return g;
  }

  private bind(): void {
    this.pos = this.geometry.getAttribute('position').array as Float32Array;
    this.col = this.geometry.getAttribute('aColor').array as Float32Array;
    this.par = this.geometry.getAttribute('aParams').array as Float32Array;
  }

  private grow(): void {
    const old = this.geometry;
    const g = SymbolLayer.makeGeometry(this.cap * 2);
    for (const k of ['position', 'aColor', 'aParams']) (g.getAttribute(k).array as Float32Array).set(old.getAttribute(k).array as Float32Array);
    this.geometry = g;
    old.dispose();
    this.cap *= 2;
    this.bind();
  }

  /** Number of symbols in the batch. */
  get symbolCount(): number { return this.n; }

  /** Start a new batch. */
  reset(): void { this.n = 0; }

  /** Add one symbol at (x, y, z) render units. `worldSize` is a physical diameter in units (0 = pixel-only). */
  put(x: number, y: number, z: number, shape: ShapeId, sizePx: number, color: Color, alpha: number, worldSize = 0, seed = 0): void {
    this.putRGB(x, y, z, shape, sizePx, color.r, color.g, color.b, alpha, worldSize, seed);
  }

  putRGB(x: number, y: number, z: number, shape: number, sizePx: number, r: number, g: number, b: number, alpha: number, worldSize = 0, seed = 0): void {
    if (alpha <= 0.002) return;
    if (this.n >= this.cap) this.grow();
    const i = this.n++;
    const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = alpha;
    this.par[i4] = sizePx; this.par[i4 + 1] = shape; this.par[i4 + 2] = worldSize; this.par[i4 + 3] = seed;
  }

  commit(): void {
    const g = this.geometry;
    g.setDrawRange(0, this.n);
    if (this.n === 0) return;
    for (const [k, size] of [['position', 3], ['aColor', 4], ['aParams', 4]] as const) {
      const attr = g.getAttribute(k) as BufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, this.n * size);
      attr.needsUpdate = true;
    }
  }

  override dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
