/**
 * [OWNER: data] Aircraft database: radar rules, loadouts and BVR character of the ten DCS jets.
 * Values come from docs/research/*.md. Where research was uncertain the value is the most defensible
 * pick and the reason is listed in AIRCRAFT_CAVEATS (show these as "simplified here" notes in the UI).
 *
 * Conventions (see docs/api/data.md):
 * - detectKm: DCS AI sensor-table (datamine) values where the radar has one; reference RCS 3–5 m².
 * - rcsM2: relative frontal RCS. Reference fighter = 5 m² (the DCS F-15C unit value). Scale detection
 *   by (rcsM2 / radar reference RCS)^(1/4).
 * - Frame time = bars × 2 × azHalf / scanRateDegPerS. scanRate is chosen so documented frame times
 *   come out right (FC3 ~5 s, Viper A6/4B 8 s, AWG-9 TWS 2 s).
 */
import type { AircraftId, AircraftSpec, AttackId, AttackSpec, FighterId, RadarSpec } from './types';

/** Kilometres per nautical mile. */
const NM = 1.852;
const nm = (...v: number[]) => v.map(x => Math.round(x * NM * 100) / 100);

/**
 * FC3 Russian radar model (N-001 family / N-019M). Shared HUD logic: 60°-wide scan in three positions,
 * ППС/ЗПС/АВТ PRF, СНП with one designated track and auto-STT at 85 % of Rmax.
 */
function fc3RuRadar(o: {
  name: string; headOn: number; tail: number; lookDownFactor: number; notchKts: number;
  gimbalElDeg: number; mig29s?: boolean;
}): RadarSpec {
  const twsBase =
    'Press RAlt + I for СНП ДВБ (PRF ППС or ЗПС; АВТ cannot run TWS). The scan stays 60° wide and centres on the ' +
    'tracked target. Slew the cursor onto a contact until it snaps to it: that is your one designated track. The ' +
    'radar then locks it (АТК ДВБ, STT) by itself at 85 % of the selected missile\'s computed Rmax. The Su-27 manual ' +
    'says Enter forces an earlier lock; the later MiG-29 and Su-33 manuals say a lock above 85 % will not happen. ' +
    'So every radar shot leaves from STT and the bandit gets a lock warning.';
  const snp2 =
    ' СНП2 (press RAlt + I twice from ОБЗ): slew onto the lead and the radar picks a second target within 8° of ' +
    'azimuth; primary = diamond, secondary = cross. When Ц1/Ц2 and ПР show, hold the trigger and two R-77s leave, ' +
    'one per target. Both targets must pull no more than 3 g and not jam, or the radar drops to one track.';
  return {
    name: o.name,
    modes: ['off', 'rws', 'tws', 'stt', 'acm'],
    modeLabels: { rws: 'ОБЗ ДВБ', tws: 'СНП ДВБ', stt: 'АТК ДВБ', acm: 'БВБ' },
    azHalfWidthOptionsDeg: [30],          // 60° wide, centred at −30 / 0 / +30 (three positions)
    azCenterOptionsDeg: [-30, 0, 30],
    barOptions: [4],                      // not selectable in FC3; count assumed
    barSpacingDeg: 2.5,
    beamWidthDeg: 2.5,
    scanRateDegPerS: 48,                  // 4 bars × 60° / 48 °/s = 5 s frame (datamine scan_period 5 s)
    gimbalAzDeg: 60,
    gimbalElDeg: o.gimbalElDeg,
    rangeScalesKm: [10, 25, 50, 100, 200],
    detectKm: { headOn: o.headOn, tail: o.tail, lookDownFactor: o.lookDownFactor, lookDownHeadOnFactor: 1, referenceRcsM2: o.mig29s ? 3 : 5 },
    notchKts: o.notchKts,
    notchNeedsLookDown: false,
    tws: {
      maxTracks: 10,
      launchFromTws: false,
      maxSimultaneousTargets: o.mig29s ? 2 : 1,
      capConfidence: 'documented',
      maxAzHalfWidthDeg: 30,
      autoSttAtRmaxFraction: 0.85,
      howTo: o.mig29s ? twsBase + snp2 : twsBase,
    },
    sttArhLaunchWarning: false,
  };
}

const N001 = { headOn: 68.4, tail: 38, lookDownFactor: 0.7, notchKts: 113, gimbalElDeg: 60 };

const APG63: RadarSpec = {
  name: 'AN/APG-63(V)1',
  modes: ['off', 'rws', 'tws', 'stt', 'acm'],
  modeLabels: { rws: 'LRS', tws: 'TWS', stt: 'STT', acm: 'AACQ' },
  azHalfWidthOptionsDeg: [30, 60],
  barOptions: [4],                        // not selectable in FC3; count undocumented
  barSpacingDeg: 2.5,
  beamWidthDeg: 2.5,
  scanRateDegPerS: 96,                    // ±60° × 4 bars = 5 s (datamine scan_period); ±30° TWS = 2.5 s
  gimbalAzDeg: 60,
  gimbalElDeg: 60,
  rangeScalesKm: nm(10, 20, 40, 80, 160),
  detectKm: { headOn: 88.4, tail: 44, lookDownFactor: 1 },
  notchKts: 54,
  notchNeedsLookDown: false,
  tws: {
    maxTracks: 16,
    launchFromTws: true,
    maxSimultaneousTargets: 4,
    capConfidence: 'documented',
    maxAzHalfWidthDeg: 30,
    autoSttAtRmaxFraction: null,
    howTo:
      'Press RAlt + I for TWS: the scan becomes a ±30° window you slew across ±60° with RShift + , and RShift + /, ' +
      'and it tries to stay centred on the PDT. Enter on a track makes it the PDT (star); each further Enter on ' +
      'another track adds an SDT (hollow brick), four designations in all. AIM-120s go to the PDT first, then the ' +
      'SDTs in the order you designated them, then back to the PDT. Enter again on a designated target commands ' +
      'STT on it; Backspace drops every designation. You cannot reorder: undesignate and designate again. The ' +
      'AIM-7 cannot be fired in TWS.',
  },
  sttArhLaunchWarning: false,
};

const APG73: RadarSpec = {
  name: 'AN/APG-73',
  modes: ['off', 'rws', 'tws', 'stt', 'vs', 'acm'],
  modeLabels: { rws: 'RWS', tws: 'TWS', stt: 'STT', vs: 'VS', acm: 'ACM' },
  azHalfWidthOptionsDeg: [10, 20, 30, 40, 70],
  barOptions: [1, 2, 4, 6],
  barSpacingDeg: 1.3,                     // 4B/6B; 2B uses 2°
  beamWidthDeg: 3,
  scanRateDegPerS: 60,
  gimbalAzDeg: 70,
  gimbalElDeg: 60,
  rangeScalesKm: nm(5, 10, 20, 40, 80, 160),
  detectKm: { headOn: 76, tail: 46, lookDownFactor: 0.76 },
  notchKts: 54,
  notchNeedsLookDown: true,
  twsPatterns: [[40, 2], [30, 2], [20, 2], [10, 2], [20, 4], [10, 4], [10, 6]],
  tws: {
    maxTracks: 10,
    launchFromTws: true,
    maxSimultaneousTargets: 10,
    capConfidence: 'unpublished',
    maxFrameTimeS: 2.7,                   // allows 2B ±40°, 4B ±20°, 6B ±10°; refuses 4B ±30°, 6B ±20°
    maxAzHalfWidthDeg: 40,
    maxBars: 6,
    autoSttAtRmaxFraction: null,
    howTo:
      'Put the TDC over the mode legend (PB5) and depress to select TWS. Scan pairs: 2B up to 80°, 4B up to 40°, ' +
      '6B 20°; MAN centering slews with the TDC, AUTO follows the L&S. The top-ranked track becomes L&S (star) by ' +
      'itself; TDC Depress on another track makes it DT2 (diamond). The AIM-120 goes to whatever is L&S at launch. ' +
      'Undesignate swaps L&S and DT2 (or steps L&S down the ranked list when there is no DT2), so press it between ' +
      'shots. Sensor Control Switch toward the radar DDI puts the L&S into STT and drops every other trackfile.',
  },
  sttArhLaunchWarning: false,
};

const APG68: RadarSpec = {
  name: 'AN/APG-68(V)5',
  modes: ['off', 'rws', 'tws', 'stt', 'acm'],
  modeLabels: { rws: 'RWS', tws: 'TWS', stt: 'STT', acm: 'ACM' },
  azHalfWidthOptionsDeg: [10, 25, 30, 60], // A1, A2 (TWS bug scan only), A3, A6
  barOptions: [1, 2, 3, 4],                // 3B only in TWS with a cursor target or bug
  barSpacingDeg: 2.2,
  beamWidthDeg: 3.2,
  scanRateDegPerS: 60,                     // A6/4B = 8 s, A3/2B = 2 s, as the ED guide gives
  gimbalAzDeg: 60,
  gimbalElDeg: 60,
  rangeScalesKm: nm(5, 10, 20, 40, 80, 160),
  detectKm: { headOn: 68.4, tail: 54, lookDownFactor: 0.6 },
  notchKts: 71,
  notchNeedsLookDown: true,
  tws: {
    maxTracks: 10,
    launchFromTws: true,
    maxSimultaneousTargets: 6,
    capConfidence: 'documented',
    maxAzHalfWidthDeg: 60,
    maxBars: 4,
    autoSttAtRmaxFraction: null,
    howTo:
      'Hold TMS Right for 1 s to enter TWS. Wait a few frames for search targets to become tracks. A short TMS ' +
      'Right upgrades every track to a System Track and bugs the closest; TMS Up on a track upgrades it or bugs ' +
      'it. With a bug (or cursor target) the scan becomes ±25° 3-bar around it. Fire, then a short TMS Right steps ' +
      'the bug to the next System Track for the next shot: up to six AIM-120s at six targets. TMS Up on the bug ' +
      'goes STT and loses the other tracks; TMS Aft rejects or downgrades. Tracks drop after 13 s without data.',
  },
  sttArhLaunchWarning: false,
};

const AWG9: RadarSpec = {
  name: 'AN/AWG-9',
  modes: ['off', 'rws', 'tws', 'stt', 'vs', 'acm'],
  modeLabels: { rws: 'RWS', tws: 'TWS', stt: 'PD STT', vs: 'PD SRCH', acm: 'PAL' },
  azHalfWidthOptionsDeg: [10, 20, 40, 65],
  barOptions: [1, 2, 4, 8],
  barSpacingDeg: 1.3,                      // 1/2/4/8 bars cover 2.3/3.6/6.3/11.5° (manual)
  beamWidthDeg: 2.3,
  scanRateDegPerS: 80,                     // gives the 2 s TWS refresh for ±20°/4B and ±40°/2B
  gimbalAzDeg: 65,
  gimbalElDeg: 60,
  rangeScalesKm: nm(25, 50, 100, 200, 400),
  detectKm: { headOn: 167, tail: 83, lookDownFactor: 0.8 },
  notchKts: 133,
  notchNeedsLookDown: true,
  twsPatterns: [[20, 4], [40, 2]],
  tws: {
    maxTracks: 24,
    launchFromTws: true,
    maxSimultaneousTargets: 6,
    capConfidence: 'documented',
    maxFrameTimeS: 2,
    maxAzHalfWidthDeg: 40,
    maxBars: 4,
    autoSttAtRmaxFraction: null,
    howTo:
      'TWS runs only ±20° 4-bar or ±40° 2-bar so every track is refreshed every 2 s (24 tracks, 18 on the TID). ' +
      'The WCS numbers up to six targets 1–6 on the TID. Each trigger press fires one Phoenix at priority 1 after ' +
      'about 3 s, and the other numbers move up. The RIO can force a target in (mandatory attack), keep one out ' +
      '(do not attack) or make a hooked track next (NEXT LAUNCH). The first Phoenix forces TWS AUTO. With Jester, ' +
      'use the A menu, Beyond Visual Range – Radar. The AIM-7 cannot be fired from TWS.',
  },
  sttArhLaunchWarning: true,               // AIM-54 from PD-STT is SARH to impact: target gets a launch warning at once
};

const KLJ7: RadarSpec = {
  name: 'KLJ-7',
  bvrStartMode: 'tws', // Deka INTC display schedule; NAV remains RWS (verification-status.md).
  modes: ['off', 'rws', 'tws', 'stt', 'vs', 'acm'],
  modeLabels: { rws: 'RWS', tws: 'TWS', stt: 'STT', vs: 'VS', acm: 'ACM' },
  azHalfWidthOptionsDeg: [10, 25, 30, 60],
  barOptions: [1, 2, 3, 4],
  barSpacingDeg: 2.5,
  beamWidthDeg: 3.5,
  scanRateDegPerS: 60,
  gimbalAzDeg: 60,
  gimbalElDeg: 60,
  rangeScalesKm: nm(10, 20, 40, 80),
  detectKm: { headOn: 89, tail: 46, lookDownFactor: 0.8 },
  notchKts: 54,
  notchNeedsLookDown: true,
  twsPatterns: [[60, 2], [25, 3], [10, 4]],
  tws: {
    maxTracks: 10,
    launchFromTws: true,
    maxSimultaneousTargets: 2,
    capConfidence: 'documented',
    maxFrameTimeS: 4,                      // allows ±60°/2B, ±25°/3B, ±10°/4B; refuses ±60°/4B
    maxAzHalfWidthDeg: 60,
    maxBars: 4,
    autoSttAtRmaxFraction: null,
    howTo:
      'INTC master mode starts in TWS (10 tracks). The first TDC press on a track bugs it as the HPT (circle); it ' +
      'is not a lock: the target still sees only your search radar. Bug a second track to get the SPT (DTT). The SD-10 goes to the ' +
      'HPT; S2 LEFT swaps HPT and SPT for the second shot. A second TDC press on the HPT gives STT, drops the other ' +
      'tracks and gives the target a lock warning. S2 press unlocks.',
  },
  sttArhLaunchWarning: false,
};

const RDI: RadarSpec = {
  name: 'RDI',
  modes: ['off', 'rws', 'stt', 'acm'],
  modeLabels: { rws: 'RECH', stt: 'PSIC', acm: 'ACM' },
  azHalfWidthOptionsDeg: [15, 30, 60],
  barOptions: [1, 2, 4],
  barSpacingDeg: 2.5,                      // 2 bars cover 5°, 4 bars 10° (guide)
  beamWidthDeg: 3,
  scanRateDegPerS: 60,
  gimbalAzDeg: 60,
  gimbalElDeg: 55,
  rangeScalesKm: nm(10, 20, 40, 80),
  detectKm: { headOn: 120, tail: 55, lookDownFactor: 0.8 },
  notchKts: 54,
  notchNeedsLookDown: true,
  singleTargetTws: { label: 'PSID', maxTracks: 1, bars: 1, launchFromTws: false, modelled: false },
  tws: null,
  sttArhLaunchWarning: false,
};

/** Indexed by a FighterId it gives a fighter spec; by any AircraftId it gives the JetSpec union. */
export type JetTable = { [K in FighterId]: AircraftSpec } & { [K in AttackId]: AttackSpec };

export const AIRCRAFT: JetTable = {
  su27: {
    id: 'su27', name: 'Su-27S Flanker-B', short: 'Su-27', nation: 'ru', module: 'fc3', developer: 'Eagle Dynamics',
    role: 'fighter', cockpit: 'ru', units: 'metric', display: 'ru-hud', rwr: 'spo15',
    radar: fc3RuRadar({ name: 'N001', ...N001 }),
    loadout: [{ missile: 'r27er', count: 4 }, { missile: 'r27et', count: 2 }, { missile: 'r73', count: 4 }],
    missiles: ['r27r', 'r27er', 'r27t', 'r27et', 'r73'],
    cms: { chaff: 96, flares: 96 },
    perf: { maxMach: 2.35, cruiseMach: 0.85, maxG: 9, cornerKts: 420, ceilingFt: 60000 },
    rcsM2: 6,
    blurb:
      'No Fox 3. Every radar shot is an R-27R or R-27ER fired from STT (АТК ДВБ), so the bandit sees your lock, ' +
      'then a launch warning, and you are tied to him until impact. You win by shooting first with the ER from ' +
      'altitude and speed, cranking toward the ±60° gimbal limit while you support, and keeping R-27ETs and R-73s ' +
      'for shots his RWR never shows.',
    strengths: [
      'R-27ER: 59 km head-on at 10 km in ED\'s launch table, the longest SARH shot in FC3',
      'R-27ET: a long-range IR shot with no RWR warning, cued by radar or IRST',
      'OLS-27 IRST gives a passive lock for R-27ET and R-73',
      '96 chaff / 96 flares and L005 Sorbtsiya jammer pods',
    ],
    limits: [
      'No active missile: every R-27R/ER needs your STT until impact',
      'СНП designates one track and locks it at 85 % of Rmax: no multi-target shots',
      'Your lock and CW illumination light up the bandit\'s RWR for the whole shot',
      '60° scan in three positions and ~5 s frames: contacts are slow to appear',
    ],
  },
  su33: {
    id: 'su33', name: 'Su-33 Flanker-D', short: 'Su-33', nation: 'ru', module: 'fc3', developer: 'Eagle Dynamics',
    role: 'fighter', cockpit: 'ru', units: 'metric', display: 'ru-hud', rwr: 'spo15',
    radar: fc3RuRadar({ name: 'N001K', ...N001 }),
    loadout: [{ missile: 'r27er', count: 6 }, { missile: 'r27et', count: 2 }, { missile: 'r73', count: 4 }],
    missiles: ['r27r', 'r27er', 'r27t', 'r27et', 'r73'],
    cms: { chaff: 48, flares: 48 },
    perf: { maxMach: 2.17, cruiseMach: 0.85, maxG: 8.5, cornerKts: 400, ceilingFt: 55000 },
    rcsM2: 6,
    blurb:
      'The carrier Flanker: canards, a tailhook and 12 weapon stations, with the same N-001 radar model, the same ' +
      'R-27/R-73 family and the same one-target STT game as the Su-27. It carries more missiles but only half the ' +
      'countermeasures, so save chaff for the SARH shots that matter.',
    strengths: [
      'Up to 8 R-27R/ER plus R-73s on 12 stations',
      'Same R-27ER and R-27ET reach as the Su-27',
      'IRST passive shots with R-27ET and R-73',
    ],
    limits: [
      'Only 48 chaff / 48 flares',
      'No R-77 and no multi-target shots',
      'Your lock and illumination are on the bandit\'s RWR for the whole SARH shot',
      'Same slow ~5 s frame and 60° scan window as the Su-27',
    ],
  },
  j11a: {
    id: 'j11a', name: 'J-11A Flanker-L', short: 'J-11A', nation: 'cn', module: 'fc3', developer: 'Eagle Dynamics',
    role: 'fighter', cockpit: 'ru', units: 'metric', display: 'ru-hud', rwr: 'spo15',
    radar: fc3RuRadar({ name: 'N001VE', ...N001 }),
    loadout: [{ missile: 'r77', count: 6 }, { missile: 'r73', count: 4 }],
    missiles: ['r27r', 'r27er', 'r27t', 'r27et', 'r73', 'r77'],
    cms: { chaff: 96, flares: 96 },
    perf: { maxMach: 2.35, cruiseMach: 0.85, maxG: 9, cornerKts: 420, ceilingFt: 60000 },
    rcsM2: 6,
    blurb:
      'The only Flanker with a Fox 3 in DCS. The R-77 still launches from STT, so the bandit gets a lock warning, ' +
      'but once the missile is within about 15 km of him you can drop the lock and move to the next target. There ' +
      'is no TWS launch and no multi-target mode: shots go one after another.',
    strengths: [
      'R-77: active seeker, you can let go once it is inside ~15 km to go',
      'Up to 6 R-77 plus 4 R-73',
      'N-001 radar and OLS-27 IRST, as the Su-27',
      '96 chaff / 96 flares',
    ],
    limits: [
      'R-77 fires only from STT: the target sees your lock',
      'R-77 is short-legged (45 km head-on at 10 km in ED\'s table) and does not loft',
      'No jammer in the datamine',
      'Sequential shots only; each one needs its own STT',
    ],
  },
  mig29s: {
    id: 'mig29s', name: 'MiG-29S Fulcrum-C', short: 'MiG-29S', nation: 'ru', module: 'fc3', developer: 'Eagle Dynamics',
    role: 'fighter', cockpit: 'ru', units: 'metric', display: 'ru-hud', rwr: 'spo15',
    radar: fc3RuRadar({ name: 'N019M', headOn: 60, tail: 30, lookDownFactor: 1, notchKts: 81, gimbalElDeg: 50, mig29s: true }),
    loadout: [{ missile: 'r77', count: 4 }, { missile: 'r73', count: 2 }],
    missiles: ['r27r', 'r27er', 'r27t', 'r27et', 'r73', 'r77'],
    cms: { chaff: 30, flares: 30 },
    perf: { maxMach: 2.25, cruiseMach: 0.85, maxG: 9, cornerKts: 380, ceilingFt: 59000 },
    rcsM2: 4,
    blurb:
      'Small and agile, with the short-ranged N-019M radar and little fuel. It is the only FC3 jet with СНП2: two ' +
      'R-77s at two targets in one trigger pull, if they sit within 8° of each other, pull no more than 3 g and are not ' +
      'jamming. R-27s fit only on the two inner pylons.',
    strengths: [
      'СНП2: two R-77s at two targets at once',
      'Up to 6 R-77',
      'Internal Gardenia jammer',
      'R-73 with the helmet sight in the merge',
    ],
    limits: [
      'N-019M sees a fighter at ~60 km head-on (AI table), less than the Flankers',
      'Only 2 R-27, on the inner pylons',
      '30 chaff / 30 flares',
      'The HDD only repeats the HUD: no top-down tactical page',
    ],
  },
  f15c: {
    id: 'f15c', name: 'F-15C Eagle', short: 'F-15C', nation: 'us', module: 'fc3', developer: 'Eagle Dynamics',
    role: 'fighter', cockpit: 'us', units: 'imperial', display: 'f15-vsd', rwr: 'alr56c', radar: APG63,
    loadout: [{ missile: 'aim120c', count: 6 }, { missile: 'aim9m', count: 2 }],
    missiles: ['aim120b', 'aim120c', 'aim7m', 'aim9m'],
    cms: { chaff: 120, flares: 60 },
    perf: { maxMach: 2.5, cruiseMach: 0.85, maxG: 9, cornerKts: 400, ceilingFt: 65000 },
    rcsM2: 5,
    blurb:
      'The FC3 Eagle: keyboard-simple, fast and high, with a real multi-target TWS. Designate a PDT and up to three ' +
      'SDTs, ripple AIM-120s in that order, and the targets get no lock and no launch warning (only your search radar) until each missile goes active. The price: ' +
      'the TWS window is only ±30°, bars are fixed, and the AIM-7 still needs STT.',
    strengths: [
      'TWS: PDT + 3 SDTs, AIM-120s ripple in designation order',
      'A TWS AIM-120 gives the target no lock and no launch warning until pitbull',
      'Up to 8 AIM-120',
      'APG-63: 88 km head-on in the AI table; players report ~120 km on an Su-27',
    ],
    limits: [
      'TWS scan limited to ±30° (slewable across ±60°)',
      'AIM-7 needs STT, or FLOOD inside 10 nm',
      'No bar selection, no velocity search, no Super Search',
      'Designations cannot be reordered: undesignate and redo',
      'TWS tracks update slowly and break on hard manoeuvres',
    ],
  },
  fa18c: {
    id: 'fa18c', name: 'F/A-18C Hornet Lot 20', short: 'F/A-18C', nation: 'us', module: 'full', developer: 'Eagle Dynamics',
    role: 'fighter', cockpit: 'us', units: 'imperial', display: 'mfd', rwr: 'alr67', radar: APG73,
    loadout: [{ missile: 'aim120c', count: 6 }, { missile: 'aim9x', count: 2 }],
    missiles: ['aim120b', 'aim120c', 'aim7m', 'aim9m', 'aim9x'],
    cms: { chaff: 60, flares: 60 },
    perf: { maxMach: 1.8, cruiseMach: 0.8, maxG: 7.5, cornerKts: 330, ceilingFt: 50000 },
    rcsM2: 4,
    blurb:
      'A full-fidelity Hornet: TWS with 10 ranked trackfiles, an automatic L&S and a DT2 you choose, RAID and EXP ' +
      'to split groups, and AIM-120s that go wherever the L&S is at launch. It is slower and lower than the Eagle ' +
      'and the Flankers, so it wins on sensor work and shot timing, not raw energy.',
    strengths: [
      'TWS: 10 trackfiles; Undesignate steps or swaps L&S and DT2',
      'HUD "ACT" countdown then "TTG"; SHOOT flashes inside RNE',
      'RAID and EXP resolve tight formations',
      'LTWS keeps trackfile awareness while you search in RWS',
    ],
    limits: [
      'Top speed ~M1.8 and a lower ceiling: less energy to give a missile',
      'TWS scan capped at 2B/80°, 4B/40° or 6B/20°',
      'SCS toward the radar DDI in TWS goes STT and drops every other track',
      'LTWS cannot launch: you must be in TWS or STT',
    ],
  },
  f16c: {
    id: 'f16c', name: 'F-16C Viper Block 50', short: 'F-16C', nation: 'us', module: 'full', developer: 'Eagle Dynamics',
    role: 'fighter', cockpit: 'us', units: 'imperial', display: 'mfd', rwr: 'alr56m', radar: APG68,
    loadout: [{ missile: 'aim120c', count: 4 }, { missile: 'aim9x', count: 2 }],
    missiles: ['aim120b', 'aim120c', 'aim9m', 'aim9x'],
    cms: { chaff: 60, flares: 60 },
    perf: { maxMach: 2.0, cruiseMach: 0.85, maxG: 9, cornerKts: 350, ceilingFt: 50000 },
    rcsM2: 3,
    blurb:
      'The Viper: light, fast and the best-documented AMRAAM shooter in DCS, guiding six AIM-120s at six separate ' +
      'targets. Its radar logic is the TMS shoot list (upgrade, bug, step), its DLZ gives RAERO/ROPT/RPI/RTR plus A ' +
      'and T countdowns, and its RWR pulls lethal threats toward the centre.',
    strengths: [
      'Six AIM-120s at six separate targets',
      'TWS with 10 tracks and an A2/3B bug scan',
      'DLZ shows loft ranges (RAERO, ROPT) and A/T times',
      'VSR search for long-range hot targets',
    ],
    limits: [
      'No AIM-7',
      'Tracks drop after 13 s without an update',
      'The RWR is blind beyond ±45° elevation',
      'Easy to be notched in look-down (ED: correct as-is)',
    ],
  },
  f14b: {
    id: 'f14b', name: 'F-14B Tomcat', short: 'F-14B', nation: 'us', module: 'full', developer: 'Heatblur',
    role: 'fighter', cockpit: 'us', units: 'imperial', display: 'tid', rwr: 'alr67', radar: AWG9,
    loadout: [{ missile: 'aim54c', count: 4 }, { missile: 'aim7m', count: 2 }, { missile: 'aim9m', count: 2 }],
    missiles: ['aim54a', 'aim54c', 'aim7m', 'aim9m'],
    cms: { chaff: 60, flares: 60 },
    perf: { maxMach: 2.34, cruiseMach: 0.8, maxG: 7.5, cornerKts: 330, ceilingFt: 53000 },
    rcsM2: 6,
    blurb:
      'The Tomcat: the AWG-9 holds 24 tracks and the WCS fires up to six Phoenix at six targets from TWS, with the ' +
      'RIO (or Jester) running the radar. What the AIM-54 does depends on the mode at launch: TWS = datalink then ' +
      'active, PD-STT = SARH all the way, P-STT, PH ACT or under 10 nm = active off the rail with short range.',
    strengths: [
      'Six-target AIM-54 attack from TWS',
      'AIM-54: 120 km head-on at 10 km in ED\'s table',
      'A TWS Phoenix gives no lock or launch warning until the active command',
      'AWG-9: ~90 nm against 5 m² in RWS/TWS (Heatblur manual)',
    ],
    limits: [
      'The pilot does not run the radar: Jester menu or a human RIO',
      'TWS fixed to ±20° 4-bar or ±40° 2-bar',
      '3 s from trigger to missile away; ~2 min MSL PREP first',
      'AWG-9 clutter notch is 266 kt wide in look-down',
    ],
  },
  jf17: {
    id: 'jf17', name: 'JF-17 Thunder', short: 'JF-17', nation: 'pk', module: 'full', developer: 'Deka Ironwork',
    role: 'fighter', cockpit: 'us', units: 'imperial', display: 'mfd', rwr: 'jf17rwr', radar: KLJ7,
    loadout: [{ missile: 'sd10', count: 4 }, { missile: 'pl5e', count: 2 }],
    missiles: ['sd10', 'pl5e'],
    cms: { chaff: 36, flares: 32 },
    perf: { maxMach: 1.6, cruiseMach: 0.8, maxG: 8, cornerKts: 360, ceilingFt: 55000 },
    rcsM2: 3,
    blurb:
      'The Thunder: a KLJ-7 radar that starts in TWS, SD-10 active missiles and a two-target mode (HPT and SPT). An ' +
      'SD-10 fired from TWS gives no lock or launch warning until pitbull, and the TOA countdown tells you when you can leave. It is not ' +
      'fast, so let the missile do the work.',
    strengths: [
      'SD-10: 80 km head-on at 10 km in ED\'s table, more than the AIM-120C',
      'Two targets: HPT and SPT, S2 LEFT swaps them',
      'TWS is the default radar mode in INTC',
      'PL-5EII for the merge',
    ],
    limits: [
      'Top speed about M1.6',
      'Four SD-10 at most',
      'Pitbull distance is unpublished: trust the TOA countdown',
      'The RWR is an HSD overlay: colour carries the threat state',
    ],
  },
  m2000c: {
    id: 'm2000c', name: 'Mirage 2000C', short: 'M-2000C', nation: 'fr', module: 'full', developer: 'Razbam',
    role: 'fighter', cockpit: 'us', units: 'imperial', display: 'vtb', rwr: 'serval', radar: RDI,
    loadout: [{ missile: 's530d', count: 2 }, { missile: 'magic2', count: 2 }],
    missiles: ['s530d', 'magic2'],
    cms: { chaff: 112, flares: 16 },
    perf: { maxMach: 2.2, cruiseMach: 0.85, maxG: 9, cornerKts: 360, ceilingFt: 59000 },
    rcsM2: 3,
    blurb:
      'A fast delta with the RDI radar and the Super 530D. There is no multi-target TWS: PSID tracks one target for ' +
      'awareness, and the 530D is SARH, so you hold the PSIC lock until impact. The missile\'s battery dies about ' +
      '45 s after launch.',
    strengths: [
      'Super 530D: fast, and lofts on its own beyond 10 nm',
      'RDI: ~65 nm against 5 m² in HFR (guide figure)',
      'Magic II with a radar-slaved seeker',
      'Sabre jammer and a Serval RWR with a launch detector (D2M)',
    ],
    limits: [
      'No TWS: one target at a time',
      'Only two Super 530D',
      'Hold PSIC to impact; the 530D battery lasts ~45 s',
      'Razbam module, frozen since April 2025',
    ],
  },
  su25t: {
    id: 'su25t', role: 'attack', name: 'Su-25T Frogfoot', short: 'Su-25T', nation: 'ru', module: 'fc3', developer: 'Eagle Dynamics',
    cockpit: 'ru', units: 'metric', rwr: 'spo15',
    radar: null,
    weapons: ['9А4172 Vikhr', 'Kh-25ML (25МЛ)', 'Kh-29L (29Л)', 'Kh-29T (29Т)', 'KAB-500Kr (500Кр)', 'S-8 rockets', 'Free-fall bombs (АБ)', 'Kh-58 with the L-081 pod (58)', 'R-60 / R-73', '30 mm cannon (ВПУ)'],
    cms: { chaff: 0, flares: 192 },
    perf: { maxMach: 0.8, cruiseMach: 0.6, maxG: 6.5, cornerKts: 300, ceilingFt: 23000 },
    rcsM2: 7,
    blurb:
      'The free attack jet in DCS World, with FC3-level keyboard avionics. It has no air-to-air radar: it finds ' +
      'targets with the Shkval TV sight, locks them by size, and guides Vikhr and laser missiles by keeping the ' +
      'laser on until impact. The SPO-15 is your only warning of the SAMs that hunt you.',
    strengths: [
      'Shkval TV sight with 8x and 23x zoom: a tank at 8–10 km, a house at 15 km',
      'Vikhr anti-tank missiles, fired in pairs, several targets per pass',
      'Laser and TV guided missiles and bombs, CCIP and CCRP bombing',
      'Kh-58 anti-radiation missiles with the Fantasmagoria pod',
    ],
    limits: [
      'No air-to-air radar: R-60 and R-73 are cued by their own seeker only',
      'Laser weapons need the lock and the laser held until impact',
      'Shkval gimbal ±35° azimuth, +15° to −85° elevation',
      'Subsonic and slow to climb: terrain and the SPO-15 are your defence',
    ],
  },
};

/** Fighters in picker order. BVR pages, tests and tables iterate this. */
export const FIGHTER_ORDER: FighterId[] = ['su27', 'su33', 'j11a', 'mig29s', 'f15c', 'fa18c', 'f16c', 'f14b', 'jf17', 'm2000c'];
/** Attack jets in picker order (air-to-ground routes only). */
export const ATTACK_ORDER: AttackId[] = ['su25t'];
/** Every jet: fighters first, then attack jets. The picker and the 3D models use this. */
export const AIRCRAFT_ORDER: AircraftId[] = [...FIGHTER_ORDER, ...ATTACK_ORDER];

export const isFighter = (id: AircraftId): id is FighterId => AIRCRAFT[id].role === 'fighter';

const PERF_NOTE = 'Performance numbers are rough public figures for the tactical flight model, not the DCS flight model.';
const RCS_NOTE = 'Radar cross-section is a relative estimate; only the F-15C\'s 5 m² comes from the DCS unit table.';
const FC3_RU_NOTES = [
  'Detection ranges are the DCS AI sensor table for N-001 (reference RCS not stated). ED\'s Su-33 manual gives the real N001K as ≥100 km head-on.',
  'Bars are not selectable in FC3; 4 bars × 2.5° and the scan speed are assumed so one frame takes ~5 s, as the datamine and manual imply.',
  'Range scales 10/25/50/100/200 km are not verified.',
  'Early lock above 85 % Rmax: the Su-27 manual says Enter forces it, the later MiG-29 and Su-33 manuals say it will not happen.',
  'The Doppler notch is applied at any look angle (the AI table gives a flat radial-speed gate). Whether DCS needs look-down here is not verified.',
  'The close-combat HUD label "БВБ" is not verified.',
  'Launch warning for an R-77 fired from STT is not verified; this trainer gives the target a lock only until the seeker goes active.',
];

/**
 * Per-aircraft "simplified here" notes: every value in AIRCRAFT that research could not confirm.
 * Pages should surface the relevant ones (Hangar, Reference, lab callouts).
 */
export const AIRCRAFT_CAVEATS: Record<AircraftId, string[]> = {
  su27: [...FC3_RU_NOTES, PERF_NOTE, RCS_NOTE],
  su33: [...FC3_RU_NOTES, 'Su-33 station counts are inferred from launcher lists in the datamine.', PERF_NOTE, RCS_NOTE],
  j11a: [...FC3_RU_NOTES, 'The datamine shows no jammer for the J-11A; not checked in game.', PERF_NOTE, RCS_NOTE],
  mig29s: [
    'Detection ranges are the DCS AI sensor table for N-019M (reference target 3 m²).',
    'Bars are not selectable in FC3; 4 bars × 2.5° and the scan speed are assumed so one frame takes ~5 s.',
    'The datamine STT limit is ±67° azimuth and −45/+50° elevation; ±60° and 50° are used here.',
    'Range scales 10/25/50/100/200 km are not verified.',
    'СНП2 solution time (~10 s) is a community figure. The two-target rule (8°, 3 g, no ECM) is from the 2018 manual.',
    'The Doppler notch is applied at any look angle (flat AI-table gate); not verified.',
    'The close-combat HUD label "БВБ" is not verified.',
    PERF_NOTE, RCS_NOTE,
  ],
  f15c: [
    'Detection is the DCS AI sensor table (88 km head-on). Players report ~120 km against an Su-27, so the player radar may scale differently.',
    'Bars are not selectable in FC3 and the count is undocumented; 4 bars × 2.5° are assumed.',
    'The 16-track limit is the manual\'s LRS figure; a TWS track-file limit is not documented.',
    'AIM-120 from STT: DCS most likely shows the target only a lock until pitbull (2020 forum); the 2014 manual implies a launch warning.',
    'The LRS legend on the VSD is not documented; "LRS" is used. "AACQ" stands for VS / Boresight / Auto Guns.',
    'The Doppler notch is applied at any look angle (flat AI-table gate); not verified.',
    PERF_NOTE,
  ],
  fa18c: [
    'Detection is the DCS AI sensor table for APG-73; the player radar model is not published.',
    'ED gives no cap on simultaneous AIM-120s; the 10-trackfile limit is used.',
    'Beam width (3°) and scan speed (60°/s) are estimates; the TWS frame limit is derived from the allowed bar/azimuth pairs.',
    'The ±60° elevation gimbal is assumed.',
    'The 54 kt notch gate is the AI table\'s; the player radar\'s gate is not published.',
    'Chaff and flare counts (60/60) are not in research.',
    PERF_NOTE, RCS_NOTE,
  ],
  f16c: [
    'Detection is the DCS AI sensor table for APG-68; the player radar model is not published.',
    'Notch gate 71 kt is MTR LO (HI is 110 kt); which one is the default was not verified.',
    'A2 (±25°) and 3B exist only in TWS with a bugged or cursor target.',
    'Bar spacing (2.2°) and beam width (3.2°) are estimates.',
    'VSR is not modelled as its own mode; SAM / DT SAM / DTT are folded into STT and TWS.',
    'Chaff and flare counts (60/60) are not in research.',
    'The trainer uses launch-zone availability; full HUD ASC/ASEC steering geometry is not modelled. The Viper has no SHOOT text cue.',
    PERF_NOTE, RCS_NOTE,
  ],
  f14b: [
    'Detection uses the Heatblur manual figure (90 nm against 5 m² in RWS/TWS); tail and look-down values are estimates.',
    'Scan speed (80°/s) is derived from the 2 s TWS refresh; the ±60° elevation gimbal is assumed.',
    'Jester menu wording is not verified.',
    'TID launch-zone vectors and optimum-range blinking are simplified; there is no IN RNG text cue in the classic F-14.',
    'Chaff and flare counts (60/60) are not in research.',
    PERF_NOTE, RCS_NOTE,
  ],
  jf17: [
    'Detection is the KLJ-7 AI sensor table (5 m²); the Deka module may use its own model.',
    'Air-to-air scenarios enter INTC with TWS; generic navigation starts in RWS. The Deka English manual used for this schedule is machine-translated.',
    'TWS scan options conflict between guides; ±10°/4B, ±25°/3B and ±60°/2B are used.',
    'Two SD-10s supported at once is implied by "attack 2 targets" on the store page; medium confidence.',
    'Scan speed, bar spacing and beam width are estimates. The ±60° elevation gimbal is assumed (the AI table scans ±30°).',
    'Chaff and flare counts (36/32) are not in research.',
    PERF_NOTE, RCS_NOTE,
  ],
  m2000c: [
    'Detection uses Chuck\'s guide (~65 nm against 5 m² in HFR); tail and look-down values are estimates.',
    'Azimuth 60/30/15 is read as ± half-widths.',
    'Range scales, notch gate and scan speed are estimates.',
    'PSID (single-target track-while-scan) is not modelled; only RECH and PSIC are.',
    'Chaff and flare counts (112/16) are not in research.',
    PERF_NOTE, RCS_NOTE,
  ],
  su25t: [
    'Performance and RCS values are rough gameplay numbers, not verified.',
    'The flight manual lists 192 flares and no chaff load; chaff is shown as 0 until checked in game.',
    'Laser limit conflict: the manual says 20 minutes total per flight with cooling; a 1-minute continuous limit is also reported. Not verified.',
    'Gun conflict: the manual names a 30 mm twin-barrel cannon with 200 rounds; GSh-30 with 150 rounds is also reported. Not verified.',
    'The manual gives no launch ranges for guided air-to-ground weapons; any range shown later is a community value, not verified.',
  ],
};
