/**
 * Turn a simulateShot() result into a recording the render kit's ReplayView can play:
 * three entities (shooter, target, missile) sampled every 0.25 s, plus a few seconds of tail so the
 * end of the shot (explosion, or the target flying on) is visible.
 */
import type { FighterId, MissileId } from '../../data/types';
import type { MissileGuidance, MissReason, RecordFrame, SimEvent } from '../../sim/types';
import type { ShotResult } from '../../sim/dlz';
import type { ReplayRoster } from '../../render';
import { G0 } from '../../sim/math';

export const SHOOTER_ID = 'shooter';
export const TARGET_ID = 'target';
export const MISSILE_ID = 'msl';

interface P3 { x: number; y: number; z: number }

const hdg = (dx: number, dz: number) => {
  const h = Math.atan2(dx, -dz);
  return h < 0 ? h + Math.PI * 2 : h;
};

function attitude(path: P3[], i: number, dt: number): { heading: number; pitch: number; roll: number } {
  const n = path.length;
  const a = path[Math.max(0, Math.min(n - 2, i))], b = path[Math.max(1, Math.min(n - 1, i + 1))];
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const horiz = Math.hypot(dx, dz);
  const heading = horiz > 1e-3 ? hdg(dx, dz) : 0;
  const pitch = Math.atan2(dy, Math.max(horiz, 1e-3));
  // bank from the turn rate (coordinated turn): tan(roll) = v·ω / g
  let roll = 0;
  if (n >= 3) {
    const j = Math.max(1, Math.min(n - 2, i));
    const p0 = path[j - 1], p1 = path[j], p2 = path[j + 1];
    const h0 = hdg(p1.x - p0.x, p1.z - p0.z), h1 = hdg(p2.x - p1.x, p2.z - p1.z);
    let dh = h1 - h0;
    if (dh > Math.PI) dh -= Math.PI * 2;
    if (dh < -Math.PI) dh += Math.PI * 2;
    const v = Math.hypot(p2.x - p1.x, p2.z - p1.z) / dt;
    const w = dh / dt;
    roll = Math.max(-1.35, Math.min(1.35, Math.atan((v * w) / G0)));
  }
  return { heading, pitch, roll };
}

const RADAR = { azCenter: 0, azHalf: 0, elCenter: 0, bars: 1, beamAz: 0, beamEl: 0 };

export interface ShotRecording {
  frames: RecordFrame[];
  roster: ReplayRoster;
  events: SimEvent[];
  /** Time the missile ended (s). */
  end: number;
  /** Last frame time (s), end + tail. */
  last: number;
}

export function shotRecording(r: ShotResult, missile: MissileId, shooterType: FighterId, targetType: FighterId, tailS = 4): ShotRecording {
  const n = r.trace.length;
  const frames: RecordFrame[] = [];
  if (!n) return { frames, roster: { aircraft: {}, missiles: {} }, events: [], end: 0, last: 0 };
  const end = r.timeOfFlight;
  const killed = r.hit;
  const sarh = r.trace[0].guidance === 'sarh';
  const dt = n > 1 ? r.trace[1].t - r.trace[0].t : 0.25;
  const pushFrame = (t: number, sp: P3, tp: P3, mp: P3, i: number, g: MissileGuidance, mAlive: boolean) => {
    const sa = attitude(r.shooterPath, i, dt), ta = attitude(r.targetPath, i, dt);
    const tAlive = !killed || t < end - 1e-6;
    frames.push({
      t,
      aircraft: [
        { id: SHOOTER_ID, side: 'blue', type: shooterType, pos: [sp.x, sp.y, sp.z], heading: sa.heading, pitch: sa.pitch, roll: 0, alive: true,
          radarMode: 'stt', sttTarget: sarh && mAlive ? TARGET_ID : null, radar: RADAR, designated: [TARGET_ID] },
        { id: TARGET_ID, side: 'red', type: targetType, pos: [tp.x, tp.y, tp.z], heading: ta.heading, pitch: ta.pitch, roll: ta.roll, alive: tAlive,
          radarMode: 'off', sttTarget: null, radar: RADAR, designated: [] },
      ],
      missiles: [
        { id: MISSILE_ID, type: missile, side: 'blue', shooterId: SHOOTER_ID, targetId: TARGET_ID, pos: [mp.x, mp.y, mp.z], guidance: g, alive: mAlive,
          timeToActive: r.pitbull && t < r.pitbull.t ? r.pitbull.t - t : null },
      ],
    });
  };
  for (let i = 0; i < n; i++) {
    const s = r.trace[i];
    pushFrame(s.t, r.shooterPath[i], r.targetPath[i], r.missilePath[i], i, s.guidance as MissileGuidance, i < n - 1);
  }
  // tail: aircraft fly on, the missile stays where it ended
  const ls = r.shooterPath[n - 1], lt = r.targetPath[n - 1], lm = r.missilePath[n - 1];
  const ps = r.shooterPath[Math.max(0, n - 2)], pt = r.targetPath[Math.max(0, n - 2)];
  const vs = { x: (ls.x - ps.x) / dt, y: 0, z: (ls.z - ps.z) / dt };
  const vt = { x: (lt.x - pt.x) / dt, y: (lt.y - pt.y) / dt, z: (lt.z - pt.z) / dt };
  const t0 = r.trace[n - 1].t;
  const steps = Math.round(tailS / 0.25);
  for (let k = 1; k <= steps; k++) {
    const tk = t0 + k * 0.25;
    const e = k * 0.25;
    pushFrame(tk, { x: ls.x + vs.x * e, y: ls.y, z: ls.z + vs.z * e }, { x: lt.x + vt.x * e, y: lt.y + vt.y * e, z: lt.z + vt.z * e }, lm, n - 1, r.trace[n - 1].guidance as MissileGuidance, false);
  }
  const events: SimEvent[] = [];
  for (const e of r.events) {
    if (e.type === 'cm') events.push({ ...e, ownerId: e.ownerId === 'shooter' ? SHOOTER_ID : TARGET_ID });
    else if (e.type === 'hit') events.push({ ...e, missileId: MISSILE_ID, targetId: TARGET_ID });
  }
  const roster: ReplayRoster = {
    aircraft: {
      [SHOOTER_ID]: { type: shooterType, side: 'blue', callsign: 'You', diedAt: null },
      [TARGET_ID]: { type: targetType, side: 'red', callsign: 'Bandit', diedAt: killed ? end : null },
    },
    missiles: {
      [MISSILE_ID]: {
        type: missile, side: 'blue', shooterId: SHOOTER_ID, targetId: TARGET_ID, launchedAt: 0,
        result: { kind: r.hit ? 'hit' : 'miss', reason: (r.hit ? 'hit' : r.reason) as MissReason | 'hit', t: end },
      },
    },
  };
  return { frames, roster, events, end, last: frames[frames.length - 1].t };
}
