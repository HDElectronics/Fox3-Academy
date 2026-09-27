/**
 * [OWNER: page-radar-lab] Datalink facts per jet for the "Datalink picture" exercise and the reading section: the
 * network name, where the picture shows, what a track looks like, who feeds it, the coast rule and the trainer values.
 * Gameplay only (AGENTS.md rule 1), from data/datalink.ts; no network internals. Unverified facts are labelled.
 */
import { AIRCRAFT } from '../../data/aircraft';
import { DATALINK, DATALINK_CAVEATS, DL_COAST_S } from '../../data/datalink';
import { PROCEDURES } from '../../data/procedures';
import type { FighterId } from '../../data/types';
import { parseChord } from '../../ui/keys';

export interface DlFacts {
  /** The jet shows a datalink picture in DCS. */
  has: boolean;
  /** Network name ('' when none). */
  name: string;
  /** FC3 rule: the picture starts once the radar is switched on. */
  radarOnFirst: boolean;
  /** Hornet: in RWS the display shows only datalink tracks that match a radar return. */
  rwsOnly: boolean;
  /** Radar on / off key text (FC3 'I'), null when the jet has none on the keyboard; and its bindKeys chord. */
  radarKey: string | null;
  radarChord: string | null;
  /** Gets tracks from other fighters: the wingman type for the exercise (null: AWACS only). */
  wingType: FighterId | null;
  /** One sentence each, labelled where not verified. */
  where: string;
  symbol: string;
  awacs: string;
  /** '' when the jet gets no donor tracks. */
  donors: string;
  /** '' when the jet shows no PPLI. */
  ppli: string;
  coast: string;
  fire: string;
  source: string;
  /** Jets without a picture: what the pilot does instead. */
  none: string;
  verified: boolean;
}

const NV = ' (not verified)';

/** "a, b and c". */
function list(xs: string[]): string {
  return xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

export function dlFacts(ac: FighterId): DlFacts {
  const spec = AIRCRAFT[ac];
  const d = DATALINK[ac];
  const nv = d.verified ? '' : NV;
  const has = d.name !== null;
  const radarOnFirst = has && d.awacs && !d.donors.length;
  const bind = PROCEDURES[ac].binds.find(b => /^Radar on/.test(b.action) && b.keyboard);
  const radarKey = bind?.keyboard ?? null;
  const wingType = d.donors.length ? (d.donors.includes(ac) ? ac : d.donors[0]) : null;
  const donorNames = d.donors.map(x => AIRCRAFT[x].short);
  const none = ac === 'f15c'
    ? 'The F-15C has no datalink display in DCS: call AWACS on the radio for a picture (bearing, range, altitude) and find the bandit with your own radar.'
    : ac === 'm2000c'
      ? `The M-2000C has no air-to-air datalink in DCS. Its TAF link from ground stations is not modelled here (${d.note ?? 'community'} source, not verified). Find the bandit with your own radar.`
      : has ? '' : `The ${spec.short} has no datalink picture in DCS: find the bandit with your own radar.`;
  // Hornet: in RWS only donor tracks that match a radar return show (ED guide); the display draws that rule.
  const rwsOnly = ac === 'fa18c' && !!d.note;
  return {
    has, name: d.name ?? '', radarOnFirst, rwsOnly,
    radarKey, radarChord: radarKey ? parseChord(radarKey)?.text ?? null : null,
    wingType,
    where: has
      ? `${d.name} shows on the ${d.where}${nv}.${rwsOnly ? ` ${d.note}: stay in ${spec.radar.modeLabels.tws ?? 'TWS'} to see the rest.` : ''}`
      : `No datalink display in DCS${d.where === 'None' ? '' : `: ${d.where.replace(/^None \((.*)\)$/, '$1')}`}.`,
    symbol: has ? `${d.symbol}${nv}${d.verified && d.note && /community/i.test(d.note) ? ` (${d.note.toLowerCase()})` : ''}.` : '',
    awacs: has && d.awacs
      ? `${radarOnFirst ? `${d.note ?? 'Automatic once the radar is on'}${nv}. ` : ''}${DATALINK_CAVEATS[0]}`
      : '',
    donors: d.donors.length
      ? `Other ${list(donorNames)} jets on the same network send you their radar tracks. ${DATALINK_CAVEATS[1]}${ac === 'f14b' ? ` ${DATALINK_CAVEATS[3]}` : ''}`
      : '',
    ppli: d.ppli ? `Friendly network members show at their own position (PPLI)${nv}.` : '',
    coast: `A track is extrapolated ${DL_COAST_S} s after its last update, then dropped (ED Viper guide p. 457; ${ac === 'f16c' ? 'verified' : 'the Viper rule, applied to every jet here: simplified'}).`,
    fire: DATALINK_CAVEATS[2],
    source: d.verified ? `Source: ${d.source}.` : `Source: ${d.source}${NV}.`,
    none,
    verified: d.verified,
  };
}
