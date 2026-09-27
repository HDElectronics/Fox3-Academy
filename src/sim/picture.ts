/**
 * [OWNER: sim-sensors] Build the RadarPicture for one aircraft (what its display shows).
 * Only radar-known information: bricks where they were painted (measured, not truth), tracks from the
 * track-file estimates, friendly from IFF. Adds the DLZ for the selected weapon against the locked /
 * primary designated target, the jet's own shoot-cue label, and this jet's missiles in flight.
 */
import type { World } from './world';
import type { Aircraft, EntityId, Missile, RadarPicture } from './types';
import { isFighterAc } from './jet';
import type { FighterId, AircraftSpec, DisplayFormat, MissileId } from '../data/types';
import { AIRCRAFT } from '../data/aircraft';
import { MISSILES } from '../data/missiles';
import { D2R, R2D, aspectAngle, closureRate, headingOf, relBearing, wrapPi } from './math';
import { brickLife, iffReply, identifiedFriend, scanElevationLimits } from './radar';
import { canLaunch } from './launch';
import { datalinkFor, datalinkSovereignty } from './datalink';

export interface PictureOptions {
  /** Display units (defaults to the jet's own: Russian jets metric, Western imperial). */
  units?: 'metric' | 'imperial';
}

/**
 * The shoot cue text each cockpit shows (docs/research):
 * FC3 Russian HUD 'ПР'; F-15C a flashing star under the TD box for AIM-120/AIM-9 ('*') or a triangle for
 * AIM-7 ('▲'), no SHOOT text; Hornet / JF-17 'SHOOT'; M-2000C 'TIR'. Viper and classic F-14 use geometric cues, no text label.
 */
export function cueLabelFor(type: FighterId, missile: MissileId | null): string {
  if (type === 'f16c' || type === 'f14b') return '';
  const display: DisplayFormat = AIRCRAFT[type].display;
  switch (display) {
    case 'ru-hud': return 'ПР';
    case 'f15-vsd': return missile && MISSILES[missile].seeker === 'sarh' ? '▲' : '*';
    case 'vtb': return 'TIR';
    case 'tid': return '';
    default: return 'SHOOT';
  }
}

/** Jets whose shoot cue only lights inside Rne (JF-17 SHOOT inside the NEZ, M-2000C TIR in the most restrictive domain). */
const CUE_INSIDE_RNE: Partial<Record<FighterId, boolean>> = { jf17: true, m2000c: true };

function missileLabels(world: World, ownerId: EntityId): Map<EntityId, string> {
  const out = new Map<EntityId, string>();
  let n = 0;
  for (const m of world.missiles.values()) if (m.shooterId === ownerId) out.set(m.id, `M${++n}`);
  return out;
}

function fmtRange(m: number, units: 'metric' | 'imperial'): string {
  return units === 'imperial' ? `${(m / 1852).toFixed(m < 18520 ? 1 : 0)} nm` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function buildRadarPicture(world: World, ownerId: EntityId, opts: PictureOptions = {}): RadarPicture | null {
  const ac = world.get(ownerId);
  if (!ac || !ac.alive || !isFighterAc(ac)) return null;
  const spec: AircraftSpec = AIRCRAFT[ac.type];
  const r = spec.radar, st = ac.radar, t = world.t;
  const units = opts.units ?? spec.units;
  const labels = missileLabels(world, ac.id);
  const live: Missile[] = [...world.missiles.values()].filter(m => m.alive && m.shooterId === ac.id);

  // Scan coverage at the cursor range.
  const lim = scanElevationLimits(spec, st);
  const atRange = st.cursor.range;
  const altCoverage = { top: ac.pos.y + atRange * Math.sin(lim.top), bottom: ac.pos.y + atRange * Math.sin(lim.bottom), atRange };

  const life = brickLife(st);
  const tracked = new Set(st.tracks.map(tr => tr.targetId));
  const bricks: RadarPicture['bricks'] = [];
  if (st.mode !== 'stt' && st.mode !== 'off') {
    for (const b of st.bricks) {
      if (st.mode === 'tws' && tracked.has(b.targetId)) continue;
      const age = t - b.t;
      bricks.push({ key: `${b.targetId}@${b.t.toFixed(3)}`, targetId: b.targetId, az: b.az, range: b.range, alt: b.pos.y, age, fade: Math.max(0, Math.min(1, 1 - age / life)), friendly: identifiedFriend(world, ac, b.targetId) });
    }
  }

  const strobes: RadarPicture['strobes'] = [];
  if (st.mode !== 'off' && st.mode !== 'acm') {
    for (const x of st.strobes) {
      if (st.mode === 'stt' && st.stt.hoj && st.stt.targetId === x.targetId) continue; // the jam lock line replaces it
      const age = t - x.t;
      strobes.push({ key: `${x.targetId}~${x.t.toFixed(3)}`, targetId: x.targetId, az: x.az, el: x.el, age, fade: Math.max(0, Math.min(1, 1 - age / life)) });
    }
  }
  // A jam lock has no range: its placeholder track is not a contact, only the stt line (hoj) shows it.
  const jamLockId = st.mode === 'stt' && st.stt.hoj ? st.stt.targetId : null;

  const tracks: RadarPicture['tracks'] = st.tracks.filter(tr => tr.targetId !== jamLockId).map(tr => {
    const speed = tr.vel.length();
    const moving = tr.firm && speed > 1;
    const d = st.designated.indexOf(tr.targetId);
    const reply = iffReply(world, ac, tr.targetId);
    return {
      label: tr.label, targetId: tr.targetId,
      az: relBearing(ac.pos, ac.heading, tr.pos), range: ac.pos.distanceTo(tr.pos), alt: tr.pos.y,
      relHeading: moving ? wrapPi(headingOf(tr.vel) - ac.heading) : 0,
      speed: moving ? speed : 0,
      aspectDeg: moving ? aspectAngle(tr.pos, tr.vel, ac.pos) * R2D : 0,
      closure: moving ? closureRate(ac.pos, ac.vel, tr.pos, tr.vel) : 0,
      firm: tr.firm, coasting: tr.coasting,
      designation: d === 0 ? 'primary' : d > 0 ? 'secondary' : null,
      designationIndex: d,
      locked: st.mode === 'stt' && st.stt.targetId === tr.targetId,
      friendly: !!reply?.friend,
      iff: reply ? { reply: reply.friend ? 'friend' : 'no-reply', age: t - reply.t } : undefined,
      dl: datalinkSovereignty(world, ac, tr.targetId) ?? undefined,
      missiles: live.filter(m => m.targetId === tr.targetId).map(m => ({
        missileId: m.id, label: labels.get(m.id) ?? 'M', guidance: m.guidance, timeToActive: m.timeToActive, timeToImpact: m.timeToImpact,
      })),
    };
  });

  const own = new Set([...st.tracks.map(x => x.targetId), ...st.bricks.map(x => x.targetId)]);
  const datalink: RadarPicture['datalink'] = datalinkFor(world, ac).map(d => {
    const moving = d.vel.length() > 1, donor = d.donorId ? world.get(d.donorId) : undefined;
    return {
      key: `${d.source}:${d.targetId}`, targetId: d.targetId,
      az: relBearing(ac.pos, ac.heading, d.pos), range: ac.pos.distanceTo(d.pos), alt: d.pos.y,
      relHeading: moving ? wrapPi(headingOf(d.vel) - ac.heading) : 0, speed: d.vel.length(),
      source: d.source, donorLabel: donor ? donor.callsign : null, sovereignty: d.sovereignty,
      correlated: own.has(d.targetId), age: t - d.t,
    };
  });

  let stt: RadarPicture['stt'] = null;
  if (jamLockId) {
    const tr = st.tracks.find(x => x.targetId === jamLockId);
    if (tr) stt = { targetId: jamLockId, az: relBearing(ac.pos, ac.heading, tr.pos), range: ac.pos.distanceTo(tr.pos), alt: tr.pos.y, aspectDeg: 0, closure: 0, lost: st.stt.lostFor > 0, hoj: true };
  } else if (st.mode === 'stt' && st.stt.targetId) {
    const p = tracks.find(tr => tr.targetId === st.stt.targetId);
    if (p) stt = { targetId: p.targetId, az: p.az, range: p.range, alt: p.alt, aspectDeg: p.aspectDeg, closure: p.closure, lost: st.stt.lostFor > 0, hoj: false };
  }

  const weaponId = ac.selectedWeapon;
  const weapon = weaponId ? { id: weaponId, name: MISSILES[weaponId].name, count: ac.stores[weaponId] ?? 0 } : null;

  // DLZ and cue against the locked / primary designated target (the jet's launch target when neither).
  const primary = (st.mode === 'stt' ? st.stt.targetId : null) ?? (st.mode === 'tws' ? st.designated[0] : undefined) ?? undefined;
  const check = canLaunch(world, ac, primary ?? undefined);
  const dlz = check.dlz && check.range != null ? { ...check.dlz, targetRange: check.range } : null;
  let shootCue = check.ok;
  let launchBlockedReason = check.reason;
  if (check.ok && CUE_INSIDE_RNE[ac.type] && check.dlz && check.range != null && check.range > check.dlz.rne) {
    shootCue = false;
    launchBlockedReason = `In range, cue off: ${cueLabelFor(ac.type, weaponId)} lights inside Rne (${fmtRange(check.dlz.rne, units)}). Target at ${fmtRange(check.range, units)}`;
  }

  const labelOf = (id: EntityId | null) => (id ? st.tracks.find(tr => tr.targetId === id)?.label : undefined) ?? '--';
  const missilesInFlight: RadarPicture['missilesInFlight'] = live.map(m => ({
    missileId: m.id, label: labels.get(m.id) ?? 'M', targetLabel: labelOf(m.targetId),
    guidance: m.guidance, timeToActive: m.timeToActive, timeToImpact: m.timeToImpact,
  }));

  return {
    t, ownerId: ac.id, aircraftType: ac.type, units, ownHeading: ac.heading, mode: st.mode,
    modeLabel: r.modeLabels[st.mode] ?? (st.mode === 'off' ? 'OFF' : st.mode.toUpperCase()),
    rangeScale: st.rangeScale,
    gimbalAz: r.gimbalAzDeg * D2R,
    scan: { azCenter: st.azCenter, azHalf: st.azHalf, elCenter: st.elCenter, bars: st.bars, beamAz: st.beamAz, beamEl: st.beamEl, bar: st.bar, frameTime: st.frameTime },
    altCoverage,
    ownAlt: ac.pos.y, ownSpeed: ac.vel.length(),
    bricks, strobes, ownJamming: ac.jamming, datalink, tracks, stt, weapon, dlz,
    shootCue, cueLabel: cueLabelFor(ac.type, weaponId), launchBlockedReason,
    missilesInFlight,
    cursor: { ...st.cursor },
  };
}
