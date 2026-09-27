/**
 * [OWNER: page-radar-lab] IFF facts per jet for the "Friend or foe" exercise and the reading section: automatic or
 * pilot interrogation, the key (with trainer-key and not-verified labels), the friend cue, what no reply means and
 * how long a reply shows. Gameplay only (AGENTS.md rule 1), from data/iff.ts; no transponder internals.
 */
import { AIRCRAFT } from '../../data/aircraft';
import { IFF } from '../../data/iff';
import type { FighterId } from '../../data/types';
import { parseChord } from '../../ui/keys';

export interface IffFacts {
  /** The radar interrogates every contact by itself (F-15C, FC3 Russian). */
  auto: boolean;
  /** How to interrogate, one sentence with its labels. */
  how: string;
  /** The coach's short instruction to interrogate ('' on auto-IFF jets). */
  ask: string;
  /** Short form for a step line: 'RCtrl + Left', 'designate or lock', 'automatic'. */
  howShort: string;
  /** DCS key text to show (null: none), and the bindKeys chord for it. */
  key: string | null;
  chord: string | null;
  /** The key stands in for a cockpit control (F-14 RIO button). */
  trainerKey: boolean;
  /** Title for the Interrogate button. */
  buttonTitle: string;
  /** What a friendly reply looks like, with "(not verified)" where the source is community. */
  cue: string;
  /** What an unknown looks like and why no reply never proves hostile (Hornet two-factor rule). */
  noReply: string;
  /** How long the reply stays on the display. */
  show: string;
  /** Viper: the reply is gone after this many seconds; null where it stays. */
  showS: number | null;
  /** DCS lets a pilot fire on an unidentified friend. */
  shoot: string;
  verified: boolean;
}

const NV = ' (not verified)';

export function iffFacts(ac: FighterId): IffFacts {
  const spec = AIRCRAFT[ac];
  const f = IFF[ac];
  const nv = f.verified ? '' : NV;
  const auto = f.mode === 'auto';
  const chord = f.key ? parseChord(f.key)?.text ?? null : null;
  let how: string, howShort: string;
  if (auto) {
    how = `Automatic: the ${spec.radar.name} interrogates every contact it paints. No key.`;
    howShort = 'automatic';
  } else if (f.key) {
    const extra = f.trainerKey
      ? `, trainer key: ${f.note ?? 'a cockpit control in DCS'}`
      : !f.verified ? `, ${f.note ?? 'community'} source${NV}` : '';
    how = `Interrogate: ${f.key}${ac === 'f16c' ? ' (TMS Left short, SCAN ±60° around the nose)' : ''}${extra}.`;
    howShort = f.key;
  } else {
    how = `No keyboard key in DCS: the ${spec.short} interrogates the contact you designate or lock ("target under cursor"). The cockpit switch sequence is not on the keyboard${nv}. The Interrogate button here is a trainer control.`;
    howShort = 'designate or lock';
  }
  const noReply = ac === 'fa18c'
    ? 'No reply is one factor, and one factor leaves him unknown (yellow). Hostile needs two: no IFF reply plus an NCTR print, or AWACS or a donor calling him hostile.'
    : f.noReplyCue
      ? `No reply shows ${f.noReplyCue.toLowerCase()}${nv}. It still does not prove hostile: his transponder may be off.`
      : ac === 'f15c'
        ? 'An unknown is drawn like a hostile, a rectangle: a rectangle never proves hostile.'
        : 'No reply shows nothing: the contact stays unknown. That never proves hostile.';
  const show = f.showS === Infinity
    ? auto ? 'The answer is refreshed every time the radar paints him.' : 'The answer stays with the contact while the radar holds it (simplified).'
    : `The reply shows for ${f.showS} s, then the contact looks unknown again: lock right after it.`;
  return {
    auto, how, howShort,
    ask: auto ? '' : f.key
      ? `Interrogate: ${f.key}${f.trainerKey ? ' (trainer key)' : nv}, or the Interrogate button.`
      : 'Designate or lock a contact to interrogate him, or press Interrogate (trainer control).',
    key: f.key, chord, trainerKey: f.trainerKey,
    buttonTitle: auto
      ? `The ${spec.short} radar interrogates by itself`
      : f.key ? `Interrogate (${f.key}${f.trainerKey ? ', trainer key' : ''})` : `Trainer control: the ${spec.short} has no IFF key in DCS, it interrogates on designate or lock`,
    cue: `${f.friendCue}${nv}`,
    noReply,
    show,
    showS: f.showS === Infinity ? null : f.showS,
    shoot: 'In DCS the radar lets you lock and fire on a friend who has not answered: identify before you shoot.',
    verified: f.verified,
  };
}
