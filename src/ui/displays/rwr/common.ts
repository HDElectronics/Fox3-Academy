/**
 * [OWNER: displays] Frame context shared by the RWR renderers.
 */
import type { RwrSpec } from '../../../data/types';
import type { RwrContact } from '../../../sim/types';
import type { Theme } from '../../theme';
import type { Gfx } from '../surface';
import type { HitItem } from '../geometry';

export interface RwrFrame {
  g: Gfx;
  th: Theme;
  S: number;
  ox: number;
  oy: number;
  u: number;
  spec: RwrSpec;
  /** Contacts, most dangerous first. */
  ranked: RwrContact[];
  /** Sim time (for new-threat highlight and history age). */
  t: number;
  /** Real-time seconds (for blinking). */
  now: number;
  hits: HitItem[];
  /** Seconds a new threat stays highlighted. */
  newS: number;
}

export const RX = (f: Pick<RwrFrame, 'ox' | 'u'>, xu: number): number => f.ox + xu * f.u;
export const RY = (f: Pick<RwrFrame, 'oy' | 'u'>, yu: number): number => f.oy + yu * f.u;
