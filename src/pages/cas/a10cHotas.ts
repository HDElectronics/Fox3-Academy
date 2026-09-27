/**
 * [OWNER: page-cas] A-10C II HOTAS logic for the CAS page, pure (no DOM, no three.js), so tests can fly it: the sensor
 * of interest (SOI), short and long presses (Long = held 1 s or more, ED manual p. 107), TMS / DMS / China Hat /
 * Coolie per SOI, the TGP slew and the TAD cursor, hooking the digital 9-line triangle, the SPI, slave-all-to-SPI,
 * LSS (OSB 6), the laser (Nosewheel Steering button), the master mode cycle and weapon release. The right MFCD shows
 * the TGP or the MAV page (Coolie Right Short cycles them, Right Long makes the shown page the SOI); with the MAV page
 * as SOI the slew moves the Maverick gate, TMS Forward Short locks, China Hat Aft Short recages (research §6).
 * Functions and keys from docs/research/a10c.md §1-4, 6 (PROCEDURES.a10c binds). Not modelled: HMCS, markpoints, the
 * DSMS, the CNTL page (the page sets codes through World.tgpCode), TGP video modes, Maverick EO power and alignment. Trainer values: the long-press threshold is the manual's
 * 1 s; the TAD cursor rate, the hook radius and the "on the target" distances are trainer values.
 */
import { Vector3 } from 'three';
import type { World } from '../../sim/world';
import type { Aircraft, EntityId } from '../../sim/types';
import type { AgWeaponId } from '../../data/types';
import { AG_WEAPONS } from '../../data/agWeapons';
import type { A10cMasterMode } from '../../ui/displays';
import type { JtacController } from './jtac';
import type { A10cMilestone } from './lessons';
import type { XZ } from './scenario';

/** A press held this long is a Long press (ED manual p. 107: 1 s or more). */
export const LONG_PRESS_S = 1;
/** NO LSR shows this long before the LSS searches again (ED manual pp. 389-391). */
const NO_LSR_S = 1;
/** TAD scales in CEN (research §4). */
export const TAD_SCALES = [5, 10, 20, 40, 80, 160] as const;
const NM = 1852;
/** TAD cursor speed: this share of the scale per second at full slew. Trainer value. */
const CURSOR_SCALE_PER_S = 0.35;
/** Hook radius: this share of the scale around the cursor. Trainer value. */
const HOOK_SCALE = 0.07;
/** An SPI or a pod point within this distance of a live briefed target is "on the target" (m). Trainer value. */
export const ON_TARGET_M = 25;

export type Soi = 'hud' | 'tad' | 'tgp' | 'mav';
export type LeftPage = 'tad' | 'msg';
/** Right MFCD page: the TGP page or the MAV page. */
export type RightPage = 'tgp' | 'mav';
export type HotasSwitch = 'tmsF' | 'tmsA' | 'tmsL' | 'tmsR' | 'dmsF' | 'dmsA' | 'dmsL' | 'dmsR' | 'chF' | 'chA' | 'coolieU' | 'coolieD' | 'coolieL' | 'coolieR';
/** Where the SPI came from: the steerpoint (default), the TAD tasking triangle, the pod, or the Maverick line of sight. */
export type SpiSource = 'steer' | 'tasking' | 'tgp' | 'mav';

export interface HotasHost {
  world(): World;
  me(): Aircraft;
  /** The JTAC, or null on pages without one (Targeting pod & Mavericks). */
  jtac(): JtacController | null;
  /** Current steerpoint (the default SPI). */
  steerpoint(): XZ & { name: string };
  /** Briefed target unit ids. */
  targets(): readonly EntityId[];
  /** Friendly ground units shown on the TAD over SADL (the JTAC). */
  friendlies(): { id: EntityId; label: string }[];
  log(text: string, tone?: 'ok' | 'caution'): void;
  /** False ignores weapon release (the lesson has ended). */
  canFire(): boolean;
}

const MASTER_CYCLE: A10cMasterMode[] = ['NAV', 'GUNS', 'CCIP', 'CCRP'];

export class A10cHotas {
  soi: Soi = 'hud';
  leftPage: LeftPage = 'tad';
  rightPage: RightPage = 'tgp';
  /** Maverick seeker field of view (China Hat Forward Short with the MAV page as SOI). */
  mavFov: 'wide' | 'narrow' = 'wide';
  /** China Hat Forward Long presses so far (lessons check a slave after the pod moved). */
  slaveCount = 0;
  master: A10cMasterMode = 'NAV';
  spiSource: SpiSource = 'steer';
  tadScaleNm = 10;
  cursor: XZ = { x: 0, z: 0 };
  hooked: 'tasking' | 'spi' | 'friendly' | null = null;
  /** Laser: held (LATCH OFF, the key) or latched (LATCH ON, the button). */
  laserHeld = false;
  laserLatched = false;
  readonly milestones = new Set<A10cMilestone>();
  private held = new Map<HotasSwitch, { s: number; fired: boolean }>();
  private slewIn = { x: 0, y: 0 };
  /** Store selected before GUNS, restored when leaving it. */
  private storeBeforeGuns: AgWeaponId | null = null;

  constructor(private readonly host: HotasHost) {}

  /** Back to the start state for a new lesson: HUD SOI, TAD on the left, cursor ahead of the jet. */
  reset(): void {
    this.soi = 'hud'; this.leftPage = 'tad'; this.rightPage = 'tgp'; this.mavFov = 'wide'; this.slaveCount = 0;
    this.master = 'NAV'; this.spiSource = 'steer';
    this.tadScaleNm = 10; this.hooked = null; this.laserHeld = false; this.laserLatched = false;
    this.milestones.clear(); this.held.clear(); this.slewIn = { x: 0, y: 0 }; this.storeBeforeGuns = null;
    const ac = this.host.me();
    const d = this.tadScaleNm * NM * 0.3;
    this.cursor = { x: ac.pos.x + Math.sin(ac.heading) * d, z: ac.pos.z - Math.cos(ac.heading) * d };
  }

  // ------------------------------------------------------------------ switches (short / long)
  press(sw: HotasSwitch): void { if (!this.held.has(sw)) this.held.set(sw, { s: 0, fired: false }); }
  release(sw: HotasSwitch): void {
    const h = this.held.get(sw);
    if (!h) return;
    this.held.delete(sw);
    if (!h.fired) this.act(sw, false);
  }
  /** A whole short or long press at once (buttons and scripts). */
  tap(sw: HotasSwitch, long = false): void { this.held.delete(sw); this.act(sw, long); }

  /** Per-frame: long presses fire at 1 s while held; TGP / TAD slew; laser; milestones. */
  step(dt: number): void {
    for (const [sw, h] of this.held) {
      h.s += dt;
      if (!h.fired && h.s >= LONG_PRESS_S) { h.fired = true; this.act(sw, true); }
    }
    const w = this.host.world(), ac = this.host.me();
    if (this.soi === 'tad' && (this.slewIn.x || this.slewIn.y)) {
      const step = this.tadScaleNm * NM * CURSOR_SCALE_PER_S * dt;
      // Heading-up: slew up moves the cursor along the nose, right to the right of the nose.
      const s = Math.sin(ac.heading), c = Math.cos(ac.heading);
      this.cursor.x += (this.slewIn.x * c + this.slewIn.y * s) * step;
      this.cursor.z += (this.slewIn.x * s - this.slewIn.y * c) * step;
    }
    // NO LSR shows for 1 s, then the search starts again (ED manual pp. 389-391).
    const lt = ac.ag?.tgp;
    if (lt?.lss === 'lost' && w.t - lt.lssSince >= NO_LSR_S) w.tgpLss(ac.id, true);
    const want = this.laserHeld || this.laserLatched;
    const t = ac.ag?.tgp;
    if (t && want !== t.laserFiring && ac.alive) {
      const r = w.tgpLaser(ac.id, want);
      if (!r.ok && want) { this.laserHeld = false; this.laserLatched = false; this.host.log(r.reason, 'caution'); }
    }
    this.updateMilestones();
  }

  /** Slew input (−1..1): the TGP with the TGP as SOI, the Maverick gate with the MAV page as SOI, the TAD cursor with the TAD as SOI. */
  slew(x: number, y: number): void {
    this.slewIn = { x, y };
    const ac = this.host.me(), w = this.host.world();
    w.tgpSlew(ac.id, this.soi === 'tgp' ? x : 0, this.soi === 'tgp' ? y : 0);
    if (ac.ag?.mav) w.mavSlew(ac.id, this.soi === 'mav' ? x : 0, this.soi === 'mav' ? y : 0);
  }

  private act(sw: HotasSwitch, long: boolean): void {
    switch (sw) {
      case 'coolieU': if (long) this.leftPage = 'msg'; else this.setSoi('hud'); break;
      case 'coolieD': this.host.log(long ? 'DSMS quick-look: not modelled' : 'HMCS: not modelled', 'caution'); break;
      case 'coolieL': if (long) this.setSoi('tad'); else this.cycleLeft(); break;
      case 'coolieR': if (long) this.setSoi(this.rightPage); else this.cycleRight(); break;
      case 'tmsF': this.tmsForward(long); break;
      case 'tmsA': this.tmsAft(long); break;
      case 'tmsL': if (long) this.host.log('SPI broadcast on the datalink'); else this.host.jtac()?.clearNewTasking(); break;
      case 'tmsR': this.host.log('Markpoint: not modelled', 'caution'); break;
      case 'dmsF': case 'dmsA': this.dmsForwardAft(sw === 'dmsF'); break;
      case 'dmsL': case 'dmsR': this.dmsLeftRight(); break;
      case 'chF': this.chinaForward(long); break;
      case 'chA': this.chinaAft(long); break;
    }
  }

  setSoi(s: Soi): void {
    if (s === 'tad') this.leftPage = 'tad';
    if (s === 'tgp' || s === 'mav') this.rightPage = s;
    this.soi = s;
    // A slew held across the SOI change goes to the new sensor only.
    this.slew(this.slewIn.x, this.slewIn.y);
  }

  /** Coolie Right Short: next right MFCD page (TGP ↔ MAV); an SOI on that MFCD moves to the new page. */
  cycleRight(): void {
    this.rightPage = this.rightPage === 'tgp' ? 'mav' : 'tgp';
    if (this.soi === 'tgp' || this.soi === 'mav') this.setSoi(this.rightPage);
  }

  private cycleLeft(): void {
    this.leftPage = this.leftPage === 'tad' ? 'msg' : 'tad';
    if (this.soi === 'tad' && this.leftPage !== 'tad') this.soi = 'hud';
  }

  // ------------------------------------------------------------------ TMS
  private tmsForward(long: boolean): void {
    const w = this.host.world(), ac = this.host.me(), t = ac.ag?.tgp;
    if (this.soi === 'mav') {
      const m = ac.ag?.mav;
      if (!m) { this.host.log('No AGM-65D / H loaded', 'caution'); return; }
      if (long) {
        if (!m.aim) { this.host.log('Maverick caged: slave it to the SPI first', 'caution'); return; }
        ac.ag!.spi = m.aim.clone();
        this.spiSource = 'mav';
        this.host.log('SPI: Maverick line of sight');
        return;
      }
      const r = w.mavLock(ac.id);
      if (!r.ok) this.host.log(r.reason, 'caution');
      else this.host.log(`MAV: locked${this.host.targets().includes(r.unitId ?? '') ? '' : ' (not a briefed target)'}`);
      return;
    }
    if (this.soi === 'tgp') {
      if (!t) return;
      if (long) {
        const r = w.setSpi(ac.id);
        if (!r.ok) { this.host.log(r.reason, 'caution'); return; }
        this.spiSource = 'tgp';
        if (this.onTarget(ac.ag!.spi!, t.trackedUnitId)) this.milestones.add('spi-tgp');
        this.host.log('SPI: TGP');
        return;
      }
      const r = w.tgpTrack(ac.id, t.track === 'point' ? 'area' : 'point');
      if (!r.ok) this.host.log(r.reason, 'caution');
      else if (t.track === 'point') this.host.log(`TGP: POINT${this.host.targets().includes(t.trackedUnitId ?? '') ? '' : ' (not a briefed target)'}`);
      return;
    }
    if (this.soi === 'tad') {
      if (!long) { this.hook(); return; }
      const p = this.hookedXZ();
      if (!p) { this.host.log('Hook a symbol first: TMS Forward Short', 'caution'); return; }
      ac.ag!.spi = vec(w, p);
      this.spiSource = this.hooked === 'tasking' ? 'tasking' : 'steer';
      if (this.hooked === 'tasking') this.milestones.add('spi-tasking');
      this.host.log(this.hooked === 'tasking' ? 'SPI: the tasking triangle' : 'SPI: TAD hook');
      return;
    }
    this.host.log(long ? 'HUD TDC SPI: not modelled, use the TGP or the TAD' : 'HUD TDC: not modelled', 'caution');
  }

  private tmsAft(long: boolean): void {
    const w = this.host.world(), ac = this.host.me();
    if (long) {
      ac.ag!.spi = null;
      this.spiSource = 'steer';
      this.host.log('SPI: steerpoint');
      return;
    }
    if (this.soi === 'tgp') { const r = w.tgpTrack(ac.id, 'inr'); if (!r.ok) this.host.log(r.reason, 'caution'); }
    else if (this.soi === 'tad') this.hooked = null;
  }

  /** TAD: hook the symbol nearest the cursor within the hook radius (tasking triangle, SPI, SADL friendly). */
  hook(): boolean {
    const c = this.cursor, r = this.tadScaleNm * NM * HOOK_SCALE;
    const tk = this.host.jtac()?.tasking;
    const cands: { what: 'tasking' | 'spi' | 'friendly'; p: XZ }[] = [];
    if (tk && tk.state !== 'cntco') cands.push({ what: 'tasking', p: tk.pos });
    cands.push({ what: 'spi', p: this.spiXZ() });
    for (const f of this.host.friendlies()) { const u = this.host.world().groundUnits.get(f.id); if (u) cands.push({ what: 'friendly', p: u.pos }); }
    let best: (typeof cands)[number] | null = null, bd = r;
    for (const k of cands) { const d = Math.hypot(k.p.x - c.x, k.p.z - c.z); if (d <= bd) { best = k; bd = d; } }
    this.hooked = best?.what ?? null;
    if (this.hooked === 'tasking') this.milestones.add('hook-tasking');
    if (!best) this.host.log('Nothing under the cursor to hook', 'caution');
    return !!best;
  }

  private hookedXZ(): XZ | null {
    if (this.hooked === 'tasking') { const tk = this.host.jtac()?.tasking; return tk && tk.state !== 'cntco' ? tk.pos : null; }
    if (this.hooked === 'spi') return this.spiXZ();
    if (this.hooked === 'friendly') {
      const f = this.host.friendlies()[0];
      const u = f ? this.host.world().groundUnits.get(f.id) : undefined;
      return u ? { x: u.pos.x, z: u.pos.z } : null;
    }
    return null;
  }

  /** The SPI on the ground: the set SPI, or the steerpoint (default). */
  spiXZ(): XZ {
    const s = this.host.me().ag?.spi;
    return s ? { x: s.x, z: s.z } : this.host.steerpoint();
  }

  // ------------------------------------------------------------------ DMS, China Hat
  private dmsForwardAft(fwd: boolean): void {
    const ac = this.host.me();
    if (this.soi === 'tad') {
      const i = TAD_SCALES.indexOf(this.tadScaleNm as (typeof TAD_SCALES)[number]);
      this.tadScaleNm = TAD_SCALES[Math.max(0, Math.min(TAD_SCALES.length - 1, i + (fwd ? -1 : 1)))]!;
    } else if (this.soi === 'tgp') {
      // Zoom is simplified to the two fields of view: DMS Forward narrows, Aft widens.
      const t = ac.ag?.tgp;
      if (t && (t.fov === 'wide') === fwd) this.host.world().tgpToggleFov(ac.id);
    }
  }

  private dmsLeftRight(): void {
    if (this.soi !== 'hud') { this.host.log('DMS Left / Right: weapon profiles with the HUD as SOI', 'caution'); return; }
    const w = this.host.world(), ac = this.host.me();
    const sel = w.cycleAgWeapon(ac.id);
    this.host.log(sel ? `Profile: ${AG_WEAPONS[sel].hudLabel}` : 'No store left');
  }

  private chinaForward(long: boolean): void {
    const ac = this.host.me();
    if (long) { this.slaveToSpi(); return; }
    if (this.soi === 'tgp' && ac.ag?.tgp) this.host.world().tgpToggleFov(ac.id);
    if (this.soi === 'mav' && ac.ag?.mav) { this.mavFov = this.mavFov === 'wide' ? 'narrow' : 'wide'; this.host.log(`MAV FOV ${this.mavFov === 'wide' ? 'WIDE' : 'NARO'}`); }
  }

  private chinaAft(long: boolean): void {
    const w = this.host.world(), ac = this.host.me();
    if (long) {
      const sp = this.host.steerpoint();
      w.tgpPointAt(ac.id, sp);
      this.host.log(`TGP to the steerpoint ${sp.name}`);
      return;
    }
    // Manual p. 112 lists China Hat Aft Short with the TGP as SOI as "Toggle LSS" (not verified in game).
    if (this.soi === 'tgp') { this.toggleLss(); return; }
    // Otherwise China Hat Aft Short recages the Maverick (research §6).
    if (ac.ag?.mav) { w.mavRecage(ac.id); this.host.log('Maverick recaged'); }
  }

  /** China Hat Forward Long: every sensor to the SPI: the pod and, when loaded, the AGM-65D / H seeker. */
  slaveToSpi(): void {
    const w = this.host.world(), ac = this.host.me();
    const p = this.spiXZ();
    const t = ac.ag?.tgp;
    if (!t) return;
    if (!t.on) w.tgpPower(ac.id, true);
    if (t.lss !== 'off') w.tgpLss(ac.id, false);
    w.tgpPointAt(ac.id, p);
    if (ac.ag!.mav) { if (ac.ag!.spi) w.mavSlaveToSpi(ac.id); else w.mavPointAt(ac.id, p); }
    this.slaveCount++;
    if (this.spiSource !== 'steer' || ac.ag!.spi) this.milestones.add('slave');
    this.host.log('Sensors slaved to the SPI');
  }

  // ------------------------------------------------------------------ OSB, laser, modes, release
  /** TGP page OSB 6: LSS on or off. */
  toggleLss(): void {
    const w = this.host.world(), ac = this.host.me(), t = ac.ag?.tgp;
    if (!t) return;
    const on = t.lss === 'off' || t.lss === 'lost';
    const r = w.tgpLss(ac.id, on);
    if (!r.ok) this.host.log(r.reason, 'caution');
    else this.host.log(on ? `LSS: searching on ${t.lssCode}` : 'LSS off');
  }

  setLaserHeld(on: boolean): void { this.laserHeld = on; }
  toggleLaserLatch(): void { this.laserLatched = !this.laserLatched; }

  /** Master Mode Control Button: NAV → GUNS → CCIP → CCRP. GUNS selects the gun; leaving it restores the store. */
  cycleMaster(): A10cMasterMode {
    const next = MASTER_CYCLE[(MASTER_CYCLE.indexOf(this.master) + 1) % MASTER_CYCLE.length]!;
    this.setMaster(next);
    return next;
  }

  setMaster(m: A10cMasterMode): void {
    const w = this.host.world(), ac = this.host.me(), ag = ac.ag!;
    if (m === 'GUNS' && ag.selected !== 'gau8') { this.storeBeforeGuns = ag.selected; w.selectAgWeapon(ac.id, 'gau8'); }
    if (m !== 'GUNS' && ag.selected === 'gau8') {
      const back = this.storeBeforeGuns && (ag.stores[this.storeBeforeGuns] ?? 0) > 0 ? this.storeBeforeGuns : null;
      if (back) w.selectAgWeapon(ac.id, back); else w.cycleAgWeapon(ac.id);
    }
    this.master = m;
    w.setAgMaster(ac.id, m === 'NAV' ? 'nav' : 'ag');
  }

  /** Weapon release (community key RAlt+Space). The trainer releases on the press (no CCRP cue timing). */
  releaseWeapon(): boolean {
    if (!this.host.canFire()) return false;
    const w = this.host.world(), ac = this.host.me();
    if (this.master === 'NAV') { this.host.log('NAV master mode: press M for CCIP or CCRP', 'caution'); return false; }
    const out = w.agLaunch(ac.id);
    if (!Array.isArray(out)) { this.host.log(out.reason || 'No release', 'caution'); return false; }
    return out.length > 0;
  }

  /** Gun trigger (community key Space): fires in GUNS only. */
  gun(): boolean {
    if (this.master !== 'GUNS') return false;
    return this.releaseWeapon();
  }

  // ------------------------------------------------------------------ helpers
  /** A point (or a tracked unit) on a live briefed target. */
  onTarget(p: { x: number; z: number }, unitId: EntityId | null = null): boolean {
    const w = this.host.world();
    const tg = this.host.targets();
    if (unitId && tg.includes(unitId)) return !!w.groundUnits.get(unitId)?.alive;
    return tg.some(id => { const u = w.groundUnits.get(id); return !!u?.alive && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) <= ON_TARGET_M; });
  }

  private updateMilestones(): void {
    const w = this.host.world(), ac = this.host.me(), t = ac.ag?.tgp;
    if (!t) return;
    if (t.lss === 'detect' || t.lss === 'track') this.milestones.add('lss-detect');
    if (t.lss === 'track') this.milestones.add('lss-track');
    if (t.track === 'point' && t.trackedUnitId && this.host.targets().includes(t.trackedUnitId)) this.milestones.add('point-target');
    if (t.laserFiring && [...w.agWeapons.values()].some(x => x.alive && x.shooterId === ac.id)) this.milestones.add('laser-release');
  }
}

function vec(w: World, p: XZ): Vector3 { return new Vector3(p.x, w.groundHeight(p.x, p.z), p.z); }
