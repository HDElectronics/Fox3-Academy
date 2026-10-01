// DCS link bridge: real loopback sockets on free ports, a fake export script on UDP, the page side over HTTP.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSocket, type Socket } from 'node:dgram';
import { request, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import {
  createBridge, commandLine, DEFAULT_ORIGINS, DEFAULT_PORTS, hostAllowed, originAllowed, parseArgs, parseCommand, parseDatagram,
  type Bridge,
} from '../dcs-link/bridge';
import { FAKE_PORTS, fakeFrame } from '../dcs-link/fake-dcs';
import { BRIDGE_URL, DCS_LINK_PORTS, parseDcsMessage } from '../src/dcs/protocol';

const HOST = '127.0.0.1';

describe('bridge input validation', () => {
  it('accepts only known commands', () => {
    expect(parseCommand({ type: 'ping', id: 7 })).toEqual({ type: 'ping', id: 7 });
    expect(commandLine({ type: 'ping', id: 7 })).toBe('ping 7');
    for (const bad of [null, 'ping', { type: 'ping' }, { type: 'ping', id: -1 }, { type: 'ping', id: 1.5 }, { type: 'ping', id: 2 ** 31 }, { type: 'setCommand', id: 1 }]) {
      expect(parseCommand(bad)).toBeNull();
    }
  });

  it('accepts only protocol-v1 JSON objects from DCS', () => {
    expect(parseDatagram(Buffer.from('{"v":1,"type":"frame","seq":1}'))).toEqual({ v: 1, type: 'frame', seq: 1 });
    for (const bad of ['', 'ping 1', '[1]', '{"type":"frame"}', '{"v":2,"type":"frame"}', '{"v":1}', 'x'.repeat(9000)]) {
      expect(parseDatagram(Buffer.from(bad))).toBeNull();
    }
  });

  it('allows the public site, its previews and local dev servers only', () => {
    for (const ok of ['https://fox3-academy.pages.dev', 'https://feat-dcs-link.fox3-academy.pages.dev', 'http://localhost:5173', 'http://127.0.0.1:5190']) {
      expect(originAllowed(ok, DEFAULT_ORIGINS), ok).toBe(true);
    }
    for (const bad of ['null', 'https://evil.example', 'https://fox3-academy.pages.dev.evil.example', 'http://fox3-academy.pages.dev', 'https://a.b.fox3-academy.pages.dev', 'http://localhost.evil.example']) {
      expect(originAllowed(bad, DEFAULT_ORIGINS), bad).toBe(false);
    }
    expect(hostAllowed('127.0.0.1:47780')).toBe(true);
    expect(hostAllowed('localhost:47780')).toBe(true);
    expect(hostAllowed('evil.example:47780')).toBe(false);
    expect(hostAllowed(undefined)).toBe(false);
  });

  it('parses command-line options', () => {
    expect(parseArgs(['--http-port', '5000', '--allow-origin', 'null']).httpPort).toBe(5000);
    expect(parseArgs(['--allow-origin', 'null']).origins).toContain('null');
    expect(() => parseArgs(['--http-port', 'x'])).toThrow();
    expect(() => parseArgs(['--nope'])).toThrow();
  });

  it('uses the same ports everywhere: bridge, fake DCS, page, export script and the site CSP', () => {
    expect(DCS_LINK_PORTS).toEqual(DEFAULT_PORTS);
    expect(FAKE_PORTS).toEqual({ fromDcs: DEFAULT_PORTS.fromDcs, toDcs: DEFAULT_PORTS.toDcs });
    const lua = readFileSync(new URL('../dcs-link/Scripts/Fox3Academy/Fox3Link.lua', import.meta.url), 'utf8');
    expect(lua).toMatch(new RegExp(`BRIDGE_PORT = ${DEFAULT_PORTS.fromDcs}\\b`));
    expect(lua).toMatch(new RegExp(`LISTEN_PORT = ${DEFAULT_PORTS.toDcs}\\b`));
    const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
    expect(headers).toMatch(new RegExp(`connect-src [^;]*${BRIDGE_URL.replace(/[.:/]/g, '\\$&')}[ ;]`));
  });

  it('fake DCS frames parse as page messages', () => {
    const f = parseDcsMessage(fakeFrame({ t: 12, seq: 3 }));
    expect(f).toMatchObject({ type: 'frame', seq: 3, t: 12, allow: { ownship: true }, self: { name: 'FA-18C_hornet' }, mech: { gear: 0 }, mcp: [] });
    expect(parseDcsMessage(fakeFrame({ t: 70, seq: 4 }))).toMatchObject({ mech: { gear: 1, flaps: 1, hook: 0 }, engine: { fuelInt: 2720 } });
  });
});

interface Http { status: number; headers: IncomingMessage['headers']; body: string }
function call(port: number, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<Http> {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port, method, path, headers }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

/** Open the event stream and collect parsed events until stop(). */
function events(port: number, origin = 'http://localhost:5173') {
  const got: { event: string; data: unknown }[] = [];
  let buf = '';
  let res: IncomingMessage | null = null;
  const ready = new Promise<IncomingMessage>((resolve, reject) => {
    const req = request({ host: HOST, port, path: '/events', headers: { origin } }, r => {
      res = r;
      r.setEncoding('utf8');
      r.on('data', (chunk: string) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (event && data) got.push({ event, data: JSON.parse(data) });
        }
      });
      resolve(r);
    });
    req.on('error', reject);
    req.end();
  });
  return { got, ready, stop: () => res?.destroy() };
}

async function until(cond: () => boolean, ms = 2000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 10));
  }
}

describe('bridge relay', () => {
  let bridge: Bridge;
  let dcs: Socket;
  let dcsPort: number;
  let ports: { http: number; fromDcs: number };
  const fromBridge: string[] = [];
  const logs: string[] = [];

  beforeEach(async () => {
    fromBridge.length = 0;
    logs.length = 0;
    dcs = createSocket('udp4');
    dcs.on('message', b => fromBridge.push(b.toString('utf8')));
    await new Promise<void>(r => dcs.bind(0, HOST, () => r()));
    dcsPort = (dcs.address() as AddressInfo).port;
    bridge = createBridge({ httpPort: 0, fromDcsPort: 0, toDcsPort: dcsPort, log: l => logs.push(l) });
    ports = await bridge.start();
  });

  afterEach(async () => {
    await bridge.stop();
    await new Promise<void>(r => dcs.close(() => r()));
  });

  const sendFromDcs = (msg: unknown) =>
    new Promise<void>(r => dcs.send(typeof msg === 'string' ? msg : JSON.stringify(msg), ports.fromDcs, HOST, () => r()));

  it('reports status with no DCS yet', async () => {
    const r = await call(ports.http, 'GET', '/status');
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toMatchObject({ v: 1, type: 'status', dcs: { packets: 0, lastPacketAgeMs: null }, clients: 0 });
  });

  it('streams DCS datagrams to the page and counts rejects', async () => {
    const es = events(ports.http);
    const res = await es.ready;
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    await until(() => es.got.some(e => e.event === 'status'));
    await sendFromDcs('not json');
    await sendFromDcs({ v: 1, type: 'frame', seq: 1, script: '0.1.0', ias: 200 });
    await until(() => es.got.some(e => e.event === 'dcs'));
    expect(es.got.find(e => e.event === 'dcs')!.data).toEqual({ v: 1, type: 'frame', seq: 1, script: '0.1.0', ias: 200 });
    expect(bridge.status().dcs).toMatchObject({ packets: 1, rejected: 1, script: '0.1.0' });
    expect(logs.some(l => l.includes('connected (v0.1.0)'))).toBe(true);
    es.stop();
  });

  it('forwards a ping from the page to the export script as a text line', async () => {
    const r = await call(ports.http, 'POST', '/command', { 'content-type': 'application/json', origin: 'https://fox3-academy.pages.dev' }, '{"type":"ping","id":42}');
    expect(r.status).toBe(202);
    expect(r.headers['access-control-allow-origin']).toBe('https://fox3-academy.pages.dev');
    await until(() => fromBridge.length > 0);
    expect(fromBridge).toEqual(['ping 42']);
    expect(bridge.status().commands).toBe(1);
  });

  it('refuses other origins, foreign hosts, unknown commands and simple-request bodies', async () => {
    const json = { 'content-type': 'application/json' };
    expect((await call(ports.http, 'POST', '/command', { ...json, origin: 'https://evil.example' }, '{"type":"ping","id":1}')).status).toBe(403);
    expect((await call(ports.http, 'GET', '/events', { origin: 'null' })).status).toBe(403);
    expect((await call(ports.http, 'GET', '/status', { host: 'evil.example' })).status).toBe(403);
    expect((await call(ports.http, 'POST', '/command', json, '{"type":"shutdown"}')).status).toBe(400);
    expect((await call(ports.http, 'POST', '/command', json, 'nope')).status).toBe(400);
    expect((await call(ports.http, 'POST', '/command', { 'content-type': 'text/plain' }, '{"type":"ping","id":1}')).status).toBe(415);
    expect((await call(ports.http, 'GET', '/nope')).status).toBe(404);
    await new Promise(r => setTimeout(r, 50));
    expect(fromBridge).toEqual([]);
  });

  it('answers the CORS and private-network preflight for allowed pages', async () => {
    const r = await call(ports.http, 'OPTIONS', '/command', {
      origin: 'https://fox3-academy.pages.dev', 'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type', 'access-control-request-private-network': 'true',
    });
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe('https://fox3-academy.pages.dev');
    expect(r.headers['access-control-allow-headers']).toBe('content-type');
    expect(r.headers['access-control-allow-private-network']).toBe('true');
  });
});
