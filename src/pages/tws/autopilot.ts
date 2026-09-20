/**
 * [OWNER: page-tws] A demo pilot that flies the lesson the way each jet should, using only the page's actions.
 * Used by the headless test (every jet must be able to finish its checklist) and by ?shot=<state> pre-rolls.
 */
import { MISSILES } from '../../data/missiles';
import type { EntityId } from '../../sim/types';
import { trackOf } from '../../sim/radar';
import { pickSnp2Second as pickSecond } from '../../sim/radar';
import type { TwsLesson } from './drill';

export interface AutopilotState { next: number; lastShot: number }

export function newAutopilot(): AutopilotState {
  return { next: 0, lastShot: -99 };
}

/** One decision (call every frame; it thinks twice a second of sim time). */
export function autopilotTick(L: TwsLesson, ap: AutopilotState): void {
  const w = L.world, me = L.me, st = me.radar, spec = L.spec;
  if (L.ended || w.t < ap.next) return;
  ap.next = w.t + 0.5;
  const alive = (id: EntityId) => !!L.bandit(id)?.alive;
  const targeted = new Set(L.playerMissiles().map(m => m.targetId));
  const firm = st.tracks.filter(t => t.firm && !t.coasting && alive(t.targetId)).sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos));

  // Radar mode.
  if (!spec.radar.tws) {
    if (st.mode === 'rws') {
      const c = L.contacts().filter(c => alive(c.id) && !targeted.has(c.id)).sort((a, b) => a.range - b.range)[0];
      const rmax = MISSILES[me.selectedWeapon ?? 's530d'].ref.highHeadOnKm * 1000;
      if (c && c.range < rmax * 1.05 && w.canLock(me.id, c.id).ok) L.act(c.id);
    }
  } else if (st.mode === 'rws') {
    L.setMode(L.ac === 'mig29s' ? 'snp2' : 'tws');
  } else if (st.mode === 'tws') {
    if (L.ac === 'mig29s' && !L.snp2 && !L.flags.snp2Salvo.length) L.setMode('snp2');
    designate(L, firm.map(t => t.targetId).filter(id => !targeted.has(id)));
  } else if (st.mode === 'stt') {
    // Let go once the missile on the locked target no longer needs the lock (active ARH, or it hit).
    const m = st.stt.targetId ? L.missileOn(st.stt.targetId) : undefined;
    if (m && m.guidance === 'active') L.unlock();
    if (!m && L.flags.shots.some(s => s.targetId === st.stt.targetId) && !L.canLaunch().ok) L.unlock();
  }

  // Jets that shoot at the primary: step it off a target that already has a missile.
  if (st.mode === 'tws' && !L.snp2 && ['fa18c', 'f16c', 'jf17'].includes(L.ac) && st.designated[0] && targeted.has(st.designated[0])) {
    const other = st.designated.slice(1).find(id => !targeted.has(id));
    if (other || st.designated.length < 2) L.cycle();
    else if (L.ac === 'fa18c') L.undesignate(st.designated[1]);
  }
  // Nothing in the scan and no primary: bring the scan back to the nose.
  if (st.mode === 'tws' && !st.designated.length && !st.tracks.length) L.setCenter(0), L.setElevation(0);

  // Shoot.
  const ck = L.snp2 ? L.snp2Status() : L.canLaunch();
  if (ck?.ok && w.t - ap.lastShot > 2.5) {
    const tid = 'targetId' in ck ? ck.targetId : st.designated[0];
    const fresh = L.snp2 ? st.designated.slice(0, 2).every(id => !targeted.has(id)) : !tid || !targeted.has(tid);
    if (fresh) {
      if (!L.fire()) ap.lastShot = w.t;
    }
  }
}

function designate(L: TwsLesson, free: EntityId[]): void {
  const st = L.me.radar;
  switch (L.ac) {
    case 'su27': case 'su33': case 'j11a':
      // One designation: keep it on the nearest firm track nobody is shooting at.
      if (free[0] && st.designated[0] !== free[0]) L.act(free[0]);
      return;
    case 'mig29s':
      if (L.snp2 && !st.designated.length) {
        const lead = free.find(id => pickSecond(L.world, L.me, id));
        if (lead) L.act(lead);
      }
      return;
    case 'f15c':
      for (const id of free) if (st.designated.length < 4 && !st.designated.includes(id)) L.act(id);
      return;
    case 'fa18c': case 'jf17':
      for (const id of free) if (st.designated.length < 2 && !st.designated.includes(id)) L.act(id);
      return;
    case 'f16c':
      if (!st.designated.length && free[0]) L.act(free[0]);
      else if (st.designated.length && !trackOf(st, st.designated[0])) L.cycle();
      return;
    default:
  }
}
