// DCS MCP server end to end without DCS: a real bridge on free ports, recorded F/A-18C frames sent as the export
// script would, the copilot monitor, and the MCP SDK client calling the tools in-process.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSocket, type Socket } from 'node:dgram';
import { fileURLToPath } from 'node:url';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createBridge, type Bridge } from '../dcs-link/bridge';
import { NodeEventSource } from '../dcs-link/mcp/nodeEventSource';
import { loadNotes, search, splitSections } from '../dcs-link/mcp/notes';
import { createDcsServer, r } from '../dcs-link/mcp/tools';
import { DcsLink } from '../src/dcs/client';
import { CopilotMonitor } from '../src/copilot/monitor';
import fixture from '../src/copilot/fixtures/hornet-flight.json';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function until(cond: () => boolean, ms = 3000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 20));
  }
}

describe('report rounding', () => {
  it('rounds to decimals, tens and hundreds', () => {
    expect([r(12.345, 1), r(12.5), r(9216, -1), r(9216, -2), r(undefined)]).toEqual([12.3, 13, 9220, 9200, undefined]);
  });
});

describe('research notes search', () => {
  it('splits by heading and ranks sections that match more query words', () => {
    const s = splitSections('x.md', '# T\nintro\n## Bingo\nSet BINGO on the IFEI.\n## Case I\nBreak at 800 ft.\n');
    expect(s.map(x => x.heading)).toEqual(['T', 'Bingo', 'Case I']);
    expect(search(s, 'how do I set bingo')[0]!.heading).toBe('Bingo');
    expect(search(s, 'zzz')).toEqual([]);
  });

  it('finds sourced Hornet facts in the real notes', () => {
    const notes = loadNotes(ROOT);
    expect(notes.length).toBeGreaterThan(100);
    const hit = search(notes, 'ALR-67 CW light')[0]!;
    expect(hit.text).toMatch(/CW/);
    expect(search(notes, 'on speed AoA indexer Hornet').some(h => /8\.1/.test(h.text))).toBe(true);
    const bingo = search(notes, 'Hornet bingo IFEI')[0]!;
    expect(bingo.file).toBe('docs/research/fa18c-copilot.md');
    expect(bingo.heading).toMatch(/Fuel/);
  });
});

describe('fox3-dcs MCP server', () => {
  let bridge: Bridge;
  let dcs: Socket;
  let link: DcsLink;
  let client: Client;
  let fromDcs: number;
  const monitor = new CopilotMonitor();
  let t = 0;

  const send = (frame: Record<string, unknown>) => new Promise<void>(r => dcs.send(JSON.stringify({ v: 1, script: '0.5.0', ...frame }), fromDcs, '127.0.0.1', () => r()));
  // Fixture args are keyed by number; the export script sends a<number>.
  const fixtureFrame = (time: number) => {
    const f = fixture.snapshots.find(s => s.t === time)!.frame;
    return { ...f, self: { ...f.self, hdg: 4.71, pitch: 0, bank: 0 }, ias: 160, altMsl: 7000, altAgl: 6950, aoa: 4, acc: { y: 1 },
      ind: { fuelUp: ' 9200T', fuelDown: ' 9200I', bingo: '0' }, args: Object.fromEntries(Object.entries(f.args).map(([k, v]) => [`a${k}`, v])) };
  };
  const step = async (time: number) => {
    const before = link.snapshot().frames;
    await send(fixtureFrame(time));
    await until(() => link.snapshot().frames > before);
    t += 1;
    monitor.update(link.snapshot(), t);
  };
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    return JSON.parse((res.content as { text: string }[])[0]!.text);
  };

  beforeAll(async () => {
    dcs = createSocket('udp4');
    await new Promise<void>(r => dcs.bind(0, '127.0.0.1', () => r()));
    bridge = createBridge({ httpPort: 0, fromDcsPort: 0, toDcsPort: (dcs.address() as { port: number }).port, log: () => {} });
    const ports = await bridge.start();
    fromDcs = ports.fromDcs;
    link = new DcsLink({ base: `http://127.0.0.1:${ports.http}`, eventSource: url => new NodeEventSource(url) });
    link.start();
    await until(() => link.snapshot().bridge === 'up');
    const server = createDcsServer({ snapshot: () => link.snapshot(), monitor, notes: loadNotes(ROOT) });
    const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
    await server.connect(serverEnd);
    client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(clientEnd);
  });

  afterAll(async () => {
    await client?.close();
    link?.stop();
    await bridge?.stop();
    await new Promise<void>(r => dcs.close(() => r()));
  });

  it('lists read-only tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map(x => x.name).sort()).toEqual(['cockpit_switches', 'copilot_alerts', 'dcs_status', 'flight_state', 'fuel_state', 'radar_lock', 'search_notes', 'threats', 'weapons']);
    expect(tools.every(x => x.annotations?.readOnlyHint === true)).toBe(true);
  });

  it('says when there is no DCS data yet', async () => {
    expect(await call('flight_state')).toEqual({ available: false, reason: 'No live data from DCS.' });
    expect(await call('dcs_status')).toMatchObject({ bridge: 'connected', dcs: 'no data yet' });
  });

  it('answers from live Hornet frames: lock, threats, fuel, weapons, alerts', async () => {
    await step(31.1);
    expect(await call('dcs_status')).toMatchObject({ dcs: 'live', aircraft: 'FA-18C_hornet', exportScript: '0.5.0' });
    expect(await call('radar_lock')).toMatchObject({ locked: true, rangeNm: 31.3, closureKt: 870, inLar: false, targetAltitudeFt: 19000 });
    expect(await call('flight_state')).toMatchObject({ aircraft: 'FA-18C_hornet', iasKt: 311, aoaDeg: 4, headingDeg: 270 });
    expect(await call('fuel_state')).toMatchObject({ fuelLb: 9200, source: 'IFEI total', bingoFrom: 'copilot setting (IFEI BINGO not set)' });
    expect(await call('weapons')).toMatchObject({ stores: { 'AIM-120C': 4 } });

    await step(87.1);
    expect(await call('radar_lock')).toMatchObject({ inLar: true, rangeNm: 19.2 });
    await step(165.6);
    expect(await call('threats')).toMatchObject({ lights: { ai: true, cw: false }, threats: [{ rwrSymbol: '29', lockedOnUs: true }] });
    await step(167.7);
    const alerts = await call('copilot_alerts');
    expect(alerts.active[0]).toMatchObject({ severity: 'warning' });
    expect(alerts.recentCalls.map((c: { text: string }) => c.text)).toEqual(expect.arrayContaining(['IN LAR', 'LOCK LOST']));
    expect(await call('cockpit_switches')).toMatchObject({ switches: { masterArm: 'ARM' } });
  });

  it('searches the notes and reports bad input as a tool error', async () => {
    const hits = await call('search_notes', { query: 'Case I break carrier', limit: 2 });
    expect(hits).toHaveLength(2);
    expect(hits[0]).toHaveProperty('file');
    const bad = await client.callTool({ name: 'search_notes', arguments: { query: 'x' } });
    expect(bad.isError).toBe(true);
  });
});
