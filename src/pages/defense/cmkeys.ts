/**
 * [OWNER: page-defense] Countermeasure keys per jet, read from PROCEDURES binds. The page binds the DCS
 * keyboard default where one exists and does not collide with the page's flying keys; otherwise it falls
 * back to the FC3 defaults (Insert / Delete), always with a letter key for keyboards without Insert.
 */
import type { FighterId } from '../../data/types';
import { PROCEDURES } from '../../data/procedures';
import { splitAlternatives } from '../../ui/keys';

/** Keys the page itself uses for flying and control. A DCS bind on one of these cannot be used here. */
export const RESERVED_KEYS = ['A', 'D', 'W', 'S', '1', '2', '3', '4', '5', 'P', 'Space', 'Shift', 'Ctrl', 'F2', 'F10', 'C', 'F', 'R', 'N'];

export interface CmKey {
  /** Chord string handed to bindKeys ('Insert / C'). */
  bind: string;
  /** The DCS keyboard default for it, if there is one ('Insert', 'E'). */
  dcsKey: string | null;
  /** The DCS control name when it is a HOTAS / cockpit function ('Dispense Switch - Forward'), else ''. */
  dcsName: string;
  /** Is `bind` the DCS default key itself? */
  exact: boolean;
  /** Why the page uses a different key, if it does. */
  note: string;
}

function reserved(chord: string): boolean {
  return splitAlternatives(chord).some(k => RESERVED_KEYS.some(r => r.toLowerCase() === k.trim().toLowerCase()));
}

function build(kind: 'chaff' | 'flare', ac: FighterId, fallback: string, letter: string): CmKey {
  const binds = PROCEDURES[ac].binds;
  const re = kind === 'chaff' ? /chaff/i : /flare/i;
  const own = binds.find(b => re.test(b.action));
  const generic = binds.find(b => /countermeasure|decoy/i.test(b.action));
  if (own) {
    const kb = own.keyboard;
    const dcsName = kb === own.keys ? '' : own.keys;
    if (kb && !reserved(kb)) return { bind: `${kb} / ${letter}`, dcsKey: kb, dcsName, exact: true, note: '' };
    if (kb) return { bind: `${fallback} / ${letter}`, dcsKey: kb, dcsName, exact: false, note: `${kb} steers here, so this page uses ${fallback} for it.` };
    return { bind: `${fallback} / ${letter}`, dcsKey: null, dcsName, exact: false, note: 'No default key in DCS: bind one.' };
  }
  if (generic) {
    const kb = generic.keyboard;
    return {
      bind: `${fallback} / ${letter}`, dcsKey: kb, dcsName: kb === generic.keys ? '' : generic.keys, exact: false,
      note: kb ? 'In the jet one control releases a programme; here chaff and flares have their own keys.' : 'No confirmed default key: check your controls menu.',
    };
  }
  return { bind: `${fallback} / ${letter}`, dcsKey: null, dcsName: '', exact: false, note: 'Not in research: check your controls menu.' };
}

export function cmKeys(ac: FighterId): { chaff: CmKey; flare: CmKey } {
  return { chaff: build('chaff', ac, 'Insert', 'C'), flare: build('flare', ac, 'Delete', 'F') };
}
