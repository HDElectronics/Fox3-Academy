import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcmiDownload, exportAcmi } from './acmi';
import { World } from '../sim/world';
import { AIRCRAFT, FIGHTER_ORDER } from '../data/aircraft';
import { MISSILES } from '../data/missiles';
import type { RecordFrame, SimEvent } from '../sim/types';

const aircraft = (id: string, patch: Partial<RecordFrame['aircraft'][number]> = {}): RecordFrame['aircraft'][number] => ({
  id, type: 'f15c', side: 'blue', pos: [0, 5000, 0], heading: 0, pitch: 0, roll: 0, alive: true,
  radarMode: 'off', sttTarget: null, radar: { azCenter: 0, azHalf: 0, elCenter: 0, bars: 1, beamAz: 0, beamEl: 0 }, designated: [], ...patch,
});
const missile = (id: string, patch: Partial<RecordFrame['missiles'][number]> = {}): RecordFrame['missiles'][number] => ({
  id, type: 'aim120c', side: 'blue', shooterId: 'a', targetId: 'b', pos: [0, 5000, -1000], guidance: 'active', alive: true, timeToActive: 0, ...patch,
});
const frame = (t: number, aircrafts: RecordFrame['aircraft'] = [], missiles: RecordFrame['missiles'] = []): RecordFrame => ({ t, aircraft: aircrafts, missiles });

/** Read emitted frame/object operations independently of the exporter. */
function read(content: string) {
  const positions = new Map<string, { t: number; transform: number[] }[]>();
  const removed: { id: string; t: number }[] = [];
  let t = 0;
  for (const line of content.replace(/^\uFEFF/, '').trimEnd().split('\n').slice(2)) {
    if (line.startsWith('#')) { const next = Number(line.slice(1)); expect(next).toBeGreaterThanOrEqual(t); t = next; }
    else if (line.startsWith('-')) { expect(line).toMatch(/^-[1-9a-f][0-9a-f]*$/); removed.push({ id: line.slice(1), t }); }
    else if (/^[1-9a-f][0-9a-f]*,/.test(line)) {
      const [id, property] = line.split(',');
      const transform = property.slice(2).split('|').map(Number);
      expect([5, 9]).toContain(transform.length);
      expect(transform.every(Number.isFinite)).toBe(true);
      const list = positions.get(id) ?? []; list.push({ t, transform }); positions.set(id, list);
    }
  }
  return { positions, removed };
}

describe('Tacview ACMI export', () => {
  it('writes a valid UTF-8 header and explicitly synthetic metadata even without frames', () => {
    const result = exportAcmi([]);
    expect(result.startsWith('\uFEFFFileType=text/acmi/tacview\nFileVersion=2.2\n')).toBe(true);
    expect(result).toContain('ReferenceTime=2000-01-01T00:00:00Z');
    expect(result).toContain('Synthetic origin 0N 0E');
    expect(read(result).positions.size).toBe(0);
  });

  it('maps east/up/south and radians to north-positive coordinates, metres and degrees', () => {
    const content = exportAcmi([frame(0, [aircraft('a', { pos: [1000, 7000, -2000], heading: Math.PI / 2, pitch: Math.PI / 6, roll: -Math.PI / 4 })])]);
    const values = read(content).positions.get('1')![0].transform;
    expect(values[0]).toBeCloseTo(0.00898315, 8);
    expect(values[1]).toBeCloseTo(0.01796631, 8);
    expect(values.slice(2)).toEqual([7000, -45, 30, 90, 1000, 2000, 90]);
  });

  it('gives arbitrary entity IDs stable nonzero hexadecimal IDs with no frame mutation', () => {
    const entities = Array.from({ length: 20 }, (_, i) => aircraft(`jet,${i}`));
    const input = [frame(1, [...entities].reverse()), frame(0, entities)];
    const before = JSON.stringify(input);
    const out = exportAcmi(input);
    expect(out).toContain('\n14,T=');
    expect(out).not.toContain('jet,');
    expect(read(out).positions.size).toBe(20);
    expect(JSON.stringify(input)).toBe(before);
    const reordered = exportAcmi([frame(1, entities), frame(0, entities)]);
    expect(reordered.split('\n').filter(l => l.includes('Name=')).sort()).toEqual(out.split('\n').filter(l => l.includes('Name=')).sort());
  });

  it('spawns missiles with a launcher parent and removes dead or missing objects once', () => {
    const out = exportAcmi([
      frame(0, [aircraft('a'), aircraft('b', { side: 'red' })]),
      frame(0.25, [aircraft('a'), aircraft('b')], [missile('m')]),
      frame(0.5, [aircraft('a'), aircraft('b', { alive: false })], [missile('m', { alive: false })]),
      frame(0.75, []),
    ]);
    expect(out).toContain('Type=Weapon+Missile,Coalition=Blue,Color=Blue,Parent=1');
    expect(read(out).removed).toEqual([{ id: '2', t: 0.5 }, { id: '3', t: 0.5 }, { id: '1', t: 0.75 }]);
    expect(out.split('Name=AIM-120C').length).toBe(2);
  });

  it('keeps inactive SAM sites and exports sampled SAM missiles without invented attitudes', () => {
    const f = frame(0);
    f.sams = [{ id: 's', type: 'sa11', side: 'red', pos: [0, 0, -5000], state: 'off', active: false, targetId: null }];
    f.samMissiles = [{ id: 'sm', type: 'sa11', side: 'red', pos: [0, 100, -4900], guided: false, alive: true, siteId: 's', targetId: null }];
    const out = exportAcmi([f]);
    expect(out).toContain('Name=SA-11 Gadfly,Type=Ground+AntiAircraft');
    expect(out).toContain('Name=SA-11 Gadfly missile,Type=Weapon+Missile,Coalition=Red,Color=Red,Parent=1');
    expect([...read(out).positions.values()].every(v => v[0].transform.length === 5)).toBe(true);
  });

  it('retains events before the first sample and final outcomes after the last sample', () => {
    const events: SimEvent[] = [
      { t: 0, type: 'launch', missileId: 'm', shooterId: 'a', targetId: 'b', missile: 'aim120c', range: 1000, radarMode: 'tws' },
      { t: 0.4, type: 'hit', missileId: 'm', targetId: 'b' },
      { t: 0.4, type: 'kill', targetId: 'b', by: 'a' },
    ];
    const out = exportAcmi([frame(0.25, [aircraft('a'), aircraft('b')], [missile('m')])], { events });
    expect(out).toContain('#0\n0,Event=Message|AIM-120C launched');
    expect(out).toContain('#0.4\n0,Event=Message|3|2|Missile hit\n-3');
    expect(read(out).removed).toEqual([{ id: '3', t: 0.4 }, { id: '2', t: 0.4 }]);
  });

  it('flattens control characters and escapes commas in user-visible metadata', () => {
    const out = exportAcmi([frame(0, [aircraft('a')])], { title: 'Test, flight\n-1', callsigns: { a: 'Сокол\\,1|2\r#99' } });
    expect(out).toContain('Title=Test\\, flight -1\n');
    expect(out).toContain('CallSign=Сокол/\\,1 2 #99');
    expect(read(out).removed).toEqual([]);
  });

  it('rejects nonfinite positions rather than emitting corrupt telemetry', () => {
    expect(() => exportAcmi([frame(0, [aircraft('a', { pos: [NaN, 1, 1] })])])).toThrow('invalid coordinate');
    expect(() => exportAcmi([frame(-1)])).toThrow('negative time');
  });

  it.each(FIGHTER_ORDER)('exports actual %s world recording samples and its available missile names', type => {
    const world = new World(7);
    world.spawnAircraft({ id: 'a', type, side: 'blue', controller: 'player', pos: { x: 1000, y: 7000, z: -2000 }, heading: Math.PI / 2, speed: 250 });
    world.step(1);
    const content = exportAcmi(world.recording);
    expect(content).toContain(`Name=${AIRCRAFT[type].short},Type=Air+FixedWing`);
    expect(read(content).positions.get('1')?.length).toBe(world.recording.length);
    const f = frame(0, [], AIRCRAFT[type].missiles.map((id, i) => missile(`m${i}`, { type: id })));
    const stores = exportAcmi([f]);
    for (const id of AIRCRAFT[type].missiles) expect(stores).toContain(`Name=${MISSILES[id].name},Type=Weapon+Missile`);
  });

  it('exports a live SAM engagement recording with launch events', () => {
    const world = new World(7);
    const events: SimEvent[] = [];
    world.on(e => events.push(e));
    world.spawnSam({ id: 's', type: 'sa11', side: 'red', pos: { x: 0, z: 0 } });
    world.spawnAircraft({ id: 'a', type: 'f16c', side: 'blue', controller: 'player', pos: { x: 0, y: 6000, z: 25000 }, heading: 0, speed: 250 });
    world.step(20);
    const out = exportAcmi(world.recording, { events });
    expect(out).toContain('SAM launch');
    expect(out).toContain('Name=SA-11 Gadfly missile');
    expect(read(out).positions.size).toBeGreaterThan(2);
  });
});


describe('ACMI browser download lifetime', () => {
  afterEach(() => vi.unstubAllGlobals());

  function browser() {
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const urls = { createObjectURL: vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second'), revokeObjectURL: vi.fn() };
    vi.stubGlobal('URL', urls);
    vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { append: vi.fn() } });
    return { link, urls };
  }

  it('downloads UTF-8 ACMI and releases URLs on repeat download and unmount', async () => {
    const { link, urls } = browser();
    const owner = new AcmiDownload();
    owner.download('FileType=text/acmi/tacview\nСокол', 'fox3-sortie-su27.acmi');
    expect(link.download).toBe('fox3-sortie-su27.acmi');
    expect(link.href).toBe('blob:first');
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    const blob = urls.createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/plain;charset=utf-8');
    expect(await blob.text()).toContain('Сокол');
    expect(urls.revokeObjectURL).not.toHaveBeenCalled();
    owner.download('second', 'next.acmi');
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:first');
    owner.dispose(); owner.dispose();
    expect(urls.revokeObjectURL.mock.calls).toEqual([['blob:first'], ['blob:second']]);
  });

  it('removes the anchor and URL if a browser refuses the download', () => {
    const { link, urls } = browser();
    link.click.mockImplementation(() => { throw new Error('Unavailable'); });
    const owner = new AcmiDownload();
    expect(() => owner.download('content', 'file.acmi')).toThrow('Unavailable');
    expect(link.remove).toHaveBeenCalledOnce();
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:first');
    owner.dispose();
    expect(urls.revokeObjectURL).toHaveBeenCalledOnce();
  });
});
