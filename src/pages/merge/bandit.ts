/**
 * [OWNER: page-merge] Scripted bandit for the Merge & guns lessons (no fighting AI yet): straight and level, a level
 * turn, a turn that reverses, and a scripted gun attack for the guns-defence drill. Each step returns the sim BFM
 * command and trigger. Rule-based and deterministic; tuned for teaching geometry, not for a fair fight.
 */
import { Vector3 } from 'three';
import type { Aircraft, BfmCommand } from '../../sim/types';
import { gunSolution } from '../../sim/guns';
import { G0, clamp } from '../../sim/math';
import { steerTo } from './bfm';

export type BanditMode = 'straight' | 'turn' | 'reverse' | 'guns';

export const BANDIT_LABEL: Record<BanditMode, string> = {
  straight: 'Straight and level',
  turn: 'Level turn',
  reverse: 'Turning and reversing',
  guns: 'Gun attack',
};

/** Load factor of the scripted level turn. */
export const TURN_G = 4;
/** Seconds between reversals. */
export const REVERSE_S = 16;
/** Gun attack: pull limit, burst and pause lengths (s), steering lag (s). */
export const ATTACK_MAX_G = 6.5;
export const BURST_S = 1;
export const PAUSE_S = 1.6;
export const AIM_LAG_S = 0.7;

export interface BanditState {
  mode: BanditMode;
  /** Altitude the level modes hold (m). */
  alt0: number;
  /** Turn direction, +1 right, −1 left. */
  dir: 1 | -1;
  nextReverse: number;
  /** Gun attack: time left in the burst / pause, smoothed aim direction. */
  burst: number;
  pause: number;
  aim: Vector3;
}

export function newBandit(mode: BanditMode, ac: Aircraft, dir: 1 | -1 = 1): BanditState {
  return { mode, alt0: ac.pos.y, dir, nextReverse: REVERSE_S, burst: 0, pause: 0.5, aim: new Vector3().copy(ac.vel).normalize() };
}

/** Level hold: load factor for a bank that keeps the altitude (P on height, D on climb rate). */
function levelAt(ac: Aircraft, bank: number, alt0: number): number {
  const v = Math.max(1, ac.vel.length());
  const av = clamp(0.012 * (alt0 - ac.pos.y) - 0.5 * ac.vel.y, -3, 3);
  const cosG = Math.sqrt(Math.max(0, 1 - (ac.vel.y / v) ** 2));
  return clamp((cosG + av / G0) / Math.max(0.2, Math.cos(bank)), 0, 9);
}

const _lead = new Vector3();

/** One step of the scripted bandit: sets nothing, returns the command and trigger. */
export function banditStep(s: BanditState, bandit: Aircraft, player: Aircraft | null, t: number, dt: number): { bfm: BfmCommand; trigger: boolean } {
  switch (s.mode) {
    case 'straight':
      return { bfm: { bank: 0, g: levelAt(bandit, 0, s.alt0), throttle: 'mil' }, trigger: false };
    case 'reverse':
    case 'turn': {
      if (s.mode === 'reverse' && t >= s.nextReverse) { s.dir = s.dir > 0 ? -1 : 1; s.nextReverse = t + REVERSE_S; }
      const bank = s.dir * Math.acos(1 / TURN_G);
      // Roll through wings level on a reversal before pulling again.
      const rolling = Math.abs(bank - bandit.roll) > 0.5;
      return { bfm: { bank, g: rolling ? 1 : levelAt(bandit, bandit.roll, s.alt0), throttle: 'ab' }, trigger: false };
    }
    case 'guns': {
      if (!player || !player.alive) return { bfm: { bank: 0, g: levelAt(bandit, 0, s.alt0), throttle: 'mil' }, trigger: false };
      const sol = gunSolution(bandit, player);
      // Smoothed aim at the lead point: a scripted shooter that reacts late to a hard jink.
      const k = 1 - Math.exp(-dt / AIM_LAG_S);
      s.aim.lerp(_lead.copy(sol.lead), k).normalize();
      const bfm = steerTo(bandit, s.aim, 'ab', 1.1, ATTACK_MAX_G);
      let trigger = false;
      if (s.burst > 0) { s.burst -= dt; trigger = true; if (s.burst <= 0) s.pause = PAUSE_S; }
      else if (s.pause > 0) s.pause -= dt;
      else if (sol.inRange && sol.missAngle < 2 * sol.sizeAngle) { s.burst = BURST_S; trigger = true; }
      return { bfm, trigger };
    }
  }
}
