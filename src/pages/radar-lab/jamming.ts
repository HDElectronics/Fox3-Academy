/**
 * [OWNER: page-radar-lab] Jamming facts per jet for the "Jammer and burn-through" exercise and the reading
 * section: the jam symbol, the burn-through range, which of the jet's missiles home on jam, and the lock key.
 * Gameplay only (AGENTS.md rule 1), from data/ecm.ts; anything not verified is labelled.
 */
import { AIRCRAFT } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import { BURN_THROUGH_M, HOJ_MISSILES, JAM_CUE, OWN_JAMMER } from '../../data/ecm';
import type { FighterId, MissileId } from '../../data/types';
import type { Units } from '../../app/format';
import { parseChord, splitAlternatives } from '../../ui/keys';
import { resolveBinds } from '../tws/binds';
import { rng } from './geometry';

export interface JamFacts {
  /** How the radar shows a jammer, with "(not verified)" when the manual gives no symbol. */
  strobe: string;
  /** How it shows a jam lock. */
  lock: string;
  /** Burn-through range (m). */
  burnThroughM: number;
  /** "Burn-through 19 nm: ED F-15C manual …" or "… simplified, not verified". */
  burnThrough: string;
  /** The jet's missiles that can be fired from a jam lock. */
  hoj: MissileId[];
  hojLine: string;
  /** How a HOJ shot flies (simplified). */
  pursuit: string;
  /** The own jammer, or null. */
  ownJammer: string | null;
}

export function jamFacts(ac: FighterId, u: Units): JamFacts {
  const spec = AIRCRAFT[ac];
  const cue = JAM_CUE[ac];
  const nv = cue.verified ? '' : ' (not verified)';
  const bt = BURN_THROUGH_M[ac];
  const btLabel = bt.verified ? bt.source : `${bt.note ?? 'simplified'} value, not verified (${bt.source})`;
  const hoj = spec.missiles.filter(m => !!HOJ_MISSILES[m]);
  const names = hoj.map(m => MISSILES[m].name);
  const hojLine = hoj.length
    ? `Home-on-jam from a jam lock: ${names.join(', ')}.`
    : `No ${spec.short} missile is listed as home-on-jam here (not verified): wait for burn-through, then lock and shoot normally.`;
  const own = OWN_JAMMER[ac];
  return {
    strobe: cue.strobe + nv,
    lock: cue.lock + nv,
    burnThroughM: bt.value,
    burnThrough: `Burn-through ${rng(bt.value, u)}: ${btLabel}.`,
    hoj,
    hojLine,
    pursuit: 'A HOJ missile flies pure pursuit at the jammer, no loft, and you get no range or DLZ: judge the shot yourself (simplified).',
    ownJammer: own
      ? `Your own jammer: ${own.name}, ${own.trainerKey ? `trainer key ${own.key} (${own.note ?? 'a panel switch in DCS'})` : `key ${own.key}`}. It hides your range and gives his HOJ missiles a beacon.`
      : `No own jammer is listed for the ${spec.short} here.`,
  };
}

/** The key that locks the contact under the cursor in this jet (DCS default or the TWS page stand-in). */
export function lockKeyOf(ac: FighterId): { text: string; chord: string; page: boolean } | null {
  const b = resolveBinds(ac).acts.designate;
  if (!b?.keys) return null;
  const first = (splitAlternatives(b.keys)[0] ?? '').trim();
  const chord = parseChord(first);
  return chord ? { text: first, chord: chord.text, page: b.source === 'page' } : null;
}
