/**
 * Fox3 Academy DCS MCP tools. Read-only: every tool reports what the player's own jet knows, from the DCS link,
 * in pilot units (kt, ft, lb, deg). Reports are pure functions of the copilot monitor state so they can be tested
 * without DCS. Gameplay level only (AGENTS.md rule 1). Docs: docs/mcp.md.
 */
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { LinkSnapshot } from '../../src/dcs/client';
import { effectiveBingo } from '../../src/copilot/hornet';
import { flapsFull, hookDown } from '../../src/copilot/hornet';
import type { CopilotMonitor, MonitorState } from '../../src/copilot/monitor';
import { enduranceMin } from '../../src/copilot/situation';
import { clockOf } from '../../src/copilot/threats';
import type { HornetConfig } from '../../src/copilot/hornet';
import { search, type NoteSection } from './notes';

export const SERVER_VERSION = '0.1.0';

const R2D = 180 / Math.PI;
/** Round to dp decimals; a negative dp rounds to tens (-1) or hundreds (-2). */
export const r = (v: number | undefined, dp = 0) => {
  if (v === undefined) return undefined;
  if (dp >= 0) return Number(v.toFixed(dp));
  const step = 10 ** -dp;
  return Math.round(v / step) * step;
};
const pos01 = (v: number | undefined, down = 'down', up = 'up') => (v === undefined ? undefined : v >= 0.95 ? down : v <= 0.05 ? up : 'in transit');

export function statusReport(snap: LinkSnapshot, st: MonitorState) {
  return {
    bridge: snap.bridge === 'up' ? 'connected' : snap.bridge === 'off' ? 'off' : 'not reachable (is npm run dcs-link running?)',
    dcs: snap.dcs === 'live' ? 'live' : snap.dcs === 'stale' ? 'quiet (paused, loading or closed)' : snap.dcs === 'stopped' ? 'mission ended' : 'no data yet',
    exportScript: snap.script,
    aircraft: st.frame?.self?.name,
    framesPerSecond: r(snap.rateHz, 1),
    lastFrameAgeMs: r(snap.lastFrameAgeMs ?? undefined),
    serverAllows: st.frame?.allow,
  };
}

export function flightReport(st: MonitorState) {
  const f = st.frame, s = st.situation;
  if (!f) return { available: false, reason: 'No live data from DCS.' };
  return {
    aircraft: s.type,
    phase: s.phase,
    iasKt: r(s.iasKt), tasKt: f.tas === undefined ? undefined : r(f.tas / 0.514444), mach: r(s.mach, 2),
    altitudeMslFt: f.altMsl === undefined ? undefined : r(f.altMsl / 0.3048, -1),
    altitudeAglFt: r(s.aglFt), verticalSpeedFpm: r(s.vviFpm, -1),
    headingDeg: f.self?.hdg === undefined ? undefined : r((((f.self.hdg * R2D) % 360) + 360) % 360),
    pitchDeg: f.self?.pitch === undefined ? undefined : r(f.self.pitch * R2D, 1),
    bankDeg: f.self?.bank === undefined ? undefined : r(f.self.bank * R2D, 1),
    g: r(s.g, 1), aoaDeg: r(s.aoaDeg, 1),
    gear: pos01(s.gear),
    flaps: s.cockpit?.switches.flapSwitch ?? (s.flaps === undefined ? undefined : r(s.flaps, 2)),
    flapsFull: flapsFull(s),
    hookDown: hookDown(s),
    speedBrake: pos01(s.speedbrake, 'out', 'in'),
    position: f.self?.lat === undefined ? undefined : { latDeg: r(f.self.lat, 4), lonDeg: r(f.self.lon, 4) },
    modelTimeS: r(f.t),
    notes: 'Heading is the export Heading (true or magnetic not verified). Phase: ground, airborne, or approach (gear down below 5000 ft AGL).',
  };
}

export function fuelReport(st: MonitorState, cfg: HornetConfig) {
  const s = st.situation;
  if (!st.frame) return { available: false, reason: 'No live data from DCS.' };
  const bingo = effectiveBingo(s, cfg);
  const toBingo = enduranceMin(s, bingo.lb);
  return {
    fuelLb: r(s.fuelLb, -1),
    source: s.cockpit ? 'IFEI total' : 'export (fuel_internal + fuel_external)',
    bingoLb: bingo.lb,
    bingoFrom: bingo.from === 'ifei' ? 'IFEI BINGO' : s.cockpit?.ifei.bingoLb === 0 ? 'copilot setting (IFEI BINGO not set)' : 'copilot setting',
    jokerLb: bingo.lb + cfg.jokerMarginLb,
    burnLbPerHour: r(s.fuelFlowLbH, -1),
    minutesToBingo: r(toBingo),
    state: s.fuelLb === undefined ? 'unknown' : s.fuelLb <= bingo.lb ? 'BINGO' : s.fuelLb <= bingo.lb + cfg.jokerMarginLb ? 'JOKER' : 'ok',
    notes: 'Burn is measured from the fuel trend over the last minute; it needs 15 s of data and resets on refuelling.',
  };
}

export function threatsReport(st: MonitorState) {
  const f = st.frame;
  if (!f) return { available: false, reason: 'No live data from DCS.' };
  if (f.allow.sensor === false) return { available: false, reason: 'This server blocks sensor export.' };
  if (st.hornet) {
    const p = st.hornetThreats;
    return {
      source: 'F/A-18C RWR display, HUD repeat and ALR-67 threat lights',
      lights: p ? { ai: p.ai, cw: p.cw, sam: p.sam, aaa: p.aaa } : undefined,
      threats: (p?.threats ?? []).map(t => ({ rwrSymbol: t.symbol, couldBe: t.names, lockedOnUs: t.locked })),
      notes: 'AI light: a hostile fighter radar has locked us. CW light: CW radar, probably guiding a missile (ED guide p414). ' +
        'The Hornet exports no threat bearing as text, so no clock position is available.',
    };
  }
  return {
    source: 'LoGetTWSInfo (RWR)',
    threats: st.threats.map(t => ({ type: t.name, state: t.state, clock: t.clock, offNoseDeg: r(t.relDeg) })),
    notes: 'RWR azimuth unit and sign not verified.',
  };
}

export function lockReport(st: MonitorState) {
  const f = st.frame;
  if (!f) return { available: false, reason: 'No live data from DCS.' };
  if (f.allow.sensor === false) return { available: false, reason: 'This server blocks sensor export.' };
  if (st.hornet) {
    const l = st.hornetLock;
    if (!l) return { locked: false };
    return {
      locked: true, source: 'F/A-18C HUD and radar attack format',
      rangeNm: l.rangeNm, closureKt: l.closureKt, inLar: l.inLar, radarMemory: l.memory ?? null,
      targetAltitudeFt: l.targetAltFt, targetHeadingDeg: l.targetHeadingDeg,
      missileTimer: l.tof, missilesInFlight: l.missiles.map(m => ({ slot: m.slot, active: m.active, timeToActiveS: m.ttgS })),
      aspectRaw: l.aspectRaw, targetAngleRaw: l.targetAngleRaw,
      notes: 'aspectRaw and targetAngleRaw are shown as the displays print them; their meaning is not verified.',
    };
  }
  const l = st.lock;
  if (!l) return { locked: false };
  return {
    locked: true, source: 'LoGetLockedTargetInformation', target: l.name, stt: l.stt,
    rangeNm: r(l.rangeNm, 1), closureKt: r(l.closureKt), targetAltitudeFt: r(l.altFt, -2),
    aspect: l.aspect, aspectDeg: r(l.aspectDeg), clock: l.relDeg === undefined ? undefined : clockOf(l.relDeg),
    launchZone: l.dlz ? { missile: l.dlz.missile, zone: l.dlz.zone, rmaxNm: r(l.dlz.rmaxNm, 1), rneNm: r(l.dlz.rneNm, 1), rminNm: r(l.dlz.rminNm, 1), from: 'Fox3 Academy DLZ tables' } : undefined,
  };
}

export function weaponsReport(st: MonitorState) {
  const f = st.frame;
  if (!f) return { available: false, reason: 'No live data from DCS.' };
  return {
    stores: f.stores?.counts, gunRounds: f.stores?.gun, selected: f.stores?.sel,
    masterArm: st.situation.cockpit?.switches.masterArm, chaff: f.cm?.chaff, flares: f.cm?.flare,
  };
}

export function cockpitReport(st: MonitorState) {
  const c = st.situation.cockpit;
  if (!st.frame) return { available: false, reason: 'No live data from DCS.' };
  if (!c) return { available: false, reason: 'Cockpit switches are exported for the F/A-18C only.' };
  return {
    switches: c.switches,
    lampsLit: Object.entries(c.lamps).filter(([, on]) => on).map(([k]) => k),
    ifei: c.ifei,
    notes: 'Switch positions use community value maps (Helios, DCS-BIOS); gear handle, flaps, hook and master arm were checked in game.',
  };
}

export function alertsReport(st: MonitorState, monitor: Pick<CopilotMonitor, 'recent'>, n = 15) {
  return {
    active: st.active.map(a => ({ severity: a.severity, text: a.text })),
    recentCalls: monitor.recent(n).map(c => ({ modelTimeS: r(c.modelT), severity: c.severity, text: c.text })),
  };
}

export interface ToolDeps {
  snapshot(): LinkSnapshot;
  monitor: CopilotMonitor;
  notes: readonly NoteSection[];
}

const json = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 1) }] });
const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

export const INSTRUCTIONS =
  'Fox3 Academy DCS tools: live, read-only data about the player\'s own aircraft in DCS World on this computer, ' +
  'plus a search over sourced research notes. Answer flight questions from these tools, in pilot terms (kt, ft, lb). ' +
  'For procedures, cues and numbers, call search_notes and cite the note; if a value is marked not verified, say so. ' +
  'Never invent DCS key bindings, ranges or cues. There is no data about other aircraft beyond what the jet\'s own ' +
  'RWR and radar show.';

export function createDcsServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: 'fox3-dcs', version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
  const st = () => deps.monitor.state();
  const tool = (name: string, description: string, report: () => unknown) =>
    server.registerTool(name, { description, inputSchema: z.object({}), annotations: READ_ONLY }, async () => json(report()));

  tool('dcs_status', 'Is DCS connected: bridge state, export script version, aircraft, and what the server allows to be exported.', () => statusReport(deps.snapshot(), st()));
  tool('flight_state', 'Own aircraft now: speeds, altitude, attitude, G, AoA, phase, gear, flaps, hook, position, mission time.', () => flightReport(st()));
  tool('fuel_state', 'Fuel now, bingo and joker, burn rate and minutes to bingo.', () => fuelReport(st(), deps.monitor.cfg));
  tool('threats', 'What the own RWR shows: threat symbols or types, locks, missile guidance lights.', () => threatsReport(st()));
  tool('radar_lock', 'The own radar lock: range, closure, in launch zone, missiles in flight, radar memory.', () => lockReport(st()));
  tool('weapons', 'Stores remaining, gun rounds, master arm, chaff and flares.', () => weaponsReport(st()));
  tool('cockpit_switches', 'F/A-18C cockpit switch positions, lit warning and caution lamps, IFEI fuel and BINGO.', () => cockpitReport(st()));
  tool('copilot_alerts', 'The copilot\'s active alerts and its most recent calls (spike, bingo, in LAR, pitbull...).', () => alertsReport(st(), deps.monitor));

  server.registerTool(
    'search_notes',
    {
      description: 'Search Fox3 Academy\'s sourced research notes (ED manuals, DCS behaviour) for procedures, cues, limits and numbers. Returns sections with their file and heading to cite.',
      inputSchema: z.object({
        query: z.string().min(2).describe('What to look for, e.g. "Case I break", "bingo set IFEI", "ALR-67 CW light"'),
        limit: z.number().int().min(1).max(8).optional().describe('Sections to return (default 4)'),
      }),
      annotations: READ_ONLY,
    },
    async ({ query, limit }) => {
      const hits = search(deps.notes, query, limit ?? 4);
      if (!hits.length) return { content: [{ type: 'text' as const, text: `No note matches "${query}".` }] };
      return json(hits.map(h => ({ file: h.file, heading: h.heading, text: h.text.length > 2400 ? h.text.slice(0, 2400) + ' […]' : h.text })));
    },
  );
  return server;
}
