/**
 * [OWNER: page-tws] The TWS lesson without any DOM: owns the World and the four-bandit drill, implements the radar
 * actions the way the selected jet does them in DCS, records what each bandit's RWR hears, and keeps the flags the
 * checklist and the coach read. index.ts draws it; drill.test.ts flies it headless for every jet.
 */
import { Vector3 } from 'three';
import { World } from '../../sim/world';
import { twsDrill, type TwsDrill } from '../../sim/scenarios';
import { buildRadarPicture } from '../../sim/picture';
import { frameTimeFor, isNotched, radarRules, revisitTime, setCursor, setSnp2, snp2SeparationDeg as separationDeg, SNP2_MAX_SEP_DEG, trackOf } from '../../sim/radar';
import { rwrRank } from '../../sim/rwr';
import { D2R, R2D, relBearing, wrapPi } from '../../sim/math';
import { AIRCRAFT } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import type { AircraftId, AircraftSpec, MissileId, SeekerKind } from '../../data/types';
import type { Aircraft, EntityId, LaunchCheck, Missile, RadarPicture, RwrContact, SimEvent } from '../../sim/types';
import { fmtRange, type Units } from '../../app/format';
import { canLaunchSnp2, launchSnp2, type Snp2LaunchCheck as Snp2Check } from '../../sim/launch';

export type PageMode = 'off' | 'rws' | 'tws' | 'snp2' | 'stt' | 'vs' | 'acm';
export type BanditState = 'quiet' | 'search' | 'lock' | 'launch' | 'missile' | 'dead';
export type Tone = 'caution' | 'warning' | 'ok' | 'hi' | 'dim';
/** Own-jet steering: straight ahead (the start), hot at the group, or a crank left / right of it. */
export type Steer = 'straight' | 'hot' | 'left' | 'right';

export interface ShotRecord {
  missileId: EntityId;
  targetId: EntityId;
  type: MissileId;
  seeker: SeekerKind;
  mode: PageMode;
  t: number;
  label: string;
}

export interface BanditLog {
  id: EntityId;
  firstSearch: number | null;
  firstWarn: number | null;
  firstWarnState: BanditState | null;
  /** Seconds of warning before the missile that killed him hit (null = he never got one). */
  lead: number | null;
  diedAt: number | null;
  killedBy: EntityId | null;
}

export interface Flags {
  tws: boolean;
  snp2: boolean;
  snp2Pair: boolean;
  snp2Ready: boolean;
  firm2: boolean;
  des1: boolean;
  des2: boolean;
  locked: boolean;
  autoLock: boolean;
  contacts2: boolean;
  shots: ShotRecord[];
  active: Set<EntityId>;
  /** Went active without having lost the datalink first. */
  activeSupported: Set<EntityId>;
  /** ARH fired from STT that went active while that lock was still held. */
  activeFromLock: Set<EntityId>;
  dlLost: Set<EntityId>;
  hits: { missileId: EntityId; targetId: EntityId; seeker: SeekerKind; t: number }[];
  relockNext: boolean;
  snp2Salvo: EntityId[];
}

export interface EndState { kind: 'clear' | 'merge' | 'time'; t: number }
export interface LogLine { text: string; tone?: Tone; t: number }

export const MERGE_RANGE_M = 10_000;
export const TIME_LIMIT_S = 360;

function newFlags(): Flags {
  return {
    tws: false, snp2: false, snp2Pair: false, snp2Ready: false, firm2: false, des1: false, des2: false,
    locked: false, autoLock: false, contacts2: false, shots: [], active: new Set(), activeSupported: new Set(),
    activeFromLock: new Set(), dlLost: new Set(), hits: [], relockNext: false, snp2Salvo: [],
  };
}

const FOX: Record<SeekerKind, string> = { sarh: 'Fox 1', ir: 'Fox 2', arh: 'Fox 3' };

export interface TwsLessonOptions {
  seed?: number;
  units?: Units;
  freeLab?: boolean;
}

export class TwsLesson {
  readonly ac: AircraftId;
  readonly spec: AircraftSpec;
  readonly units: Units;
  world!: World;
  drill!: TwsDrill;
  me!: Aircraft;
  bandits: Aircraft[] = [];
  /** MiG-29S only: the radar is in СНП2 (two-target TWS). */
  get snp2(): boolean { return this.me.radar.snp2; }
  set snp2(value: boolean) { setSnp2(this.world, this.me, value); }
  freeLab: boolean;
  /** Manual designation is a trainer aid; optional SNP snap restores the DCS cursor acquisition flow. */
  dcsCursorSnap = false;
  flags: Flags = newFlags();
  ended: EndState | null = null;
  /** The contact under the cursor (keyboard designate, 3D selection, bandit RWR display). */
  hooked: EntityId | null = null;
  notching = new Set<EntityId>();
  /** How your jet flies: it holds altitude and speed; this page only steers it hot or into a crank. */
  steer: Steer = 'straight';
  /** When each bandit last slipped into your radar's Doppler notch (sim s), while it sits there. */
  notchedAt = new Map<EntityId, number>();
  banditLog = new Map<EntityId, BanditLog>();
  /** Page listeners. */
  onLog: (l: LogLine) => void = () => {};
  onEnd: (e: EndState) => void = () => {};
  onReset: () => void = () => {};

  private seed: number;
  private userLock = false;
  private labelOf = new Map<EntityId, string>();
  private firmSeen = new Set<EntityId>();
  private lastSnp2: Snp2Check | null = null;
  private centroid = new Vector3();

  constructor(ac: AircraftId, o: TwsLessonOptions = {}) {
    this.ac = ac;
    this.spec = AIRCRAFT[ac];
    this.units = o.units ?? this.spec.units;
    this.seed = o.seed ?? 7;
    this.freeLab = o.freeLab ?? false;
    this.reset();
  }

  // ------------------------------------------------------------------ setup

  reset(): void {
    this.world = new World(this.seed);
    // The bandits fly hot (pointed at you), as in the original lesson. The MiG-29S gets a tighter wall so that
    // neighbours sit inside the 8° СНП2 strobe; the F-14B carries six Phoenix.
    const spread = this.ac === 'mig29s' ? 0.4 : 1;
    const playerStores = this.ac === 'f14b' ? { aim54c: 6, aim9m: 2 } : undefined;
    this.drill = twsDrill(this.world, this.ac, { units: this.units, spread, playerStores, maneuver: 'hot' });
    const me = this.world.get(this.drill.playerId);
    if (!me) throw new Error('twsDrill did not spawn the player');
    this.me = me;
    this.bandits = this.drill.banditIds.map(id => this.world.get(id)).filter((a): a is Aircraft => !!a);
    this.snp2 = false;
    this.flags = newFlags();
    this.ended = null;
    this.hooked = null;
    this.notching.clear();
    this.notchedAt.clear();
    this.labelOf.clear();
    this.firmSeen.clear();
    this.lastSnp2 = null;
    this.steer = 'straight';
    this.autoCenterOn = true;
    this.banditLog.clear();
    for (const b of this.bandits) this.banditLog.set(b.id, { id: b.id, firstSearch: null, firstWarn: null, firstWarnState: null, lead: null, diedAt: null, killedBy: null });
    this.world.on(e => this.onEvent(e));
    this.onReset();
  }

  // ------------------------------------------------------------------ queries

  /** The mode as the pilot sees it (СНП2 is TWS with two designations on the MiG-29S). */
  get mode(): PageMode {
    const m = this.me.radar.mode;
    if (m === 'tws' && this.snp2) return 'snp2';
    return m;
  }

  get multiTarget(): boolean {
    const tws = this.spec.radar.tws;
    return !!tws && tws.launchFromTws && tws.maxSimultaneousTargets > 1;
  }

  /** FC3 Russian jets: СНП locks by itself at this fraction of Rmax. */
  get autoSttFraction(): number | null {
    return this.spec.radar.tws?.autoSttAtRmaxFraction ?? null;
  }

  bandit(id: EntityId | null | undefined): Aircraft | undefined {
    return id ? this.bandits.find(b => b.id === id) : undefined;
  }

  /** Callsign + track label, e.g. 'Bandit-2 (T3)'. */
  who(id: EntityId | null | undefined): string {
    const b = this.bandit(id);
    if (!b) return 'the target';
    const trk = trackOf(this.me.radar, id);
    return trk ? `${b.callsign} (${trk.label})` : b.callsign;
  }

  label(missileId: EntityId): string {
    return this.labelOf.get(missileId) ?? 'M';
  }

  playerMissiles(alive = true): Missile[] {
    const out: Missile[] = [];
    for (const m of this.world.missiles.values()) if (m.shooterId === this.me.id && (!alive || m.alive)) out.push(m);
    return out;
  }

  /** Is this RWR contact caused by you (your radar or your missile)? */
  fromMe(c: RwrContact): boolean {
    if (c.emitterId === this.me.id) return true;
    return this.world.missiles.get(c.emitterId)?.shooterId === this.me.id;
  }

  /** What this bandit's RWR shows about you right now. */
  banditState(id: EntityId): BanditState {
    const b = this.bandit(id);
    if (!b || !b.alive) return 'dead';
    let best: RwrContact['state'] | null = null;
    for (const c of b.rwr) if (this.fromMe(c) && (!best || rwrRank(c.state) > rwrRank(best))) best = c.state;
    return best ?? 'quiet';
  }

  /** Your RWR contacts on this bandit, for his RWR display (other bandits' radars filtered out). */
  banditContacts(id: EntityId): RwrContact[] {
    const b = this.bandit(id);
    return b && b.alive ? b.rwr.filter(c => this.fromMe(c)) : [];
  }

  /** The newest live missile of yours aimed at this bandit. */
  missileOn(id: EntityId): Missile | undefined {
    let best: Missile | undefined;
    for (const m of this.world.missiles.values()) {
      if (m.shooterId !== this.me.id || !m.alive || m.targetId !== id) continue;
      if (!best || (m.timeToImpact ?? 1e9) < (best.timeToImpact ?? 1e9)) best = m;
    }
    return best;
  }

  rangeTo(id: EntityId): number {
    const b = this.bandit(id);
    return b ? this.me.pos.distanceTo(b.pos) : Infinity;
  }

  /** Revisit time per jet in the current scan (s). */
  revisit(): number {
    return revisitTime(this.me.radar);
  }

  canLaunch(): LaunchCheck {
    return this.world.canLaunch(this.me.id);
  }

  snp2Status(): Snp2Check | null {
    return this.snp2 ? canLaunchSnp2(this.world, this.me) : null;
  }

  /** The radar picture for the display, with the local СНП2 cue on the MiG-29S. */
  picture(): RadarPicture | null {
    const pic = buildRadarPicture(this.world, this.me.id, { units: this.units });
    if (pic && this.snp2 && this.me.radar.mode === 'tws') {
      const c = this.lastSnp2 ?? canLaunchSnp2(this.world, this.me);
      pic.shootCue = c.ok;
      pic.launchBlockedReason = c.ok ? '' : c.reason;
      pic.cueLabel = 'ПР';
    }
    return pic;
  }

  /** Contacts on the radar (tracks and bricks), left to right, for the cursor keys. */
  contacts(): { id: EntityId; az: number; range: number }[] {
    const st = this.me.radar, seen = new Set<EntityId>(), out: { id: EntityId; az: number; range: number }[] = [];
    for (const t of st.tracks) {
      if (seen.has(t.targetId)) continue;
      seen.add(t.targetId);
      out.push({ id: t.targetId, az: relBearing(this.me.pos, this.me.heading, t.pos), range: this.me.pos.distanceTo(t.pos) });
    }
    for (const b of st.bricks) {
      if (seen.has(b.targetId)) continue;
      seen.add(b.targetId);
      out.push({ id: b.targetId, az: b.az, range: b.range });
    }
    return out.sort((a, b) => a.az - b.az);
  }

  hasContact(id: EntityId): boolean {
    const st = this.me.radar;
    return st.tracks.some(t => t.targetId === id) || st.bricks.some(b => b.targetId === id);
  }

  // ------------------------------------------------------------------ stepping

  step(dt: number): void {
    if (this.ended || dt <= 0) return;
    this.applySteer();
    this.world.step(dt);
    this.afterStep();
  }

  private afterStep(): void {
    const st = this.me.radar, f = this.flags;
    if (st.mode !== 'tws') this.snp2 = false;
    if (st.mode === 'tws') {
      f.tws = true;
      if (st.tracks.filter(t => t.firm).length >= 2) f.firm2 = true;
      if (st.designated.length >= 1) f.des1 = true;
      if (st.designated.length >= 2) f.des2 = true;
    }
    if (st.mode === 'stt') f.locked = true;
    if (this.contacts().length >= 2) f.contacts2 = true;
    if (this.snp2) {
      f.snp2 = true;
      this.snp2Upkeep();
    }
    // RWR bookkeeping: first time each bandit heard you, and first real warning.
    for (const b of this.bandits) {
      const log = this.banditLog.get(b.id);
      if (!log || !b.alive) continue;
      const s = this.banditState(b.id);
      if (s !== 'quiet' && log.firstSearch === null) log.firstSearch = this.world.t;
      if ((s === 'lock' || s === 'launch' || s === 'missile') && log.firstWarn === null) { log.firstWarn = this.world.t; log.firstWarnState = s; }
    }
    for (const b of this.bandits) {
      const n = b.alive && this.me.radar.mode !== 'off' && isNotched(this.world, this.me, b);
      if (n && !this.notchedAt.has(b.id)) {
        this.notchedAt.set(b.id, this.world.t);
        if (this.notching.has(b.id)) this.log(`${b.callsign} sits in your notch: your radar cannot see him, his RWR still hears you`, 'caution');
      } else if (!n) this.notchedAt.delete(b.id);
    }
    if (this.hooked && !this.bandit(this.hooked)?.alive) this.hooked = null;
    this.checkEnd();
  }

  /** Crank angle off the group, deg: 50° or 10° inside the gimbal, whichever is smaller. */
  get crankDeg(): number {
    return Math.max(20, Math.min(50, this.spec.radar.gimbalAzDeg - 10));
  }

  setSteer(s: Steer): void {
    if (this.ended) return;
    this.steer = s;
    this.applySteer();
  }

  /** Point the jet at the centre of the live bandits, plus the crank offset. 'straight' leaves the heading alone. */
  private applySteer(): void {
    if (this.steer === 'straight') return;
    const alive = this.bandits.filter(b => b.alive);
    if (!alive.length) return;
    const c = this.centroid.set(0, 0, 0);
    for (const b of alive) c.add(b.pos);
    c.divideScalar(alive.length);
    const me = this.me, off = this.steer === 'left' ? -1 : this.steer === 'right' ? 1 : 0;
    me.cmd.heading = wrapPi(me.heading + relBearing(me.pos, me.heading, c) + off * this.crankDeg * D2R);
  }

  private snp2Upkeep(): void {
    if (this.me.radar.designated.length >= 2) this.flags.snp2Pair = true;
    this.lastSnp2 = canLaunchSnp2(this.world, this.me);
    if (this.lastSnp2.ok) this.flags.snp2Ready = true;
  }

  private checkEnd(): void {
    if (this.freeLab) return;
    if (this.ended) return;
    const alive = this.bandits.filter(b => b.alive);
    const t = this.world.t;
    let kind: EndState['kind'] | null = null;
    if (!alive.length && !this.playerMissiles().length) kind = 'clear';
    else if (alive.some(b => b.pos.distanceTo(this.me.pos) < MERGE_RANGE_M)) kind = 'merge';
    else if (t > TIME_LIMIT_S) kind = 'time';
    if (!kind) return;
    this.ended = { kind, t };
    this.onEnd(this.ended);
  }

  // ------------------------------------------------------------------ events → log and flags

  private log(text: string, tone?: Tone): void {
    this.onLog({ text, tone, t: this.world.t });
  }

  private onEvent(e: SimEvent): void {
    const me = this.me, f = this.flags;
    switch (e.type) {
      case 'launch': {
        if (e.shooterId !== me.id || !e.targetId) return;
        const n = this.labelOf.size + 1;
        const label = `M${n}`;
        this.labelOf.set(e.missileId, label);
        const seeker = MISSILES[e.missile].seeker;
        const mode: PageMode = e.radarMode === 'tws' && this.snp2 ? 'snp2' : e.radarMode;
        // Sequential shots: a new target after an earlier shot went active or hit.
        const earlier = f.shots.filter(s => s.targetId !== e.targetId);
        if (earlier.some(s => f.active.has(s.missileId) || f.hits.some(h => h.missileId === s.missileId))) f.relockNext = true;
        f.shots.push({ missileId: e.missileId, targetId: e.targetId, type: e.missile, seeker, mode, t: e.t, label });
        const how = e.radarMode === 'tws' ? (seeker === 'arh' ? 'from TWS: he hears no lock and no launch' : 'from TWS') : e.radarMode === 'stt' ? 'from STT' : '';
        this.log(`${FOX[seeker]}: ${label} (${MISSILES[e.missile].name}) at ${this.who(e.targetId)}${e.range ? ', ' + fmtRange(e.range, this.units) : ''} ${how}`.trim(), 'hi');
        return;
      }
      case 'pitbull': {
        const m = this.world.missiles.get(e.missileId);
        if (!m || m.shooterId !== me.id) return;
        f.active.add(m.id);
        if (!f.dlLost.has(m.id)) f.activeSupported.add(m.id);
        const shot = f.shots.find(s => s.missileId === m.id);
        if (shot?.mode === 'stt' && me.radar.mode === 'stt' && me.radar.stt.targetId === m.targetId) f.activeFromLock.add(m.id);
        const who = this.bandit(e.targetId) ? this.who(e.targetId) : e.targetId ? 'chaff' : 'nothing';
        this.log(`${this.label(m.id)} active (pitbull) on ${who}: his RWR shows a missile now`, 'ok');
        return;
      }
      case 'datalink-lost': {
        const m = this.world.missiles.get(e.missileId);
        if (!m || m.shooterId !== me.id) return;
        f.dlLost.add(m.id);
        this.log(`${this.label(m.id)} lost the datalink (${e.why}): it flies to where the old track said ${this.bandit(m.targetId)?.callsign ?? 'he'} would be`, 'caution');
        return;
      }
      case 'seeker-lost': {
        const m = this.world.missiles.get(e.missileId);
        if (!m || m.shooterId !== me.id) return;
        if (e.why === 'lost-guidance') this.log(`${this.label(m.id)} lost your illumination: the ${MISSILES[m.type].name} is blind`, 'warning');
        else this.log(`${this.label(m.id)} seeker lost ${this.bandit(m.targetId)?.callsign ?? 'the target'}: ${e.why}`, 'caution');
        return;
      }
      case 'hit': {
        const m = this.world.missiles.get(e.missileId);
        if (!m || m.shooterId !== me.id) return;
        f.hits.push({ missileId: m.id, targetId: e.targetId, seeker: MISSILES[m.type].seeker, t: e.t });
        const log = this.banditLog.get(e.targetId);
        if (log) {
          log.diedAt = e.t;
          log.killedBy = m.id;
          log.lead = log.firstWarn === null ? null : e.t - log.firstWarn;
        }
        const b = this.bandit(e.targetId);
        const warn = log?.lead === null || log?.lead === undefined ? 'He never got a warning.' : `His first warning came ${log.lead.toFixed(0)} s before impact.`;
        this.log(`Splash ${b?.callsign ?? 'bandit'} (${this.label(m.id)}). ${warn}`, 'ok');
        return;
      }
      case 'miss': {
        const m = this.world.missiles.get(e.missileId);
        if (!m || m.shooterId !== me.id || e.reason === 'target-dead') return;
        this.log(`${this.label(m.id)} missed: ${missText(e.reason)}`, 'caution');
        return;
      }
      case 'lock': {
        if (e.ownerId !== me.id) return;
        if (e.what === 'locked') {
          if (!this.userLock) {
            f.autoLock = true;
            this.log(`${this.autoSttFraction ? `${Math.round(this.autoSttFraction * 100)} % Rmax: ` : ''}the radar locks ${this.who(e.targetId)} by itself (${this.spec.radar.modeLabels.stt ?? 'STT'}). He hears a lock now`, 'caution');
          } else {
            this.log(`STT on ${this.who(e.targetId)}: his RWR shows a lock`, 'caution');
          }
        } else if (e.what === 'broken') {
          this.log(`Lock on ${this.bandit(e.targetId)?.callsign ?? 'the target'} broken: ${e.why ?? 'lost'}`, e.why === 'target destroyed' ? undefined : 'warning');
        }
        return;
      }
      case 'track': {
        if (e.ownerId !== me.id) return;
        if (e.what === 'firm' && !this.firmSeen.has(e.targetId)) {
          this.firmSeen.add(e.targetId);
          const trk = trackOf(me.radar, e.targetId);
          if (trk && me.radar.mode === 'tws') this.log(`${trk.label} firm: speed and heading known`);
        } else if (e.what === 'dropped' && me.radar.mode === 'tws' && this.bandit(e.targetId)?.alive) {
          this.firmSeen.delete(e.targetId);
          const m = this.missileOn(e.targetId);
          this.log(`Track on ${this.bandit(e.targetId)?.callsign ?? 'a bandit'} dropped${m && m.guidance === 'datalink' ? `: ${this.label(m.id)} loses its datalink` : ''}`, m ? 'caution' : undefined);
        }
        return;
      }
      case 'ai': {
        if (this.bandit(e.ownerId)) this.log(e.text);
        return;
      }
      default:
    }
  }

  // ------------------------------------------------------------------ actions (all return a message on refusal)

  /** Radar mode as the pilot selects it. */
  setMode(m: PageMode): string | null {
    if (this.ended) return null;
    const w = this.world, me = this.me, st = me.radar, spec = this.spec;
    if (m === 'stt') return this.lockPrimary();
    if (m === 'tws' || m === 'snp2') {
      if (!spec.radar.tws || !spec.radar.modes.includes('tws')) return `No TWS in the ${spec.short}: ${spec.id === 'm2000c' ? 'PSID tracks one target and cannot guide the 530D' : 'search in RWS and lock one target'}.`;
      if (m === 'snp2' && this.ac !== 'mig29s') return 'СНП2 exists only in the MiG-29S.';
      if (st.mode !== 'tws') w.setRadarMode(me.id, 'tws');
      if (m === 'snp2') {
        if (!this.snp2) { this.snp2 = true; this.log('СНП2: put the cursor on the lead; the radar picks Ц2 within 8°'); }
      } else if (this.snp2) {
        this.snp2 = false;
        const extra = st.designated.slice(1);
        for (const id of extra) w.undesignate(me.id, id);
      }
      return null;
    }
    if (m === 'rws' && st.mode !== 'rws') { this.snp2 = false; w.setRadarMode(me.id, 'rws'); }
    return null;
  }

  /** The mode key: FC3 RAlt + I toggles ОБЗ / СНП (MiG-29S: ОБЗ → СНП → СНП2), others RWS ↔ TWS. */
  toggleMode(): string | null {
    const m = this.mode;
    if (!this.spec.radar.tws) return this.setMode('tws');
    if (this.ac === 'mig29s') return this.setMode(m === 'rws' ? 'tws' : m === 'tws' ? 'snp2' : 'rws');
    return this.setMode(m === 'tws' ? 'rws' : 'tws');
  }

  /**
   * Click / Enter / TDC depress on a contact. RWS: lock it. TWS: designate it the way the jet does (a second
   * press on a designated track goes STT on the F-15C, FC3 Russian jets and the JF-17). STT: only the locked
   * target exists.
   */
  act(id: EntityId): string | null {
    if (this.ended) return null;
    const me = this.me, st = me.radar, w = this.world;
    const b = this.bandit(id);
    if (!b || !b.alive) return null;
    this.hooked = id;
    if (!this.hasContact(id)) return `Your radar has no contact on ${b.callsign} right now: you can only designate what it has detected.`;
    if (st.mode === 'rws' || st.mode === 'vs') return this.lock(id);
    if (st.mode === 'stt') {
      if (st.stt.targetId === id) return null;
      return `In STT the radar sees only ${this.who(st.stt.targetId)}. Unlock first to pick another target.`;
    }
    if (st.mode !== 'tws') return null;
    const trk = trackOf(st, id);
    if (!trk) return `No track on ${b.callsign} yet.`;
    if (!trk.firm) return `${trk.label} is still tentative: it needs a second hit, one revisit later, before you can designate it.`;
    const rules = radarRules(this.ac);
    const i = st.designated.indexOf(id);
    if (i >= 0) {
      if (this.snp2) return `${trk.label} is already ${i === 0 ? 'the lead (Ц1)' : 'Ц2'}.`;
      if (rules.redesignate === 'lock' || i === 0) {
        const others = st.designated.length > 1 || this.playerMissiles().some(m => m.targetId !== id && m.guidance === 'datalink');
        const r = this.lock(id);
        if (!r && others) this.log(`Designated ${trk.label} again: STT. Every other track is gone, and missiles on them lose their datalink`, 'warning');
        return r;
      }
      w.designate(me.id, id);
      this.log(`${trk.label} is now the primary`);
      return null;
    }
    if (this.snp2) {
      const lead = st.designated[0];
      if (lead && st.designated.length >= 1) {
        const sep = separationDeg(me, lead, id);
        if (sep !== null && sep > SNP2_MAX_SEP_DEG) return `СНП2: ${trk.label} is ${sep.toFixed(0)}° from the lead. Both must sit inside the 8° strobe.`;
        if (st.designated.length >= 2) w.undesignate(me.id, st.designated[1]);
        st.designated.push(id);
        this.log(`${trk.label} is Ц2 (cross)`);
        return null;
      }
    } else if (this.ac === 'mig29s' || rules.designationCap <= 1) {
      for (const d of [...st.designated]) w.undesignate(me.id, d);
    }
    const before = st.designated.length;
    w.designate(me.id, id);
    if (this.snp2 && st.designated.length === 1) {
      setSnp2(w, me, true);
    }
    if (st.designated.length === before && !st.designated.includes(id)) return `Designation list full: the ${this.spec.short} keeps ${rules.designationCap}. Undesignate one first.`;
    const idx = st.designated.indexOf(id);
    this.log(`Designated ${trk.label} (${b.callsign})${designationName(this.ac, idx, this.snp2)}`);
    return null;
  }

  /** STT on a target (RWS click, Hornet SCS, "designate again"). */
  lock(id: EntityId): string | null {
    const chk = this.world.canLock(this.me.id, id);
    if (!chk.ok) return `Cannot lock ${this.bandit(id)?.callsign ?? 'that'}: ${chk.reason}.`;
    this.userLock = true;
    this.world.lock(this.me.id, id);
    this.userLock = false;
    this.snp2 = false;
    return null;
  }

  /** Lock the primary designation, else the contact under the cursor, else the nearest contact. */
  lockPrimary(): string | null {
    const st = this.me.radar;
    if (st.mode === 'stt') return null;
    const id = st.designated[0] ?? (this.freeLab ? this.contactAtCursor() : (this.hooked && this.hasContact(this.hooked) ? this.hooked : null) ?? this.nearestContact());
    if (!id) return 'Nothing to lock: your radar has no contact yet.';
    return this.lock(id);
  }

  nearestContact(): EntityId | null {
    let best: EntityId | null = null, br = Infinity;
    for (const c of this.contacts()) if (c.range < br && this.bandit(c.id)?.alive) { br = c.range; best = c.id; }
    return best;
  }

  undesignate(id: EntityId): void {
    const trk = trackOf(this.me.radar, id);
    this.world.undesignate(this.me.id, id);
    if (trk) this.log(`${trk.label} undesignated`);
  }

  /** Next primary: Hornet Undesignate, Viper TMS Right, JF-17 S2 Left, F-14 NEXT LAUNCH. */
  cycle(): string | null {
    const st = this.me.radar;
    if (st.mode !== 'tws') return 'Stepping the primary works in TWS.';
    if (this.ac === 'jf17' && st.designated.length < 2) return 'S2 Left swaps HPT and SPT: bug a second track first.';
    if (this.ac === 'f15c' || radarRules(this.ac).designationCap <= 1) return `The ${this.spec.short} cannot step designations: undesignate and designate again.`;
    const before = st.designated[0];
    this.world.cycleDesignation(this.me.id);
    const after = st.designated[0];
    if (after && after !== before) this.log(`${this.who(after)} is now the primary${this.ac === 'fa18c' ? ' (L&S)' : this.ac === 'f16c' ? ' (bug)' : this.ac === 'jf17' ? ' (HPT)' : ''}`);
    return null;
  }

  unlock(): void {
    const st = this.me.radar;
    if (st.mode === 'stt') {
      const id = st.stt.targetId;
      this.world.unlock(this.me.id);
      this.log(`Unlocked ${this.bandit(id)?.callsign ?? ''}: back to ${this.spec.radar.modeLabels[this.me.radar.mode] ?? this.me.radar.mode.toUpperCase()}${radarRules(this.ac).unlockKeepsDesignation ? '' : ', track cleared'}`.replace('  ', ' '));
    } else if (st.mode === 'tws' && st.designated.length) {
      this.world.unlock(this.me.id);
      this.log('All designations dropped');
    }
  }

  fire(): string | null {
    if (this.ended) return null;
    if (this.snp2 && this.me.radar.mode === 'tws') {
      const c = canLaunchSnp2(this.world, this.me);
      if (!c.ok) return c.reason;
      const ms = launchSnp2(this.world, this.me);
      this.flags.snp2Salvo = ms.map(m => m.id);
      return null;
    }
    const r = this.world.launch(this.me.id);
    return 'kind' in r ? null : r.reason;
  }

  selectWeapon(id: MissileId): void {
    if ((this.me.stores[id] ?? 0) > 0) this.me.selectedWeapon = id;
  }

  cycleWeapon(): void {
    this.world.cycleWeapon(this.me.id);
  }

  toggleNotch(id: EntityId): void {
    const b = this.bandit(id);
    if (!b || !b.alive || this.ended) return;
    if (this.notching.has(id)) { this.notching.delete(id); this.drill.setManeuver(id, 'hot'); }
    else { this.notching.add(id); this.drill.setManeuver(id, 'beam'); }
  }

  /** FC3 Russian jets: in СНП the cursor snaps to a track and designates it (no key press needed). */
  get cursorSnaps(): boolean {
    return this.autoSttFraction !== null;
  }

  /**
   * The cursor has just moved onto `id`. FC3 Russian СНП: it snaps to a firm track and designates it, as in DCS
   * (Enter on it then locks early). In СНП2 only the lead snaps: the radar picks Ц2 itself. Returns a message or null.
   */
  cursorSnap(id: EntityId | null): string | null {
    const st = this.me.radar;
    if ((this.freeLab && !this.dcsCursorSnap) || !id || !this.cursorSnaps || this.ended || st.mode !== 'tws' || st.designated.includes(id)) return null;
    if (this.snp2 && st.designated.length) return null;
    const trk = trackOf(st, id);
    if (!trk || !trk.firm || trk.coasting) return null;
    return this.act(id);
  }

  /** A contact must actually overlap the trainer cursor gate; there is no nearest-contact fallback. */
  contactAtCursor(): EntityId | null {
    const st = this.me.radar;
    const candidates = this.contacts().filter(c => Math.abs(c.az - st.cursor.az) <= 2 * D2R
      && Math.abs(c.range - st.cursor.range) <= Math.max(500, st.rangeScale * 0.025));
    candidates.sort((a, b) => Math.abs(a.az - st.cursor.az) - Math.abs(b.az - st.cursor.az)
      || Math.abs(a.range - st.cursor.range) - Math.abs(b.range - st.cursor.range));
    return candidates[0]?.id ?? null;
  }

  /** Continuous trainer cursor speed; only a contact actually under the gate may be acquired. */
  slewCursor(dx: number, dy: number, dt: number): void {
    if (dt <= 0 || (!dx && !dy)) return;
    const st = this.me.radar;
    setCursor(this.world, this.me, { az: st.cursor.az + dx * 25 * D2R * dt,
      range: Math.max(0, Math.min(st.rangeScale, st.cursor.range + dy * st.rangeScale * 0.35 * dt)) });
    this.hooked = this.contactAtCursor();
    this.cursorSnap(this.hooked);
  }

  /** Arrow keys command tactical heading/altitude, not stick or flight-model inputs. */
  steerInput(turn: number, climb: number, dt: number): void {
    if (dt <= 0 || (!turn && !climb)) return;
    this.steer = 'straight';
    this.me.cmd.heading = wrapPi(this.me.cmd.heading + turn * 12 * D2R * dt);
    this.me.cmd.altitude = Math.max(300, Math.min(18000, this.me.cmd.altitude + climb * 300 * dt));
  }

  /** Move the cursor to the next contact: dx = −1 left / +1 right (azimuth), dy = +1 farther / −1 nearer. */
  hookStep(dx: number, dy: number): void {
    const list = this.contacts().filter(c => this.bandit(c.id)?.alive);
    if (!list.length) { this.hooked = null; return; }
    const cur = list.find(c => c.id === this.hooked);
    if (!cur) { this.hooked = (dx < 0 || dy < 0 ? list[0] : list[list.length - 1]).id; return; }
    if (dx) {
      const i = list.indexOf(cur);
      this.hooked = list[(i + (dx > 0 ? 1 : list.length - 1)) % list.length].id;
    } else {
      const byR = [...list].sort((a, b) => a.range - b.range);
      const i = byR.indexOf(cur);
      this.hooked = byR[(i + (dy > 0 ? 1 : byR.length - 1)) % byR.length].id;
    }
  }

  // ------------------------------------------------------------------ scan

  /** Scan width options (± half-width, deg) with the reason when TWS or the mode refuses one. */
  azOptions(): { deg: number; ok: boolean; why: string; frameS: number }[] {
    const r = this.spec.radar, st = this.me.radar, tws = r.tws, inTws = st.mode === 'tws';
    return r.azHalfWidthOptionsDeg.map(deg => {
      const frameS = frameTimeFor(this.spec, deg * D2R, st.bars);
      let why = '';
      if (st.mode === 'stt') why = 'STT: the beam stares at one target, no scan';
      else if (this.ac === 'f16c' && deg === 25 && !(inTws && st.designated.length)) why = 'A2 (±25°) exists only in TWS with a bugged target';
      else if (inTws && r.twsPatterns && !r.twsPatterns.some(([a]) => a === deg)) why = 'Not offered in DCS TWS';
      else if (inTws && tws) {
        const maxAz = Math.min(tws.maxAzHalfWidthDeg ?? Infinity, r.gimbalAzDeg);
        if (deg > maxAz + 1e-6) why = `TWS allows ±${maxAz}° at most in the ${this.spec.short}${this.ac === 'f15c' ? ' (DCS since 1.2.7)' : ''}`;
        else if (tws.maxFrameTimeS) {
          const bars = r.barOptions.filter(b => b <= (tws.maxBars ?? Infinity));
          if (!bars.some(b => frameTimeFor(this.spec, deg * D2R, b) <= tws.maxFrameTimeS! + 1e-6)) why = `Too slow for TWS: a frame over ${tws.maxFrameTimeS} s even with one bar`;
        }
      }
      return { deg, ok: !why, why, frameS };
    });
  }

  barOptions(): { n: number; ok: boolean; why: string }[] {
    const r = this.spec.radar, st = this.me.radar, tws = r.tws, inTws = st.mode === 'tws';
    return r.barOptions.map(n => {
      let why = '';
      if (st.mode === 'stt') why = 'STT: no scan pattern';
      else if (this.ac === 'f16c' && n === 3 && !(inTws && st.designated.length)) why = '3B exists only in TWS with a bugged target';
      else if (inTws && r.twsPatterns && !r.twsPatterns.some(([, b]) => b === n)) why = 'Not offered in DCS TWS';
      else if (inTws && tws) {
        if (n > (tws.maxBars ?? Infinity)) why = `TWS allows ${tws.maxBars} bars at most in the ${this.spec.short}`;
        else if (tws.maxFrameTimeS) {
          const minAz = Math.min(...r.azHalfWidthOptionsDeg);
          if (frameTimeFor(this.spec, minAz * D2R, n) > tws.maxFrameTimeS + 1e-6) why = `Too slow for TWS: a frame over ${tws.maxFrameTimeS} s`;
        }
      }
      return { n, ok: !why, why };
    });
  }

  /** Apply a scan width; returns a note when TWS had to trim the bars to keep the frame short. */
  setAz(deg: number): string | null {
    const st = this.me.radar, bars = st.bars;
    this.world.setScan(this.me.id, { azHalf: deg * D2R });
    if (st.bars !== bars) return `Bars cut to ${st.bars} to keep the TWS frame under ${this.spec.radar.tws?.maxFrameTimeS ?? '?'} s`;
    if (Math.abs(st.azHalf * R2D - deg) > 0.5) return `TWS keeps ±${Math.round(st.azHalf * R2D)}°`;
    return null;
  }

  setBars(n: number): string | null {
    const st = this.me.radar, az = st.azHalf;
    this.world.setScan(this.me.id, { bars: n });
    if (Math.abs(st.azHalf - az) > 1e-6) return `Scan narrowed to ±${Math.round(st.azHalf * R2D)}° to keep the TWS frame under ${this.spec.radar.tws?.maxFrameTimeS ?? '?'} s`;
    if (st.bars !== n) return `TWS keeps ${st.bars} bars`;
    return null;
  }

  /** Scan centre (deg off the nose). auto = follow the primary in TWS. */
  setCenter(deg: number | 'auto'): void {
    if (deg === 'auto') { this.world.setScan(this.me.id, { autoCenter: true }); this.autoCenterOn = true; }
    else if (this.fc3Positions) {
      // FC3 Russian: three 60° positions; СНП still centres on the tracked target by itself.
      this.world.setScan(this.me.id, { azCenter: deg * D2R });
    } else { this.world.setScan(this.me.id, { azCenter: deg * D2R, autoCenter: false }); this.autoCenterOn = false; }
  }

  /** FC3 Russian scan: three fixed positions, auto-centred in СНП. */
  get fc3Positions(): boolean {
    return radarRules(this.ac).azPositionsDeg !== null;
  }

  /** Antenna elevation (scan centre above the horizon, deg). Stops the TWS auto-centring. */
  setElevation(deg: number): void {
    this.world.setScan(this.me.id, { elCenter: deg * D2R });
  }

  /** Scan elevation limits, deg: how far the antenna can tilt with the current bars. */
  elevationLimitDeg(): number {
    const r = this.spec.radar, st = this.me.radar;
    const half = ((st.bars - 1) * r.barSpacingDeg + r.beamWidthDeg) / 2;
    return Math.max(0, Math.min(15, r.gimbalElDeg - half));
  }

  /** Is the scan auto-centred on the primary right now? */
  get autoCentred(): boolean {
    return this.me.radar.mode === 'tws' && this.me.radar.designated.length > 0 && this.autoCenterOn;
  }

  /** Mirror of the radar's auto-centre flag (set through setCenter / setElevation). */
  autoCenterOn = true;

  /** Display range step: +1 = longer scale, −1 = shorter. */
  zoom(dir: 1 | -1): void {
    const scales = this.spec.radar.rangeScalesKm.map(k => k * 1000);
    const cur = this.me.radar.rangeScale;
    let i = scales.findIndex(s => Math.abs(s - cur) < 1);
    if (i < 0) i = 0;
    const next = scales[Math.max(0, Math.min(scales.length - 1, i + dir))];
    this.world.setScan(this.me.id, { rangeScale: next });
  }
}

function missText(reason: string): string {
  switch (reason) {
    case 'notched': return 'he notched the seeker';
    case 'chaff': return 'it went for the chaff';
    case 'kinematic': return 'out of energy';
    case 'lost-guidance': return 'no guidance';
    case 'no-acquisition': return 'the seeker found nothing where the track said he would be';
    case 'timeout': return 'battery ran out';
    case 'overshoot': return 'overshot';
    case 'ground': return 'hit the ground';
    default: return reason;
  }
}

/** What the jet calls designation number `i`. */
export function designationName(ac: AircraftId, i: number, snp2 = false): string {
  if (i < 0) return '';
  if (snp2) return i === 0 ? ': lead (Ц1)' : ': Ц2';
  switch (ac) {
    case 'f15c': return i === 0 ? ': PDT' : `: SDT ${i}`;
    case 'fa18c': return i === 0 ? ': L&S' : ': DT2';
    case 'f16c': return i === 0 ? ': bug' : `: secondary ${i}`;
    case 'jf17': return i === 0 ? ': HPT' : ': SPT';
    case 'f14b': return `: priority ${i + 1}`;
    default: return i === 0 ? '' : ` (${i + 1})`;
  }
}
