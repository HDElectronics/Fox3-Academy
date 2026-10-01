/**
 * Stand-in for DCS and Fox3Link.lua, for testing the bridge and the page without the game:
 * `npm run dcs-link:fake` while `npm run dcs-link` runs. Sends the same protocol-v1 datagrams as the export
 * script (hello, 10 Hz frames, pong, bye) for an F/A-18C cruising then flying an approach (see fakeFrame), and answers pings.
 * The numbers are made up; only the message shapes matter.
 */
import { createSocket } from 'node:dgram';

const HOST = '127.0.0.1';
/** Same as DEFAULT_PORTS in bridge.ts (kept separate so Node can run this file alone; a test checks they match). */
export const FAKE_PORTS = { fromDcs: 47781, toDcs: 47782 } as const;
const SCRIPT = '0.2.0-fake';

export interface FakeState { t: number; seq: number }

/** Length of one fake sortie: cruise, then a gear-down approach. */
export const FAKE_CYCLE_S = 120;

/**
 * One frame at model time t, for an F/A-18C. Each 2 min cycle: 50 s level cruise at 7000 m, then a gear-down
 * approach from 1500 ft with FULL flaps and the hook up (so the carrier hook check fires), AoA wandering through
 * the on-speed band. Fuel drains from 3000 kg at 4 kg/s through joker and bingo at the default settings.
 */
export function fakeFrame(s: FakeState): Record<string, unknown> {
  const c = s.t % FAKE_CYCLE_S;
  const approach = c >= 50;
  const turn = (2 * Math.PI) / 120;
  const hdg = (((Math.PI / 2 - turn * s.t) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const r = 250 / turn;
  const lat = 41.6 + ((r * Math.sin(turn * s.t)) / 111_320);
  const lon = 41.6 + ((r * Math.cos(turn * s.t)) / (111_320 * Math.cos((41.6 * Math.PI) / 180)));
  const aglM = approach ? Math.max(15, 460 - (c - 50) * 6.3) : 6950 - 40 * Math.sin(s.t / 11);
  const fuelKg = Math.max(300, 3000 - 4 * s.t);
  return {
    v: 1, type: 'frame', script: SCRIPT, seq: s.seq, t: s.t,
    allow: { ownship: true, sensor: true, object: true },
    self: { name: 'FA-18C_hornet', lat, lon, alt: aglM + 50, hdg, pitch: approach ? -0.04 : 0.02, bank: approach ? 0 : -0.6 },
    pilot: 'Test pilot',
    ias: approach ? 72 : 190 + 3 * Math.sin(s.t / 7), tas: approach ? 74 : 250, mach: approach ? 0.22 : 0.79,
    altMsl: aglM + 50, altAgl: aglM, vv: approach ? -3.5 : 0.4 * Math.sin(s.t / 5),
    aoa: approach ? 8.1 + 1.3 * Math.sin((c - 50) / 6) : 4, // degrees, as DCS sends it for the Hornet
    acc: { x: 0, y: approach ? 1 : 1.2, z: 0 },
    mech: { gear: approach ? 1 : 0, flaps: approach ? 1 : 0, hook: 0, speedbrakes: 0, wheelbrakes: 0, canopy: 0 },
    engine: { rpmL: approach ? 78 : 88, rpmR: approach ? 78 : 88, fuelInt: fuelKg, fuelExt: 0, ffL: 0.3, ffR: 0.3 },
    mcp: {}, cm: { chaff: 60, flare: 60 },
    // Hornet cockpit (raw args as Fox3Link.lua sends them): gear handle 226 (0 down), flaps 234 (-1 FULL, 1 AUTO),
    // hook handle 293 (1 up), master caution 13, FUEL LO 304, and the IFEI strings.
    args: { a226: approach ? 0 : 1, a234: approach ? -1 : 1, a293: 1, a13: 0, a304: fuelKg * 2.20462 < 1600 ? 1 : 0, a49: 0, a233: 0 },
    ind: { bingo: '2500', fuelUp: String(Math.round(fuelKg * 2.20462)).padStart(6) + 'T', fuelDown: String(Math.round(fuelKg * 2.20462)).padStart(6) + 'I' },
  };
}
function main() {
  const sock = createSocket('udp4');
  const send = (msg: Record<string, unknown>) => sock.send(JSON.stringify({ v: 1, script: SCRIPT, ...msg }), FAKE_PORTS.fromDcs, HOST);
  const t0 = Date.now();
  const modelTime = () => (Date.now() - t0) / 1000;
  sock.on('error', err => {
    console.error(`UDP: ${err.message}`);
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(`Port ${FAKE_PORTS.toDcs} is taken: is DCS running with the export script, or another fake? Stop it first.`);
      process.exit(1);
    }
  });
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
