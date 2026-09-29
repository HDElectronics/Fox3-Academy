/** Named A-10 exterior hinges. Visual travel only; no flight/weapon behavior. */
import { Group, Object3D, PropertyBinding, Quaternion, Vector3 } from 'three';
import type { JetConfig } from './jets';

type Drive = 'gear' | 'flaps' | 'speedbrake';
export const A10_HINGES: readonly { name: string; drive: Drive; radians: number }[] = [
  ...['nose', 'port', 'starboard'].map(side => ({ name: 'gear.' + side, drive: 'gear' as const, radians: -Math.PI / 2 })),
  ...['port', 'starboard'].map(side => ({ name: 'flap.' + side, drive: 'flaps' as const, radians: Math.PI / 6 })),
  ...['port', 'starboard'].flatMap(side => [
    { name: 'deceleron.' + side + '.upper', drive: 'speedbrake' as const, radians: -Math.PI / 3 },
    { name: 'deceleron.' + side + '.lower', drive: 'speedbrake' as const, radians: Math.PI / 3 },
  ]),
];

/** A partial rig must never disable the complete procedural configuration fallback. */
export function bindA10Rig(content: Group | null): ((config: Readonly<JetConfig>) => void) | null {
  if (!content) return null;
  const bindings: { node: Object3D; base: Quaternion; drive: Drive; radians: number }[] = [];
  for (const hinge of A10_HINGES) {
    const node = content.getObjectByName(hinge.name) ?? content.getObjectByName(PropertyBinding.sanitizeNodeName(hinge.name));
    if (!node) return null;
    bindings.push({ ...hinge, node, base: node.quaternion.clone() });
  }
  const axis = new Vector3(1, 0, 0), rotation = new Quaternion();
  return config => {
    for (const { node, base, drive, radians } of bindings) {
      node.quaternion.copy(base).multiply(rotation.setFromAxisAngle(axis, config[drive] * radians));
    }
  };
}
