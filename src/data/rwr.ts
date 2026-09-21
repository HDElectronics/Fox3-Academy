/**
 * [OWNER: data] RWR systems: what each emitter looks like, how search / lock / launch / missile look and
 * sound, and the misconceptions to teach. Sources: ru-fc3.md (SPO-15), f15c-fc3.md (ALR-56C TEWS),
 * hornet-viper.md (ALR-67, ALR-56M), tomcat-thunder-mirage.md (ALR-67 in the F-14, JF-17 RWR, Serval),
 * bvr-mechanics.md (warning rules).
 *
 * Every RwrSpec lists a symbol for every emitter kind (all ten AircraftIds, 'missile', 'awacs',
 * 'sam-long', 'sam-medium', 'sam-short', 'unknown'). Use rwrSymbol() for lookups.
 * SPO-15: the symbol is the threat-type lamp letter; '' means no type lamp lights.
 */
import type { AircraftId, RwrId, RwrSpec, RwrSymbol } from './types';

type Emitter = RwrSymbol['emitter'];

/** ED's airborne code list (F/A-18C guide, F-15C table): Flanker family and Fulcrum all read "29". */
const ED_AIR: Record<AircraftId, string> = {
  su27: '29', su33: '29', j11a: '29', mig29s: '29',
  f15c: '15', fa18c: '18', f16c: '16', f14b: '14', jf17: 'JF', m2000c: 'M2',
};

function table(air: Record<AircraftId, string>, other: Record<Exclude<Emitter, AircraftId>, string>): RwrSymbol[] {
  return [
    ...(Object.keys(air) as AircraftId[]).map(emitter => ({ emitter, symbol: air[emitter] })),
    ...(Object.keys(other) as Exclude<Emitter, AircraftId>[]).map(emitter => ({ emitter, symbol: other[emitter] })),
  ];
}

/** ED-style ground and support codes: SA-10, SA-11, SA-15 (Tor), A-50. */
const ED_OTHER = { missile: 'M', awacs: '50', 'sam-long': '10', 'sam-medium': '11', 'sam-short': '15', unknown: 'U' } as const;

export const RWRS: Record<RwrId, RwrSpec> = {
  spo15: {
    id: 'spo15',
    name: 'SPO-15 "Beryoza"',
    kind: 'lamps',
    aircraft: ['su27', 'su33', 'j11a', 'mig29s'],
    symbols: table(
      { su27: 'П', su33: 'П', j11a: 'П', mig29s: 'П', f15c: 'П', fa18c: 'П', f16c: 'П', f14b: 'П', jf17: 'П', m2000c: 'П' },
      { missile: 'П', awacs: 'С', 'sam-long': 'З', 'sam-medium': 'Х', 'sam-short': 'Н', unknown: '' },
    ),
    cues: {
      search:
        'Azimuth lamp lights (large yellow for the primary threat, small green for others), the П type lamp lights, ' +
        'and the power ring fills as he gets closer. Low-frequency tone.',
      lock: 'The large red lamp under the silhouette lights steady, with a steady high-frequency tone.',
      launch:
        'The large red lamp flashes with a high-pitched intermittent tone: a SARH launch (his CW illumination). ' +
        'A TWS Fox 3 gives nothing here.',
      missile:
        'An active radar missile appears only when its own seeker goes active: it becomes the primary threat and the ' +
        'power ring jumps up fast. There is no separate missile lamp.',
    },
    teach: [
      'П means any airborne radar. The SPO cannot tell an F-15 from an Su-27.',
      'Elevation (В above / Н below), the power ring and the red lock/launch lamp describe the primary threat only.',
      'The power ring is signal strength, a rough hint of range, not a distance readout.',
      'Azimuth lamps sit at 10, 30, 50 and 90° each side; behind you there are only two rear-quadrant lamps and bearing is poor.',
      'A Fox 3 fired from TWS gives no lock or launch warning until its seeker goes active: you only see his search radar. By then you have seconds, not minutes.',
      'IR missiles (R-27ET, R-73, AIM-9) never show. Inside their range, flare pre-emptively.',
      'Other letters: З long-range SAM, Х medium-range SAM, Н short-range SAM, F early-warning radar, С AWACS.',
      'The new full-fidelity MiG-29A SPO-15LM (2025) is different: no launch warning and ARH missiles seen only 2–4 s before impact. The FC3 jets keep this simpler model.',
    ],
  },

  alr56c: {
    id: 'alr56c',
    name: 'AN/ALR-56C TEWS',
    kind: 'scope',
    aircraft: ['f15c'],
    symbols: table(ED_AIR, ED_OTHER),
    cues: {
      search:
        'A code appears with a ^ hat (airborne) at its bearing; an upper semicircle marks a new threat, with a single ' +
        'high tone. Search gives a periodic chirp.',
      lock: 'Continuous chirping. The diamond marks the primary threat (a lock outranks any search).',
      launch:
        'A flashing circle around the shooter\'s code and the launch tone, repeating every 15 s. A flashing lower ' +
        'semicircle means a missile is guiding on you.',
      missile:
        '"M" in a diamond: an active radar missile, always the primary threat, drawn in the inner ring. It first ' +
        'appears near the shooter\'s bearing. Launch tone.',
    },
    teach: [
      'In DCS, distance from the centre is signal strength: stronger emitters sit nearer the centre. It is not range and not lethality.',
      'EW and AWACS radars never appear in the inner ring.',
      'Priority: active missile or command launch, then lock, then type (airborne > long > medium > short SAM > EW > AWACS), then strength.',
      'A TWS AIM-120 gives no lock and no launch warning; your first cue is the "M".',
      'An AIM-120 fired from STT most likely shows only a lock until pitbull (2020 forum report).',
      '15 with a hat is an F-15; 15 without a hat is an SA-15 Tor.',
      'Coverage is ±45° in elevation; up to 16 threats with a 7 s history.',
    ],
  },

  alr67: {
    id: 'alr67',
    name: 'AN/ALR-67(V)',
    kind: 'scope',
    aircraft: ['fa18c', 'f14b'],
    symbols: table(ED_AIR, ED_OTHER),
    cues: {
      search:
        'Code with the airborne modifier (hat) in the non-lethal or lethal band. New airborne emitter: double beep ' +
        '(Hornet); single short tone on a new emitter or band change (F-14).',
      lock:
        'The symbol moves to the critical band (outermost ring). AI lights steady for an airborne lock; SAM lights ' +
        'steady for a surface-to-air radar lock. Repeating beep ' +
        '(Hornet) or slow warble (F-14).',
      launch:
        'The symbol flashes in the critical band; the matching AI or SAM lamp flashes here and CW lights for illumination. Faster tone ' +
        '(Hornet) or fast warble (F-14).',
      missile: '"M": an active radar missile seeker, in the critical band, with the fast tone.',
    },
    teach: [
      'The outermost ring is CRITICAL here, the opposite of the Viper\'s ALR-56M. Chuck\'s Hornet guide says the reverse; ED and Heatblur both say outermost.',
      'Airborne emitters carry a hat above the code; ground emitters do not.',
      'LIMIT shows only the six highest-priority emitters. OFFSET spreads overlapping symbols but loses exact bearing.',
      'In the F-14 (Heatblur) the JF-17 shows as "17", not "JF". A special four-tone descending alert means a new threat that can shoot from TWS without a lock (14, 15, 16, 17, 18, 29, 30, 34, M2).',
      '"U" is used for radars the library cannot name (in the Hornet list, Tornado IDS and AJS37 also show as U).',
      'A TWS Fox 3 gives no lock or launch warning until "M" appears.',
    ],
  },

  alr56m: {
    id: 'alr56m',
    name: 'AN/ALR-56M',
    kind: 'scope',
    aircraft: ['f16c'],
    symbols: table(ED_AIR, ED_OTHER),
    cues: {
      search: 'Code on the outer ring, with a chevron (hat) if airborne. New-threat tone.',
      lock: 'The symbol moves just outside the solid inner circle and gets a box; the ACTIVITY light comes on.',
      launch:
        'The symbol moves inside the inner circle with a flashing circle around it, and the LAUNCH button flashes ' +
        '"MISSILE LAUNCH". Launch tone.',
      missile: '"M" (active radar seeker) inside the inner circle with a flashing circle; MISSILE LAUNCH flashes.',
    },
    teach: [
      'More lethal means nearer the centre: search outside, track (box) just outside the inner circle, guidance inside it.',
      'This is the opposite of the Hornet and F-14 ALR-67, where the outer ring is critical.',
      'The diamond marks the priority threat (HANDOFF can latch another).',
      'Blind beyond ±45° elevation: a hard bank can hide a lock or a launch from you.',
      'OPEN mode shows 16 threats, PRIORITY mode 5. "U" shows unknown emitters (UNKNOWN button).',
      'A TWS Fox 3 gives no lock or launch warning until "M" appears.',
    ],
  },

  jf17rwr: {
    id: 'jf17rwr',
    name: 'JF-17 RWR (HSD) and MAWS',
    kind: 'scope',
    aircraft: ['jf17'],
    symbols: table(
      { su27: 'S27', su33: 'S33', j11a: 'J11', mig29s: 'M29', f15c: 'F15', fa18c: 'F18', f16c: 'F16', f14b: 'F14', jf17: 'J17', m2000c: 'M2K' },
      { missile: 'M', awacs: 'A50', 'sam-long': 'SA10', 'sam-medium': 'SA11', 'sam-short': 'SA8', unknown: 'U' },
    ),
    cues: {
      search: 'Yellow threat symbol in the outer (non-lethal) ring: rectangle for air, circle for a known surface emitter.',
      lock: 'The symbol turns red and moves to the inner (lethal) ring, with a "Tracking!" voice.',
      launch: 'The red symbol flashes and the HUD shows "MSL LCH".',
      missile:
        'MAWS adds a missile symbol at its bearing (a number such as 120 for a known active type, "M" for others), ' +
        'with above/below marks. Bearing only; most reliable inside 5 km.',
    },
    teach: [
      'Colour carries the state: yellow = search, red = lock, flashing = launch.',
      'Inner ring = lethal (tracking you), outer ring = non-lethal (search).',
      'Air threats use rectangles; surface threats use circles. Four outward ticks mark the main threat. A line under a symbol = jammed emitter.',
      'MAWS gives only a bearing, and is reliable inside about 5 km: it is a last-ditch cue, not a BVR warning.',
      'An SD-10 or AIM-120 fired from TWS gives no warning until the seeker goes active.',
      'Only "M2K", "M29" and "SA8" are confirmed label spellings; the others follow that pattern.',
    ],
  },

  serval: {
    id: 'serval',
    name: 'Serval RWR (VCM)',
    kind: 'scope',
    aircraft: ['m2000c'],
    symbols: table(ED_AIR, ED_OTHER),
    cues: {
      search: 'Threat symbol in the outer (low-threat) zone at its bearing.',
      lock: 'The symbol moves toward the centre (high-threat zone).',
      launch: 'D2M launch-detector warning on the display (up to two at once).',
      missile: 'Active seeker shown near the centre; D2M warns of the launch plume.',
    },
    teach: [
      'Nearer the centre means more dangerous, not closer.',
      'Capacity: 8 radar threats plus 2 D2M missile-launch warnings at once.',
      'Status lights: V (Sabre ELINT record), BR (jamming), DA (RWR OK), D2M (launch detector; blinking = not cooled or missing), LL (dispensers).',
      'The symbol library is on the kneeboard page "Menaces VCM" (RShift + K, then [ and ]). This trainer uses ED-style codes instead; the real glyphs were not researched.',
    ],
  },
};

/** Symbol text an RWR shows for an emitter kind ('' on the SPO-15 = no type lamp). */
export function rwrSymbol(rwr: RwrId, emitter: Emitter): string {
  return RWRS[rwr].symbols.find(s => s.emitter === emitter)?.symbol ?? RWRS[rwr].symbols.find(s => s.emitter === 'unknown')?.symbol ?? '';
}

/** Per-RWR "simplified here" notes (values research could not confirm). */
export const RWR_CAVEATS: Record<RwrId, string[]> = {
  spo15: [
    'The unknown emitter lights no type lamp; research lists only the six letters П З Х Н F С.',
    'The number of power-ring lamps and whether primary and secondary threats have separate type rows are not confirmed.',
  ],
  alr56c: [
    'The 2014 F-15C table predates the JF-17 and M-2000C; "JF" and "M2" follow ED\'s current list.',
    'The unknown symbol "U" is not in the FC3 manual.',
  ],
  alr67: [
    'The Hornet and the F-14 share this RWR here; F-14 differences (JF-17 = "17", tones) are in the teach notes.',
    'The shape of the airborne modifier (hat) is only in ED graphics; community calls it a hat or chevron.',
    'SAM codes 10, 11 and 15 are listed in the official Hornet appendix for SA-10, SA-11 and SA-15 tracking radars.',
    'The Hornet guide confirms a steady SAM lock lamp but does not state that it flashes on launch; flashing here follows Heatblur\'s shared ALR-67 behavior.',
    'CW follows the trainer\'s generic launch state here; the manuals do not establish CW illumination for every represented SAM or fighter launch.',
  ],
  alr56m: [
    'Viper codes are assumed to match the Hornet list; ED\'s appendix is graphical.',
    'Tones are not documented in research.',
  ],
  jf17rwr: [
    'Only "M2K", "M29" and "SA8" are confirmed; other labels follow the same pattern.',
    'How the RWR (not MAWS) shows an active radar missile is not documented; "M" is used.',
  ],
  serval: [
    'Serval symbols were not researched; ED-style codes stand in for them.',
    'Tones and the exact look of lock and launch are not documented in research.',
  ],
};
