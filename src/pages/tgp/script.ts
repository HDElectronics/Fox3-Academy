/**
 * [OWNER: page-tgp] Scripted pilot for every Targeting pod & Mavericks lesson, flown through the HOTAS as a pilot
 * would (Coolie, TMS, China Hat, DMS, M, the laser, release). The page uses it for the ?shot= pre-rolls (never saved as
 * progress) and the tests use it to prove the sim can complete each lesson. Pointing the pod or the Maverick at a
 * vehicle stands in for slewing onto it (World.tgpPointAt / mavPointAt), as the CAS pre-rolls do.
 */
import type { AgWeaponId } from '../../data/types';
import type { A10cHotas } from '../cas/a10cHotas';
import { predictImpact } from '../../sim/agWeapons';
import { holdAngleAltitude, noseOffsetM } from '../strike/cockpit';
import type { TgpSession } from './session';
import { BUDDY_CODE, centreOf, type TgpLessonId } from './scenario';

export interface Pilot {
  session: TgpSession;
  hotas: A10cHotas;
  /** Advance the sim `sec` seconds at 30 Hz, stopping early when `stop` returns true; `each` runs before every tick. */
  run(sec: number, stop?: () => boolean, each?: () => void): void;
}

type Stage = { id: string; act: (p: Pilot) => void };

const unitPos = (p: Pilot, id: string) => p.session.sc.world.groundUnits.get(id)!.pos;
const col = (p: Pilot, i: number) => unitPos(p, p.session.sc.column[i]!);
const lookAt = (p: Pilot, pos: { x: number; y: number; z: number }) => p.session.sc.world.tgpPointAt(p.session.sc.me.id, pos);
const settle = (p: Pilot) => p.run(0.3);
const rangeTo = (p: Pilot, pos: { x: number; z: number }) => Math.hypot(p.session.sc.me.pos.x - pos.x, p.session.sc.me.pos.z - pos.z);
const kills = (p: Pilot, w: AgWeaponId) => p.session.tracker.kills[w] ?? 0;
const ownFlying = (p: Pilot) => [...p.session.sc.world.agWeapons.values()].some(x => x.alive && x.shooterId === p.session.sc.me.id);

/** HUD as SOI, then DMS Right Short until the profile is selected. */
function profile(p: Pilot, w: AgWeaponId): void {
  const ag = p.session.sc.me.ag!;
  p.hotas.tap('coolieU');
  for (let i = 0; i < 8 && ag.selected !== w; i++) p.hotas.tap('dmsR');
}
/** M until the master mode reads `m`. */
function master(p: Pilot, m: A10cHotas['master']): void {
  for (let i = 0; i < 4 && p.hotas.master !== m; i++) p.hotas.cycleMaster();
}
/** TGP as SOI, pod on the unit, POINT track (TMS Forward Short), optionally make it the SPI (TMS Forward Long). */
function track(p: Pilot, pos: { x: number; y: number; z: number }, spi: boolean): void {
  p.hotas.tap('coolieR', true);
  if (p.hotas.soi !== 'tgp') p.hotas.setSoi('tgp');
  lookAt(p, pos);
  p.hotas.tap('tmsF');
  if (spi) p.hotas.tap('tmsF', true);
  settle(p);
}
function releaseWhenReady(p: Pilot, maxS = 90): void {
  const w = p.session.sc.world, id = p.session.sc.me.id;
  p.run(maxS, () => w.canAgLaunch(id).ok);
  p.hotas.releaseWeapon();
  settle(p);
}

const SCRIPTS: Record<TgpLessonId, Stage[]> = {
  soi: [
    { id: 'tgp', act: p => { p.hotas.tap('coolieR', true); settle(p); } },
    { id: 'tad', act: p => { p.hotas.tap('coolieL', true); settle(p); } },
    { id: 'hud', act: p => { p.hotas.tap('coolieU'); settle(p); } },
    { id: 'pod', act: p => { p.hotas.tap('coolieR', true); lookAt(p, col(p, 2)); settle(p); } },
    { id: 'spi', act: p => { p.hotas.tap('tmsF', true); settle(p); } },
    { id: 'slave', act: p => { const c = col(p, 2); lookAt(p, { x: c.x + 400, y: c.y, z: c.z - 200 }); settle(p); p.hotas.tap('chF', true); settle(p); } },
    { id: 'reset', act: p => { p.hotas.tap('tmsA', true); settle(p); } },
  ],
  pod: [
    { id: 'soi', act: p => { p.hotas.tap('coolieR', true); settle(p); } },
    { id: 'slew', act: p => { lookAt(p, col(p, 2)); settle(p); } },
    { id: 'naro', act: p => { p.hotas.tap('chF'); settle(p); } },
    { id: 'point', act: p => { p.hotas.tap('tmsF'); settle(p); } },
    { id: 'area', act: p => { p.hotas.tap('tmsF'); settle(p); } },
    { id: 'point2', act: p => { p.hotas.tap('tmsF'); settle(p); } },
    { id: 'spi', act: p => { p.hotas.tap('tmsF', true); settle(p); } },
  ],
  laser: [
    { id: 'point', act: p => track(p, col(p, 1), false) },
    { id: 'lase', act: p => { p.hotas.setLaserHeld(true); p.run(2.5); } },
    { id: 'code', act: p => { p.hotas.setLaserHeld(false); settle(p); p.session.sc.world.tgpCode(p.session.sc.me.id, 'lss', BUDDY_CODE); settle(p); } },
    {
      id: 'lss', act: p => {
        const c = centreOf(p.session.sc.world, p.session.sc.trucks)!;
        lookAt(p, c); p.hotas.toggleLss();
        p.run(4, () => p.session.sc.me.ag!.tgp!.lss === 'detect' || p.session.sc.me.ag!.tgp!.lss === 'track');
      },
    },
    { id: 'ltrack', act: p => p.run(4, () => p.session.sc.me.ag!.tgp!.lss === 'track') },
    { id: 'spi', act: p => { p.hotas.tap('tmsF', true); settle(p); } },
  ],
  mav: [
    { id: 'profile', act: p => { profile(p, 'agm65d'); settle(p); } },
    { id: 'master', act: p => { master(p, 'CCIP'); settle(p); } },
    { id: 'point', act: p => track(p, col(p, 0), false) },
    { id: 'spi', act: p => { p.hotas.tap('tmsF', true); settle(p); } },
    { id: 'slave', act: p => { p.hotas.tap('chF', true); settle(p); } },
    { id: 'mavsoi', act: p => { p.hotas.tap('coolieR'); if (p.hotas.soi !== 'mav') p.hotas.setSoi('mav'); settle(p); } },
    {
      id: 'lock', act: p => {
        const tgt = col(p, 0);
        p.run(60, () => rangeTo(p, tgt) < 14000);
        p.hotas.tap('tmsF'); settle(p);
      },
    },
    { id: 'fire', act: p => releaseWhenReady(p) },
    {
      id: 'second', act: p => {
        const w = p.session.sc.world, id = p.session.sc.me.id;
        w.mavPointAt(id, col(p, 4)); p.hotas.tap('tmsF'); settle(p);
        releaseWhenReady(p);
      },
    },
    { id: 'kills', act: p => p.run(90, () => !ownFlying(p) && kills(p, 'agm65d') + kills(p, 'agm65h') >= 2) },
  ],
  lgb: [
    { id: 'point', act: p => track(p, col(p, 1), false) },
    { id: 'spi', act: p => { p.hotas.tap('tmsF', true); settle(p); } },
    { id: 'gbu', act: p => { profile(p, 'gbu12'); settle(p); } },
    { id: 'ccrp', act: p => { master(p, 'CCRP'); settle(p); } },
    { id: 'release', act: p => releaseWhenReady(p) },
    { id: 'lase', act: p => { p.hotas.setLaserHeld(true); p.run(2); } },
    { id: 'gbu-hit', act: p => p.run(90, () => kills(p, 'gbu12') > 0 && p.session.phase === 'apkws') },
    {
      id: 'apkws', act: p => {
        p.run(5, () => p.session.phase === 'apkws');
        profile(p, 'apkws');
        master(p, 'CCIP'); settle(p);
      },
    },
    {
      id: 'truck', act: p => {
        track(p, unitPos(p, p.session.sc.trucks[0]!), false);
        p.hotas.setLaserHeld(true); settle(p);
      },
    },
    { id: 'rkt', act: p => releaseWhenReady(p) },
    { id: 'rkt-hit', act: p => p.run(60, () => kills(p, 'apkws') > 0 && p.session.phase === '65l') },
    {
      id: '65l', act: p => {
        p.run(5, () => p.session.phase === '65l');
        profile(p, 'agm65l');
        track(p, col(p, 3), false);
        p.hotas.setLaserHeld(true); settle(p);
        releaseWhenReady(p);
      },
    },
    { id: '65l-hit', act: p => p.run(90, () => kills(p, 'agm65l') > 0) },
  ],
  gun: [
    { id: 'guns', act: p => { master(p, 'GUNS'); settle(p); } },
    { id: 'fire', act: p => strafe(p, () => (p.session.tracker.fired.gau8 ?? 0) > 0) },
    { id: 'kill', act: p => strafe(p, () => kills(p, 'gau8') > 0) },
  ],
};

/**
 * Hand-flown strafe (the trainer pitch keys): push over once the trucks are inside 4.2 km until the pipper reaches
 * them, hold the dive, fire bursts with the pipper on a truck inside the gun band, pull out below 300 m.
 */
function strafe(p: Pilot, done: () => boolean): void {
  const sc = p.session.sc, w = sc.world, me = sc.me;
  let held = 0, gamma: number | null = null, pulled = false;
  p.run(80, done, () => {
    const c = centreOf(w, sc.trucks);
    if (!c || !me.alive) return;
    me.cmd.heading = Math.atan2(c.x - me.pos.x, -(c.z - me.pos.z));
    const agl = me.pos.y - w.groundHeight(me.pos.x, me.pos.z);
    const ip = predictImpact(w, me, 'gau8');
    const rT = Math.hypot(c.x - me.pos.x, c.z - me.pos.z);
    const pipperShort = ip ? Math.hypot(ip.x - me.pos.x, ip.z - me.pos.z) < rT : false;
    if (rT > 5000) pulled = false;
    if (agl < 300 || pulled) { pulled = true; gamma = null; held = 0; me.cmd.altitude = me.pos.y + noseOffsetM(1); }
    else if (rT < 4200 && !pipperShort) { if (gamma != null) { gamma = null; held = 0; } held += 1 / 30; me.cmd.altitude = me.pos.y - noseOffsetM(held); }
    else if (gamma == null && held > 0) gamma = me.pitch;
    if (gamma != null && !pulled) me.cmd.altitude = holdAngleAltitude(me.pos.y, me.vel.length(), gamma);
    const onTruck = ip && sc.trucks.some(t => { const u = w.groundUnits.get(t)!; return u.alive && Math.hypot(u.pos.x - ip.x, u.pos.z - ip.z) < 20; });
    if (onTruck && w.canAgLaunch(me.id).pr) p.hotas.gun();
  });
}

/** Fly a lesson's script up to and including stage `until` (every stage when omitted). */
export function flyScript(lesson: TgpLessonId, p: Pilot, until?: string): void {
  for (const st of SCRIPTS[lesson]) {
    st.act(p);
    if (st.id === until) return;
  }
}

/** Stage ids of a lesson script (the same ids as the lesson steps). */
export const scriptStages = (lesson: TgpLessonId): string[] => SCRIPTS[lesson].map(s => s.id);
