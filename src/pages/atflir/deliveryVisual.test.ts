import { describe, it, expect } from 'vitest';
import { bombPosition, RELEASE_POINT, HIT_POINT, MISS_POINT, DeliveryVisual } from './deliveryVisual';
import { LaserDeliverySession } from './delivery';
import { AtflirSession } from './model';
import type { Theme } from '../../ui/theme';
const theme = { earth:'#777777', caution:'#ffaa00', panelMuted:'#555555' } as Theme;
describe('delivery visual sequence', () => {
  it('has bounded release and distinct impact endpoints', () => {
    expect(bombPosition(-1,HIT_POINT)).toEqual(RELEASE_POINT);
    expect(bombPosition(1,HIT_POINT).distanceTo(HIT_POINT)).toBeLessThan(1e-8);
    expect(bombPosition(2,MISS_POINT).distanceTo(MISS_POINT)).toBeLessThan(1e-8);
    expect(HIT_POINT.distanceTo(MISS_POINT)).toBeGreaterThan(.05);
  });
  it('shows release, hit effects, and clears everything on retry', () => {
    const view = new DeliveryVisual(theme), d = new LaserDeliverySession('delivery'), p = new AtflirSession('delivery');
    d.phase='flight'; d.timer=8; view.update(d,p,.05); expect(view.bomb.visible).toBe(true);
    d.phase='hit'; view.update(d,p,.05); expect(view.bomb.visible).toBe(false); expect(view.impact.visible).toBe(true);
    expect(view.impact.position).toEqual(HIT_POINT);
    d.retry(); view.update(d,p,.05); expect(view.impact.visible).toBe(false); expect(view.label).toBe(''); view.dispose(); view.dispose();
  });
  it('places a miss away from the assigned truck', () => {
    const view=new DeliveryVisual(theme), d=new LaserDeliverySession('delivery'); d.phase='miss';
    view.update(d,new AtflirSession('delivery'),.05); expect(view.impact.position).toEqual(MISS_POINT); expect(view.label).toContain('MISS'); view.dispose();
  });
});
