/**
 * [OWNER: page-tgp] TgpTracker: samples the sim and the HOTAS state each tick into the lesson snapshot (TgpSnap),
 * keeping the sticky "seen" flags and the own releases and kills per store (from World events). Pure: no DOM, no
 * three.js; the page and the tests share it.
 */
import type { AgWeaponId } from '../../data/types';
import type { SimEvent } from '../../sim/types';
import type { A10cHotas, Soi } from '../cas/a10cHotas';
import type { TgpSnap } from './lessons';
import { buddyMark, centreOf, type TgpScenario } from './scenario';

/** An SPI within this distance of the column centre is "on the column" (m). Trainer value. */
const SPI_ON_COLUMN_M = 150;
/** An SPI or a point within this distance of a live red vehicle is on it (m). Trainer value. */
const ON_UNIT_M = 25;
/** The pod counts as "off the SPI" beyond this distance (m). Trainer value. */
const OFF_SPI_M = 150;

export class TgpTracker {
  private soiSeen = new Set<Soi>();
  private narrowSeen = false;
  private pointSeen = false;
  private areaAfterPoint = false;
  private offSpi = false;
  private slaveAt = 0;
  private slavedBack = false;
  private laserRunS = 0;
  private lasedPointS = 0;
  private lssDetectBuddy = false;
  private lssTrackBuddy = false;
  private mavSlaved = false;
  private lasedWithWeapon = false;
  private weapons = new Map<string, AgWeaponId>();
  readonly fired: Partial<Record<AgWeaponId, number>> = {};
  readonly kills: Partial<Record<AgWeaponId, number>> = {};
  /** Release ranges (m) of own stores, for the log and the debrief. */
  readonly launches: { weapon: AgWeaponId; rangeM: number | null; t: number }[] = [];
  private off: () => void;

  constructor(private readonly sc: TgpScenario, private readonly hotas: A10cHotas) {
    this.off = sc.world.on(e => this.onEvent(e));
    this.slaveAt = hotas.slaveCount;
  }

  dispose(): void { this.off(); }

  private onEvent(e: SimEvent): void {
    const me = this.sc.me.id;
    if (e.type === 'ag-launch' && e.shooterId === me) {
      this.weapons.set(e.weaponId, e.weapon);
      this.fired[e.weapon] = (this.fired[e.weapon] ?? 0) + 1;
      this.launches.push({ weapon: e.weapon, rangeM: e.range, t: e.t });
    } else if (e.type === 'ground-kill' && e.by === me && e.weapon) {
      this.kills[e.weapon] = (this.kills[e.weapon] ?? 0) + 1;
    }
  }

  /** Per tick, after the world and the HOTAS stepped: update the sticky flags. */
  step(dt: number): void {
    const w = this.sc.world, me = this.sc.me, ag = me.ag!, t = ag.tgp!, ho = this.hotas;
    this.soiSeen.add(ho.soi);
    if (t.fov === 'narrow') this.narrowSeen = true;
    if (t.track === 'point') this.pointSeen = true;
    else if (this.pointSeen && (t.track === 'area' || t.track === 'inr')) this.areaAfterPoint = true;
    // Slave back: the pod was off the SPI, then China Hat Forward Long brought it back.
    if (ag.spi && ho.spiSource === 'tgp' && Math.hypot(t.aim.x - ag.spi.x, t.aim.z - ag.spi.z) > OFF_SPI_M) this.offSpi = true;
    if (ho.slaveCount !== this.slaveAt) {
      this.slaveAt = ho.slaveCount;
      if (this.offSpi && ag.spi && Math.hypot(t.aim.x - ag.spi.x, t.aim.z - ag.spi.z) < 5) this.slavedBack = true;
    }
    if (t.laserFiring && t.track === 'point' && t.trackedUnitId) { this.laserRunS += dt; this.lasedPointS = Math.max(this.lasedPointS, this.laserRunS); }
    else this.laserRunS = 0;
    const bm = buddyMark(this.sc);
    if (bm && (t.lss === 'detect' || t.lss === 'track') && t.lssMarkId === bm.id) {
      this.lssDetectBuddy = true;
      if (t.lss === 'track') this.lssTrackBuddy = true;
    }
    const m = ag.mav;
    if (m?.aim && ag.spi && Math.hypot(m.aim.x - ag.spi.x, m.aim.z - ag.spi.z) < 30) this.mavSlaved = true;
    if (t.laserFiring) {
      for (const wp of w.agWeapons.values()) {
        if (wp.alive && wp.shooterId === me.id && (wp.type === 'gbu12' || wp.type === 'apkws' || wp.type === 'agm65l')) { this.lasedWithWeapon = true; break; }
      }
    }
  }

  snap(): TgpSnap {
    const w = this.sc.world, me = this.sc.me, ag = me.ag!, t = ag.tgp!, ho = this.hotas;
    const liveUnit = (id: string | null) => !!id && !!w.groundUnits.get(id)?.alive;
    const nearest = (p: { x: number; z: number }, ids: readonly string[]) => {
      let best: number | null = null;
      for (const id of ids) { const u = w.groundUnits.get(id); if (!u?.alive) continue; const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z); if (best == null || d < best) best = d; }
      return best;
    };
    const spi = ag.spi;
    const col = centreOf(w, this.sc.column);
    const bm = buddyMark(this.sc);
    return {
      soi: ho.soi, rightPage: ho.rightPage, soiSeen: this.soiSeen, master: ho.master, selected: ag.selected,
      tgpOn: t.on, fov: t.fov, narrowSeen: this.narrowSeen, track: t.track,
      pointOnColumn: t.track === 'point' && !!t.trackedUnitId && this.sc.column.includes(t.trackedUnitId) && liveUnit(t.trackedUnitId),
      pointOnTruck: t.track === 'point' && !!t.trackedUnitId && this.sc.trucks.includes(t.trackedUnitId) && liveUnit(t.trackedUnitId),
      areaAfterPoint: this.areaAfterPoint,
      aimToColumnM: t.on ? nearest(t.aim, this.sc.column) : null,
      spiSource: ho.spiSource,
      spiOnColumn: !!spi && !!col && Math.hypot(spi.x - col.x, spi.z - col.z) <= SPI_ON_COLUMN_M,
      spiOnTarget: !!spi && (nearest(spi, this.sc.targets) ?? 1e9) <= ON_UNIT_M,
      slavedBack: this.slavedBack,
      laserCode: t.laserCode, lssCode: t.lssCode, laserFiring: t.laserFiring, lasedPointS: this.lasedPointS,
      lss: t.lss, lssDetectBuddy: this.lssDetectBuddy, lssTrackBuddy: this.lssTrackBuddy,
      spiOnBuddySpot: !!spi && !!bm && Math.hypot(spi.x - bm.pos.x, spi.z - bm.pos.z) <= 15,
      mavSlaved: this.mavSlaved, mavLocked: !!ag.mav?.lockedUnitId,
      launchOk: ho.master !== 'NAV' && w.canAgLaunch(me.id).ok,
      fired: { ...this.fired }, kills: { ...this.kills }, lasedWithWeapon: this.lasedWithWeapon,
    };
  }
}
