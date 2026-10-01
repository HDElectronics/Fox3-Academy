/**
 * Minimal EventSource for Node over node:http, enough for DcsLink (src/dcs/client.ts): named events, onopen,
 * onerror and the browser's reconnect behaviour (retry after the server's retry: value).
 */
import { request, type ClientRequest } from 'node:http';
import type { EventSourceLike } from '../../src/dcs/client';

const CONNECTING = 0, OPEN = 1, CLOSED = 2;

export class NodeEventSource implements EventSourceLike {
  readyState = CONNECTING;
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  private listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  private req: ClientRequest | null = null;
  private retryMs = 2000;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly url: string) { this.connect(); }

  addEventListener(type: string, fn: (e: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  close(): void {
    this.readyState = CLOSED;
    if (this.timer) clearTimeout(this.timer);
    this.req?.destroy();
    this.req = null;
  }

  private connect(): void {
    if (this.readyState === CLOSED) return;
    const u = new URL(this.url);
    let buf = '';
    const req = request({ host: u.hostname, port: u.port, path: u.pathname, headers: { accept: 'text/event-stream' } }, res => {
      if (res.statusCode !== 200) { res.resume(); this.fail(true); return; }
      this.readyState = OPEN;
      this.onopen?.(new Event('open'));
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          this.dispatch(block);
        }
      });
      res.on('end', () => this.fail(false));
      res.on('error', () => this.fail(false));
    });
    req.on('error', () => this.fail(false));
    req.end();
    this.req = req;
  }

  private dispatch(block: string): void {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data.push(line.slice(6));
      else if (line.startsWith('retry: ')) this.retryMs = Number(line.slice(7)) || this.retryMs;
    }
    if (!data.length) return;
    const e = { data: data.join('\n') } as MessageEvent;
    for (const fn of this.listeners.get(event) ?? []) fn(e);
  }

  /** closed: the server refused the stream (like a browser, give up and let the owner retry). */
  private fail(closed: boolean): void {
    if (this.readyState === CLOSED) return;
    this.req?.destroy();
    this.req = null;
    this.readyState = closed ? CLOSED : CONNECTING;
    this.onerror?.(new Event('error'));
    if (!closed) this.timer = setTimeout(() => this.connect(), this.retryMs);
  }
}
