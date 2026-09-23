/**
 * [OWNER: data] SAM sites for the defence drills and sorties, one per RWR range class the RWR trainer
 * already uses: sam-long (SA-10), sam-medium (SA-11), sam-short (SA-15). Research: docs/research/sam-threats.md.
 *
 * Game tutorial scope (ARCHITECTURE.md "Scope"): only what the DCS player sees and uses. Ranges and
 * altitudes are the engagement envelope community references compile from the game; how the Mission Editor
 * draws each ring was not checked in a current build, so every ring is listed as not verified.
 * RWR symbols are not repeated here: use samRwrSymbol(), which reads src/data/rwr.ts.
 */
import type { RwrId, SamClass, SamId, SamSpec } from './types';
import { rwrSymbol } from './rwr';

export const SAMS: Record<SamId, SamSpec> = {
  sa10: {
    id: 'sa10',
    name: 'S-300PS',
    nato: 'SA-10 Grumble',
    rwrClass: 'sam-long',
    threatRingKm: 120,
    minRangeKm: 5,
    minAltM: 25,
    maxAltM: 27000,
    guidance: 'track-to-impact',
    guidanceRule: 'The site\'s track radar must hold you until impact. Break the track and the missile goes dumb.',
    defeat: [
      'Stay outside the ring or below the radar horizon: at low level the site cannot see you until close in.',
      'Use terrain: put a ridge between you and the site and the track drops.',
      'Beam the site (notch) and drop chaff: in the game this can break the track, but the SA-10 is the hardest of the three to notch.',
      'Do not try to outrun it inside the ring: the missile is very fast and reaches high.',
    ],
    uncertain: [
      'The 120 km ring is from a community reference compiled from game files; older DCS references show a smaller ring. Not verified in the Mission Editor.',
      'Guidance is simplified to "track radar until impact"; how DCS guides this missile in its final seconds is not verified.',
    ],
  },
  sa11: {
    id: 'sa11',
    name: '9K37 Buk-M1',
    nato: 'SA-11 Gadfly',
    rwrClass: 'sam-medium',
    threatRingKm: 35,
    minRangeKm: 3.3,
    minAltM: 15,
    maxAltM: 22000,
    guidance: 'track-to-impact',
    guidanceRule: 'Semi-active: the launcher\'s radar must keep you locked until impact. Break the lock and the missile is lost.',
    defeat: [
      'Beam it (notch) and drop chaff: the classic SAM defence works well against the SA-11 in the game.',
      'Descend and use terrain to break line of sight.',
      'Turn away and run if you are near the edge of the ring: the missile runs out of energy.',
    ],
    uncertain: [
      'The 35 km ring and 15–22000 m band come from a community reference compiled from game files; not verified in the Mission Editor.',
    ],
  },
  sa15: {
    id: 'sa15',
    name: '9K331 Tor',
    nato: 'SA-15 Gauntlet',
    rwrClass: 'sam-short',
    threatRingKm: 12,
    minRangeKm: 1.5,
    minAltM: 10,
    maxAltM: 6000,
    guidance: 'track-to-impact',
    guidanceRule: 'Command guided from the vehicle: its radar must hold you until impact.',
    defeat: [
      'Stay out of the ring or above its ceiling: it is a short-range point defence.',
      'Beam it and drop chaff if it launches; break line of sight with terrain if you can.',
      'Turn cold early: short range means short missile flight.',
    ],
    uncertain: [
      'Ceiling 6000 m is from one community reference; another lists 26000 ft (about 7900 m). Not verified in game.',
      'The JF-17 RWR shows the short-range class as "SA8" in this trainer; that spelling is confirmed, but the SA-15 label is not.',
    ],
  },
};

export const SAM_ORDER: SamId[] = ['sa10', 'sa11', 'sa15'];

/** The site that represents an RWR class. */
export function samForClass(cls: SamClass): SamId {
  return SAM_ORDER.find(id => SAMS[id].rwrClass === cls) ?? 'sa11';
}

/** Symbol text this RWR shows for the site (SPO-15: the type-lamp letter). */
export function samRwrSymbol(rwr: RwrId, sam: SamId): string {
  return rwrSymbol(rwr, SAMS[sam].rwrClass);
}

/** Global "simplified here" notes for SAM sites. */
export const SAM_CAVEATS: string[] = [
  'Three representative sites stand for the long, medium and short range classes; DCS has many more.',
  'Missile speed, turn and timing are arcade values tuned to the ring sizes, not measured in game.',
  'Terrain masking is a simple rule: the radar horizon plus a scenario mask height around the site.',
  'Notch and chaff break the site track by the same gameplay rules as air-to-air radar missiles.',
  ...Object.values(SAMS).flatMap(s => s.uncertain.map(u => `${s.nato}: ${u}`)),
];
