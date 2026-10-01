/**
 * DcsLink: the page's connection to the DCS link bridge (dcs-link/bridge.ts). Server-Sent Events bring DCS
 * messages and bridge status down; POST /command sends test commands up. The browser's EventSource
 * reconnects by itself, so the link survives the bridge or DCS starting later. Spec: docs/api/dcs-link.md.
 *
 *   const link = new DcsLink();
 *   const off = link.on(e => log(e));
 *   link.start(); ... link.snapshot() at ~10 Hz ... link.ping();
 *   link.stop(); off();
 */
import { BRIDGE_URL, parseBridgeStatus, parseDcsMessage, parseJson, type BridgeStatus, type DcsFrame } from './protocol';

/** off: not started. connecting: first attempt. up: event stream open. down: no bridge, retrying. */
export type BridgeState = 'off' | 'connecting' | 'up' | 'down';
/** none: no DCS message yet. live: frames arriving. stale: frames stopped. stopped: the mission ended (bye). */
export type DcsState = 'none' | 'live' | 'stale' | 'stopped';

export interface PingStats { sent: number; answered: number; lost: number; lastRttMs: number | null; pending: number }

export interface LinkSnapshot {
  bridge: BridgeState;
  dcs: DcsState;
  status: BridgeStatus | null;
  frame: DcsFrame | null;
  frames: number;
  /** Frames per second over the last two seconds. */
  rateHz: number;
  lastFrameAgeMs: number | null;
  script: string | null;
  pings: PingStats;
}

export type LinkEvent =
  | { kind: 'bridge'; state: BridgeState }
  | { kind: 'dcs'; state: DcsState }
  | { kind: 'hello' | 'bye'; script?: string }
  | { kind: 'ping'; id: number }
  | { kind: 'pong'; id: number; rttMs: number; t?: number }
  | { kind: 'ping-lost'; id: number }
  | { kind: 'error'; message: string };

/** The part of EventSource the link uses (tests pass a fake). */
export interface EventSourceLike {
  readonly readyState: number;
  onopen: ((e: Event) => void) | null;
  onerror: ((e: Event) => void) | null;
  addEventListener(type: string, fn: (e: MessageEvent) => void): void;
  close(): void;
}

export interface DcsLinkOptions {
  base?: string;
  eventSource?: (url: string) => EventSourceLike;
  fetch?: typeof fetch;
  now?: () => number;
}

export const STALE_AFTER_MS = 2000;
export const PING_TIMEOUT_MS = 3000;
const RATE_WINDOW_MS = 2000;
const CLOSED_RETRY_MS = 5000;
const TICK_MS = 250;
const ES_CLOSED = 2;

export class DcsLink {
  private readonly base: string;
  private readonly makeSource: (url: string) => EventSourceLike;
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;
  private readonly listeners = new Set<(e: LinkEvent) => void>();
  private source: EventSourceLike | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private bridge: BridgeState = 'off';
  private dcs: DcsState = 'none';
  private status: BridgeStatus | null = null;
  private frame: DcsFrame | null = null;
  private frames = 0;
  private frameTimes: number[] = [];
  private lastFrameAt: number | null = null;
  private script: string | null = null;
  private pingId = 0;
  private pending = new Map<number, number>();
  private pingStats = { sent: 0, answered: 0, lost: 0, lastRttMs: null as number | null };

  constructor(opts: DcsLinkOptions = {}) {
    this.base = (opts.base ?? BRIDGE_URL).replace(/\/$/, '');
    this.makeSource = opts.eventSource ?? (url => new EventSource(url));
    this.doFetch = opts.fetch ?? ((input, init) => fetch(input, init));
    this.now = opts.now ?? (() => performance.now());
  }

  on(fn: (e: LinkEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get running(): boolean { return this.bridge !== 'off'; }

  start(): void {
    if (this.running) return;
    this.setBridge('connecting');
    this.open();
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (!this.running) return;
    this.source?.close();
    this.source = null;
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.tickTimer = this.retryTimer = null;
    this.pending.clear();
    this.setBridge('off');
    this.setDcs('none');
    this.status = null;
  }

  /** Send a ping through the bridge to the export script; the pong event carries the round trip. */
  async ping(): Promise<void> {
    if (this.bridge !== 'up') {
      this.emit({ kind: 'error', message: 'No bridge connection. Start the bridge first.' });
      return;
    }
    const id = ++this.pingId;
    this.pending.set(id, this.now());
    this.pingStats.sent++;
    this.emit({ kind: 'ping', id });
    try {
      const res = await this.doFetch(this.base + '/command', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'ping', id }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (e) {
      if (this.pending.delete(id)) this.pingStats.lost++;
      this.emit({ kind: 'error', message: `The bridge did not take ping ${id} (${(e as Error).message}).` });
    }
  }

  snapshot(): LinkSnapshot {
    const now = this.now();
    while (this.frameTimes.length && now - this.frameTimes[0]! > RATE_WINDOW_MS) this.frameTimes.shift();
    return {
      bridge: this.bridge,
      dcs: this.dcs,
      status: this.status,
      frame: this.frame,
      frames: this.frames,
      rateHz: this.frameTimes.length / (RATE_WINDOW_MS / 1000),
      lastFrameAgeMs: this.lastFrameAt === null ? null : now - this.lastFrameAt,
      script: this.script,
      pings: { ...this.pingStats, pending: this.pending.size },
    };
  }

  /** Staleness and ping timeouts. Runs on a timer; public so tests can drive it. */
  tick(): void {
    const now = this.now();
    if (this.dcs === 'live' && this.lastFrameAt !== null && now - this.lastFrameAt > STALE_AFTER_MS) this.setDcs('stale');
    for (const [id, sentAt] of this.pending) {
      if (now - sentAt > PING_TIMEOUT_MS) {
        this.pending.delete(id);
        this.pingStats.lost++;
        this.emit({ kind: 'ping-lost', id });
      }
    }
  }

  private open(): void {
    const es = this.makeSource(this.base + '/events');
    this.source = es;
    es.onopen = () => { if (this.source === es) this.setBridge('up'); };
    es.onerror = () => {
      if (this.source !== es) return;
      this.setBridge('down');
      this.status = null;
      // CONNECTING: the browser retries by itself. CLOSED: it gave up (the bridge refused us), so retry here.
      if (es.readyState === ES_CLOSED && !this.retryTimer) {
        es.close();
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          if (this.running) this.open();
        }, CLOSED_RETRY_MS);
      }
    };
    es.addEventListener('status', e => {
      const s = parseBridgeStatus(parseJson(e.data));
      if (s) this.status = s;
    });
    es.addEventListener('dcs', e => this.onDcs(parseJson(e.data)));
  }

  private onDcs(raw: unknown): void {
    const msg = parseDcsMessage(raw);
    if (!msg) return;
    if (msg.script) this.script = msg.script;
    const now = this.now();
    switch (msg.type) {
      case 'frame':
        this.frame = msg;
        this.frames++;
        this.frameTimes.push(now);
        this.lastFrameAt = now;
        this.setDcs('live');
        break;
      case 'hello':
        this.emit({ kind: 'hello', script: msg.script });
        break;
      case 'bye':
        this.emit({ kind: 'bye', script: msg.script });
        this.setDcs('stopped');
        break;
      case 'pong': {
        const sentAt = this.pending.get(msg.id);
        if (sentAt === undefined) return; // late (already counted lost) or not ours
        this.pending.delete(msg.id);
        const rttMs = now - sentAt;
        this.pingStats.answered++;
        this.pingStats.lastRttMs = rttMs;
        this.emit({ kind: 'pong', id: msg.id, rttMs, t: msg.t });
        break;
      }
    }
  }

  private setBridge(state: BridgeState): void {
    if (state === this.bridge) return;
    this.bridge = state;
    this.emit({ kind: 'bridge', state });
  }

  private setDcs(state: DcsState): void {
    if (state === this.dcs) return;
    this.dcs = state;
    this.emit({ kind: 'dcs', state });
  }

  private emit(e: LinkEvent): void {
    for (const fn of this.listeners) {
      try { fn(e); } catch (err) { console.error(err); }
    }
  }
}
