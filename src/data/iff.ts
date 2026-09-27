/**
 * [OWNER: data] IFF as DCS presents it to the player (issue #12, part 2): which radars identify friends by themselves,
 * which need an interrogation, the key, and what a friendly reply looks like. Game level only (AGENTS.md rule 1):
 * keys, symbols and how long they show, never transponder internals or real-world IFF modes.
 *
 * Research: docs/research/ecm-datalink-iff.md, section 3. `verified: true` only where an ED or Heatblur manual gives
 * the fact; the rest is labelled in the UI.
 */
import type { FighterId } from './types';

export interface IffSpec {
  /** 'auto': the radar interrogates every contact by itself (F-15C, FC3 Russian). 'interrogate': the pilot asks. */
  mode: 'auto' | 'interrogate';
  /** DCS keyboard key for an interrogation; null where DCS has none (the trainer offers a button or the designate action). */
  key: string | null;
  /** The key is a stand-in for a cockpit control that DCS does not put on the keyboard. */
  trainerKey: boolean;
  /** Also interrogates on designate / lock (Hornet: "target under cursor"). */
  onDesignate: boolean;
  /** Interrogation volume around the nose (deg, az and el). */
  scanHalfDeg: number;
  /** How long a reply shows (s). Infinity: kept with the contact while the radar holds it. */
  showS: number;
  /** What a friendly reply looks like on the radar display. */
  friendCue: string;
  /** What no reply looks like: most jets show nothing (unknown), the JF-17 marks it red. */
  noReplyCue: string | null;
  verified: boolean;
  source: string;
  note?: string;
}

const RU_FC3: IffSpec = {
  mode: 'auto', key: null, trainerKey: false, onDesignate: false, scanHalfDeg: 60, showS: Infinity,
  friendCue: 'Second row of dots above the return', noReplyCue: null,
  verified: true, source: 'ED Su-27 manual pp. 51–52: friendly return = double row of dots',
};

export const IFF: Record<FighterId, IffSpec> = {
  su27: RU_FC3,
  su33: { ...RU_FC3, verified: false, source: 'Su-27 rule, same FC3 family' },
  j11a: { ...RU_FC3, verified: false, source: 'Su-27 rule, same FC3 family' },
  mig29s: { ...RU_FC3, verified: false, source: 'Su-27 rule, same FC3 family' },
  f15c: {
    mode: 'auto', key: null, trainerKey: false, onDesignate: false, scanHalfDeg: 60, showS: Infinity,
    friendCue: 'Circle instead of a rectangle', noReplyCue: null,
    verified: true, source: 'ED F-15C manual p. 66: the radar interrogates all targets automatically',
  },
  fa18c: {
    mode: 'interrogate', key: null, trainerKey: false, onDesignate: true, scanHalfDeg: 60, showS: Infinity,
    friendCue: 'Green hemisphere on the HAFU', noReplyCue: null,
    verified: false, source: 'ED Hornet guide pp. 209–210: friendly reply, two factors for hostile',
    note: 'Interrogates on designate or lock ("target under cursor"); the SCS sequence (Chuck\'s) is not on the keyboard',
  },
  f16c: {
    mode: 'interrogate', key: 'RCtrl + Left', trainerKey: false, onDesignate: false, scanHalfDeg: 60, showS: 2,
    friendCue: 'Green circle with 4 for 2 s', noReplyCue: null,
    verified: true, source: 'ED Viper guide pp. 433–435: TMS Left short = SCAN (±60°), green circle "4" for 2 s',
  },
  f14b: {
    mode: 'interrogate', key: 'I', trainerKey: true, onDesignate: false, scanHalfDeg: 60, showS: Infinity,
    friendCue: 'Two bars above and below the return', noReplyCue: null,
    verified: true, source: 'Heatblur F-14 manual: RIO IFF button on the DDD, two bars',
    note: 'A RIO button in DCS; I stands in for it',
  },
  jf17: {
    mode: 'interrogate', key: 'I', trainerKey: false, onDesignate: false, scanHalfDeg: 60, showS: Infinity,
    friendCue: 'Green', noReplyCue: 'Red',
    verified: false, source: "Chuck's JF-17 guide: T4 press = I", note: 'community',
  },
  m2000c: {
    mode: 'interrogate', key: 'S', trainerKey: false, onDesignate: false, scanHalfDeg: 60, showS: Infinity,
    friendCue: 'A in the target data block', noReplyCue: null,
    verified: false, source: "Chuck's M-2000C guide: S = IFF interrogate (gear up)", note: 'community',
  },
};

/** IFF interrogation range (m): the radar's head-on detection range × this. Trainer value. */
export const IFF_RANGE_FACTOR = 1.2;

export const IFF_CAVEATS: readonly string[] = [
  'Every friendly answers (transponders on, the right codes): a trainer assumption.',
  'A missing reply never proves hostile: enemies stay unknown unless a second source says hostile (Hornet rule).',
  'Interrogation reaches 1.2× the radar head-on detection range: a trainer value.',
  'AI pilots know every contact\'s side, as DCS AI is commonly assumed to (not verified).',
  'The Viper LOS mode (TMS Left long, ±15° around the cursor) is not modelled; SCAN covers ±60°.',
];
