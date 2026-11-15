/**
 * Soft contact shadows: one instanced draw call of ground-aligned ellipses. Under ground units (`sync`) they are a
 * little longer than the vehicle and pushed away from the sun, with a darker scorch under wrecks, which seats the
 * vehicles on the terrain in the 3D view and keeps them separable from the ground in the Shkval TV and pod pictures.
 * `put` places any blob (the flight-ops jet near the runway). Authored in metres (add under a 0.001-scaled root).
 * Drawing choices only.
 */
import { CircleGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, ShaderMaterial, Vector3 } from 'three';
import type { GroundUnit } from '../sim/types';
import { GROUND_UNIT_SIZE } from '../sim/ground';
import { FRAG_END, FRAG_PRELUDE, ORDER, VERT_END, VERT_PRELUDE } from './shared';

/** Height above the ground (m): log depth ignores polygon offset, so the disc floats just clear of the surface. */
export const SHADOW_LIFT_M = 0.35;

/**
 * Ellipse for one unit in its own frame: half-width (x), half-length (z), centre offset away from the sun (m, in
 * world x/z) and opacity. Pure, unit-tested.
 */
export function contactShadow(u: Pick<GroundUnit, 'kind' | 'sizeM' | 'alive'>, sun: { x: number; y: number; z: number }) {
  const size = u.sizeM || GROUND_UNIT_SIZE[u.kind];
  const horiz = Math.hypot(sun.x, sun.z) || 1;
  // Shadow length grows as the sun drops (height about a quarter of the length), capped for low sun.
  const reach = Math.min(0.5, (0.25 / Math.max(0.2, sun.y)) * horiz * 0.45) * size;
  return {
    halfWidth: size * (u.alive ? 0.34 : 0.5),
    halfLength: size * (u.alive ? 0.6 : 0.55),
    dx: u.alive ? (-sun.x / horiz) * reach : 0,
    dz: u.alive ? (-sun.z / horiz) * reach : 0,
    alpha: u.alive ? 0.42 : 0.6,
  };
}

const vert = /* glsl */ `
${VERT_PRELUDE}
attribute float aAlpha;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vUv = position.xz;
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  ${VERT_END}
}`;

const frag = /* glsl */ `
${FRAG_PRELUDE}
varying vec2 vUv;
varying float vAlpha;
void main() {
  float r = length(vUv);
  float a = vAlpha * (1.0 - smoothstep(0.25, 1.0, r));
  if (a < 0.01) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  ${FRAG_END}
}`;

export class ContactShadows extends InstancedMesh<CircleGeometry, ShaderMaterial> {
  private readonly alphas: Float32Array;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly yAxis = new Vector3(0, 1, 0);

  constructor(capacity = 96) {
    // Unit disc laid flat facing up: local x = width, local z = length.
    const geometry = new CircleGeometry(1, 24).rotateX(-Math.PI / 2);
    const material = new ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false });
    super(geometry, material, capacity);
    this.alphas = new Float32Array(capacity);
    geometry.setAttribute('aAlpha', new InstancedBufferAttribute(this.alphas, 1));
    this.name = 'contact-shadows';
    this.renderOrder = ORDER.shadows;
    this.frustumCulled = false;
    this.count = 0;
  }

  /** Place one shadow per unit (sun = unit vector toward the sun). */
  sync(units: Iterable<GroundUnit>, sun: { x: number; y: number; z: number }): void {
    let n = 0;
    for (const u of units) {
      if (n >= this.alphas.length) break;
      const sh = contactShadow(u, sun);
      this.put(n++, u.pos.x + sh.dx, u.pos.y + SHADOW_LIFT_M, u.pos.z + sh.dz, u.heading, sh.halfWidth, sh.halfLength, sh.alpha);
    }
    this.show(n);
  }

  /** Place blob `i` (metres; heading clockwise from north; half-sizes across and along it). Call `show(n)` after. */
  put(i: number, x: number, y: number, z: number, heading: number, halfWidth: number, halfLength: number, alpha: number): void {
    if (i < 0 || i >= this.alphas.length) return;
    this.p.set(x, y, z);
    this.q.setFromAxisAngle(this.yAxis, -heading);
    this.s.set(halfWidth, 1, halfLength);
    this.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    this.alphas[i] = alpha;
  }

  /** Draw the first `n` blobs. */
  show(n: number): void {
    this.count = Math.max(0, Math.min(n, this.alphas.length));
    this.instanceMatrix.needsUpdate = true;
    this.geometry.getAttribute('aAlpha').needsUpdate = true;
  }

  override dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.removeFromParent();
    super.dispose();
  }
}
