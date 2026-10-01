/**
 * Fox3 Academy DCS link bridge: relays between the DCS export script and the web page, on this computer only.
 *
 *   Fox3Link.lua ──UDP :47781──► bridge ──GET /events (Server-Sent Events)──► page
 *   Fox3Link.lua ◄──UDP :47782── bridge ◄──POST /command (JSON)───────────── page
 *
 * A browser page cannot open UDP sockets, and DCS export scripts cannot easily serve HTTP, so this small
 * process sits between them. No dependencies: `npm run dcs-link` (Node 24 runs the TypeScript directly).
 * Protocol and API: docs/api/dcs-link.md. Options: `--help`.
 *
 * Security: both sockets bind 127.0.0.1. HTTP requests must name a loopback Host (DNS-rebinding guard) and,
 * when a browser sends an Origin, it must be on the allow list; anything else gets 403. Commands are limited
 * to the ones listed in parseCommand().
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createSocket, type Socket } from 'node:dgram';
import type { AddressInfo } from 'node:net';

export const BRIDGE_VERSION = '0.1.0';
export const DEFAULT_PORTS = { http: 47780, fromDcs: 47781, toDcs: 47782 } as const;
/** Pages allowed to use the bridge: the public site, its preview deployments, and local dev servers. */
export const DEFAULT_ORIGINS: readonly (string | RegExp)[] = [
  'https://fox3-academy.pages.dev',
  /^https:\/\/[a-z0-9-]+\.fox3-academy\.pages\.dev$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/,
];
const HOST = '127.0.0.1';
const MAX_DATAGRAM = 8192;
const MAX_BODY = 1024;
const STATUS_INTERVAL_MS = 1000;
const SILENT_AFTER_MS = 3000;

export interface BridgeOptions {
  httpPort?: number;
  fromDcsPort?: number;
  toDcsPort?: number;
  origins?: readonly (string | RegExp)[];
  log?: (line: string) => void;
  now?: () => number;
}

export interface BridgeStatus {
  v: 1;
  type: 'status';
  bridge: string;
  ports: { http: number; fromDcs: number; toDcs: number };
  dcs: { packets: number; rejected: number; lastPacketAgeMs: number | null; script: string | null };
  commands: number;
  clients: number;
}

export type Command = { type: 'ping'; id: number };

/** Validate a command body from the page. Only these commands exist; everything else is refused. */
export function parseCommand(body: unknown): Command | null {
  if (typeof body !== 'object' || body === null) return null;
  const c = body as Record<string, unknown>;
  if (c.type === 'ping' && Number.isInteger(c.id) && (c.id as number) >= 0 && (c.id as number) <= 0x7fffffff) {
    return { type: 'ping', id: c.id as number };
  }
  return null;
}

/** The text line the export script reads for a command. */
export function commandLine(c: Command): string {
  return `ping ${c.id}`;
}

/** A datagram from the export script: one protocol-v1 JSON object with a type. Null when it is not one. */
export function parseDatagram(buf: Buffer): Record<string, unknown> | null {
  if (buf.length === 0 || buf.length > MAX_DATAGRAM) return null;
  try {
    const msg: unknown = JSON.parse(buf.toString('utf8'));
    if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) return null;
    const m = msg as Record<string, unknown>;
    return m.v === 1 && typeof m.type === 'string' ? m : null;
  } catch {
    return null;
  }
}

export function originAllowed(origin: string, allow: readonly (string | RegExp)[]): boolean {
  return allow.some(a => (typeof a === 'string' ? a === origin : a.test(origin)));
}

/** Host header must be a loopback name, so a DNS-rebinding page cannot reach the bridge through its own domain. */
export function hostAllowed(host: string | undefined): boolean {
  return !!host && /^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/i.test(host);
}

export interface Bridge {
  start(): Promise<{ http: number; fromDcs: number }>;
  stop(): Promise<void>;
  status(): BridgeStatus;
}

export function createBridge(opts: BridgeOptions = {}): Bridge {
  const log = opts.log ?? (line => console.log(line));
  const now = opts.now ?? Date.now;
  const origins = opts.origins ?? DEFAULT_ORIGINS;
  const ports = {
    http: opts.httpPort ?? DEFAULT_PORTS.http,
    fromDcs: opts.fromDcsPort ?? DEFAULT_PORTS.fromDcs,
    toDcs: opts.toDcsPort ?? DEFAULT_PORTS.toDcs,
  };
  const clients = new Set<ServerResponse>();
  let packets = 0, rejected = 0, commands = 0;
  let lastPacketAt: number | null = null;
  let script: string | null = null;
  let silentLogged = true;
  let udp: Socket | null = null;
  let http: Server | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const status = (): BridgeStatus => ({
    v: 1, type: 'status', bridge: BRIDGE_VERSION, ports: { ...ports },
    dcs: { packets, rejected, lastPacketAgeMs: lastPacketAt === null ? null : Math.max(0, now() - lastPacketAt), script },
    commands, clients: clients.size,
  });

  const broadcast = (event: string, data: unknown) => {
    const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      // A page that stops reading must not grow memory without bound.
      if (res.writableLength > 1_000_000) { res.destroy(); clients.delete(res); continue; }
      res.write(chunk);
    }
  };

  const onDatagram = (buf: Buffer) => {
    const msg = parseDatagram(buf);
    if (!msg) {
      rejected++;
      if (rejected === 1) log('Ignored a datagram that is not Fox3 link protocol v1.');
      return;
    }
    packets++;
    lastPacketAt = now();
    if (typeof msg.script === 'string') script = msg.script.slice(0, 32);
    if (silentLogged) {
      silentLogged = false;
      log(`DCS export script connected${script ? ` (v${script})` : ''}.`);
    }
    if (msg.type === 'bye') log('DCS mission stopped.');
    broadcast('dcs', msg);
  };

  const cors = (req: IncomingMessage, res: ServerResponse): boolean => {
    if (!hostAllowed(req.headers.host)) {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('Host not allowed');
      return false;
    }
    const origin = req.headers.origin;
    if (origin === undefined) return true; // not a cross-origin browser request (curl, the bridge's own tests)
    if (!originAllowed(origin, origins)) {
      log(`Refused a request from ${origin.slice(0, 100)} (not on the allow list).`);
      res.writeHead(403, { 'content-type': 'text/plain' }).end('Origin not allowed');
      return false;
    }
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
    return true;
  };

  const json = (res: ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
  };

  const onRequest = (req: IncomingMessage, res: ServerResponse) => {
    if (!cors(req, res)) return;
    const path = (req.url ?? '/').split('?')[0];
    if (req.method === 'OPTIONS') {
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type');
      res.setHeader('access-control-max-age', '600');
      // Chrome asks before a public site reaches a loopback address (Private / Local Network Access).
      if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('access-control-allow-private-network', 'true');
      res.writeHead(204).end();
      return;
    }
    if (req.method === 'GET' && path === '/status') return json(res, 200, status());
    if (req.method === 'GET' && path === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`retry: 2000\n\nevent: status\ndata: ${JSON.stringify(status())}\n\n`);
      clients.add(res);
      log(`Page connected (${clients.size} open).`);
      req.on('close', () => {
        if (clients.delete(res)) log(`Page disconnected (${clients.size} open).`);
      });
      return;
    }
    if (req.method === 'POST' && path === '/command') {
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return json(res, 415, { ok: false, error: 'content-type must be application/json' });
      let body = '';
      let tooBig = false;
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        body += chunk;
        if (body.length > MAX_BODY) { tooBig = true; req.destroy(); }
      });
      req.on('end', () => {
        if (tooBig) return;
        let cmd: Command | null = null;
        try { cmd = parseCommand(JSON.parse(body)); } catch { /* invalid JSON */ }
        if (!cmd) return json(res, 400, { ok: false, error: 'unknown command' });
        commands++;
        udp?.send(commandLine(cmd), ports.toDcs, HOST);
        json(res, 202, { ok: true });
      });
      return;
    }
    json(res, 404, { ok: false, error: 'not found' });
  };

  return {
    status,
    async start() {
      udp = createSocket('udp4');
      udp.on('message', onDatagram);
      // Windows reports an unreachable command port (no DCS) as a socket error; it is not fatal.
      udp.on('error', err => log(`UDP: ${err.message}`));
      await new Promise<void>((resolve, reject) => {
        udp!.once('error', reject);
        udp!.bind(ports.fromDcs, HOST, () => { udp!.off('error', reject); resolve(); });
      });
      ports.fromDcs = (udp.address() as AddressInfo).port;

      http = createServer(onRequest);
      await new Promise<void>((resolve, reject) => {
        http!.once('error', reject);
        http!.listen(ports.http, HOST, () => { http!.off('error', reject); resolve(); });
      });
      ports.http = (http.address() as AddressInfo).port;

      timer = setInterval(() => {
        const s = status();
        if (!silentLogged && s.dcs.lastPacketAgeMs !== null && s.dcs.lastPacketAgeMs > SILENT_AFTER_MS) {
          silentLogged = true;
          log('DCS export script silent (mission ended, paused or DCS closed).');
        }
        broadcast('status', s);
      }, STATUS_INTERVAL_MS);
      return { http: ports.http, fromDcs: ports.fromDcs };
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      for (const res of clients) res.end();
      clients.clear();
      await new Promise<void>(resolve => (http ? http.close(() => resolve()) : resolve()));
      http?.closeAllConnections();
      http = null;
      await new Promise<void>(resolve => (udp ? udp.close(() => resolve()) : resolve()));
      udp = null;
    },
  };
}

const HELP = `Fox3 Academy DCS link bridge v${BRIDGE_VERSION}

Usage: npm run dcs-link -- [options]

  --http-port <n>        page connection port (default ${DEFAULT_PORTS.http}; the public site expects ${DEFAULT_PORTS.http})
  --dcs-port <n>         UDP port the export script sends to (default ${DEFAULT_PORTS.fromDcs})
  --command-port <n>     UDP port the export script listens on (default ${DEFAULT_PORTS.toDcs})
  --allow-origin <o>     also accept pages from this origin (repeatable). Use "null" for the
                         single-file build opened from disk.
  --help                 this text
`;

export function parseArgs(argv: readonly string[]): BridgeOptions & { help?: boolean } {
  const out: BridgeOptions & { help?: boolean } = {};
  const extra: string[] = [];
  const port = (v: string | undefined, flag: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${flag} needs a port number (1-65535)`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--http-port') out.httpPort = port(argv[++i], a);
    else if (a === '--dcs-port') out.fromDcsPort = port(argv[++i], a);
    else if (a === '--command-port') out.toDcsPort = port(argv[++i], a);
    else if (a === '--allow-origin') {
      const o = argv[++i];
      if (!o) throw new Error('--allow-origin needs an origin');
      extra.push(o);
    } else throw new Error(`Unknown option ${a}. Try --help.`);
  }
  if (extra.length) out.origins = [...DEFAULT_ORIGINS, ...extra];
  return out;
}

async function main() {
  let opts: ReturnType<typeof parseArgs>;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
  }
  if (opts.help) { console.log(HELP); return; }
  const stamp = () => new Date().toTimeString().slice(0, 8);
  const bridge = createBridge({ ...opts, log: line => console.log(`${stamp()}  ${line}`) });
  try {
    const p = await bridge.start();
    const s = bridge.status();
    console.log(`Fox3 Academy DCS link bridge v${BRIDGE_VERSION}`);
    console.log(`  Page:  http://${HOST}:${p.http}  (open the DCS link page in Fox3 Academy)`);
    console.log(`  DCS:   listening on UDP ${HOST}:${p.fromDcs}, commands to UDP ${HOST}:${s.ports.toDcs}`);
    console.log('  Ctrl+C to stop.');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    console.error(err.code === 'EADDRINUSE'
      ? `A port is already in use (${err.message}). Is another bridge running? Choose ports with --help.`
      : `Bridge failed to start: ${err.message}`);
    process.exit(1);
  }
  const quit = () => { void bridge.stop().then(() => process.exit(0)); };
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}

if (import.meta.main) void main();
