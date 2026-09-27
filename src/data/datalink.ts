/**
 * [OWNER: data] The datalink picture as DCS presents it to the player (issue #12, part 3): which jets get tracks from an
 * AWACS and from other fighters, what the symbols mean, and how long a track lives. Game level only (AGENTS.md rule 1):
 * what shows on which display and where it comes from, never network or message internals.
 *
 * Research: docs/research/ecm-datalink-iff.md, section 2. `verified: true` only where an ED or Heatblur manual gives
 * the fact; community and trainer values are listed in DATALINK_CAVEATS and labelled in the UI.
 */
import type { FighterId } from './types';

export interface DatalinkSpec {
  /** Network name as the manuals call it; null = no air-to-air datalink picture in DCS. */
  name: string | null;
  /** Gets AWACS surveillance tracks. */
  awacs: boolean;
  /** Gets other fighters' radar tracks, and from which jets (same network). */
  donors: readonly FighterId[];
  /** Shows friendly network members' own positions (PPLI). */
  ppli: boolean;
  /** Where the picture shows, as the cockpit names it. */
  where: string;
  /** What a datalink track looks like, in the manual's words. */
  symbol: string;
  verified: boolean;
  source: string;
  note?: string;
}

const LINK16: readonly FighterId[] = ['fa18c', 'f16c'];
const RU_FC3_DL: DatalinkSpec = {
  name: 'Datalink (AWACS / EWR)', awacs: true, donors: [], ppli: false, where: 'HDD top-down view (trainer: on the HUD picture)',
  symbol: 'Open triangle = AWACS track, filled = own radar', verified: true, source: 'ED Su-27 manual pp. 57–58',
  note: 'Automatic once the radar has been switched on, when a friendly AWACS is in the mission',
};

export const DATALINK: Record<FighterId, DatalinkSpec> = {
  su27: RU_FC3_DL,
  su33: { ...RU_FC3_DL, verified: false, source: 'Su-27 rule, same FC3 family' },
  j11a: { ...RU_FC3_DL, verified: false, source: 'Su-27 rule, same FC3 family' },
  mig29s: { ...RU_FC3_DL, verified: false, source: 'Su-27 rule, same FC3 family' },
  f15c: {
    name: null, awacs: false, donors: [], ppli: false, where: 'None', symbol: 'None', verified: true,
    source: 'ED F-15C manual: no datalink display (call AWACS by radio)',
  },
  fa18c: {
    name: 'MIDS (Link 16)', awacs: true, donors: LINK16, ppli: true, where: 'Attack radar and SA page',
    symbol: 'HAFU bottom half = donor ID: hemisphere friendly, bracket unknown, caret hostile; PPLI circles',
    verified: true, source: 'ED Hornet guide pp. 200–210', note: 'In RWS only donor tracks that match a radar return show',
  },
  f16c: {
    name: 'MIDS (Link 16)', awacs: true, donors: LINK16, ppli: true, where: 'FCR and HSD',
    symbol: 'Datalink air tracks: blue = own flight, green = other donors (Chuck\'s); AWACS tracks coast 20 s',
    verified: true, source: 'ED Viper guide pp. 452–475', note: 'Colours are community',
  },
  f14b: {
    name: 'Link 4A / 4C', awacs: true, donors: ['f14b'], ppli: false, where: 'TID',
    symbol: 'Drawn below the track dot: unknown ⊔, hostile ∨, friendly ∪', verified: true,
    source: 'Heatblur F-14 manual, Link 4', note: 'Link 4A from AWACS or Link 4C between F-14s, not both at once: the trainer merges them',
  },
  jf17: {
    name: 'Link 17', awacs: true, donors: ['jf17'], ppli: true, where: 'HSD',
    symbol: 'Green = friendly, red = unknown or hostile; a line around it = not seen by your own radar',
    verified: false, source: "Chuck's JF-17 guide, datalink", note: 'community',
  },
  m2000c: {
    name: null, awacs: false, donors: [], ppli: false, where: 'None (TAF ground link not modelled)', symbol: 'None',
    verified: false, source: "Chuck's M-2000C guide: TAF GCI link from ground stations only", note: 'community',
  },
};

/** Surveillance tracks are extrapolated this long after the last update, then dropped (ED Viper guide p. 457). */
export const DL_COAST_S = 20;
/** How often the AWACS picture updates (s). Trainer value. */
export const AWACS_UPDATE_S = 10;
/** How often a donor's tracks go out (s). Trainer value. */
export const DONOR_UPDATE_S = 2;
/** AWACS radar reach (m) around its orbit point. Trainer value (flat world, no terrain masking). */
export const AWACS_RANGE_M = 370_000;

export const DATALINK_CAVEATS: readonly string[] = [
  'The AWACS sees every aircraft within 200 nm of its orbit, updated every 10 s: trainer values.',
  'Donor tracks go out every 2 s from each network member\'s own radar tracks: a trainer value.',
  'A datalink track cannot be fired on: lock it with your own radar first.',
  'The F-14 merges Link 4A (AWACS) and Link 4C (other F-14s), which DCS runs one at a time.',
  'Su-33, J-11A and MiG-29S follow the Su-27 datalink rule (not verified per jet).',
];
