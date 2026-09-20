/**
 * Data agent harness: internal consistency of src/data. Run with
 *   npx vitest run -c sandbox/data-vitest.config.ts
 */
import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT, AIRCRAFT_CAVEATS, AIRCRAFT_ORDER, MISSILES, PROCEDURES, RWRS, RWR_CAVEATS, SOURCES, SOURCE_TOPICS,
  procedureFor, rwrSymbol, sourcesFor,
  type AircraftId, type MissileId, type RwrId, type RwrSymbol, type SourceTopic,
} from '../src/data';

const IDS = AIRCRAFT_ORDER;
const EMITTERS: RwrSymbol['emitter'][] = [...IDS, 'missile', 'awacs', 'sam-long', 'sam-medium', 'sam-short', 'unknown'];
const frame = (az: number, bars: number, rate: number) => (bars * 2 * az) / rate;

describe('aircraft', () => {
  it('covers all ten jets with matching ids', () => {
    expect(IDS).toHaveLength(10);
    for (const id of IDS) {
      expect(AIRCRAFT[id].id).toBe(id);
      expect(AIRCRAFT_CAVEATS[id].length).toBeGreaterThan(0);
    }
  });

  it('loadouts only use carriable missiles that exist', () => {
    for (const id of IDS) {
      const a = AIRCRAFT[id];
      for (const w of a.loadout) {
        expect(a.missiles, `${id} ${w.missile}`).toContain(w.missile);
        expect(w.count).toBeGreaterThan(0);
      }
      for (const m of a.missiles) expect(MISSILES[m], m).toBeDefined();
    }
  });

  it('radar specs are coherent', () => {
    for (const id of IDS) {
      const r = AIRCRAFT[id].radar;
      expect(r.modes).toContain('rws');
      expect(r.modes).toContain('stt');
      for (const mode of r.modes) if (mode !== 'off') expect(r.modeLabels[mode], `${id} ${mode}`).toBeTruthy();
      expect(r.tws === null).toBe(!r.modes.includes('tws'));
      expect([...r.rangeScalesKm].sort((x, y) => x - y)).toEqual(r.rangeScalesKm);
      expect(Math.max(...r.azHalfWidthOptionsDeg)).toBeLessThanOrEqual(r.gimbalAzDeg);
      expect(r.beamWidthDeg).toBeGreaterThanOrEqual(r.barSpacingDeg);
      expect(r.detectKm.tail).toBeLessThan(r.detectKm.headOn);
      expect(r.detectKm.lookDownFactor).toBeGreaterThan(0);
      expect(r.detectKm.lookDownFactor).toBeLessThanOrEqual(1);
      if (r.tws) {
        expect(r.tws.maxSimultaneousTargets).toBeLessThanOrEqual(r.tws.maxTracks);
        expect(r.tws.howTo.length).toBeGreaterThan(100);
      }
    }
    expect(AIRCRAFT.m2000c.radar.tws).toBeNull();
  });

  it('auto-STT only on the FC3 Russian jets', () => {
    for (const id of IDS) {
      const f = AIRCRAFT[id].radar.tws?.autoSttAtRmaxFraction ?? null;
      const ru = AIRCRAFT[id].display === 'ru-hud';
      expect(f, id).toBe(ru ? 0.85 : null);
    }
  });

  it('frame times match documented values', () => {
    const r = (id: AircraftId) => AIRCRAFT[id].radar;
    expect(frame(30, 4, r('su27').scanRateDegPerS)).toBeCloseTo(5);         // FC3 ~5 s
    expect(frame(60, 4, r('f15c').scanRateDegPerS)).toBeCloseTo(5);
    expect(frame(60, 4, r('f16c').scanRateDegPerS)).toBeCloseTo(8);         // A6 4B
    expect(frame(30, 2, r('f16c').scanRateDegPerS)).toBeCloseTo(2);         // A3 2B
    expect(frame(20, 4, r('f14b').scanRateDegPerS)).toBeCloseTo(2);         // TWS ±20° 4B
    expect(frame(40, 2, r('f14b').scanRateDegPerS)).toBeCloseTo(2);         // TWS ±40° 2B
  });

  it('TWS frame-time limits accept the real patterns and refuse the others', () => {
    const ok = (id: AircraftId, az: number, bars: number) => {
      const r = AIRCRAFT[id].radar;
      const t = r.tws!;
      return frame(az, bars, r.scanRateDegPerS) <= (t.maxFrameTimeS ?? Infinity) + 1e-9
        && az <= (t.maxAzHalfWidthDeg ?? 180) && bars <= (t.maxBars ?? 99);
    };
    expect(ok('fa18c', 40, 2)).toBe(true);
    expect(ok('fa18c', 20, 4)).toBe(true);
    expect(ok('fa18c', 10, 6)).toBe(true);
    expect(ok('fa18c', 30, 4)).toBe(false);
    expect(ok('fa18c', 20, 6)).toBe(false);
    expect(ok('fa18c', 70, 2)).toBe(false);
    expect(ok('f14b', 20, 4)).toBe(true);
    expect(ok('f14b', 40, 2)).toBe(true);
    expect(ok('f14b', 40, 4)).toBe(false);
    expect(ok('f14b', 65, 2)).toBe(false);
    expect(ok('jf17', 60, 2)).toBe(true);
    expect(ok('jf17', 25, 3)).toBe(true);
    expect(ok('jf17', 10, 4)).toBe(true);
    expect(ok('jf17', 60, 4)).toBe(false);
    expect(ok('f15c', 30, 4)).toBe(true);
    expect(ok('f15c', 60, 4)).toBe(false);
    expect(ok('su27', 30, 4)).toBe(true);
  });
});

describe('missiles', () => {
  const all = Object.values(MISSILES);
  it('has all seventeen with matching ids', () => {
    expect(all).toHaveLength(17);
    for (const [k, m] of Object.entries(MISSILES)) expect(m.id).toBe(k as MissileId);
  });
  it('fox number matches seeker and fields are sane', () => {
    for (const m of all) {
      expect(m.fox, m.id).toBe(m.seeker === 'sarh' ? 1 : m.seeker === 'ir' ? 2 : 3);
      expect(m.guidanceRule.length, m.id).toBeGreaterThan(20);
      expect(m.notes.length, m.id).toBeGreaterThan(0);
      expect(m.chaffSusceptibility).toBeGreaterThanOrEqual(0);
      expect(m.chaffSusceptibility).toBeLessThanOrEqual(1);
      expect(m.ref.highColdKm).toBeLessThan(m.ref.highHeadOnKm);
      expect(m.ref.lowHeadOnKm).toBeLessThan(m.ref.highHeadOnKm);
      if (m.seeker === 'ir') {
        expect(m.chaffSusceptibility).toBe(0);
        expect(m.midcourse).toBe('none');
      }
      if (m.seeker === 'arh') {
        expect(m.pitbullKm, m.id).toBeGreaterThan(0);
        expect(m.midcourse).toBe('datalink');
        expect(m.seekerRangeKm!, m.id).toBeGreaterThanOrEqual(m.pitbullKm!);
      } else {
        expect(m.pitbullKm).toBeUndefined();
      }
    }
  });
});

describe('rwr', () => {
  it('each RWR lists every emitter once and its aircraft use it', () => {
    for (const [id, r] of Object.entries(RWRS) as [RwrId, (typeof RWRS)[RwrId]][]) {
      expect(r.id).toBe(id);
      expect(r.symbols.map(s => s.emitter).sort()).toEqual([...EMITTERS].sort());
      for (const a of r.aircraft) expect(AIRCRAFT[a].rwr).toBe(id);
      expect(r.teach.length).toBeGreaterThan(2);
      expect(RWR_CAVEATS[id].length).toBeGreaterThan(0);
    }
    for (const id of IDS) expect(RWRS[AIRCRAFT[id].rwr].aircraft).toContain(id);
  });
  it('SPO-15 uses the lamp letters, Cyrillic except F', () => {
    const letters = new Set(RWRS.spo15.symbols.map(s => s.symbol).filter(Boolean));
    expect([...letters].sort()).toEqual(['З', 'Н', 'П', 'С', 'Х'].sort());
    for (const l of letters) expect(/^[Ѐ-ӿ]$/.test(l), l).toBe(true);
    expect(rwrSymbol('spo15', 'f15c')).toBe('П');
    expect(rwrSymbol('alr56c', 'missile')).toBe('M');
    expect(rwrSymbol('alr67', 'su27')).toBe('29');
  });
});

describe('procedures', () => {
  it('every jet has binds and the core procedures', () => {
    for (const id of IDS) {
      const p = PROCEDURES[id];
      expect(p.aircraft).toBe(id);
      expect(p.binds.length).toBeGreaterThan(10);
      for (const core of ['search', 'stt-shot', 'support', 'defend']) expect(procedureFor(id, core), `${id} ${core}`).toBeDefined();
      for (const pr of p.procedures) {
        expect(pr.steps.length).toBeGreaterThan(1);
        for (const s of pr.steps) expect(s.text.length).toBeGreaterThan(5);
      }
      const multi = (AIRCRAFT[id].radar.tws?.maxSimultaneousTargets ?? 1) > 1;
      expect(!!procedureFor(id, 'tws-multi'), `${id} tws-multi`).toBe(multi);
    }
  });
});

describe('sources', () => {
  it('ids are 1..n, urls unique, topics valid', () => {
    SOURCES.forEach((s, i) => expect(s.id).toBe(i + 1));
    expect(new Set(SOURCES.map(s => s.url)).size).toBe(SOURCES.length);
    for (const [t, ids] of Object.entries(SOURCE_TOPICS) as [SourceTopic, number[]][]) {
      expect(ids.length, t).toBeGreaterThan(0);
      for (const id of ids) expect(SOURCES[id - 1], `${t} ${id}`).toBeDefined();
      expect(sourcesFor(t)).toHaveLength(ids.length);
    }
    for (const id of IDS) expect(SOURCE_TOPICS[id].length).toBeGreaterThan(0);
    for (const m of Object.keys(MISSILES) as MissileId[]) expect(SOURCE_TOPICS[m].length).toBeGreaterThan(0);
  });

  it('prints a summary table', () => {
    const rows = IDS.map(id => {
      const r = AIRCRAFT[id].radar;
      const az = Math.max(...r.azHalfWidthOptionsDeg);
      const bars = r.barOptions.includes(4) ? 4 : r.barOptions[0];
      return `${id.padEnd(7)} ${r.name.padEnd(14)} det ${String(r.detectKm.headOn).padStart(5)}/${String(r.detectKm.tail).padStart(3)} km  notch ${r.notchKts} kt  default frame ${frame(az, bars, r.scanRateDegPerS).toFixed(1)} s  tws ${r.tws ? `${r.tws.maxTracks}T/${r.tws.maxSimultaneousTargets}tgt` : 'none'}`;
    });
    console.log(rows.join('\n') + `\nsources: ${SOURCES.length}`);
  });
});
