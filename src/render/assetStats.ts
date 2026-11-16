/**
 * Measure loaded geometry: exact bounds (every vertex, not the loose box of rotated node boxes) and the triangle
 * count, in the frame of the object passed in. Used by the 3D models page to show what a file really contains.
 */
import { Box3, Matrix4, Mesh, Vector3, type Object3D } from 'three';

export interface MeshStats {
  /** Bounds of every mesh vertex in `root`'s own frame (its parents' and its own transform ignored). */
  bounds: Box3;
  /** `bounds` size: x = width (span), y = height, z = length for models built nose to -z. */
  size: Vector3;
  /** Indexed triangles, or vertices / 3 for non-indexed meshes. */
  triangles: number;
  vertices: number;
  meshes: number;
}

const _inv = new Matrix4();
const _m = new Matrix4();
const _v = new Vector3();

/** Exact metre bounds and counts of every Mesh under `root` (lines and points are skipped). */
export function meshStats(root: Object3D): MeshStats {
  root.updateWorldMatrix(true, true);
  _inv.copy(root.matrixWorld).invert();
  const bounds = new Box3();
  let triangles = 0, vertices = 0, meshes = 0;
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const position = node.geometry.getAttribute('position');
    if (!position) return;
    meshes++;
    vertices += position.count;
    triangles += Math.floor((node.geometry.index?.count ?? position.count) / 3);
    _m.multiplyMatrices(_inv, node.matrixWorld);
    for (let i = 0; i < position.count; i++) bounds.expandByPoint(_v.fromBufferAttribute(position, i).applyMatrix4(_m));
  });
  return { bounds, size: bounds.isEmpty() ? new Vector3() : bounds.getSize(new Vector3()), triangles, vertices, meshes };
}
