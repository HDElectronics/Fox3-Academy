import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ContactShadows, contactShadow } from './contactShadows';

describe('contact shadows', () => {
  const sun = new Vector3(0.49, 0.64, -0.59).normalize(); // south-east, 40° up: shadows fall north-west
  it('pushes a live unit shadow away from the sun, longer as the sun drops', () => {
    const tank = contactShadow({ kind: 'tank', sizeM: 10, alive: true }, sun);
    expect(tank.dx).toBeLessThan(0);
    expect(tank.dz).toBeGreaterThan(0);
    expect(tank.halfLength).toBeGreaterThan(tank.halfWidth);
    const low = contactShadow({ kind: 'tank', sizeM: 10, alive: true }, new Vector3(0.7, 0.25, -0.67).normalize());
    expect(Math.hypot(low.dx, low.dz)).toBeGreaterThan(Math.hypot(tank.dx, tank.dz));
    expect(Math.hypot(low.dx, low.dz)).toBeLessThanOrEqual(5 + 1e-9);
  });

  it('centres a darker scorch under a wreck and falls back to the kind size', () => {
    const wreck = contactShadow({ kind: 'truck', sizeM: 0, alive: false }, sun);
    expect(wreck.dx).toBe(0);
    expect(wreck.dz).toBe(0);
    expect(wreck.alpha).toBeGreaterThan(contactShadow({ kind: 'truck', sizeM: 0, alive: true }, sun).alpha);
    expect(wreck.halfWidth).toBeGreaterThan(0);
  });

  it('draws one instance per unit and frees its resources', () => {
    const layer = new ContactShadows(4);
    const unit = (id: string, x: number) => ({ id, kind: 'tank' as const, sizeM: 10, alive: true, heading: 0, pos: new Vector3(x, 100, 0) });
    layer.sync([unit('a', 0), unit('b', 50)] as never, sun);
    expect(layer.count).toBe(2);
    layer.sync([unit('a', 0), unit('b', 1), unit('c', 2), unit('d', 3), unit('e', 4)] as never, sun);
    expect(layer.count).toBe(4);
    layer.dispose();
  });
});
