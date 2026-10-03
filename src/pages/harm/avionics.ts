/**
 * [OWNER: page-harm] The Hornet's HARM avionics as the pilot works them (page-local, pure logic over HarmSim): the
 * stores page, the HARM format and its pushbuttons, SP / TOO / PB / Pullback, the UFC entry of the PB code, the HSI
 * waypoint designation, Master Arm and master mode, and weapon release. Every action returns an explanation for the
 * page's "what that did" log. Builds the views the drawing code reads (types.ts). Facts and pages:
 * docs/research/fa18c-harm.md (S1 = ED F/A-18C guide). Trainer rules are listed in HARM_CAVEATS.
 */
import { ALIC_TABLE, CLASS_MEANING, HARM_STATIONS, TRAINER } from './data';
import { HarmSim, bearingDeg, wrapDeg, type Contact, type Vec3 } from './sim';
import {
  CLASS_OSB, type EwView, type FormatView, type HarmClass, type HarmMode, type HudView, type MasterMode, type Osb,
  type Pullup, type UfcKey, type UfcView,
} from './types';

const NM = 1852;
const FT = 0.3048;
const R2D = 180 / Math.PI;

export interface Waypoint { name: string; pos: Vec3 }

/** Result of a pilot action: did it do something, and the explanation for the log. */
export interface ActionResult { ok: boolean; text: string; tone?: 'ok' | 'caution' | 'warning' }

const done = (text: string): ActionResult => ({ ok: true, text });
const refused = (text: string): ActionResult => ({ ok: false, text, tone: 'caution' });

/** Threat order for SP and the TOO priority box: locked or guiding first, tracking radars before search, then nearest. */
export function threatOrder(a: Contact, b: Contact): number {
  const score = (c: Contact) => (c.guiding ? 4 : 0) + (c.lockedYou ? 2 : 0) + (c.emitter.radar.job === 'search' ? 0 : 1);
  return score(b) - score(a) || a.rangeM - b.rangeM;
}

/** Does a radar belong to a TOO class? Our sites are all hostile land radars (S1 p371, p420). */
export function inClass(c: Contact, cls: HarmClass): boolean {
  switch (cls) {
    case 'ALL': case 'HOS': return true;
    case 'PRI': return c.lockedYou;
    default: return c.emitter.radar.cls === cls;
  }
}

/** Trainer in-range distances for PB (nm), scaled with altitude (HARM_CAVEATS). */
export function pbRanges(altFt: number): { hrm: number; ac: number; min: number } {
  const hrm = TRAINER.hrmRangeNmAt25k * (0.6 + 0.4 * Math.max(0, altFt) / 25000);
  return { hrm, ac: hrm * TRAINER.acRangeFactor, min: TRAINER.minRangeNm };
}

/** PB HUD release cue elevations (deg) for a distance, trainer rule. */
export function pbCues(distNm: number, altFt: number): { ac: number; hrm: number; min: number | null } {
  const r = pbRanges(altFt);
  const kAc = Math.max(0, Math.min(1, (r.ac - distNm) / (r.ac - r.min)));
  const kHrm = Math.max(0, Math.min(1, (distNm - r.min) / (r.hrm - r.min)));
  const min = distNm < r.min + 5 ? -12 + 12 * Math.max(0, Math.min(1, (r.min + 5 - distNm) / 5)) : null;
  return { ac: 45 - 30 * kAc, hrm: 2 + 8 * kHrm, min };
}

export function alicName(code: number): string | null {
  const row = ALIC_TABLE.find(r => r.alic === code);
  return row ? `${row.system} ${row.radar}` : null;
}

export class HarmAvionics {
  masterArm = false;
  master: MasterMode = 'NAV';
  page: FormatView['page'] = 'SMS';
  harmSelected = false;
  mode: HarmMode = 'SP';
  /** Boxed = Pullback inhibited (default, S1 p363). */
  hrmOvrd = true;
  /** Loaded stations, in launch order (S1 p362). */
  stations: number[] = [...HARM_STATIONS];
  tdcOnHarm = false;
  ewHud = false;
  spKey: string | null = null;
  cls: HarmClass = 'ALL';
  limit = false;
  tooKey: string | null = null;
  handoffKey: string | null = null;
  pullup: Pullup = 'HRM';
  pbCode: number | null = null;
  ufcOn = false;
  ufcOption: number | null = null;
  scratch = '';
  wpIdx = 0;
  designated = false;
  releaseHeld = false;
  launches = 0;
  pullbackShots = 0;

  constructor(readonly sim: HarmSim, readonly waypoints: Waypoint[]) {}

  // ------------------------------------------------------------------ derived

  get station(): number | null { return this.stations[0] ?? null; }

  contacts(): Contact[] { return this.sim.contacts().sort(threatOrder); }

  /** The lock that triggers Pullback (critical threat, S1 p365). */
  criticalThreat(): Contact | null { return this.contacts().find(c => c.lockedYou || c.guiding) ?? null; }

  pullbackLabel(): HudView['pullback'] {
    const c = this.criticalThreat();
    if (!c) return null;
    if (this.hrmOvrd) return 'PLBK';
    return this.masterArm && this.station !== null ? 'HARM' : 'HARM-X';
  }

  /** SP cue: the pilot's choice while it is still heard, else the highest threat. */
  spCue(): Contact | null {
    const cs = this.contacts();
    return cs.find(c => c.key === this.spKey) ?? cs[0] ?? null;
  }

  tooTargets(): Contact[] {
    const cs = this.contacts().filter(c => inClass(c, this.cls));
    return this.limit ? cs.slice(0, 5) : cs.slice(0, 15);
  }

  /** Inside the HARM field of view. Trainer rule: only azimuth gates it; height on the format is clamped (HARM_CAVEATS). */
  inFov(c: Contact): boolean { return Math.abs(c.azDeg) <= TRAINER.fovHalfDeg; }

  tooBox(): Contact | null {
    const vis = this.tooTargets().filter(c => this.inFov(c));
    if (this.handoffKey) return this.contacts().find(c => c.key === this.handoffKey) ?? null;
    return vis.find(c => c.key === this.tooKey) ?? vis[0] ?? null;
  }

  designatedPoint(): Waypoint | null { return this.designated ? this.waypoints[this.wpIdx] ?? null : null; }

  altFt(): number { return this.sim.jet.pos.y / FT; }

  pbState(): { distNm: number; aslX: number; inRange: 'A/C RNG' | 'HRM RNG' | null; cue: number | null; cues: ReturnType<typeof pbCues> } | null {
    const wp = this.designatedPoint();
    if (!wp) return null;
    const j = this.sim.jet;
    const distNm = Math.hypot(wp.pos.x - j.pos.x, wp.pos.z - j.pos.z) / NM;
    const aslX = wrapDeg(bearingDeg(j.pos, wp.pos) - j.headingRad * R2D);
    const r = pbRanges(this.altFt());
    const cues = pbCues(distNm, this.altFt());
    const max = this.pullup === 'HRM' ? r.hrm : r.ac;
    const inRange = distNm > r.min && distNm <= max ? (this.pullup === 'HRM' ? 'HRM RNG' : 'A/C RNG') : null;
    return { distNm, aslX, inRange, cue: this.pullup === 'HRM' ? cues.hrm : cues.ac, cues };
  }

  /** Is the selected HARM ready to launch (no X through the legend)? */
  ready(): boolean {
    if (!this.harmSelected || !this.masterArm || this.station === null) return false;
    if (this.mode === 'SP') return !!this.spCue();
    if (this.mode === 'TOO') return !!this.handoffKey;
    return this.pbCode !== null;
  }

  // ------------------------------------------------------------------ pilot actions

  toggleMasterArm(): ActionResult {
    this.masterArm = !this.masterArm;
    return done(this.masterArm ? 'Master Arm ARM: weapons can now be released (guide p40).' : 'Master Arm SAFE: nothing will release.');
  }

  setMaster(m: MasterMode): ActionResult {
    this.master = this.master === m ? 'NAV' : m;
    if (this.master === 'AG') return done('A/G master mode: the stores page offers the air-to-ground weapons, HARM included (p361).');
    if (this.master === 'AA') return done('A/A master mode. Pullback still works here, but the trigger fires your air-to-air missile, not the HARM (p367).');
    return done('NAV master mode.');
  }

  tdcToHarm(): ActionResult {
    this.tdcOnHarm = true;
    return done('Sensor Control toward the HARM display: the TDC now works the HARM format, so HARM Sequence and Cage/Uncage act on its targets (p368).');
  }

  toggleEwHud(): ActionResult {
    this.ewHud = !this.ewHud;
    return done(this.ewHud ? 'HUD boxed on the EW page: the emitter symbols are now also in the HUD (p410).' : 'EW symbols removed from the HUD.');
  }

  selectWaypoint(dir: 1 | -1): ActionResult {
    const n = this.waypoints.length;
    if (!n) return refused('No waypoints in this lesson.');
    this.wpIdx = (this.wpIdx + dir + n) % n;
    this.designated = false;
    return done(`HSI steering to ${this.waypoints[this.wpIdx]!.name}. Press WPDSG to make it the target point.`);
  }

  wpdsg(): ActionResult {
    const wp = this.waypoints[this.wpIdx];
    if (!wp) return refused('No waypoint selected.');
    this.designated = true;
    return done(`WPDSG: ${wp.name} is now the target point, a diamond in the HUD (p122). In PB the HARM flies to it, then listens for the coded radar (p373).`);
  }

  /** HARM Sequence (I). */
  sequence(): ActionResult {
    if (!this.harmSelected || this.page !== 'HARM') return refused('HARM Sequence only steps HARM targets with the HARM format up.');
    if (this.mode === 'SP') {
      const cs = this.contacts();
      if (cs.length < 2) return refused(cs.length ? 'Only one emitter heard: nothing to cycle to.' : 'No emitter heard yet.');
      const i = cs.findIndex(c => c.key === this.spCue()?.key);
      this.spKey = cs[(i + 1) % cs.length]!.key;
      return done(`HARM Sequence: cued to ${cs[(i + 1) % cs.length]!.emitter.radar.rwr}, boxed on the EW page and HUD (p365).`);
    }
    if (this.mode === 'TOO') {
      if (!this.tdcOnHarm) return refused('In TOO, give the HARM display the TDC first: Sensor Control toward it (p368).');
      if (this.handoffKey) return refused('A target is handed off. Cancel with Cage/Uncage or RSET before you step.');
      const vis = this.tooTargets().filter(c => this.inFov(c));
      if (vis.length < 2) return refused(vis.length ? 'Only one target in the field of view.' : 'No target inside the T marks: turn toward the arrow.');
      const i = vis.findIndex(c => c.key === this.tooBox()?.key);
      const next = vis[(i + 1) % vis.length]!;
      this.tooKey = next.key;
      return done(`HARM Sequence: the box moves to ${next.emitter.radar.rwr} (${next.emitter.radar.name}).`);
    }
    return refused('PB has no targets to step: the code and the waypoint pick the target.');
  }

  /** Cage/Uncage (C). */
  cage(): ActionResult {
    if (!this.harmSelected || this.page !== 'HARM') return refused('Cage/Uncage acts on the HARM format: select HARM first.');
    if (this.mode === 'SP') {
      this.spKey = null;
      return done('Cage/Uncage in SP: the HARM goes back to the highest threat (p365).');
    }
    if (this.mode === 'TOO') {
      if (!this.tdcOnHarm) return refused('Give the HARM display the TDC first: Sensor Control toward it (p368).');
      if (this.handoffKey) {
        this.handoffKey = null;
        return done('Hand-off cancelled: every target of the class shows again (p368).');
      }
      const box = this.tooBox();
      if (!box) return refused('Nothing boxed to hand off.');
      this.handoffKey = box.key;
      return done(`Hand-off: H-OFF above ${box.emitter.radar.rwr}, the other targets disappear, STBY becomes RDY. The HARM now knows exactly which radar to chase (p368).`);
    }
    return refused('PB has no hand-off: the code and the designated waypoint replace it.');
  }

  /** A pushbutton on the HARM display (DCS numbering, types.ts). */
  osb(n: Osb): ActionResult {
    if (n === 16) {
      this.hrmOvrd = !this.hrmOvrd;
      return done(this.hrmOvrd
        ? 'HRM OVRD boxed: Pullback inhibited. A lock on you shows PLBK and changes nothing (p367).'
        : 'HRM OVRD unboxed: Pullback armed. When a radar locks you or guides a missile, a HARM is readied against it and HARM shows in the HUD (p365).');
    }
    if (this.page === 'SMS') {
      if (n !== 6) return refused('On the stores page, HARM is the legend in the top row (pushbuttons 6-10, p361).');
      if (this.master === 'AA') return refused('HARM is selectable in A/G or NAV, not A/A (p361).');
      if (this.station === null) return refused('No HARM left on the stations.');
      this.harmSelected = true;
      this.page = 'HARM';
      return done(`HARM selected: the HARM format replaces the stores page, in ${this.mode} (p362). The next HARM to fire is on station ${this.station}.`);
    }
    if (this.page === 'CLASS') {
      const cls = (Object.keys(CLASS_OSB) as HarmClass[]).find(k => CLASS_OSB[k] === n);
      if (!cls) return refused('No class on that button.');
      this.cls = cls;
      this.tooKey = null;
      this.handoffKey = null;
      this.page = 'HARM';
      const n2 = this.tooTargets().length;
      return done(`Class ${cls}: the TOO format now shows only ${CLASS_MEANING[cls]} (${n2} heard) (p370-371).`);
    }
    if (this.page === 'SCAN') {
      if (n === 17) { this.page = 'HARM'; return done('SCAN unboxed: back to the TOO format (p372).'); }
      return refused('Press SCAN again to go back.');
    }
    // HARM format.
    switch (n) {
      case 5: return this.setMode('SP');
      case 4: return this.setMode('TOO');
      case 3: return this.setMode('PB');
      case 2: case 1: {
        if (this.mode !== 'PB') return refused('The pull-up choice only exists in PB.');
        this.pullup = n === 2 ? 'AC' : 'HRM';
        return done(this.pullup === 'AC'
          ? 'A/C pull-up: you fly the loft (45Â° nose up at A/C RNG) and the HARM keeps its energy for a longer shot (p374-375).'
          : 'HRM pull-up: the HARM does the lofting itself, so you must be closer; a small loft from you is enough (p374-375).');
      }
      case 11:
        if (this.mode !== 'TOO') return refused('CLASS is a TOO option.');
        this.page = 'CLASS';
        return done('CLASS page: pick which kind of radar the TOO format shows. H1 = older hostile systems, H2 = newer ones (p370-371).');
      case 13: {
        if (this.stations.length < 2) return refused('No other HARM station to step to.');
        this.stations.push(this.stations.shift()!);
        return done(`STEP: station ${this.station} is now the next HARM (p364).`);
      }
      case 14:
        if (this.mode !== 'PB') return refused('UFC is a PB option.');
        this.ufcOn = true;
        this.ufcOption = null;
        this.scratch = '';
        return done('UFC: the PB options move to the UFC. Window 4 is TGT, the emitter type the HARM will look for (p374).');
      case 15:
        this.spKey = null;
        this.tooKey = null;
        this.handoffKey = null;
        return done('RSET: back to the highest priority threat; any hand-off is cancelled (p364, p369).');
      case 17:
        if (this.mode !== 'TOO') return refused('SCAN is a TOO option.');
        this.page = 'SCAN';
        return done('SCAN: every class the RWR hears is listed, with arrows for those outside the field of view (p372).');
      case 19:
        if (this.mode !== 'TOO') return refused('LIMIT is a TOO option.');
        this.limit = !this.limit;
        return done(this.limit ? 'LIMIT: only the 5 highest priority emitters show (p369).' : 'LIMIT off: up to 15 emitters show.');
      default:
        return refused('That button does nothing on the HARM format here.');
    }
  }

  private setMode(m: HarmMode): ActionResult {
    this.mode = m;
    this.handoffKey = null;
    this.tooKey = null;
    this.spKey = null;
    if (m !== 'PB') this.ufcOn = false;
    if (m === 'SP') return done('SP: the HARM cues itself to the highest radar threat. No range is shown in this mode (p364-367).');
    if (m === 'TOO') return done('TOO: the HARM becomes a sensor. Radars inside its 30Â° field of view show as numbers; you choose one and hand it off (p368).');
    return done(this.pbCode === null
      ? 'PB: for a radar at a known place. HARM is crossed out until you enter its code on the UFC (p373-374).'
      : `PB with code ${this.pbCode}. Designate the waypoint on the radar and fly the HUD cues.`);
  }

  /** A UFC key. */
  ufcKey(k: UfcKey): ActionResult {
    if (!this.ufcOn) return refused('The UFC shows nothing for the HARM yet: press UFC (pushbutton 14) on the PB format.');
    if (k.startsWith('OPT')) {
      const i = Number(k.slice(3));
      if (i !== 4) return refused('Only window 4, TGT, is used for the PB code (p374).');
      this.ufcOption = 4;
      this.scratch = '';
      return done('Option 4, TGT, selected: the colon in front shows it is the one you are typing into.');
    }
    if (this.ufcOption !== 4) return refused('Select window 4 (TGT) first.');
    if (k === 'CLR') { this.scratch = ''; return done('CLR: scratchpad cleared.'); }
    if (k === 'ENT') {
      if (this.scratch.length !== 3) return refused('The emitter code has three digits (p374).');
      const code = Number(this.scratch);
      this.pbCode = code;
      const name = alicName(code);
      return done(name
        ? `ENT: code ${code} stored. It is the ${name} in the guide's table (p420). TGT ${code} shows on the HARM format and the X leaves the HARM legend.`
        : `ENT: code ${code} stored, but it is not in the table on this page. A HARM looking for it will only hit a radar of that type.`);
    }
    if (this.scratch.length >= 3) return refused('Three digits already: CLR to start again.');
    this.scratch += k;
    const hint = this.scratch.length === 1
      ? (k === '1' ? ' In the guide\'s table, Eastern land radars use 1xx codes; Western ones 2xx; ships 3xx and 4xx.' : '')
      : this.scratch.length === 3 ? ` ${alicName(Number(this.scratch)) ? `${this.scratch} = ${alicName(Number(this.scratch))}.` : ''} Press ENT to store it.` : '';
    return done(`${k} typed: scratchpad ${this.scratch}.${hint}`);
  }

  /** Weapon release pressed or released. Launches happen in update() while held (PB needs the cue). */
  setRelease(held: boolean): ActionResult | null {
    const was = this.releaseHeld;
    this.releaseHeld = held;
    if (!held || was) return null;
    return this.tryLaunch(true);
  }

  /** Per frame: a held release in PB launches when the cue is met. */
  update(): ActionResult | null {
    if (!this.releaseHeld || this.mode !== 'PB' || this.pullbackTarget()) return null;
    return this.tryLaunch(false);
  }

  private pullbackTarget(): Contact | null {
    return !this.hrmOvrd ? this.criticalThreat() : null;
  }

  private tryLaunch(press: boolean): ActionResult | null {
    const say = (r: ActionResult) => (press ? r : null);
    const pb = this.pullbackTarget();
    if (pb) {
      if (!this.masterArm) return say(refused('Pullback HARM is crossed out: Master Arm is SAFE (p366-367).'));
      if (this.station === null) return say(refused('No HARM left.'));
      this.pullbackShots += 1;
      return this.fire(() => this.sim.launchAt(pb.key), `Pullback shot at ${pb.emitter.radar.rwr}: the radar that locked you (p366).`);
    }
    if (!this.masterArm) return say(refused('Master Arm is SAFE: nothing releases.'));
    if (this.master !== 'AG') return say(refused('Weapon release needs A/G master mode for the HARM (p364).'));
    if (!this.harmSelected) return say(refused('Select HARM on the stores page first.'));
    if (this.station === null) return say(refused('No HARM left.'));
    if (this.mode === 'SP') {
      const c = this.spCue();
      if (!c) return say(refused('SP has no emitter to cue: nothing heard yet.'));
      return this.fire(() => this.sim.launchAt(c.key), `SP shot at ${c.emitter.radar.rwr}, the cued emitter. No range was shown: SP never gives one (p367).`);
    }
    if (this.mode === 'TOO') {
      if (!this.handoffKey) return say(refused('STBY: hand off a target with Cage/Uncage first (p368).'));
      const key = this.handoffKey;
      const c = this.contacts().find(x => x.key === key);
      this.handoffKey = null;
      this.tooKey = null;
      return this.fire(() => this.sim.launchAt(key), `TOO shot at ${c?.emitter.radar.rwr ?? 'the handed-off radar'}.`);
    }
    if (this.pbCode === null) return say(refused('HARM crossed out: enter the emitter code on the UFC (p374).'));
    const wp = this.designatedPoint();
    const s = this.pbState();
    if (!wp || !s) return say(refused('No target point: select the waypoint on the HSI and press WPDSG (p374).'));
    if (!s.inRange) return say(refused(`Not in range yet for a ${this.pullup === 'HRM' ? 'HARM' : 'A/C'} pull-up: wait for ${this.pullup === 'HRM' ? 'HRM' : 'A/C'} RNG.`));
    if (Math.abs(s.aslX) > 1) return press ? refused('Keep holding, and put the flight path marker on the azimuth steering line (within 1Â°, p375).') : null;
    const fpmY = this.sim.jet.pitchRad * R2D;
    if (s.cue !== null && fpmY < s.cue) return press ? refused(`Keep holding and raise the nose: the flight path marker must reach the ${this.pullup === 'HRM' ? 'HARM' : 'A/C'} pull-up release cue (p375).`) : null;
    const code = this.pbCode;
    return this.fire(() => this.sim.launchPb(wp.pos, code, this.pullup), `PB shot: the HARM lofts toward ${wp.name}, then listens for code ${code} (p373).`);
  }

  private fire(launch: () => void, text: string): ActionResult {
    launch();
    this.launches += 1;
    const sta = this.stations.shift();
    this.releaseHeld = false;
    return { ok: true, tone: 'ok', text: `${text} Station ${sta} away${this.station ? `; station ${this.station} is next (order 8, 2, 7, 3)` : '; no HARM left'}.` };
  }

  // ------------------------------------------------------------------ views

  formatView(hint: Osb | null = null): FormatView {
    const crossed = !this.ready();
    const status = this.mode === 'TOO' ? (this.handoffKey ? 'RDY' : 'STBY') : this.ready() ? 'RDY' : 'STBY';
    const base: FormatView = {
      page: this.page,
      sms: null,
      mode: this.mode,
      weapon: { boxed: this.harmSelected, crossed },
      status: this.station === null ? null : status,
      station: this.station,
      modeAvailable: { SP: true, TOO: true, PB: this.pbCode !== null || this.mode === 'PB' },
      hrmOvrd: this.hrmOvrd,
      tdc: this.tdcOnHarm,
      too: null, pb: null, classPage: null, scanPage: null,
      hintOsb: hint,
    };
    if (this.page === 'SMS') {
      base.sms = {
        stations: [2, 3, 7, 8].map(sta => ({ sta, loaded: this.stations.includes(sta), selected: false })),
        status: null,
      };
      return base;
    }
    if (this.page === 'CLASS') {
      const detected = (Object.keys(CLASS_OSB) as HarmClass[]).filter(k => this.contacts().some(c => inClass(c, k)));
      base.classPage = { selected: this.cls, detected };
      return base;
    }
    if (this.page === 'SCAN') {
      const seen = new Map<HarmClass, 'in' | 'left' | 'right'>();
      for (const c of this.contacts()) {
        const k = c.emitter.radar.cls;
        if (!k) continue;
        const side = this.inFov(c) ? 'in' : c.azDeg < 0 ? 'left' : 'right';
        if (!seen.has(k) || side === 'in') seen.set(k, side);
      }
      base.scanPage = { rows: [...seen].map(([cls, side]) => ({ cls, side })) };
      return base;
    }
    if (this.mode === 'TOO') {
      const all = this.tooTargets();
      const box = this.tooBox();
      const shown = this.handoffKey ? all.filter(c => c.key === this.handoffKey) : all;
      const pitch = this.sim.jet.pitchRad * R2D;
      base.too = {
        cls: this.cls,
        targets: shown.filter(c => this.inFov(c)).map(c => ({
          label: c.emitter.radar.rwr, xDeg: c.azDeg, yDeg: Math.max(-12, Math.min(12, (c.elDeg + pitch) / 2)), boxed: c.key === box?.key, hoff: c.key === this.handoffKey, lockedYou: c.lockedYou,
        })),
        arrows: {
          left: shown.some(c => c.azDeg < -TRAINER.fovHalfDeg), right: shown.some(c => c.azDeg > TRAINER.fovHalfDeg),
          up: false, down: false,
        },
        limit: this.limit,
      };
    }
    if (this.mode === 'PB') {
      const s = this.pbState();
      base.pb = {
        pullup: this.pullup, code: this.pbCode, inRange: s?.inRange ?? null,
        tofS: s ? HarmSim.timeOfFlight(s.distNm * NM) : null, ttiS: this.sim.timeToImpact(),
      };
    }
    return base;
  }

  ewView(hint: Osb | null = null): EwView {
    const cs = this.contacts();
    const cued = this.harmSelected ? (this.mode === 'SP' ? this.spCue()?.key : this.mode === 'TOO' ? (this.handoffKey ?? this.tooBox()?.key) : null) : null;
    return {
      emitters: cs.map(c => ({ label: c.emitter.radar.rwr, azDeg: c.azDeg, ring: c.lockedYou ? 1 : 0, boxed: c.key === cued, lockedYou: c.lockedYou })),
      lamps: { ai: cs.some(c => c.lockedYou), cw: cs.some(c => c.guiding), sam: cs.some(c => c.lockedYou) },
      hudOn: this.ewHud,
      hintOsb: hint,
    };
  }

  hudView(): HudView {
    const j = this.sim.jet;
    const altFt = this.altFt();
    const altKft = altFt / 1000;
    const tempK = 288.15 - 0.0065 * Math.min(11000, j.pos.y);
    const pitch = j.pitchRad * R2D;
    const cued = this.ewView().emitters;
    const wp = this.waypoints[this.wpIdx];
    let steer: HudView['steer'] = null;
    if (wp) {
      const r = this.sim.relative(wp.pos);
      steer = { name: wp.name, distNm: Math.hypot(wp.pos.x - j.pos.x, wp.pos.z - j.pos.z) / NM, xDeg: r.azDeg, yDeg: r.elDeg, tgt: this.designated };
    }
    const tooLos = this.harmSelected && this.mode === 'TOO' ? this.tooBox() : null;
    const s = this.mode === 'PB' && this.harmSelected ? this.pbState() : null;
    return {
      headingDeg: ((j.headingRad * R2D) % 360 + 360) % 360,
      pitchDeg: pitch,
      altFt,
      iasKt: (j.speed * 3600 / NM) / (1 + 0.02 * altKft),
      mach: j.speed / (20.05 * Math.sqrt(tempK)),
      g: 1 + Math.abs(j.pitchCmd) * 0.6,
      fpm: { xDeg: 0, yDeg: pitch },
      master: this.master,
      masterArm: this.masterArm,
      harmLegend: this.harmSelected,
      pullback: this.pullbackLabel(),
      ew: this.ewHud ? cued.map(e => ({ label: e.label, azDeg: e.azDeg, boxed: e.boxed })) : [],
      los: tooLos ? { xDeg: tooLos.azDeg, yDeg: tooLos.elDeg, hoff: tooLos.key === this.handoffKey } : null,
      steer,
      pb: s ? {
        aslXDeg: s.aslX, inRange: s.inRange, distNm: s.distNm,
        acCueYDeg: this.pullup === 'AC' ? s.cues.ac : null,
        hrmCueYDeg: this.pullup === 'HRM' ? s.cues.hrm : null,
        minCueYDeg: s.cues.min,
      } : null,
    };
  }

  ufcView(hint: UfcKey | null = null): UfcView {
    const blank = { text: '', cued: false };
    if (!this.ufcOn) return { options: [blank, blank, blank, blank, blank], scratch: '', hint };
    return {
      options: [blank, blank, blank, { text: 'TGT', cued: this.ufcOption === 4 }, blank],
      scratch: this.scratch || (this.pbCode !== null && this.ufcOption === 4 ? String(this.pbCode) : ''),
      hint,
    };
  }
}
