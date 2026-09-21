import { describe, expect, it, vi } from 'vitest';
import type { RecordFrame } from '../sim/types';
import type { Stage } from './stage';
import { recordedRadarAt } from './replay-sensors';
import { ReplayView } from './replay';

const tagDisposals = vi.hoisted(() => [] as ReturnType<typeof vi.fn>[]);

vi.mock('./tactical', () => ({ TacticalScene: class {
  layers = { effects: true, labels: true, illumination: true };
  opts = { aircraftTrailSeconds: 45 };
  palette = { sym: { r: 1, g: 1, b: 1 }, symHi: { r: 1, g: 1, b: 1 }, symDim: { r: 1, g: 1, b: 1 } };
  symbols = { put: vi.fn() }; overlaySymbols = { put: vi.fn() }; lines = { seg: vi.fn() };
  synced: { aircraft: unknown[]; missiles: unknown[] } = { aircraft: [], missiles: [] };
  clear() {} refreshLabels() {} select() {} addExplosion() {} jetVis() {} missileVis() {}
  registerLabel() { return vi.fn(); }
  gather() {}
  syncNow() { this.gather(); }
  syncEntities(_t: number, aircraft: Iterable<unknown>, missiles: Iterable<unknown>) {
    this.synced = { aircraft: [...aircraft], missiles: [...missiles] };
  }
  constructor(public stage: Stage) {}
} }));
vi.mock('./tags', async () => {
  const { Vector3 } = await import('three');
  return { Tag: class {
    obj = { position: new Vector3() };
    visible = true;
    dispose = vi.fn();
    constructor() { tagDisposals.push(this.dispose); }
    setFlagAttr() {} set() {}
  } };
});

function frame(t: number, detected = true): RecordFrame {
  const aircraft: RecordFrame['aircraft'] = ['own', 'unknown'].map(id => ({
    id, type: 'f15c', side: 'blue', pos: [999000, 9000, -999000], heading: 0, pitch: 0, roll: 0, alive: true,
    radarMode: 'tws', sttTarget: null, designated: detected ? ['unknown'] : [],
    radar: { azCenter: 0, azHalf: 1, elCenter: 0, bars: 2, beamAz: 0, beamEl: 0 },
    radarContacts: { bricks: [], tracks: detected ? [{ targetId: 'unknown', label: 'T1', pos: [100, 8000, -30000], vel: [0, 0, 200], lastHit: t, firm: true, coasting: false }] : [] },
  }));
  return { t, aircraft, missiles: [{ id: 'missile', type: 'aim120c', side: 'red', shooterId: 'unknown', targetId: 'own', pos: [2000, 9000, -5000], guidance: 'active', alive: true, timeToActive: 0 }] };
}

describe('recorded radar sampling', () => {
  it('does not borrow a detection or designation from the next sample', () => {
    const frames = [frame(1, false), frame(1.25)];
    expect(recordedRadarAt(frames, 1.24, 'own')?.aircraft.radarContacts?.tracks).toEqual([]);
    expect(recordedRadarAt(frames, 1.24, 'own')?.aircraft.designated).toEqual([]);
    expect(recordedRadarAt(frames, 1.25, 'own')?.aircraft.radarContacts?.tracks).toHaveLength(1);
    expect(recordedRadarAt(frames, 0.99, 'own')).toBeNull();
  });

  it('uses the latest estimate unchanged between samples, including backward seeks and track loss', () => {
    const frames = [frame(1), frame(1.25), frame(1.5, false)];
    frames[1].aircraft[0].radarContacts!.tracks[0].pos[0] = 900;
    expect(recordedRadarAt(frames, 1.49, 'own')?.aircraft.radarContacts?.tracks[0].pos[0]).toBe(900);
    expect(recordedRadarAt(frames, 1.5, 'own')?.aircraft.radarContacts?.tracks).toEqual([]);
    expect(recordedRadarAt(frames, 1.1, 'own')?.aircraft.radarContacts?.tracks[0].pos[0]).toBe(100);
  });

  it('distinguishes absent old sensor data from a recorded empty scan', () => {
    const old = frame(1); delete old.aircraft[0].radarContacts;
    expect(recordedRadarAt([old], 1, 'own')).toBeNull();
    expect(recordedRadarAt([frame(1, false)], 1, 'own')?.aircraft.radarContacts).toEqual({ bricks: [], tracks: [] });
    expect(recordedRadarAt([old], 1, 'missing')).toBeNull();
    expect(recordedRadarAt([], 1, 'own')).toBeNull();
  });
});

class TestReplay extends ReplayView {
  draw() { this.drawExtra(); }
  cms() { return [...this.countermeasures()]; }
}
function makeReplay(frames: RecordFrame[]) {
  return new TestReplay({ requestRender: vi.fn(), labels: {} } as unknown as Stage, {
    frames,
    roster: { aircraft: { own: { type: 'f15c', side: 'blue', callsign: 'Player' }, unknown: { type: 'f15c', side: 'blue', callsign: 'Hidden friendly' } }, missiles: {} },
    events: [{ t: 1, type: 'cm', ownerId: 'unknown', what: 'chaff' }],
  });
}
function rendered(view: ReplayView) { return view as unknown as { synced: { aircraft: { id: string }[]; missiles: unknown[] }; overlaySymbols: { put: ReturnType<typeof vi.fn> } }; }

describe('radar replay visibility', () => {
  it('draws only ownship and recorded estimates, including when hidden truth is friendly', () => {
    const view = makeReplay([frame(1), frame(2)]);
    view.setRadarObserver('own'); view.syncNow(); view.draw();
    expect(rendered(view).synced.aircraft.map(a => a.id)).toEqual(['own']);
    expect(rendered(view).synced.missiles).toEqual([]);
    expect(rendered(view).overlaySymbols.put.mock.calls[0].slice(0, 3)).toEqual([0.1, 8, -30]);
    expect(view.layers.effects).toBe(false);
    expect(view.cms()).toEqual([]);
    expect(view.radarSampleTime).toBe(1);
  });

  it('restores truth entities/effects and cannot fall back to truth for legacy frames', () => {
    const old = frame(1); old.aircraft.forEach(a => { delete a.radarContacts; });
    const view = makeReplay([old]);
    expect(view.hasRadarRecording('own')).toBe(false);
    view.setRadarObserver('own'); view.syncNow(); view.draw();
    expect(rendered(view).synced.aircraft.map(a => a.id)).toEqual(['own']);
    expect(rendered(view).overlaySymbols.put).not.toHaveBeenCalled();
    expect(view.radarSampleTime).toBeNull();
    view.setRadarObserver(null); view.syncNow();
    expect(rendered(view).synced.aircraft).toHaveLength(2);
    expect(rendered(view).synced.missiles).toHaveLength(1);
    expect(view.layers.effects).toBe(true);
  });

  it('releases track tags on loss, backward seek, perspective changes and data replacement', () => {
    tagDisposals.length = 0;
    const view = makeReplay([frame(1), frame(2, false)]);
    view.setRadarObserver('own'); view.draw();
    expect(tagDisposals).toHaveLength(1);
    view.setTime(2); view.draw();
    expect(tagDisposals[0]).toHaveBeenCalledOnce();
    view.setTime(1); view.draw();
    expect(tagDisposals).toHaveLength(2);
    view.setRadarObserver(null);
    expect(tagDisposals[1]).toHaveBeenCalledOnce();
    view.setRadarObserver('own'); view.draw();
    view.setData([], { aircraft: {}, missiles: {} });
    expect(tagDisposals[2]).toHaveBeenCalledOnce();
    expect(view.radarSampleTime).toBeNull();
  });
});
