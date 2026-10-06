/** Camera framing choices for the training scene, not real ATFLIR angular limits. */
import { PerspectiveCamera, Vector3 } from 'three';
import { UNIT_PER_M } from '../../render/units';
import { TARGETS, type AtflirSession } from './model';
export const POD_FOV = [28, 9, 2.4] as const;
export function podAim(s: Pick<AtflirSession, 'tracked' | 'x' | 'y'>): Vector3 {
  const truck = TARGETS.find(t => t.id === s.tracked);
  return new Vector3(truck?.x ?? s.x, truck ? 1.8 : 0.8, truck?.y ?? s.y).multiplyScalar(UNIT_PER_M);
}
export function setPodCamera(camera: PerspectiveCamera, aim: Vector3, fov: number): void {
  camera.position.set(0, 0.35, 0.6);
  camera.up.set(0, 1, 0);
  camera.fov = fov;
  camera.lookAt(aim);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
