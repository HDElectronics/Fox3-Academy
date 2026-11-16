/**
 * Placement and camera framing for the 3D models page, in metres (this page's scene is 1 unit = 1 m, not the
 * kit's 1 unit = 1 km). Models are authored nose to -z, right wing +x, top +y. Pure: three.js maths only.
 */
import { Box3, Vector3 } from 'three';
import { fitDistance, orbitBasis } from '../../render/cameras';
import type { ViewId } from './catalogue';

/**
 * Camera direction per preset, in the CameraRig convention (`orbitBasis`): heading is the compass direction the
 * camera looks toward (north = -z, the nose), elevation above the horizon.
 * 3/4: from ahead and to the left, above. Side: from the left, nose to the left. Top: nose up. Front: nose on.
 */
export const VIEW_ANGLES: Readonly<Record<ViewId, { headingDeg: number; elevationDeg: number }>> = {
  'three-quarter': { headingDeg: 135, elevationDeg: 24 },
  side: { headingDeg: 90, elevationDeg: 0 },
  top: { headingDeg: 0, elevationDeg: 89.9 },
  front: { headingDeg: 180, elevationDeg: 0 },
};

/**
 * Gap between two models side by side: a share of the larger one, and at least the taller one's height, so from the
 * 3/4 view (24° up, 45° off the nose) the near model hides little of the far one. Never under 25 cm.
 */
export function pairGap(a: Box3, b: Box3): number {
  const sa = a.getSize(new Vector3()), sb = b.getSize(new Vector3());
  return Math.max(0.25, 0.12 * Math.max(sa.x, sa.z, sb.x, sb.z), 1.1 * Math.max(sa.y, sb.y));
}

/**
 * Translations that put each model (local bounds `a`, `b`) on the ground (y = 0) with the noses on one line
 * (z = -length/2 of the longer one). One model: centred on x. Two: side by side along x with a gap, `a` on the left
 * seen from ahead and above. `stacked` (the side view, where side by side would hide one behind the other): both
 * centred on x, `b` raised above `a` by a gap.
 */
export function pairLayout(a: Box3, b: Box3 | null, stacked = false): { a: Vector3; b: Vector3 | null } {
  const sa = a.getSize(new Vector3());
  const sb = b?.getSize(new Vector3()) ?? null;
  const noseZ = -Math.max(sa.z, sb?.z ?? 0) / 2;
  const centreX = (box: Box3) => (box.min.x + box.max.x) / 2;
  const offA = new Vector3(-centreX(a), -a.min.y, noseZ - a.min.z);
  if (!b || !sb) return { a: offA, b: null };
  const offB = new Vector3(-centreX(b), -b.min.y, noseZ - b.min.z);
  if (stacked) {
    // Room between the two for the lower model's name tag.
    offB.y = sa.y + Math.max(0.25, 0.45 * Math.max(sa.y, sb.y)) - b.min.y;
    return { a: offA, b: offB };
  }
  const gap = pairGap(a, b);
  const total = sa.x + gap + sb.x;
  // Seen from ahead (the 3/4 and front presets) +x is the screen left, so `a` (the selection) sits at +x.
  offA.x += total / 2 - sa.x / 2;
  offB.x += -total / 2 + sb.x / 2;
  return { a: offA, b: offB };
}

/** Union of boxes translated by their offsets (world bounds of the placed models). */
export function placedBounds(parts: readonly { box: Box3; offset: Vector3 }[]): Box3 {
  const out = new Box3();
  for (const p of parts) out.union(p.box.clone().translate(p.offset));
  return out;
}

export interface Framing { target: Vector3; position: Vector3; distance: number }

/**
 * Camera that fits `bounds` (all 8 corners) for a preset at a vertical field of view `vFovDeg` (the one on screen,
 * `stage.viewFov`) and viewport aspect, with `pad` margin (1.25 leaves room for the corner overlays).
 */
export function frameBounds(bounds: Box3, view: ViewId, vFovDeg: number, aspect: number, pad = 1.25): Framing {
  const { headingDeg, elevationDeg } = VIEW_ANGLES[view];
  const fwd = new Vector3(), right = new Vector3(), up = new Vector3();
  orbitBasis(headingDeg, elevationDeg, fwd, right, up);
  const target = bounds.getCenter(new Vector3());
  const tanV = Math.tan((vFovDeg * Math.PI) / 360);
  const tanH = tanV * (aspect > 0 && Number.isFinite(aspect) ? aspect : 1);
  const corners: Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    corners.push(new Vector3(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).sub(target));
  }
  const size = bounds.getSize(new Vector3()).length();
  const distance = fitDistance(8, i => corners[i] ?? null, fwd, right, up, tanH, tanV, pad, Math.max(0.3, size * 0.25));
  return { target, position: target.clone().addScaledVector(fwd, -distance), distance };
}
