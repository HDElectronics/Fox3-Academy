/**
 * [OWNER: page-cas] A-10C II cockpit for the CAS page: the HUD over the forward view, the left MFCD (TAD or MSG page),
 * the right MFCD (TGP page with the pod video), the ALR-69 for the sortie, the HOTAS buttons, the key map and the
 * display views built from the sim. The HOTAS logic lives in a10cHotas.ts (pure, tested). Keys from PROCEDURES.a10c
 * (docs/research/a10c.md §1): TMS LCtrl+arrows, DMS Home/End/Delete/PageDown, China Hat V/C, Coolie U/J/H/K, slew
 * ; . , /, Insert laser, M master mode; weapon release RAlt+Space and gun Space are the A-10C default list (community,
 * labelled). WILCO / CNTCO and LSS (OSB 6) are buttons: no keyboard default was found. The page merges `keys` into its
 * single bindKeys map and routes the CMS digits through the radio menu fallback (`cmsKeys`).
 */
import { Quaternion, Vector3 } from 'three';
import { AG_WEAPONS } from '../../data/agWeapons';
import { PROCEDURES } from '../../data/procedures';
import type { Aircraft, EntityId } from '../../sim/types';
import type { World } from '../../sim/world';
import { D2R, relBearing } from '../../sim/math';
import { canAgLaunch, predictImpact } from '../../sim/agWeapons';
import { TGP_FOV_DEG, tgpViewWidthM } from '../../sim/tgp';
import type { ShkvalTv } from '../../render/attack';
import { vFovDeg, type ForwardView } from '../../render/forwardView';
import { UNIT_PER_M, orientationQuaternion } from '../../render/units';
import {
  h, screenBezel, button, placard, keyHint, disclosure, mobileAction, type ButtonHandle, type Cleanup, type KeyMap, type KeyHandler,
} from '../../ui';
import {
  RwrDisplay, A10cHud, A10cTadPage, A10cTgpPage, A10cMsgPage, TAD_RING,
  type A10cHudView, type TgpPageView, type TadView, type MsgPageView,
} from '../../ui/displays';
import { noseOffsetM, holdAngleAltitude } from '../strike/cockpit';
import { A10cHotas, type HotasHost, type HotasSwitch } from './a10cHotas';
import type { JtacController } from './jtac';
import type { XZ } from './scenario';

/** HUD field of view across the canvas (deg) and boresight height: the display's defaults. */
const HUD_FOV = 26, HUD_BORE = 0.4;
const NM = 1852, KT = 1.943844, FT = 3.28084;
const _pos = new Vector3(), _q = new Quaternion(), _dir = new Vector3();

export interface A10cCockpitHost {
  bag: Cleanup;
  world(): World;
  me(): Aircraft;
  jtac(): JtacController;
  steerpoint(): XZ & { name: string };
  targets(): readonly EntityId[];
  friendlies(): { id: EntityId; label: string }[];
  log(text: string, opts?: { t?: number; tone?: 'ok' | 'caution' | 'warning' }): void;
  canFire(): boolean;
}

export interface A10cCockpit {
  hotas: A10cHotas;
  hudBezel: { el: HTMLElement };
  leftBezel: { el: HTMLElement };
  /** The TGP page: the page shows it big with the TV camera. */
  tgpBezel: { el: HTMLElement };
  rwrBezel: { el: HTMLElement };
  touchPad: HTMLElement;
  controlRows: HTMLElement[];
  keyList: HTMLElement;
  mobileActions: HTMLElement[];
  releaseBtn: ButtonHandle;
  keys: KeyMap;
  /** Countermeasure keys (CMS 7 / 8 / 9 / 0): the page passes them as the radio menu's digit fallback. */
  cmsKeys: Record<string, KeyHandler>;
  step(dt: number): void;
  resetInputs(): void;
  draw(podCam: ShkvalTv | null, showRwr: boolean, hudCam?: ForwardView | null): void;
  updateLamps(): void;
  storeText(): string;
  hudView(): A10cHudView;
  tgpView(image: CanvasImageSource | null): TgpPageView;
  tadView(): TadView;
  msgView(): MsgPageView | null;
}

export function createA10cCockpit(host: A10cCockpitHost): A10cCockpit {
  const { bag } = host;
  const world = host.world, me = host.me;
  const log = (text: string, tone?: 'ok' | 'caution') => host.log(text, { t: world().t, ...(tone ? { tone } : {}) });
  const hotasHost: HotasHost = {
    world, me, jtac: host.jtac, steerpoint: host.steerpoint, targets: host.targets, friendlies: host.friendlies,
    log, canFire: host.canFire,
  };
  const hotas = new A10cHotas(hotasHost);
  const slew = { up: 0, down: 0, left: 0, right: 0 };
  const applySlew = () => hotas.slew(slew.right - slew.left, slew.up - slew.down);
  let noseDir: -1 | 0 | 1 = 0, noseHeldS = 0, holdGamma: number | null = null;
  const nosePress = (d: -1 | 1) => { if (noseDir !== d) { noseDir = d; noseHeldS = 0; holdGamma = null; } };
  const noseRelease = () => { if (noseDir) { noseDir = 0; holdGamma = me().pitch; } };

  // ------------------------------------------------------------------ displays
  const hudCanvas = h('canvas', { class: 'strk-canvas', 'aria-label': 'A-10C II HUD' });
  const tadCanvas = h('canvas', { class: 'strk-canvas cas-mfcd__canvas', 'aria-label': 'Left MFCD: TAD page. Click to put the TAD cursor there.' });
  const msgCanvas = h('canvas', { class: 'strk-canvas', 'aria-label': 'Left MFCD: MSG page with the digital 9-line', hidden: true });
  const tgpCanvas = h('canvas', { class: 'strk-canvas cas-mfcd__canvas', 'aria-label': 'Right MFCD: TGP page. Click to point the pod there.' });
  const rwrCanvas = h('canvas', { class: 'strk-canvas', 'aria-label': 'ALR-69 radar warning display' });
  const hudBezel = screenBezel({ id: 'cas-a10-hud', label: 'HUD', aspect: '1', content: hudCanvas, class: 'strk-hud' });
  const leftBezel = screenBezel({ id: 'cas-a10-left', label: 'Left MFCD', aspect: '1', content: h('div', { class: 'cas-mfcd__pages' }, tadCanvas, msgCanvas), class: 'cas-mfcd' });
  const tgpBezel = screenBezel({ id: 'cas-a10-tgp', label: 'Right MFCD · TGP', aspect: '1', content: tgpCanvas, class: 'cas-mfcd cas-tgp' });
  const rwrBezel = screenBezel({ id: 'cas-a10-rwr', label: 'ALR-69', aspect: '1', content: rwrCanvas, class: 'strk-rwr' });
  const hud = new A10cHud(hudCanvas, { fovDeg: HUD_FOV, boreY: HUD_BORE });
  const tad = new A10cTadPage(tadCanvas);
  const msg = new A10cMsgPage(msgCanvas);
  const tgp = new A10cTgpPage(tgpCanvas);
  const rwr = new RwrDisplay(rwrCanvas, { rwr: 'alr69' });
  bag.add(() => { hud.dispose(); tad.dispose(); msg.dispose(); tgp.dispose(); rwr.dispose(); });
  bag.on(tadCanvas, 'click', (e: Event) => clickTad(e as MouseEvent));
  bag.on(tgpCanvas, 'click', (e: Event) => clickTgp(e as MouseEvent));

  // ------------------------------------------------------------------ buttons
  const cap = (label: string, aria: string, fn: () => void, keys?: string, lamp = false) =>
    button({ label, size: 's', ariaLabel: aria, onClick: fn, keepCase: true, lamp, ...(keys ? { keys } : {}) });
  const holdPad = (label: string, aria: string, set: (v: number) => void) => {
    const b = h('button', { type: 'button', class: 'ui-btn strk-pad__btn', 'aria-label': aria }, label);
    const on = () => { set(1); applySlew(); }, off = () => { set(0); applySlew(); };
    bag.on(b, 'pointerdown', (e: Event) => { e.preventDefault(); on(); });
    for (const t of ['pointerup', 'pointerleave', 'pointercancel']) bag.on(b, t, off);
    return b;
  };
  const tap = (sw: HotasSwitch, long = false) => () => hotas.tap(sw, long);
  const soiHud = cap('HUD', 'SOI to the HUD (Coolie Up Short)', tap('coolieU'), 'U', true);
  const soiTad = cap('TAD', 'SOI to the left MFCD TAD (Coolie Left Long)', tap('coolieL', true), 'H', true);
  const soiTgp = cap('TGP', 'SOI to the right MFCD TGP (Coolie Right Long)', tap('coolieR', true), 'K', true);
  const pageBtn = cap('TAD / MSG', 'Left MFCD page (Coolie Left Short)', tap('coolieL'));
  const tmsFs = cap('TMS Fwd', 'TMS Forward Short: track, hook', tap('tmsF'), 'LCtrl+Up');
  const tmsFl = cap('TMS Fwd Long', 'TMS Forward Long: set SPI', tap('tmsF', true));
  const tmsAs = cap('TMS Aft', 'TMS Aft Short: INR, unhook', tap('tmsA'), 'LCtrl+Down');
  const tmsAl = cap('TMS Aft Long', 'TMS Aft Long: SPI to the steerpoint', tap('tmsA', true));
  const tmsLs = cap('TMS Left', 'TMS Left Short: clear NEW TASKING', tap('tmsL'), 'LCtrl+Left');
  const slave = cap('Slave to SPI', 'China Hat Forward Long: slave all sensors to the SPI', tap('chF', true), 'V');
  const fovBtn = cap('FOV', 'China Hat Forward Short: TGP WIDE / NARO', tap('chF'));
  const toStp = cap('TGP to STPT', 'China Hat Aft Long: TGP to the steerpoint', tap('chA', true), 'C');
  const lssBtn = button({ label: 'LSS · OSB 6', size: 's', lamp: true, keepCase: true, ariaLabel: 'TGP page OSB 6: laser spot search', onClick: () => hotas.toggleLss() });
  const laserBtn = button({ label: 'Laser latch', size: 's', lamp: true, keepCase: true, keys: 'Insert', ariaLabel: 'Fire the laser: latch on or off (Insert: hold to fire)', onClick: () => hotas.toggleLaserLatch() });
  const wilcoBtn = button({ label: 'WILCO · OSB 19', size: 's', lamp: true, keepCase: true, ariaLabel: 'MSG page OSB 19: WILCO', onClick: () => { if (host.jtac().wilco()) log('WILCO: tasking accepted', 'ok'); } });
  const cntcoBtn = button({ label: 'CNTCO · OSB 7', size: 's', keepCase: true, ariaLabel: 'MSG page OSB 7: cannot comply', onClick: () => { if (host.jtac().cntco()) log('CNTCO: tasking refused'); } });
  const masterBtn = cap('M Master', 'Master mode NAV, GUNS, CCIP, CCRP', () => { log(`Master mode ${hotas.cycleMaster()}`); }, 'M');
  const profBtn = cap('Profile', 'DMS Right Short with the HUD as SOI: next weapon profile', tap('dmsR'), 'PageDown');
  const releaseBtn = button({ label: 'Release', variant: 'primary', lamp: true, keys: 'RAlt+Space', onClick: () => { hotas.releaseWeapon(); } });
  const flareBtn = cap('CMS flares', 'Countermeasures: flares', () => cms());

  /** 3 × 3 slew pad with TMS Forward Short in the middle (one in the strip for touch, one in Controls). */
  const slewGrid = (cls: string) => h('div', { class: cls },
    h('span'), holdPad('▲', 'Slew up', v => { slew.up = v; }), h('span'),
    holdPad('◀', 'Slew left', v => { slew.left = v; }), cap('TMS', 'TMS Forward Short', tap('tmsF')).el, holdPad('▶', 'Slew right', v => { slew.right = v; }),
    h('span'), holdPad('▼', 'Slew down', v => { slew.down = v; }), h('span'));
  const touchPad = h('div', { class: 'ui-strip-block strk-touch' }, placard('Slew'), slewGrid('strk-pad'));
  const row = (...els: HTMLElement[]) => h('div', { class: 'strk-row' }, ...els);
  const slewPad = slewGrid('strk-pad cas-a10-pad');
  const controlRows = [
    placard('SOI (Coolie)'), row(soiHud.el, soiTad.el, soiTgp.el, pageBtn.el),
    placard('TMS'), row(tmsFs.el, tmsFl.el), row(tmsAs.el, tmsAl.el, tmsLs.el),
    placard('Slew'), slewPad,
    placard('China Hat · TGP'), row(slave.el, fovBtn.el, toStp.el), row(lssBtn.el, laserBtn.el),
    placard('MSG page'), row(wilcoBtn.el, cntcoBtn.el),
    placard('Weapons'), row(masterBtn.el, profBtn.el, flareBtn.el), releaseBtn.el,
  ];
  const binds = PROCEDURES.a10c.binds;
  const keyList = disclosure({
    title: 'A-10C II keys', id: 'cas-a10-keys',
    content: h('div', { class: 'strk-keys' },
      binds.map(b => keyHint({ label: `${b.keys}: ${b.action}`, keys: b.keyboard ?? (b.group === 'weapons' ? (b.keys === 'Weapon release' ? 'RAlt+Space' : 'Space') : 'none'), note: b.note })),
      keyHint({ label: 'LSS, WILCO, CNTCO: MFCD buttons (OSB 6, 19, 7)', keys: 'click', note: 'No keyboard default found.' }),
      keyHint({ label: 'Turn left / right (trainer steering)', keys: 'Left / Right' }),
      keyHint({ label: 'Nose down / nose up (trainer pitch)', keys: 'Up / Down' })),
  });
  const mRel = mobileAction(releaseBtn.el), mTms = mobileAction(tmsFs.el, 'TMS'), mSpi = mobileAction(tmsFl.el, 'SPI');
  bag.add(() => { mRel.destroy(); mTms.destroy(); mSpi.destroy(); });

  // ------------------------------------------------------------------ keys
  const hold = (sw: HotasSwitch) => ({ down: () => hotas.press(sw), up: () => hotas.release(sw) });
  const slewKey = (k: keyof typeof slew) => ({ down: () => { slew[k] = 1; applySlew(); }, up: () => { slew[k] = 0; applySlew(); } });
  const keys: KeyMap = {
    'LCtrl+Up': hold('tmsF'), 'LCtrl+Down': hold('tmsA'), 'LCtrl+Left': hold('tmsL'), 'LCtrl+Right': hold('tmsR'),
    'Home': hold('dmsF'), 'End': hold('dmsA'), 'Delete': hold('dmsL'), 'PageDown': hold('dmsR'),
    'V': hold('chF'), 'C': hold('chA'),
    'U': hold('coolieU'), 'J': hold('coolieD'), 'H': hold('coolieL'), 'K': hold('coolieR'),
    ';': slewKey('up'), '.': slewKey('down'), ',': slewKey('left'), '/': slewKey('right'),
    'Insert': { down: () => hotas.setLaserHeld(true), up: () => hotas.setLaserHeld(false) },
    'M': () => log(`Master mode ${hotas.cycleMaster()}`),
    'RAlt+Space': { down: () => { hotas.releaseWeapon(); }, inModal: false },
    'Space': { down: () => { hotas.gun(); }, inModal: false },
    'Left': { down: () => steer(-2), repeat: true },
    'Right': { down: () => steer(2), repeat: true },
    'Up': { down: () => nosePress(-1), up: () => noseRelease(), repeat: true },
    'Down': { down: () => nosePress(1), up: () => noseRelease(), repeat: true },
  };
  const cmsKeys: Record<string, KeyHandler> = { '7': () => cms(), '8': () => cms(), '9': () => cms(), '0': () => cms() };

  function steer(deg: number): void { me().cmd.heading = me().cmd.heading + deg * D2R; }
  function cms(): void { if (world().flare(me().id)) log(`Flares: ${me().flares} left`); }

  // ------------------------------------------------------------------ mouse on the MFCDs
  function clickTad(e: MouseEvent): void {
    if (hotas.leftPage !== 'tad') return;
    const { x, y, s } = tad.toPage(e.clientX, e.clientY);
    const ac = me(), k = (s * TAD_RING) / (hotas.tadScaleNm * NM);
    const right = (x - s / 2) / k, fwd = (s / 2 - y) / k;
    const c = Math.cos(ac.heading), sn = Math.sin(ac.heading);
    const east = right * c + fwd * sn, north = -right * sn + fwd * c;
    hotas.setSoi('tad');
    hotas.cursor = { x: ac.pos.x + east, z: ac.pos.z - north };
  }
  function clickTgp(e: MouseEvent): void {
    const ac = me(), t = ac.ag?.tgp;
    if (!t?.on) return;
    const { x, y, s } = tgp.toPage(e.clientX, e.clientY);
    const fx = x / s - 0.5, fy = y / s - 0.5;
    const width = tgpViewWidthM(ac, t);
    const fwd = new Vector3(t.aim.x - ac.pos.x, 0, t.aim.z - ac.pos.z);
    const horiz = Math.max(1, fwd.length());
    fwd.normalize();
    const dep = Math.max(0.05, Math.atan2(ac.pos.y - t.aim.y, horiz));
    const along = -fy * width / Math.sin(dep), across = fx * width;
    hotas.setSoi('tgp');
    world().tgpPointAt(ac.id, { x: t.aim.x + fwd.x * along - fwd.z * across, z: t.aim.z + fwd.z * along + fwd.x * across });
  }

  // ------------------------------------------------------------------ views
  function angles(ac: Aircraft, p: { x: number; y: number; z: number }): { az: number; el: number } {
    const az = relBearing(ac.pos, ac.heading, _pos.set(p.x, p.y, p.z));
    const d = Math.hypot(p.x - ac.pos.x, p.z - ac.pos.z);
    return { az, el: Math.atan2(p.y - ac.pos.y, d) - ac.pitch };
  }
  function hudView(): A10cHudView {
    const w = world(), ac = me(), ag = ac.ag!, sel = ag.selected;
    const spec = sel ? AG_WEAPONS[sel] : null;
    const ballistic = spec?.guidance === 'ballistic';
    const imp = sel && ballistic && (hotas.master === 'GUNS' || hotas.master === 'CCIP') ? predictImpact(w, ac, sel) : null;
    const spi = hotas.spiXZ();
    const spiP = { x: spi.x, y: w.groundHeight(spi.x, spi.z), z: spi.z };
    const spiA = angles(ac, spiP);
    let ccrp: A10cHudView['ccrp'] = null;
    if (hotas.master === 'CCRP' && sel && !ballistic) {
      // Trainer cue: time until the SPI is inside the selected store's release band (not the DCS CCRP computation).
      const band = canAgLaunch(w, ac, sel).band;
      const rng = Math.hypot(spiP.x - ac.pos.x, spiP.z - ac.pos.z);
      const sp = Math.max(1, ac.vel.length());
      ccrp = { ttrS: band ? Math.max(0, (rng - band.max * 0.95) / sp) : 0, errRad: spiA.az };
    }
    return {
      t: w.t, heading: ac.heading, pitch: ac.pitch, roll: ac.roll, speedKt: ac.vel.length() * KT, altFt: ac.pos.y * FT,
      master: hotas.master, soi: hotas.soi === 'hud',
      weapon: sel && spec ? { id: sel, label: spec.hudLabel, count: ag.stores[sel] ?? 0 } : null,
      pipper: imp ? angles(ac, imp) : null, releaseCue: null, ccrp,
      spi: Math.abs(spiA.az) < 0.35 && Math.abs(spiA.el) < 0.35 ? spiA : null,
      belowMinAlt: false, laserFiring: !!ag.tgp?.laserFiring,
    };
  }
  function tgpView(image: CanvasImageSource | null): TgpPageView {
    const ac = me(), ag = ac.ag!, t = ag.tgp!;
    const r = t.on ? ac.pos.distanceTo(t.aim) : null;
    const spi = ag.spi;
    return {
      t: world().t, on: t.on, image: t.on ? image : null, fov: t.fov, track: t.track, lss: t.lss,
      lssCode: t.lssCode, laserCode: t.laserCode, laserFiring: t.laserFiring,
      rangeM: r, rangeSource: r == null ? null : t.laserFiring ? 'L' : t.track !== 'none' ? 'T' : 'E',
      soi: hotas.soi === 'tgp', isSpi: hotas.spiSource === 'tgp' && !!spi && spi.distanceTo(t.aim) < 5, units: 'imperial',
    };
  }
  function tadView(): TadView {
    const w = world(), ac = me(), tk = host.jtac().tasking;
    const sp = host.steerpoint();
    return {
      t: w.t, own: { x: ac.pos.x, z: ac.pos.z, heading: ac.heading }, scaleNm: hotas.tadScaleNm,
      spi: hotas.spiXZ(), steerpoint: { x: sp.x, z: sp.z, name: sp.name },
      friendlies: host.friendlies().flatMap(f => { const u = w.groundUnits.get(f.id); return u?.alive ? [{ x: u.pos.x, z: u.pos.z, label: f.label }] : []; }),
      tasking: tk && tk.state !== 'cntco' ? { x: tk.pos.x, z: tk.pos.z, accepted: tk.state === 'wilco' } : null,
      newTasking: !!tk?.newShown, cursor: hotas.cursor, hooked: hotas.hooked, soi: hotas.soi === 'tad',
    };
  }
  function msgView(): MsgPageView | null {
    const tk = host.jtac().tasking;
    return tk ? { title: 'CAS 9-LINE', lines: tk.lines, state: tk.state } : null;
  }
  function storeText(): string {
    const ag = me().ag!, sel = ag.selected;
    if (!sel) return 'none';
    const code = ag.laserCodes[sel];
    return `${AG_WEAPONS[sel].hudLabel} ×${ag.stores[sel] ?? 0}${code ? ` · ${code}` : ''} · ${hotas.master}`;
  }

  return {
    hotas, hudBezel, leftBezel, tgpBezel, rwrBezel, touchPad, controlRows, keyList,
    mobileActions: [mRel.el, mTms.el, mSpi.el], releaseBtn, keys, cmsKeys,
    step(dt) {
      const ac = me();
      if (noseDir) { noseHeldS += dt; ac.cmd.altitude = ac.pos.y + noseDir * noseOffsetM(noseHeldS); }
      else if (holdGamma != null && ac.alive) ac.cmd.altitude = holdAngleAltitude(ac.pos.y, ac.vel.length(), holdGamma);
      hotas.step(dt);
    },
    resetInputs() {
      slew.up = slew.down = slew.left = slew.right = 0; noseDir = 0; noseHeldS = 0; holdGamma = null;
      hotas.reset();
    },
    draw(podCam, showRwr, hudCam = null) {
      const ac = me(), t = ac.ag?.tgp;
      if (podCam && t?.on && ac.alive) {
        _dir.subVectors(t.aim, ac.pos).normalize();
        podCam.render(ac.pos, _dir, TGP_FOV_DEG[t.fov]);
      }
      tgp.draw(tgpView(podCam && t?.on ? podCam.image : null));
      const onTad = hotas.leftPage === 'tad';
      if (tadCanvas.hidden === onTad) { tadCanvas.hidden = !onTad; msgCanvas.hidden = onTad; }
      if (onTad) tad.draw(tadView()); else msg.draw(msgView());
      if (hudCam && ac.alive) {
        const aspect = Math.max(0.2, hudCanvas.clientWidth / Math.max(1, hudCanvas.clientHeight));
        _pos.set(ac.pos.x * UNIT_PER_M, ac.pos.y * UNIT_PER_M, ac.pos.z * UNIT_PER_M);
        hudCam.render(_pos, orientationQuaternion(ac.heading, ac.pitch, ac.roll, _q), vFovDeg(HUD_FOV, aspect), 0.5, HUD_BORE);
      }
      hud.draw(hudView(), hudCam && ac.alive ? hudCam.image : null);
      if (showRwr) rwr.draw(ac.rwr, world().t);
      leftBezel.el.querySelector('.ui-bezel__label')!.textContent = hotas.leftPage === 'tad' ? 'Left MFCD · TAD' : 'Left MFCD · MSG';
    },
    updateLamps() {
      const ac = me(), t = ac.ag?.tgp, tk = host.jtac().tasking;
      releaseBtn.setLit(hotas.master !== 'NAV' && world().canAgLaunch(ac.id).ok);
      lssBtn.setLit(!!t && t.lss !== 'off');
      lssBtn.setLabel(t && (t.lss === 'detect' || t.lss === 'track') ? 'LST · OSB 6' : 'LSS · OSB 6');
      laserBtn.setLit(!!t?.laserFiring);
      wilcoBtn.setLit(tk?.state === 'new');
      for (const [b, s] of [[soiHud, 'hud'], [soiTad, 'tad'], [soiTgp, 'tgp']] as const) b.setLit(hotas.soi === s);
    },
    storeText, hudView, tgpView, tadView, msgView,
  };
}
