/**
 * Stand-in for DCS and Fox3Link.lua, for testing the bridge and the page without the game:
 * `npm run dcs-link:fake` while `npm run dcs-link` runs. Sends the same protocol-v1 datagrams as the export
 * script (hello, 10 Hz frames, pong, bye) for a jet flying a level left-hand circle, and answers pings.
 * The numbers are made up; only the message shapes matter.
 */
import { createSocket } from 'node:dgram';

const HOST = '127.0.0.1';
/** Same as DEFAULT_PORTS in bridge.ts (kept separate so Node can run this file alone; a test checks they match). */
export const FAKE_PORTS = { fromDcs: 47781, toDcs: 47782 } as const;
const SCRIPT = '0.1.0-fake';

export interface FakeState { t: number; seq: number }

/** One frame at model time t: 250 m/s TAS, 2 min circle, 7000 m, near Batumi. */
export function fakeFrame(s: FakeState): Record<string, unknown> {
  const turn = (2 * Math.PI) / 120;
  const hdg = (((Math.PI / 2 - turn * s.t) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const r = 250 / turn;
  const lat = 41.6 + ((r * Math.sin(turn * s.t)) / 111_320);
  const lon = 41.6 + ((r * Math.cos(turn * s.t)) / (111_320 * Math.cos((41.6 * Math.PI) / 180)));
  return {
    v: 1, type: 'frame', script: SCRIPT, seq: s.seq, t: s.t,
    allow: { ownship: true, sensor: true, object: true },
    self: { name: 'F-16C_50', lat, lon, alt: 7000, hdg, pitch: 0.02, bank: -0.6 },
    pilot: 'Test pilot',
    ias: 190 + 3 * Math.sin(s.t / 7), tas: 250, mach: 0.79, altMsl: 7000, altAgl: 6950 - 40 * Math.sin(s.t / 11),
    vv: 0.4 * Math.sin(s.t / 5), aoa: 0.07, acc: { x: 0, y: 1.2, z: 0 },
  };
}

function main() {
  const sock = createSocket('udp4');
  const send = (msg: Record<string, unknown>) => sock.send(JSON.stringify({ v: 1, script: SCRIPT, ...msg }), FAKE_PORTS.fromDcs, HOST);
  const t0 = Date.now();
  const modelTime = () => (Date.now() - t0) / 1000;
  sock.on('error', err => console.error(`UDP: ${err.message}`));
  sock.on('message', buf => {
    const id = /^ping (\d+)$/.exec(buf.toString('utf8'))?.[1];
    if (id !== undefined) send({ type: 'pong', id: Number(id), t: modelTime() });
  });
  sock.bind(FAKE_PORTS.toDcs, HOST, () => {
    console.log(`Fake DCS: sending to UDP ${HOST}:${FAKE_PORTS.fromDcs}, commands on ${HOST}:${FAKE_PORTS.toDcs}. Ctrl+C to stop.`);
    send({ type: 'hello', t: 0 });
    let seq = 0;
    const timer = setInterval(() => send(fakeFrame({ t: modelTime(), seq: ++seq })), 100);
    const quit = () => {
      clearInterval(timer);
      send({ type: 'bye', t: modelTime() });
      setTimeout(() => { sock.close(); process.exit(0); }, 50);
    };
    process.on('SIGINT', quit);
    process.on('SIGTERM', quit);
  });
}

if (import.meta.main) main();
