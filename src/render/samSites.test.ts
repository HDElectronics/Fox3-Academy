import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SAMS } from '../data/sams';
import { World } from '../sim/world';
import { samDrill } from '../sim/scenarios';
import { circlePoints, samMissileLike, samShortName, samTagText, type SamSiteLike } from './samSites';
import { LabelPriority } from './tags';

const site = (o: Partial<SamSiteLike> = {}): SamSiteLike => ({
  id: 'sam1', type: 'sa11', side: 'red', pos: { x: 0, y: 0, z: 0 }, state: 'search', targetId: null, active: true, ...o,
});

describe('SAM site rendering helpers', () => {
  it('names sites by their NATO short name', () => {
    expect(samShortName('sa10')).toBe('SA-10');
    expect(samShortName('sa15')).toBe('SA-15');
  });

  it('tags the radar state and the ring radius in the chosen units', () => {
    expect(samTagText(site(), 'metric')).toMatchObject({ title: 'SA-11', sub: 'SEARCH · RING 35 km', tone: null });
    expect(samTagText(site({ state: 'track' }), 'metric').tone).toBe('caution');
    expect(samTagText(site({ state: 'engage' }), 'metric')).toMatchObject({ tone: 'warning' });
    expect(samTagText(site({ state: 'engage' }), 'metric').sub).toContain('LAUNCH');
    expect(samTagText(site({ active: false }), 'metric').sub).toContain('SILENT');
    expect(samTagText(site({ alive: false }), 'metric').sub).toContain('DESTROYED');
    expect(samTagText(site(), 'imperial').sub).toMatch(/nm$/);
  });

  it('draws a closed ring at the requested radius', () => {
    const pts = circlePoints(10, 0.1, -5, SAMS.sa15.threatRingKm, 32);
    expect(pts).toHaveLength(33);
    for (const [x, y, z] of pts) {
      expect(Math.hypot(x - 10, z + 5)).toBeCloseTo(12, 6);
      expect(y).toBe(0.1);
    }
    expect(pts[0][0]).toBeCloseTo(pts[32][0], 9);
  });

  it('ranks site tags below aircraft and missiles, above annotations', () => {
    expect(LabelPriority.site).toBeGreaterThan(LabelPriority.missile);
    expect(LabelPriority.site).toBeLessThan(LabelPriority.annotation);
  });

  it('adapts a SAM in flight to the missile renderer, reusing the object', () => {
    const w = new World(3);
    const d = samDrill(w, 'f15c', 'sa11', { range: 25000 });
    for (let i = 0; i < 60 * 40 && !d.missiles().length; i++) w.step(1 / 60);
    const m = d.missiles()[0];
    expect(m).toBeDefined();
    const like = samMissileLike(m);
    expect(like.display?.name).toBe('SA-11');
    expect(like.shooterId).toBe(d.siteId);
    expect(like.guidance).toBe(m.guided ? 'sarh' : 'ballistic');
    expect(like.pos).toBeInstanceOf(Vector3);
    expect(like.pos.distanceTo(m.pos)).toBe(0);
    expect(samMissileLike(m, like)).toBe(like);
  });
});
