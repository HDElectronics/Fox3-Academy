/**
 * [OWNER: page-strike] Su-25T cockpit wiring shared by the attack pages (Strike, CAS): the IT-23M Shkval TV, the HUD
 * and the SPO-15, the touch pad, the Controls rows, the key map and the actions behind them (master modes, Shkval,
 * laser, weapon select, lock, release, Kh-58 passive detection), and the display state builders. Keys from
 * PROCEDURES.su25t (S1). The page owns the World, the lesson logic and the readouts; it merges `keys` into its
 * single bindKeys map and calls `step`, `draw` and `updateLamps` from its loop.
 */
import { AG_WEAPONS, KH58_TARGET_CODES } from '../../data/agWeapons';
import { PROCEDURES } from '../../data/procedures';
import type { AgWeaponId } from '../../data/types';
import type { AgWeapon, Aircraft, EntityId } from '../../sim/types';
import type { World } from '../../sim/world';
import { D2R, R2D, dirFrom, relBearing } from '../../sim/math';
import { shkvalAimPoint, shkvalDir, shkvalFovDeg } from '../../sim/shkval';
import { armEmitters, ccrpSolution, predictImpact } from '../../sim/agWeapons';
import type { ShkvalTv } from '../../render/attack';
import { h, screenBezel, button, placard, keyHint, disclosure, mobileAction, type ButtonHandle, type Cleanup, type KeyMap, type Tone } from '../../ui';
import { RwrDisplay, It23mDisplay, Su25tHud, su25tHudAngles as hudAngles, hudModeLabel, type It23mState, type Su25tHudState } from '../../ui/displays';
import { projectArmHudPoint } from '../../ui/displays/su25tHud';
import { pickArmEmitter } from './targeting';

/** Kh-58 HUD: the ±30° detection zone is drawn across this many HUD degrees each side (simplified). */
const ARM_HUD_DEG = 11;
/** HUD degrees per second the Kh-58 square slews (trainer value). */
const ARM_SLEW_DPS = 6;
/** Trainer estimate of the Vikhr's mean speed for the pre-launch time of flight (not DCS data). */
const VIKHR_MEAN_MS = 480;
const STATION_LABEL: Record<string, string> = { r60: '60', r73: '73', l081: 'L-081' };

export interface CockpitHost {
  bag: Cleanup;
  world(): World;
  me(): Aircraft;
  log(text: string, opts?: { t?: number; tone?: Tone }): void;
  /** False ignores the release key (the lesson has ended). */
  canFire(): boolean;
  /** Up / Down trainer keys: the page decides what a climb means (altitude or terrain-following height). */
  climb(m: number): void;
  /** Weapons released by the pilot (not CCRP automatic releases, which arrive as ag-launch events). */
  onRelease?(out: AgWeapon[]): void;
  /** A Shkval lock attempt failed; `reason` is in pilot words. */
  onLockFail?(reason: string): void;
}

export interface ArmMark { id: EntityId; xDeg: number; yDeg: number; code: string | null; locked: boolean }

export interface Su25tCockpit {
  tvCanvas: HTMLCanvasElement;
  tv: It23mDisplay;
  tvBezel: { el: HTMLElement };
  hudBezel: { el: HTMLElement };
  rwrBezel: { el: HTMLElement };
  touchPad: HTMLElement;
  /** Rows for the Controls console panel. */
  controlRows: HTMLElement[];
  /** Su-25T key list disclosure. */
  keyList: HTMLElement;
  fireBtn: ButtonHandle;
  lockBtn: ButtonHandle;
  laserBtn: ButtonHandle;
  /** Phone action bar mirrors of Fire, Lock and ЛД. */
  mobileActions: HTMLElement[];
  /** Cockpit keys; merge into the page's single bindKeys map. */
  keys: KeyMap;
  /** Kh-58 HUD square position (HUD degrees). */
  armCursor: { x: number; y: number };
  armMode(): boolean;
  armMarks(): ArmMark[];
  setMaster(m: 'nav' | 'ag' | 'fixed'): void;
  toggleShkval(): void;
  toggleLaser(): void;
  toggleArm(): void;
  cycle(): void;
  selectGun(): void;
  enter(): void;
  fire(): void;
  fireUp(): void;
  /** Per-frame input integration (Kh-58 square slew). */
  step(dt: number): void;
  /** Clear held inputs and the Kh-58 square after a restart. */
  resetInputs(): void;
  /** Draw the TV (with the Shkval camera image when there is one), the HUD and, when asked, the SPO-15. */
  draw(tvCam: ShkvalTv | null, showRwr: boolean): void;
  updateLamps(): void;
  tvState(): It23mState;
  hudState(): Su25tHudState;
}

export function createSu25tCockpit(host: CockpitHost): Su25tCockpit {
  const { bag } = host;
  const world = host.world, me = host.me;
  const log = (text: string, opts?: { t?: number; tone?: Tone }) => host.log(text, { t: world().t, ...opts });
  const binds = PROCEDURES.su25t.binds;
  const slew = { up: 0, down: 0, left: 0, right: 0 };
  const armCursor = { x: 0, y: -4 };

  // ------------------------------------------------------------------ displays
  const tvCanvas = h('canvas', { class: 'strk-canvas', 'aria-label': 'Shkval TV picture on the IT-23M. Tap to point the sight.' });
  const hudCanvas = h('canvas', { class: 'strk-canvas', 'aria-label': 'Su-25T HUD' });
  const tvBezel = screenBezel({ id: 'strk-tv', label: 'ИТ-23М', aspect: '4 / 3', content: tvCanvas, class: 'strk-tv' });
  const hudBezel = screenBezel({ id: 'strk-hud', label: 'ИЛС', aspect: '1', content: hudCanvas, class: 'strk-hud' });
  const rwrCanvas = h('canvas', { class: 'strk-canvas', 'aria-label': 'SPO-15 radar warning display' });
  const rwrBezel = screenBezel({ id: 'strk-rwr', label: 'СПО-15', aspect: '1', content: rwrCanvas, class: 'strk-rwr' });
  const tv = new It23mDisplay(tvCanvas);
  const hud = new Su25tHud(hudCanvas);
  const rwr = new RwrDisplay(rwrCanvas, { rwr: 'spo15' });
  bag.add(() => { tv.dispose(); hud.dispose(); rwr.dispose(); });

  // ------------------------------------------------------------------ touch pad and controls
  const hold = (label: string, aria: string, set: (v: number) => void) => {
    const b = h('button', { type: 'button', class: 'ui-btn strk-pad__btn', 'aria-label': aria }, label);
    const on = () => { set(1); applySlew(); }, off = () => { set(0); applySlew(); };
    bag.on(b, 'pointerdown', (e: Event) => { e.preventDefault(); on(); });
    for (const t of ['pointerup', 'pointerleave', 'pointercancel']) bag.on(b, t, off);
    return b;
  };
  const cap = (label: string, aria: string, fn: () => void) => button({ label, size: 's', ariaLabel: aria, onClick: fn, keepCase: true }).el;
  const fireBtn = button({ label: 'Fire', variant: 'primary', lamp: true, keys: 'Space', onClick: () => { if (me().ag!.ccrpHeld) fireUp(); else fire(); } });
  const lockBtn = button({ label: 'Lock / unlock', keys: 'Enter', onClick: () => enter() });
  const laserBtn = button({ label: 'Laser ЛД', keys: 'RShift+O', lamp: true, onClick: () => toggleLaser(), keepCase: true });
  const touchPad = h('div', { class: 'ui-strip-block strk-touch' }, placard('Shkval'),
    h('div', { class: 'strk-pad' },
      h('span'), hold('▲', 'Slew up', v => { slew.up = v; }), h('span'),
      hold('◀', 'Slew left', v => { slew.left = v; }), cap('⏎', 'Stabilise or lock', () => enter()), hold('▶', 'Slew right', v => { slew.right = v; }),
      h('span'), hold('▼', 'Slew down', v => { slew.down = v; }), h('span')),
    h('div', { class: 'strk-pad__row' }, cap('Zoom −', 'Zoom out', () => world().shkvalZoom(me().id, -1)), cap('Zoom +', 'Zoom in', () => world().shkvalZoom(me().id, 1))),
    h('div', { class: 'strk-pad__row' }, cap('Size −', 'Target size smaller', () => world().shkvalTargetSize(me().id, { step: -1 })), cap('Size +', 'Target size larger', () => world().shkvalTargetSize(me().id, { step: 1 }))),
  );
  const ctlRow = (...els: HTMLElement[]) => h('div', { class: 'strk-row' }, ...els);
  const controlRows = [
    ctlRow(cap('7 ОПТ-ЗЕМЛЯ', 'Air-to-ground mode', () => setMaster('ag')), cap('O Shkval', 'Shkval on or off', () => toggleShkval())),
    ctlRow(cap('D Weapon', 'Next weapon', () => cycle()), cap('C Cannon', 'Select the cannon', () => selectGun())),
    ctlRow(lockBtn.el, laserBtn.el),
    ctlRow(cap('I ПРГ', 'Kh-58 passive detection on or off', () => toggleArm())),
    fireBtn.el,
  ];
  const keyList = disclosure({
    title: 'Su-25T keys', id: 'strk-keys',
    content: h('div', { class: 'strk-keys' },
      binds.filter(b => b.group !== 'defence').map(b => keyHint({ label: b.action, keys: b.keys, note: b.note })),
      keyHint({ label: 'Trainer steering (not a DCS key)', keys: 'Left / Right, Up / Down' })),
  });
  const mFire = mobileAction(fireBtn.el), mLock = mobileAction(lockBtn.el, 'Lock'), mLaser = mobileAction(laserBtn.el, 'ЛД');
  bag.add(() => { mFire.destroy(); mLock.destroy(); mLaser.destroy(); });
  bag.on(tvCanvas, 'click', (e: Event) => tapTv(e as MouseEvent));

  // ------------------------------------------------------------------ keys
  const keys: KeyMap = {
    '7': () => setMaster('ag'),
    '1': () => setMaster('nav'),
    '8': () => setMaster(me().ag!.master === 'fixed' ? 'ag' : 'fixed'),
    'D': () => cycle(),
    'C': () => selectGun(),
    'O': () => toggleShkval(),
    'RShift+O': () => toggleLaser(),
    ';': { down: () => { slew.up = 1; applySlew(); }, up: () => { slew.up = 0; applySlew(); } },
    '.': { down: () => { slew.down = 1; applySlew(); }, up: () => { slew.down = 0; applySlew(); } },
    ',': { down: () => { slew.left = 1; applySlew(); }, up: () => { slew.left = 0; applySlew(); } },
    '/': { down: () => { slew.right = 1; applySlew(); }, up: () => { slew.right = 0; applySlew(); } },
    'Enter': () => enter(),
    '=': () => world().shkvalZoom(me().id, 1),
    '-': () => world().shkvalZoom(me().id, -1),
    'RCtrl+]': () => world().shkvalTargetSize(me().id, { step: 1 }),
    'RCtrl+[': () => world().shkvalTargetSize(me().id, { step: -1 }),
    'Space': { down: () => fire(), up: () => fireUp(), inModal: false },
    'I': () => toggleArm(),
    'Delete': () => { if (world().flare(me().id)) log(`Flares: ${me().flares} left`); },
    'Left': { down: () => steer(-2), repeat: true },
    'Right': { down: () => steer(2), repeat: true },
    'Up': { down: () => host.climb(60), repeat: true },
    'Down': { down: () => host.climb(-60), repeat: true },
  };

  // ------------------------------------------------------------------ actions
  /** Kh-58 selected with passive detection on: the slew keys move the HUD square, Enter locks an emitter. */
  function armMode(): boolean { const ag = me().ag!; return ag.selected === 'kh58' && ag.arm.detecting; }
  function applySlew(): void { world().shkvalSlew(me().id, armMode() ? 0 : slew.right - slew.left, armMode() ? 0 : slew.up - slew.down); }
  function toggleArm(): void {
    const on = !me().ag!.arm.detecting;
    const r = world().armDetect(me().id, on);
    log(r.ok ? (on ? 'ПРГ: passive detection on' : 'Passive detection off') : r.reason, { tone: r.ok ? undefined : 'caution' });
    applySlew();
  }
  /** Emitters inside ±30° as HUD marks: x scaled so the zone fits the HUD (simplified), y from the elevation. */
  function armMarks(): ArmMark[] {
    const w = world(), ac = me();
    return armEmitters(w, ac).map(id => {
      const site = w.samSites.get(id)!;
      const a = hudAngles(ac.pos, ac.heading, ac.pitch, site.pos);
      return {
        id, ...projectArmHudPoint({ xDeg: (relBearing(ac.pos, ac.heading, site.pos) * R2D) * ARM_HUD_DEG / 30, yDeg: a.yDeg }),
        code: KH58_TARGET_CODES[site.type] ?? null, locked: ac.ag!.arm.emitterId === id,
      };
    });
  }
  function armEnter(): void {
    const w = world(), ag = me().ag!;
    if (ag.arm.emitterId) { ag.arm.emitterId = null; log('Emitter unlocked'); return; }
    const best = pickArmEmitter(armMarks(), { xDeg: armCursor.x, yDeg: armCursor.y });
    if (!best) { log('Put the square on a diamond first', { tone: 'caution' }); return; }
    const r = w.armLock(me().id, best.id);
    log(r.ok ? `Emitter locked: ${w.samSites.get(best.id)!.callsign}` : r.reason, { tone: r.ok ? 'ok' : 'caution' });
  }
  function setMaster(m: 'nav' | 'ag' | 'fixed'): void {
    world().setAgMaster(me().id, m);
    log(m === 'ag' ? 'Air-to-ground mode: ОПТ-ЗЕМЛЯ' : m === 'fixed' ? 'Fixed reticle' : 'Navigation mode');
  }
  function toggleShkval(): void { world().shkvalPower(me().id, !me().ag!.shkval.on); log(me().ag!.shkval.on ? 'Shkval on' : 'Shkval off'); }
  function toggleLaser(): void {
    const on = !me().ag!.shkval.laserOn;
    const r = world().laser(me().id, on);
    if (!r.ok) log(r.reason, { tone: 'caution' });
  }
  function cycle(): void { const w = world().cycleAgWeapon(me().id); log(w ? `Store: ${AG_WEAPONS[w].hudLabel}` : 'No store left'); }
  function selectGun(): void { world().selectAgWeapon(me().id, 'gun25t'); log('Cannon: ВПУ'); }
  function steer(deg: number): void { me().cmd.heading = me().cmd.heading + deg * D2R; }
  function enter(): void {
    if (armMode()) { armEnter(); return; }
    const w = world(), id = me().id, sh = me().ag!.shkval;
    if (!sh.on) { log('Shkval is off [O]', { tone: 'caution' }); return; }
    if (sh.lockedUnitId) { w.shkvalUnlock(id); log('КС: unlocked'); return; }
    if (!sh.groundStab) {
      const r = w.shkvalStabilise(id, true);
      if (!r.ok) { log(r.reason, { tone: 'caution' }); return; }
    }
    const r = w.shkvalLock(id);
    if (!r.ok) { log(r.reason, { tone: 'caution' }); host.onLockFail?.(r.reason); }
  }
  function fire(): void {
    if (!host.canFire()) return;
    const w = world(), ac = me();
    if (ccrpSolution(w, ac).active) {
      if (ac.ag!.ccrpHeld) return;
      const r = w.ccrpHold(ac.id, true);
      log(r.ok ? 'Release held: CCRP, fly the keel into the circle' : r.reason, { tone: r.ok ? undefined : 'caution' });
      return;
    }
    const out = w.agLaunch(ac.id);
    if (!Array.isArray(out)) { log(out.reason || 'No release', { tone: 'caution' }); return; }
    host.onRelease?.(out);
  }
  function fireUp(): void {
    if (!me().ag!.ccrpHeld) return;
    world().ccrpHold(me().id, false);
    log('Release let go: no bomb', { tone: 'caution' });
  }
  function tapTv(e: MouseEvent): void {
    const ac = me(), sh = ac.ag!.shkval;
    if (!sh.on) return;
    if (sh.lockedUnitId) { log('Unlock first (Enter)'); return; }
    const { fx, fy } = tv.pickOffset(e.clientX, e.clientY);
    const fov = shkvalFovDeg(sh.zoom);
    const d = dirFrom(ac.heading + sh.az + fx * fov.h * D2R, sh.el - fy * fov.v * D2R);
    world().shkvalPointAt(ac.id, { x: ac.pos.x + d.x * 10000, y: ac.pos.y + d.y * 10000, z: ac.pos.z + d.z * 10000 });
  }

  // ------------------------------------------------------------------ display state
  function tvState(): It23mState {
    const w = world(), ac = me(), ag = ac.ag!, sh = ag.shkval;
    const aim = shkvalAimPoint(w, ac);
    const check = w.canAgLaunch(ac.id);
    const guided = ag.selected ? AG_WEAPONS[ag.selected].guidance !== 'ballistic' : false;
    let tof: number | null = null;
    for (const wp of w.agWeapons.values()) if (wp.alive && wp.guided && wp.shooterId === ac.id && wp.timeToImpact != null) tof = tof == null ? wp.timeToImpact : Math.min(tof, wp.timeToImpact);
    if (tof == null && guided && sh.lockedUnitId && aim && ag.selected === 'vikhr') tof = ac.pos.distanceTo(aim) / VIKHR_MEAN_MS;
    const fov = shkvalFovDeg(sh.zoom);
    return {
      on: sh.on, mode: sh.mode, zoom: sh.zoom, targetSizeM: sh.targetSizeM,
      azDeg: sh.az * R2D, elDeg: sh.el * R2D, pitchDeg: ac.pitch * R2D,
      radarAltM: ac.pos.y - w.groundHeight(ac.pos.x, ac.pos.z),
      laserOn: sh.laserOn, laserCooling: sh.laserCoolS > 0,
      rangeM: sh.laserOn && aim ? ac.pos.distanceTo(aim) : null,
      tofS: tof, pr: guided && check.pr, fovHDeg: fov.h, groundStab: sh.groundStab,
    };
  }

  function hudState(): Su25tHudState {
    const w = world(), ac = me(), ag = ac.ag!, sh = ag.shkval;
    const sel = ag.selected as AgWeaponId | null;
    const spec = sel ? AG_WEAPONS[sel] : null;
    const check = w.canAgLaunch(ac.id);
    const aim = shkvalAimPoint(w, ac);
    const ballistic = spec?.guidance === 'ballistic';
    const ccrp = ccrpSolution(w, ac);
    const imp = sel && ballistic && ag.master !== 'nav' && !ccrp.active ? predictImpact(w, ac, sel) : null;
    const band = check.band;
    const arm = sel === 'kh58' && ag.arm.detecting && ag.master === 'ag';
    return {
      master: ag.master, modeLabel: arm ? 'ПРГ' : hudModeLabel(ag.master, sh.on),
      weaponLabel: ag.master === 'nav' ? null : spec?.hudLabel ?? null, rounds: sel ? ag.stores[sel] ?? 0 : null,
      pitchDeg: ac.pitch * R2D, headingDeg: ac.heading * R2D, speedKmh: ac.vel.length() * 3.6, altM: ac.pos.y,
      range: band && ag.master !== 'nav' ? { cur: check.range ?? (arm && ag.arm.emitterId ? ac.pos.distanceTo(w.samSites.get(ag.arm.emitterId)!.pos) : null), min: band.min, max: band.max } : null,
      pr: check.pr && ag.master !== 'nav' && !ccrp.active,
      laserCursor: sh.on && aim ? hudAngles(ac.pos, ac.heading, ac.pitch, aim) : null,
      ccip: imp ? hudAngles(ac.pos, ac.heading, ac.pitch, imp) : null,
      reticle: spec && !ballistic && sh.on && ag.master === 'ag' ? (check.range != null && band && check.range <= band.max && check.range >= band.min ? 'in' : 'out') : null,
      ccrp: ccrp.active ? { errDeg: ccrp.errDeg!, inCircle: ccrp.inCircle, ttrS: ccrp.ttrS, held: ag.ccrpHeld } : null,
      arm: arm ? { emitters: armMarks(), cursor: ag.arm.emitterId ? null : { xDeg: armCursor.x, yDeg: armCursor.y } } : null,
      stations: ag.stations.filter(s => s.weapon !== 'l081').map(s => ({
        station: s.station, label: STATION_LABEL[s.weapon] ?? AG_WEAPONS[s.weapon as AgWeaponId]?.hudLabel ?? s.weapon, count: s.count, selected: s.weapon === sel,
      })),
    };
  }

  return {
    tvCanvas, tv, tvBezel, hudBezel, rwrBezel, touchPad, controlRows, keyList, fireBtn, lockBtn, laserBtn,
    mobileActions: [mFire.el, mLock.el, mLaser.el], keys, armCursor,
    armMode, armMarks, setMaster, toggleShkval, toggleLaser, toggleArm, cycle, selectGun, enter, fire, fireUp,
    step(dt) {
      if (!armMode()) return;
      armCursor.x = Math.max(-ARM_HUD_DEG, Math.min(ARM_HUD_DEG, armCursor.x + (slew.right - slew.left) * ARM_SLEW_DPS * dt));
      armCursor.y = Math.max(-9, Math.min(4, armCursor.y + (slew.up - slew.down) * ARM_SLEW_DPS * dt));
    },
    resetInputs() { slew.up = slew.down = slew.left = slew.right = 0; armCursor.x = 0; armCursor.y = -4; },
    draw(tvCam, showRwr) {
      const ac = me(), sh = ac.ag!.shkval;
      if (tvCam && sh.on && ac.alive) tvCam.render(ac.pos, shkvalDir(ac), shkvalFovDeg(sh.zoom).v);
      tv.draw(tvState(), tvCam && sh.on ? tvCam.image : null);
      hud.draw(hudState());
      if (showRwr) rwr.draw(ac.rwr, world().t);
    },
    updateLamps() {
      fireBtn.setLit(world().canAgLaunch(me().id).pr);
      laserBtn.setLit(me().ag!.shkval.laserOn);
    },
    tvState, hudState,
  };
}
