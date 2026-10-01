/** DCS link page model: what the lamps, readouts and coach say for a link snapshot. Pure, tested. */
import type { Units } from '../../app/format';
import { fmtAltFine, fmtSpeed } from '../../app/format';
import type { LinkSnapshot } from '../../dcs/client';
import type { DcsFrame } from '../../dcs/protocol';
import { M_PER_FT } from '../../sim/math';
import type { Tone } from '../../ui';

export type LampState = 'off' | 'on' | 'flash';
export interface LinkView {
  lamps: { bridge: LampState; dcs: LampState; ping: LampState };
  coach: { text: string; why: string; tone: Tone };
  link: Record<'bridge' | 'script' | 'packets' | 'rate' | 'age' | 'ownship' | 'sensor' | 'object', string>;
  ping: Record<'sent' | 'answered' | 'lost' | 'rtt', string>;
  pingReady: boolean;
}

const DASH = '—';
const R2D = 180 / Math.PI;

const permission = (v: boolean | null | undefined): string => (v === true ? 'Allowed' : v === false ? 'Blocked by server' : DASH);

export function linkView(s: LinkSnapshot): LinkView {
  const live = s.dcs === 'live';
  const lamps = {
    bridge: s.bridge === 'up' ? 'on' : s.bridge === 'connecting' ? 'flash' : 'off',
    dcs: live ? 'on' : s.dcs === 'stale' ? 'flash' : 'off',
    ping: s.pings.pending > 0 ? 'flash' : s.pings.answered > 0 ? 'on' : 'off',
  } satisfies LinkView['lamps'];
  return {
    lamps,
    coach: coach(s),
    link: {
      bridge: s.bridge === 'up' ? `v${s.status?.bridge ?? '?'}` : s.bridge === 'off' ? 'Off' : s.bridge === 'connecting' ? 'Connecting' : 'Not found',
      script: s.script ? `v${s.script}` : DASH,
      packets: String(s.frames),
      rate: s.frames ? `${s.rateHz.toFixed(1)} Hz` : DASH,
      age: s.lastFrameAgeMs === null ? DASH : s.lastFrameAgeMs < 1000 ? `${Math.round(s.lastFrameAgeMs)} ms` : `${(s.lastFrameAgeMs / 1000).toFixed(1)} s`,
      ownship: permission(s.frame?.allow.ownship),
      sensor: permission(s.frame?.allow.sensor),
      object: permission(s.frame?.allow.object),
    },
    ping: {
      sent: String(s.pings.sent),
      answered: String(s.pings.answered),
      lost: String(s.pings.lost),
      rtt: s.pings.lastRttMs === null ? DASH : `${Math.round(s.pings.lastRttMs)} ms`,
    },
    pingReady: s.bridge === 'up',
  };
}

function coach(s: LinkSnapshot): LinkView['coach'] {
  if (s.bridge === 'off') return { text: 'Link off.', why: 'Press Connect to look for the bridge.', tone: 'dim' };
  if (s.bridge !== 'up') {
    return {
      text: 'Start the bridge on this computer.',
      why: 'Run npm run dcs-link in the Fox3 Academy folder. The page retries every few seconds.',
      tone: 'caution',
    };
  }
  switch (s.dcs) {
    case 'none':
      return { text: 'Bridge up. Waiting for DCS.', why: 'Install the export script, then start or restart a mission. Data flows once you are in the jet.', tone: 'hi' };
    case 'stopped':
      return { text: 'Mission ended.', why: 'DCS sent its stop message. Start another mission to resume.', tone: 'dim' };
    case 'stale':
      return { text: 'DCS went quiet.', why: 'The game is paused, loading, or closed. Frames resume on their own.', tone: 'caution' };
    case 'live':
      if (s.frame?.allow.ownship === false) {
        return { text: 'Connected. The server blocks own-ship export.', why: 'The link works, but this multiplayer server does not allow own-ship data. Try a single-player mission.', tone: 'caution' };
      }
      return s.pings.answered > 0
        ? { text: 'Two-way link confirmed.', why: 'Telemetry arrives from DCS and pings come back from the export script.', tone: 'ok' }
        : { text: 'Receiving from DCS. Send a ping.', why: 'A ping goes page to bridge to the export script and back. It changes nothing in the game.', tone: 'ok' };
  }
}

export interface OwnShipRow { id: string; label: string; value: string }

/** Own-ship readouts. Values are the export API's, converted to the selected units; unknown shows a dash. */
export function ownShipRows(f: DcsFrame | null, units: Units): OwnShipRow[] {
  const v = <T>(x: T | undefined, fmt: (x: T) => string) => (x === undefined ? DASH : fmt(x));
  const deg = (r: number, dp = 0) => (r * R2D).toFixed(dp) + '°';
  const self = f?.self;
  const vvi = (mps: number) => (units === 'metric' ? `${mps.toFixed(1)} m/s` : `${Math.round((mps / M_PER_FT) * 60)} ft/min`);
  return [
    { id: 'type', label: 'Aircraft', value: self?.name ?? DASH },
    { id: 'pilot', label: 'Pilot', value: f?.pilot ?? DASH },
    { id: 'ias', label: 'IAS', value: v(f?.ias, x => fmtSpeed(x, units)) },
    { id: 'tas', label: 'TAS', value: v(f?.tas, x => fmtSpeed(x, units)) },
    { id: 'mach', label: 'Mach', value: v(f?.mach, x => x.toFixed(2)) },
    { id: 'alt', label: 'Altitude MSL', value: v(f?.altMsl, x => fmtAltFine(x, units)) },
    { id: 'agl', label: 'Radar altitude', value: v(f?.altAgl, x => fmtAltFine(x, units)) },
    { id: 'vv', label: 'Vertical speed', value: v(f?.vv, vvi) },
    { id: 'hdg', label: 'Heading', value: v(self?.hdg, x => String(Math.round((((x * R2D) % 360) + 360) % 360)).padStart(3, '0') + '°') },
    { id: 'pitch', label: 'Pitch', value: v(self?.pitch, x => deg(x, 1)) },
    { id: 'bank', label: 'Bank', value: v(self?.bank, x => deg(x, 1)) },
    { id: 'g', label: 'Load factor', value: v(f?.acc?.y, x => x.toFixed(1) + ' G') },
    { id: 'aoa', label: 'AoA', value: v(f?.aoa, x => deg(x, 1)) },
    { id: 'pos', label: 'Position', value: self?.lat !== undefined && self.lon !== undefined ? latLon(self.lat, self.lon) : DASH },
    { id: 't', label: 'Model time', value: v(f?.t, modelTime) },
  ];
}

/** "N41°36.00' E041°36.00'" (degrees and decimal minutes, the DCS F10 map default). */
export function latLon(lat: number, lon: number): string {
  const part = (x: number, pos: string, neg: string, w: number) => {
    const a = Math.abs(x);
    let d = Math.floor(a);
    let m = (a - d) * 60;
    if (Number(m.toFixed(2)) >= 60) { d += 1; m = 0; }
    return `${x < 0 ? neg : pos}${String(d).padStart(w, '0')}°${m.toFixed(2).padStart(5, '0')}'`;
  };
  return `${part(lat, 'N', 'S', 2)} ${part(lon, 'E', 'W', 3)}`;
}

export function modelTime(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  return [hh, mm, ss].map(n => String(n).padStart(2, '0')).join(':');
}

/** ?shot=off|waiting|live: fixed snapshots for screenshots. No network. */
export function previewSnapshot(shot: string | null): LinkSnapshot | null {
  const pings = { sent: 0, answered: 0, lost: 0, lastRttMs: null, pending: 0 };
  const status = { bridge: '0.1.0', dcs: { packets: 0, rejected: 0, lastPacketAgeMs: null, script: null }, commands: 0, clients: 1 };
  switch (shot) {
    case 'off':
      return { bridge: 'down', dcs: 'none', status: null, frame: null, frames: 0, rateHz: 0, lastFrameAgeMs: null, script: null, pings };
    case 'waiting':
      return { bridge: 'up', dcs: 'none', status, frame: null, frames: 0, rateHz: 0, lastFrameAgeMs: null, script: null, pings };
    case 'live':
      return {
        bridge: 'up', dcs: 'live', status: { ...status, dcs: { packets: 1843, rejected: 0, lastPacketAgeMs: 40, script: '0.1.0' }, commands: 3 },
        frames: 1843, rateHz: 10, lastFrameAgeMs: 42, script: '0.1.0',
        pings: { sent: 3, answered: 3, lost: 0, lastRttMs: 21, pending: 0 },
        frame: {
          type: 'frame', seq: 1843, t: 1843.2, script: '0.1.0',
          allow: { ownship: true, sensor: true, object: true },
          self: { name: 'F-16C_50', lat: 41.6123, lon: 41.5987, alt: 7012, hdg: 4.71, pitch: 0.035, bank: -0.52 },
          pilot: 'Viper 1-1', ias: 172, tas: 232, mach: 0.73, altMsl: 7012, altAgl: 6955, vv: 1.2, aoa: 0.07,
          acc: { x: 0.01, y: 1.3, z: 0 },
        },
      };
    default:
      return null;
  }
}
