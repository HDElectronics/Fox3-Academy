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

  it('keeps the BVR-only export byte-identical (snapshot taken before the ground and A-G export)', () => {
    const f0 = frame(0, [aircraft('a', { pos: [100, 6000, 200], heading: 0.3, pitch: 0.05, roll: -0.2 }), aircraft('b', { type: 'su27', side: 'red', pos: [0, 7000, -40000], heading: Math.PI })]);
    f0.sams = [{ id: 's', type: 'sa11', side: 'red', pos: [5000, 0, -30000], state: 'track', active: true, targetId: 'a' }];
    const f1 = frame(0.25, f0.aircraft, [missile('m', { pos: [100, 6000, -100] })]);
    f1.sams = f0.sams;
    f1.samMissiles = [{ id: 'sm', type: 'sa11', side: 'red', pos: [5000, 50, -30000], guided: true, alive: true, siteId: 's', targetId: 'a' }];
    const f2 = frame(0.5, [f0.aircraft[0], { ...f0.aircraft[1], alive: false }], [missile('m', { alive: false })]);
    const events: SimEvent[] = [
      { t: 0.1, type: 'launch', missileId: 'm', shooterId: 'a', targetId: 'b', missile: 'aim120c', range: 30000, radarMode: 'tws' },
      { t: 0.2, type: 'cm', ownerId: 'b', what: 'chaff' },
      { t: 0.25, type: 'pitbull', missileId: 'm', targetId: 'b' } as SimEvent,
      { t: 0.3, type: 'sam', siteId: 's', what: 'launch', targetId: 'a', missileId: 'sm' },
      { t: 0.35, type: 'datalink-lost', missileId: 'm', why: 'test' } as SimEvent,
      { t: 0.45, type: 'hit', missileId: 'm', targetId: 'b' },
      { t: 0.45, type: 'kill', targetId: 'b', by: 'a' },
      { t: 0.6, type: 'miss', missileId: 'sm', reason: 'timeout' } as SimEvent,
    ];
    expect(exportAcmi([f0, f1, f2], { title: 'BVR', callsigns: { a: 'Eagle 1' }, events })).toMatchInlineSnapshot(`
      "﻿FileType=text/acmi/tacview
      FileVersion=2.2
      0,ReferenceTime=2000-01-01T00:00:00Z
      0,DataSource=Fox3 Academy,DataRecorder=Fox3 Academy
      0,Title=BVR
      0,ReferenceLongitude=0,ReferenceLatitude=0
      0,Comments=Simplified trainer whole-fight truth. Synthetic origin 0N 0E and date 2000-01-01. Native coordinates are east and north metres. Objects are sampled every 0.25 s; events retain their recorded times. No DCS terrain or sensor picture.
      #0
      1,T=0.00089832|-0.00179663|6000|-11.459|2.865|17.189|100|-200|17.189,Name=F-15C,Type=Air+FixedWing,Coalition=Blue,Color=Blue,CallSign=Eagle 1
      2,T=0|0.35932611|7000|0|0|180|0|40000|180,Name=Su-27,Type=Air+FixedWing,Coalition=Red,Color=Red
      4,T=0.04491576|0.26949459|0|5000|30000,Name=SA-11 Gadfly,Type=Ground+AntiAircraft,Coalition=Red,Color=Red
      #0.1
      0,Event=Message|1|AIM-120C launched
      #0.25
      1,T=0.00089832|-0.00179663|6000|-11.459|2.865|17.189|100|-200|17.189
      2,T=0|0.35932611|7000|0|0|180|0|40000|180
      3,T=0.00089832|0.00089832|6000|100|100,Name=AIM-120C,Type=Weapon+Missile,Coalition=Blue,Color=Blue,Parent=1
      4,T=0.04491576|0.26949459|0|5000|30000
      5,T=0.04491576|0.26949459|50|5000|30000,Name=SA-11 Gadfly missile,Type=Weapon+Missile,Coalition=Red,Color=Red,Parent=4
      0,Event=Message|3|Missile active
      #0.3
      0,Event=Message|4|1|SAM launch
      #0.35
      0,Event=Message|3|Datalink lost: test
      #0.45
      0,Event=Message|3|2|Missile hit
      -3
      0,Event=Message|2|Aircraft destroyed
      -2
      #0.5
      -4
      -5
      1,T=0.00089832|-0.00179663|6000|-11.459|2.865|17.189|100|-200|17.189
      #0.6
      0,Event=Message|Missile ended: timeout
      "
    `);
  });

  it('exports ground units, A-G weapons, smoke marks, kills and JTAC notes with documented tags and events', () => {
    type Gu = NonNullable<RecordFrame['groundUnits']>[number];
    const unit = (id: string, kind: Gu['kind'], alive = true): Gu => ({ id, kind, side: 'red', pos: [0, 0, -8000], heading: Math.PI / 2, alive });
    const jet = aircraft('a', { type: 'su25t' });
    const f0 = frame(0, [jet]);
    f0.groundUnits = [unit('g1', 'tank'), unit('g2', 'truck'), { ...unit('jt', 'apc'), side: 'blue', pos: [0, 0, -2000] }];
    f0.marks = [{ id: 'k', type: 'smoke', colour: 'white', side: 'blue', pos: [0, 0, -7900], alive: true }, { id: 'l', type: 'laser', colour: null, side: 'blue', pos: [0, 0, -8000], alive: true }];
    const f1 = frame(0.25, [jet]);
    f1.groundUnits = f0.groundUnits;
    f1.marks = f0.marks;
    f1.agWeapons = [
      { id: 'w', type: 'kh29l', side: 'blue', shooterId: 'a', targetId: 'g1', pos: [0, 4000, -1000], guided: true, alive: true },
      { id: 'r', type: 's8', side: 'blue', shooterId: 'a', targetId: null, pos: [0, 4000, -1000], guided: false, alive: true },
      { id: 'c', type: 'gun25t', side: 'blue', shooterId: 'a', targetId: null, pos: [0, 4000, -1000], guided: false, alive: true },
    ];
    const f2 = frame(0.5, [jet]);
    f2.groundUnits = [unit('g1', 'tank', false), unit('g2', 'truck', false), f0.groundUnits[2]];
    f2.marks = f0.marks;
    const f3 = frame(0.75, [jet]);
    f3.groundUnits = f2.groundUnits;
    // Still sampled after its end event: the ended smoke must not respawn.
    f3.marks = f0.marks;
    const events: SimEvent[] = [
      { t: 0, type: 'mark', markId: 'k', mark: 'smoke', what: 'on', ownerId: 'jt' },
      { t: 0, type: 'note', text: 'Two, type 2, bomb on target, smoke, white' },
      { t: 0.2, type: 'ag-launch', weaponId: 'w', shooterId: 'a', targetId: 'g1', weapon: 'kh29l', range: 7000 },
      { t: 0.2, type: 'ag-launch', weaponId: 'c', shooterId: 'a', targetId: null, weapon: 'gun25t', range: null },
      { t: 0.4, type: 'ag-impact', weaponId: 'w', weapon: 'kh29l', targetId: 'g1', pos: [0, 0, -8000], killed: ['g1'] },
      { t: 0.4, type: 'ground-kill', targetId: 'g1', by: 'a', weapon: 'kh29l' },
      { t: 0.45, type: 'ag-miss', weaponId: 'r', weapon: 's8', reason: 'ground' },
      { t: 0.7, type: 'mark', markId: 'k', mark: 'smoke', what: 'off', ownerId: 'jt' },
      { t: 0.8, type: 'mark', markId: 'l', mark: 'laser', what: 'on', ownerId: 'jt' },
    ];
    const out = exportAcmi([f0, f1, f2, f3], { events });
    // IDs: a=1, g1=2, g2=3, jt=4, k=5, r=6, w=7. Cannon rounds and laser spots are not objects and take no ID.
    expect(out).toContain('2,T=0|0.07186522|0|0|0|90|0|8000|90,Name=Tank,Type=Ground+Heavy+Armor+Vehicle+Tank,Coalition=Red,Color=Red');
    expect(out).toContain('Name=Truck,Type=Ground+Light+Vehicle');
    expect(out).toContain('Name=APC,Type=Ground+Armor+Vehicle,Coalition=Blue');
    expect(out).toContain('5,T=0|0.07096691|0|0|7900,Name=White smoke,Type=Misc+Decoy+SmokeGrenade,Coalition=Blue');
    expect(out).not.toContain('Name=Laser');
    expect(out).toContain('Coalition=Blue,Color=Blue\n0,Event=Message|5|4|White smoke mark on\n0,Event=Message|Two\\, type 2\\, bomb on target\\, smoke\\, white');
    expect(out).toContain('7,T=0|0.00898315|4000|0|1000,Name=Kh-29L,Type=Weapon+Missile,Coalition=Blue,Color=Blue,Parent=1');
    expect(out).toContain('6,T=0|0.00898315|4000|0|1000,Name=S-8,Type=Weapon+Rocket,Coalition=Blue,Color=Blue,Parent=1');
    expect(out).not.toMatch(/30 mm cannon/);
    expect(out).toContain('#0.2\n0,Event=Message|1|2|Kh-29L launched\n#0.25');
    expect(out).toContain('#0.4\n0,Event=Message|7|2|Kh-29L impact\n-7\n0,Event=Message|2|1|Tank destroyed by Kh-29L\n0,Event=Destroyed|2\n-2\n');
    expect(out).toContain('#0.45\n0,Event=Message|6|S-8 missed: ground\n-6\n');
    // No kill event for the truck: its recorded death still gives a Destroyed event at the next sample.
    expect(out).toContain('#0.5\n0,Event=Destroyed|3\n-3\n1,T=');
    expect(out).toContain('#0.7\n0,Event=Message|5|4|White smoke mark off\n-5\n#0.75\n1,T=');
    expect(out).toContain('#0.8\n0,Event=Message|4|Laser mark on\n');
    const { removed } = read(out);
    expect(removed.filter(r => r.id === '2')).toEqual([{ id: '2', t: 0.4 }]);
    expect(removed.filter(r => r.id === '5')).toEqual([{ id: '5', t: 0.7 }]);
    expect(out.split('Name=Tank').length).toBe(2);
    expect(out.split('Name=White smoke').length).toBe(2);
  });

  it('lets a ground kill at a sample time reference the unit and keeps a killed SAM site removed', () => {
    const f0 = frame(0);
    f0.sams = [{ id: 's', type: 'sa11', side: 'red', pos: [0, 0, -5000], state: 'off', active: false, targetId: null }];
    f0.groundUnits = [{ id: 'g', kind: 'aaa', side: 'red', pos: [0, 0, -4000], heading: 0, alive: true }];
    const f1 = { ...frame(0.25), sams: f0.sams, groundUnits: [{ ...f0.groundUnits[0], alive: false }] };
    const f2 = { ...frame(0.5), sams: f0.sams, groundUnits: f1.groundUnits };
    const events: SimEvent[] = [
      { t: 0.25, type: 'ground-kill', targetId: 'g', by: null, weapon: 'gun25t' },
      { t: 0.3, type: 'ground-kill', targetId: 's', by: null, weapon: 'kh58' },
    ];
    const out = exportAcmi([f0, f1, f2], { events });
    expect(out).toContain('Name=AAA,Type=Ground+AntiAircraft');
    expect(out).toContain('#0.25\n2,T=0|0.04491576|0|0|5000\n0,Event=Message|1|AAA destroyed by 30 mm cannon\n0,Event=Destroyed|1\n-1\n');
    expect(out).toContain('#0.3\n0,Event=Message|2|SA-11 Gadfly destroyed by Kh-58\n0,Event=Destroyed|2\n-2\n#0.5\n');
    expect(out.trimEnd().endsWith('#0.5')).toBe(true);
    expect(out.split('Name=SA-11').length).toBe(2);
  });

  it('exports a live Su-25T strike recording with ground units and A-G weapons', () => {
    const world = new World(3);
    const events: SimEvent[] = [];
    world.on(e => events.push(e));
    world.spawnGroundUnit({ id: 't', kind: 'tank', side: 'red', pos: { x: 0, z: -6000 } });
    world.spawnAircraft({ id: 'a', type: 'su25t', side: 'blue', controller: 'player', pos: { x: 0, y: 3000, z: 0 }, heading: 0, speed: 200 });
    world.step(1);
    const out = exportAcmi(world.recording, { events });
    expect(out).toContain('Name=Tank,Type=Ground+Heavy+Armor+Vehicle+Tank');
    expect(read(out).positions.size).toBe(2);
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
