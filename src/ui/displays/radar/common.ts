/**
 * [OWNER: displays] Frame context and helpers shared by the radar display formats.
 */
import type { FighterId, DisplayFormat } from '../../../data/types';
import type { EntityId, RadarPicture } from '../../../sim/types';
import type { Theme } from '../../theme';
import type { Gfx } from '../surface';
import { blinkOn } from '../surface';
import type { HitItem, Pt, Units } from '../geometry';
import type { MissileClock } from '../glyphs';

export type PicTrack = RadarPicture['tracks'][number];
export type PicBrick = RadarPicture['bricks'][number];
export type PicMissile = PicTrack['missiles'][number];
export type PicDlz = NonNullable<RadarPicture['dlz']>;

export interface RadarDisplayOptions {
  format: DisplayFormat;
  /** Display units. Defaults to the picture's units. */
  units?: Units;
  /** Wording variant (Hornet / Viper / JF-17 on 'mfd'; Su-27 vs MiG-29 on 'ru-hud'). Defaults to picture.aircraftType. */
  aircraft?: FighterId;
  /** How non-friendly tracks are identified on HAFU/TID symbols. Own-sensor pictures usually say 'unknown'. Default 'unknown'. */
  nonFriendly?: 'unknown' | 'hostile';
  /** F-14 TID stabilisation. 'ground' (north-up) needs `ownHeading` in draw(). Default 'aircraft'. */
  tidStab?: 'aircraft' | 'ground';
  /** Glow strength multiplier, 0 = off. Default 1. */
  glow?: number;
  /** Colour-coded symbology on MFDs (Hornet DATA>COLOR, Viper colours). Default: Viper and JF-17 yes, Hornet no. */
  color?: boolean;
  /** Trainer aid: draw the independent cursor instead of the FC3 designated-track snap. */
  manualCursor?: boolean;
}

export interface ResolvedOptions {
  format: DisplayFormat;
  units: Units | null;
  aircraft: FighterId | null;
  nonFriendly: 'unknown' | 'hostile';
  tidStab: 'aircraft' | 'ground';
  glow: number;
  color: boolean | null;
  manualCursor: boolean;
}

export interface Mapping {
  toScreen(az: number, range: number): Pt;
  toRadar(x: number, y: number): { az: number; range: number } | null;
}

export interface FrameCtx {
  g: Gfx;
  th: Theme;
  /** Square drawing area: side S at (ox, oy); u = S / 100. */
  S: number;
  ox: number;
  oy: number;
  u: number;
  /** Full canvas size (CSS px). */
  W: number;
  H: number;
  pic: RadarPicture;
  units: Units;
  aircraft: FighterId;
  opts: ResolvedOptions;
  /** Real-time seconds, for blinking. */
  now: number;
  hits: HitItem[];
  clock: MissileClock;
  ownHeading: number | null;
}

export type FormatRenderer = (f: FrameCtx) => Mapping | null;

/** Percent-of-square to CSS px. */
type Sq = Pick<FrameCtx, 'ox' | 'oy' | 'u'>;
export const X = (f: Sq, xu: number): number => f.ox + xu * f.u;
export const Y = (f: Sq, yu: number): number => f.oy + yu * f.u;

/** The primary (or locked) track, if any. */
export function primaryTrack(pic: RadarPicture): PicTrack | null {
  return pic.tracks.find(t => t.locked) ?? pic.tracks.find(t => t.designation === 'primary') ?? null;
}

/** Missiles in flight at a target, best first (shortest time to impact). */
export function missilesAt(pic: RadarPicture, targetId: EntityId | null): PicMissile[] {
  if (!targetId) return [];
  const t = pic.tracks.find(tr => tr.targetId === targetId);
  const list = t ? [...t.missiles] : [];
  return list.sort((a, b) => (a.timeToImpact ?? 1e9) - (b.timeToImpact ?? 1e9));
}

/** The "missile of interest": longest time remaining (Viper convention). */
export function missileOfInterest(pic: RadarPicture): RadarPicture['missilesInFlight'][number] | null {
  let best: RadarPicture['missilesInFlight'][number] | null = null;
  for (const m of pic.missilesInFlight) if (!best || (m.timeToImpact ?? 0) > (best.timeToImpact ?? 0)) best = m;
  return best;
}

/**
 * Flight phase for counters: 'toActive' = ARH still on datalink / inertial (show time to active),
 * 'active' = ARH seeker on, 'homing' = SARH / IR / ballistic (only time to impact makes sense).
 */
export function missilePhase(m: { guidance: PicMissile['guidance']; timeToActive: number | null }): 'toActive' | 'active' | 'homing' {
  if (m.guidance === 'active') return 'active';
  if (m.guidance === 'datalink' || m.guidance === 'inertial') return m.timeToActive != null && m.timeToActive > 0 ? 'toActive' : 'active';
  return 'homing';
}

/** Coasting (extrapolated) tracks blink at 2 Hz; returns false in the off phase. */
export const visibleCoast = (f: FrameCtx, t: PicTrack): boolean => !t.coasting || blinkOn(2, f.now, 0.62);

/** Opacity for a brick from its fade (1 fresh .. 0 gone). */
export const brickAlpha = (b: PicBrick): number => Math.max(0, Math.min(1, 0.12 + 0.88 * b.fade));

/** Push a hit-test item. */
export function hit(f: FrameCtx, x: number, y: number, id: EntityId, kind: HitItem['kind'], rU = 3.2): void {
  f.hits.push({ x, y, r: Math.max(12, rU * f.u), id, kind, prio: kind === 'stt' ? 0 : kind === 'track' ? 1 : 2 });
}

/** Stick length for an aspect/velocity vector: grows with speed. */
export function stickLen(f: FrameCtx, speed: number, k = 1): number {
  return (2.2 + Math.min(1, Math.max(0, speed) / 600) * 4.5) * f.u * k;
}

/**
 * Vertical DLZ scale aligned with a plot's range axis (y0 = range 0 at the bottom, y1 = rangeScale
 * at the top). Draws the marks the caller asks for; returns the caret y (or null).
 */
export interface DlzMarks {
  /** x of the scale line. */
  x: number;
  /** Which side the ticks point to: -1 = left (into a plot on the left), +1 = right. */
  side: -1 | 1;
  yBottom: number;
  yTop: number;
  rangeScale: number;
}
export function rangeY(m: DlzMarks, r: number): number {
  const k = Math.max(0, Math.min(1.02, r / (m.rangeScale || 1)));
  return m.yBottom - (m.yBottom - m.yTop) * k;
}
