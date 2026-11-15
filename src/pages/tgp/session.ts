/**
 * [OWNER: page-tgp] One lesson run on the Targeting pod & Mavericks page, without DOM: the scenario, the tracker, the
 * checklist (steps complete in order, each once) and the trainer flying between passes (repositioning after an
 * overflight, the laser-weapons phases). The caller steps the world and the HOTAS, then calls `update(dt)`; the page
 * adds the displays, the tests drive it headless.
 *
 * Trainer convenience, not DCS: when the store the current step needs is used up and its last round has resolved
 * (hit or miss), the trainer rearms that store, logs one line and repositions for another pass, so a miss never leaves
 * the lesson without the weapon to finish it. These lessons are not scored.
 */
import type { AgWeaponId } from '../../data/types';
import type { A10cHotas } from '../cas/a10cHotas';
import { LESSONS, type TgpSnap } from './lessons';
import { TgpTracker } from './tracker';
import { START, TRUCKS_AT, centreOf, type TgpLessonId, type TgpScenario } from './scenario';

/** Laser-weapons lesson phases: GBU-12 on the column, APKWS on the trucks, AGM-65L on the column. */
export type LgbPhase = 'gbu' | 'apkws' | '65l';
const PHASE_OF_STORE: Record<LgbPhase, 'gbu12' | 'apkws' | 'agm65l'> = { gbu: 'gbu12', apkws: 'apkws', '65l': 'agm65l' };
/** Where each laser-weapons pass starts: range south of its target (m), height above the pad (m). Trainer values. */
const PHASE_START: Record<LgbPhase, { rangeM: number; aglM: number; trucks: boolean }> = {
  gbu: { rangeM: 13000, aglM: 3000, trucks: false },
  apkws: { rangeM: 11500, aglM: 1800, trucks: true },
  '65l': { rangeM: 14000, aglM: 2600, trucks: false },
};
/** Overflight limits: the lesson repositions the jet once this close to the target without a job left there (m). */
const TOO_CLOSE_M: Record<TgpLessonId, number> = { soi: 5000, pod: 5000, laser: 5000, mav: 5800, lgb: 2500, gun: 0 };
/** The stores a step needs to be finished, and how the rearm line names them (trainer convenience, see the header). */
type Need = { stores: readonly AgWeaponId[]; name: string };
const MAV_NEED: Need = { stores: ['agm65d', 'agm65h'], name: 'Mavericks' };
const GBU_NEED: Need = { stores: ['gbu12'], name: 'GBU-12' };
const RKT_NEED: Need = { stores: ['apkws'], name: 'APKWS' };
const L65_NEED: Need = { stores: ['agm65l'], name: 'AGM-65L' };
const GUN_NEED: Need = { stores: ['gau8'], name: '30 mm rounds' };
function needOf(lesson: TgpLessonId, step: string): Need | null {
  switch (lesson) {
    case 'mav': return MAV_NEED;
    case 'gun': return GUN_NEED;
    case 'lgb': return step === '65l' || step === '65l-hit' ? L65_NEED : step === 'apkws' || step === 'truck' || step === 'rkt' || step === 'rkt-hit' ? RKT_NEED : GBU_NEED;
    default: return null;
  }
}

export type SessionLog = (text: string, tone?: 'ok' | 'caution') => void;

export class TgpSession {
  readonly tracker: TgpTracker;
  readonly done = new Set<string>();
  phase: LgbPhase = 'gbu';
  /** Gun lesson: closest range to the trucks on this pass (m). */
  private closestM = Infinity;
  private last: TgpSnap;
  /** The lesson loadout at the start: store counts and station counts, for the trainer rearm. */
  private readonly full: { stores: Partial<Record<AgWeaponId, number>>; stations: number[] };

  constructor(readonly lesson: TgpLessonId, readonly sc: TgpScenario, readonly hotas: A10cHotas, private readonly log: SessionLog = () => {}) {
    this.tracker = new TgpTracker(sc, hotas);
    this.last = this.tracker.snap();
    const ag = sc.me.ag!;
    this.full = { stores: { ...ag.stores }, stations: ag.stations.map(s => s.count) };
  }

  dispose(): void { this.tracker.dispose(); }

  get complete(): boolean { return this.done.size === LESSONS[this.lesson].steps.length; }
  get snapshot(): TgpSnap { return this.last; }

  /** After world.step and hotas.step: sample, fly the lesson, tick the checklist. Returns the step ids done now. */
  update(dt: number): string[] {
    this.tracker.step(dt);
    this.fly();
    this.last = this.tracker.snap();
    const now: string[] = [];
    for (const st of LESSONS[this.lesson].steps) {
      if (this.done.has(st.id)) continue;
      if (!st.check(this.last)) break;
      this.done.add(st.id);
      now.push(st.id);
    }
    this.rearmIfOut();
    return now;
  }

  /** Trainer rearm (see the header): the current step's store is used up and none of it is still flying. */
  private rearmIfOut(): void {
    const step = this.current(), me = this.sc.me, ag = me.ag!;
    const need = step && me.alive ? needOf(this.lesson, step) : null;
    if (!need || need.stores.some(w => (ag.stores[w] ?? 0) > 0)) return;
    for (const wp of this.sc.world.agWeapons.values()) if (wp.alive && wp.shooterId === me.id && need.stores.includes(wp.type)) return;
    for (const w of need.stores) ag.stores[w] = this.full.stores[w] ?? 0;
    ag.stations.forEach((s, i) => { if ((need.stores as readonly string[]).includes(s.weapon)) s.count = this.full.stations[i] ?? s.count; });
    if (!ag.selected || !need.stores.includes(ag.selected)) this.sc.world.selectAgWeapon(me.id, need.stores[0]!);
    if (ag.tgp?.laserFiring) this.hotas.laserHeld = this.hotas.laserLatched = false;
    const p = this.lesson === 'lgb' ? PHASE_START[this.phase] : START[this.lesson];
    this.reposition(p.rangeM, p.aglM, this.lesson === 'gun' || (this.lesson === 'lgb' && PHASE_START[this.phase].trucks));
    this.log(`Out of ${need.name}. Rearmed for another pass.`);
  }

  /** The current step, or null when the lesson is complete. */
  current(): string | null { return LESSONS[this.lesson].steps.find(s => !this.done.has(s.id))?.id ?? null; }

  private ownFlying(): boolean {
    const me = this.sc.me.id;
    for (const w of this.sc.world.agWeapons.values()) if (w.alive && w.shooterId === me) return true;
    return false;
  }

  /** Put the jet back on a straight run toward the column (or the trucks), `rangeM` south of it. */
  reposition(rangeM: number, aglM: number, trucks = false, speed?: number): void {
    const w = this.sc.world, me = this.sc.me;
    const c = (trucks ? centreOf(w, this.sc.trucks) : centreOf(w, this.sc.column)) ?? { x: trucks ? TRUCKS_AT.x : 0, y: this.sc.groundM, z: trucks ? TRUCKS_AT.z : 0 };
    const y = this.sc.groundM + aglM;
    const v = speed ?? START[this.lesson].speed;
    me.pos.set(c.x, y, c.z + rangeM);
    me.heading = me.cmd.heading = 0; me.pitch = 0; me.roll = 0;
    me.cmd.altitude = y; me.cmd.speed = v;
    me.vel.set(0, 0, -v);
    this.closestM = Infinity;
  }

  private fly(): void {
    if (this.complete) return;
    const w = this.sc.world, me = this.sc.me;
    if (!me.alive) return;
    const lesson = this.lesson;
    if (lesson === 'lgb') { this.flyLgb(); return; }
    if (lesson === 'gun') {
      const c = centreOf(w, this.sc.trucks) ?? { x: TRUCKS_AT.x, z: TRUCKS_AT.z };
      const r = Math.hypot(me.pos.x - c.x, me.pos.z - c.z);
      this.closestM = Math.min(this.closestM, r);
      if (this.closestM < 1500 && r > this.closestM + 600 && !this.ownFlying()) {
        const st = START.gun;
        this.reposition(st.rangeM, st.aglM, true);
        this.log('Past the trucks: repositioned for another pass');
      }
      return;
    }
    const c = centreOf(w, this.sc.column) ?? { x: 0, z: 0 };
    const r = Math.hypot(me.pos.x - c.x, me.pos.z - c.z);
    if (r < TOO_CLOSE_M[lesson] && !this.ownFlying()) {
      const st = START[lesson];
      this.reposition(st.rangeM, st.aglM);
      this.log(`Repositioned ${(st.rangeM / 1852).toFixed(0)} nm south for another run`);
    }
  }

  private flyLgb(): void {
    const w = this.sc.world, me = this.sc.me;
    const store = PHASE_OF_STORE[this.phase];
    const killed = (this.tracker.kills[store] ?? 0) > 0;
    const flying = this.ownFlying();
    if (killed && !flying && this.phase !== '65l') {
      this.phase = this.phase === 'gbu' ? 'apkws' : '65l';
      const p = PHASE_START[this.phase];
      if (me.ag!.tgp!.laserFiring) this.hotas.laserHeld = this.hotas.laserLatched = false;
      this.reposition(p.rangeM, p.aglM, p.trucks);
      this.log(this.phase === 'apkws' ? 'APKWS pass: the trucks, 6 nm ahead' : 'AGM-65L pass: the column, 7.5 nm ahead');
      return;
    }
    const p = PHASE_START[this.phase];
    const c = (p.trucks ? centreOf(w, this.sc.trucks) : centreOf(w, this.sc.column)) ?? { x: 0, z: 0 };
    const r = Math.hypot(me.pos.x - c.x, me.pos.z - c.z);
    if (r < TOO_CLOSE_M.lgb && !flying) {
      this.reposition(p.rangeM, p.aglM, p.trucks);
      this.log('Too close for this pass: repositioned for another run');
    }
  }
}
