import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DcsLink, PING_TIMEOUT_MS, STALE_AFTER_MS, type EventSourceLike, type LinkEvent } from './client';
import { parseBridgeStatus, parseDcsMessage } from './protocol';

describe('DCS link protocol', () => {
  it('keeps known, well-typed frame fields only', () => {
    const f = parseDcsMessage({
      v: 1, type: 'frame', seq: 5, t: 10.5, script: '0.1.0', allow: { ownship: true, sensor: false },
      self: { name: 'Su-27', lat: 41.5, lon: 'x', hdg: 1.2, extra: 1 }, ias: 200, mach: null, aoa: Infinity, acc: { y: 1.1 }, junk: 'x',
    });
    expect(f).toEqual({
      type: 'frame', seq: 5, t: 10.5, script: '0.1.0', allow: { ownship: true, sensor: false, object: null },
      self: { name: 'Su-27', lat: 41.5, hdg: 1.2 }, ias: 200, acc: { y: 1.1 },
    });
  });

  it('rejects other versions and malformed messages', () => {
    for (const bad of [null, [], 'x', { type: 'frame', seq: 1 }, { v: 2, type: 'frame', seq: 1 }, { v: 1, type: 'frame' }, { v: 1, type: 'pong' }, { v: 1, type: 'pong', id: 1.5 }, { v: 1, type: 'nope' }]) {
      expect(parseDcsMessage(bad)).toBeNull();
    }
    expect(parseDcsMessage({ v: 1, type: 'pong', id: 3, t: 2 })).toEqual({ type: 'pong', id: 3, t: 2 });
    expect(parseDcsMessage({ v: 1, type: 'bye' })).toEqual({ type: 'bye' });
  });

  it('parses systems, cockpit args and indicator strings defensively', () => {
    const f = parseDcsMessage({
      v: 1, type: 'frame', seq: 1, allow: {},
      mech: { gear: 1, flaps: 'x', hook: 0 }, engine: { fuelInt: 2000, ffL: 0.2 }, cm: { chaff: 30 },
      mcp: { MasterWarning: true, CanopyOpen: false, 'bad key!': true },
      args: { a226: 0, a234: -1, a13: 1, b5: 1, a12345: 1, a7: 'x' },
      ind: { bingo: '2500', fuelUp: ' 10800T'.padEnd(40, 'x'), 'bad-key': 'x', n: 5 },
    });
    expect(f).toMatchObject({
      mech: { gear: 1, hook: 0 }, engine: { fuelInt: 2000, ffL: 0.2 }, cm: { chaff: 30 }, mcp: ['MasterWarning'],
      args: { 226: 0, 234: -1, 13: 1 }, ind: { bingo: '2500', fuelUp: ' 10800Txxxxxxxxx' },
    });
    expect(f && 'mech' in f && f.mech).not.toHaveProperty('flaps');
    expect(f && 'args' in f && Object.keys(f.args!)).toEqual(['13', '226', '234']);
    expect(f && 'ind' in f && Object.keys(f.ind!)).toEqual(['bingo', 'fuelUp']);
  });

  it('parses RWR emitters, radar targets and stores; an empty Lua list arrives as {}', () => {
    const f = parseDcsMessage({
      v: 1, type: 'frame', seq: 1, allow: { sensor: true },
      self: { name: 'FA-18C_hornet', x: 1, y: 2, z: 3 },
      rwr: { mode: 0, emitters: [{ id: 5, name: 'Su-27', signal: 'lock', az: 1.2, power: 0.8, prio: 150, junk: 1 }, 'bad'] },
      lock: [{ id: 5, name: 'Su-27', dist: 40000, closure: 450, flags: 8, jam: false, pos: { x: 1, y: 2, z: 'x' }, vel: { x: -250 } }],
      tracks: {},
      stores: { counts: { 'AIM-120C': 2, bad: 'x' }, sel: 'AIM-120C', gun: 578 },
    });
    expect(f).toMatchObject({
      self: { x: 1, y: 2, z: 3 },
      rwr: { mode: 0, emitters: [{ id: 5, name: 'Su-27', signal: 'lock', az: 1.2, power: 0.8, prio: 150 }] },
      lock: [{ id: 5, name: 'Su-27', dist: 40000, closure: 450, flags: 8, pos: { x: 1, y: 2 }, vel: { x: -250 } }],
      tracks: [], stores: { counts: { 'AIM-120C': 2 }, sel: 'AIM-120C', gun: 578 },
    });
    expect(f && 'lock' in f && f.lock![0]).not.toHaveProperty('jam');
    expect(parseDcsMessage({ v: 1, type: 'frame', seq: 1, allow: {}, tracks: 'x', rwr: 5 })).not.toHaveProperty('tracks');
  });

  it('parses bridge status', () => {
    expect(parseBridgeStatus({ v: 1, type: 'status', bridge: '0.1.0', dcs: { packets: 4, rejected: 0, lastPacketAgeMs: null, script: null }, commands: 1, clients: 1 }))
      .toEqual({ bridge: '0.1.0', dcs: { packets: 4, rejected: 0, lastPacketAgeMs: null, script: null }, commands: 1, clients: 1 });
    expect(parseBridgeStatus({ v: 1, type: 'frame' })).toBeNull();
  });
});

class FakeSource implements EventSourceLike {
  readyState = 0;
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  private handlers = new Map<string, (e: MessageEvent) => void>();
  constructor(readonly url: string) {}
  addEventListener(type: string, fn: (e: MessageEvent) => void) { this.handlers.set(type, fn); }
  close() { this.closed = true; this.readyState = 2; }
  open() { this.readyState = 1; this.onopen?.(new Event('open')); }
  fail(closed = false) { this.readyState = closed ? 2 : 0; this.onerror?.(new Event('error')); }
  emit(type: string, data: unknown) { this.handlers.get(type)?.({ data: JSON.stringify(data) } as MessageEvent); }
}

describe('DcsLink client', () => {
  let t = 0;
  let sources: FakeSource[];
  let posts: { url: string; body: unknown }[];
  let events: LinkEvent[];
  let link: DcsLink;
  const frame = (seq: number) => ({ v: 1, type: 'frame', seq, script: '0.1.0', allow: { ownship: true }, ias: 150 });

  beforeEach(() => {
    vi.useFakeTimers();
    t = 0;
    sources = [];
    posts = [];
    events = [];
    link = new DcsLink({
      base: 'http://bridge',
      now: () => t,
      eventSource: url => { const s = new FakeSource(url); sources.push(s); return s; },
      fetch: (async (url: string, init?: RequestInit) => {
        posts.push({ url, body: JSON.parse(String(init?.body)) });
        return new Response(null, { status: 202 });
      }) as typeof fetch,
    });
    link.on(e => events.push(e));
  });
  afterEach(() => { link.stop(); vi.useRealTimers(); });

  it('goes connecting, down, up, then live on frames', () => {
    link.start();
    expect(sources[0]!.url).toBe('http://bridge/events');
    expect(link.snapshot().bridge).toBe('connecting');
    sources[0]!.fail();
    expect(link.snapshot().bridge).toBe('down');
    sources[0]!.open();
    expect(link.snapshot()).toMatchObject({ bridge: 'up', dcs: 'none', frames: 0 });
    for (let i = 1; i <= 10; i++) { t += 100; sources[0]!.emit('dcs', frame(i)); }
    expect(link.snapshot()).toMatchObject({ dcs: 'live', frames: 10, rateHz: 5, script: '0.1.0', lastFrameAgeMs: 0 });
    expect(link.snapshot().frame?.ias).toBe(150);
    t += STALE_AFTER_MS + 1;
    link.tick();
    expect(link.snapshot().dcs).toBe('stale');
    sources[0]!.emit('dcs', { v: 1, type: 'bye' });
    expect(link.snapshot().dcs).toBe('stopped');
    expect(events.map(e => e.kind === 'bridge' || e.kind === 'dcs' ? `${e.kind}:${e.state}` : e.kind))
      .toEqual(['bridge:connecting', 'bridge:down', 'bridge:up', 'dcs:live', 'dcs:stale', 'bye', 'dcs:stopped']);
  });

  it('ignores malformed DCS messages and keeps bridge status', () => {
    link.start();
    sources[0]!.open();
    sources[0]!.emit('dcs', { v: 1, type: 'frame' });
    sources[0]!.emit('status', { v: 1, type: 'status', bridge: '0.1.0', dcs: { packets: 0 } });
    expect(link.snapshot()).toMatchObject({ frames: 0, dcs: 'none', status: { bridge: '0.1.0' } });
  });

  it('measures a ping round trip and counts lost pings', async () => {
    link.start();
    await link.ping();
    expect(events.at(-1)).toEqual({ kind: 'error', message: 'No bridge connection. Start the bridge first.' });
    expect(link.snapshot().pings.sent).toBe(0);

    sources[0]!.open();
    await link.ping();
    expect(posts).toEqual([{ url: 'http://bridge/command', body: { type: 'ping', id: 1 } }]);
    t += 25;
    sources[0]!.emit('dcs', { v: 1, type: 'pong', id: 1, t: 3 });
    expect(events.at(-1)).toEqual({ kind: 'pong', id: 1, rttMs: 25, t: 3 });

    await link.ping();
    t += PING_TIMEOUT_MS + 1;
    link.tick();
    expect(events.at(-1)).toEqual({ kind: 'ping-lost', id: 2 });
    sources[0]!.emit('dcs', { v: 1, type: 'pong', id: 2 }); // late: already lost
    expect(link.snapshot().pings).toEqual({ sent: 2, answered: 1, lost: 1, lastRttMs: 25, pending: 0 });
  });

  it('counts a ping the bridge refuses as lost', async () => {
    link = new DcsLink({
      base: 'http://bridge', now: () => t,
      eventSource: url => { const s = new FakeSource(url); sources.push(s); return s; },
      fetch: (async () => new Response(null, { status: 403 })) as unknown as typeof fetch,
    });
    link.on(e => events.push(e));
    link.start();
    sources[0]!.open();
    await link.ping();
    expect(link.snapshot().pings).toMatchObject({ sent: 1, lost: 1, pending: 0 });
    expect(events.at(-1)).toMatchObject({ kind: 'error' });
  });

  it('reopens the stream when the browser gives up, and stop closes everything', () => {
    link.start();
    sources[0]!.fail(true);
    expect(sources[0]!.closed).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(sources).toHaveLength(2);
    link.stop();
    expect(sources[1]!.closed).toBe(true);
    expect(link.snapshot()).toMatchObject({ bridge: 'off', dcs: 'none', status: null });
    vi.advanceTimersByTime(10_000);
    expect(sources).toHaveLength(2);
  });
});
