/**
 * [OWNER: page-radar-lab] Jet-specific radar-scan notes for the explainer, from docs/research
 * (ru-fc3.md, f15c-fc3.md, hornet-viper.md, tomcat-thunder-mirage.md, bvr-mechanics.md).
 * Keys in the text are DCS keyboard defaults; `keys` holds the <kbd> string for each line.
 */
import type { FighterId } from '../../data/types';

export interface JetNote { title: string; text: string; keys?: string }

const FC3_RU = (name: string, extra: JetNote[] = []): JetNote[] => [
  {
    title: 'PRF: ППС, ЗПС, АВТ',
    text: 'ППС is high PRF for head-on targets and gives the longest range. ЗПС is medium PRF for tail-on targets. АВТ interleaves the two on alternate bars for any aspect, at about 25 % less range. СНП (TWS) runs only in ППС or ЗПС. This trainer does not model PRF: every contact behaves as if you picked the right one.',
    keys: 'RShift + I',
  },
  {
    title: 'A fixed window in three positions',
    text: `The ${name} scan is 60° wide with fixed bars. You cannot trade width or bars for a faster frame; you can only move the window: left (−60…0°), centre (±30°) or right (0…+60°). A frame takes about 5 s, so give a new position one or two frames before you decide nothing is there.`,
    keys: 'RShift + , / RShift + /',
  },
  {
    title: 'Range-angle aiming',
    text: 'You do not tilt the antenna in degrees. Enter the expected target range and the height difference, and the radar points the scan through that point. The manual example: you at 5 km, target 80 km out at 10 km: enter 80 and +5. The HUD shows the height difference beside the elevation bar on the right.',
    keys: 'RCtrl + = / RCtrl + - and RShift + ; / RShift + .',
  },
  ...extra,
];

export const JET_NOTES: Record<FighterId, JetNote[]> = {
  su27: FC3_RU('N001', [{ title: 'N001 in the AI table', text: 'About 68 km head-on and 38 km tail-on against a fighter; tail-on in look-down drops to about 27 km. The Doppler gate is 113 kt (210 km/h), twice the Eagle\'s 54 kt: an easy radar to notch. Hot look-down retains the head-on range.' }]),
  su33: FC3_RU('N001K', [{ title: 'Same N-001 model', text: 'The Su-33 uses the Su-27 radar model in DCS: about 68 km head-on, 38 km tail-on, 113 kt gate. ED\'s Su-33 manual quotes the real N001K at 100 km or more, but the game table is what counts here.' }]),
  j11a: FC3_RU('N001VE', [{ title: 'Same N-001 model', text: 'The J-11A shares the N-001 table: about 68 km head-on, 38 km tail-on and a 113 kt gate. Your R-77 still needs STT, so every scan setting here ends in a lock.' }]),
  mig29s: FC3_RU('N019M', [{ title: 'N019M: shorter, but no look-down penalty', text: 'The MiG-29S radar table uses a 3 m² target: about 60 km head-on and 30 km tail-on, the same in look-down in the AI table. Its gate is 81 kt (150 km/h). СНП2 (two R-77s at two targets) needs them within 8° of azimuth of each other.' }]),
  f15c: [
    { title: 'PRF: HI, MED, interleaved', text: 'HI reaches farthest against hot targets, MED handles tail-on and beaming targets, interleaved (the default) alternates both. This trainer does not model PRF.', keys: 'RShift + I' },
    { title: 'Width, not bars', text: 'LRS searches ±60° or ±30°. Bars are not selectable in FC3 and their count is not documented (4 × 2.5° is assumed here). TWS always runs a ±30° window that you slew across ±60°, and it follows the PDT.', keys: 'RCtrl + = / RCtrl + -' },
    { title: 'Read the VSD coverage numbers', text: 'Put the TDC at the expected range: the two small numbers on the left scale are the top and bottom of the scan there, in thousands of feet. Tilt the antenna until the bandit\'s altitude sits between them.', keys: 'RShift + ; / RShift + .' },
    { title: 'No velocity search in FC3', text: 'The DCS Eagle has no VS and no Super Search. Its gate in the AI table is 54 kt (100 km/h).' },
  ],
  fa18c: [
    { title: 'Bars and azimuth', text: 'RWS offers 1, 2, 4 or 6 bars ("4B 1" is bar 1 of 4) and 20 to 140° of azimuth. TWS keeps each track fresh by limiting the pairs: 2B up to 80°, 4B up to 40°, 6B at 20°. Bar spacing is 1.3° (2° in 2B TWS; 1.3° is used throughout here).' },
    { title: 'Antenna elevation', text: 'The numbers above and below the TDC are the top and bottom of the scan at the TDC range, in thousands of feet. Tilt with the elevation control until they bracket the target.', keys: '= / -' },
    { title: 'PRF and VS', text: 'PRF is MED, HI or INTL. VS (high PRF) plots closure against azimuth with no range: great for hot targets far out, blind to beaming ones. Not modelled here: VS bricks carry a range.' },
    { title: 'AUTO and MAN centring', text: 'In TWS, AUTO keeps the scan on the L&S; MAN lets you slew it with the TDC. This lab runs the scan in MAN so your settings stay put.' },
  ],
  f16c: [
    { title: 'A6, A3, A1 and bars', text: 'A6 is ±60° and nose-centred, A3 ±30°, A1 ±10°. Bars are 4B, 2B or 1B. A2 (±25°) and 3B only exist in TWS with a bugged or cursor target. ED gives A6 4B about 8 s per frame and A3 2B about 2 s.' },
    { title: 'ANT ELEV', text: 'The cursor shows the upper (blue) and lower (white) coverage altitudes at the cursor range. Turn the ANT ELEV knob until they bracket the target.', keys: '= / -' },
    { title: 'MTR: your notch width', text: 'The FCR CNTL page sets the motion target rejection: LO 71 kt, HI 110 kt in RWS and TWS. A high target notches the Viper easily in look-down; ED tagged that "correct as-is".' },
    { title: 'Spotlight and bug scan', text: 'Hold TMS Up for a Spotlight: ±10° 4-bar on the cursor. Bugging a track in TWS forces a ±25° 3-bar scan around it.' },
  ],
  f14b: [
    { title: 'The RIO runs the radar', text: 'AZ SCAN is ±10, ±20, ±40 or ±65°; EL BARS 1, 2, 4 or 8, covering 2.3, 3.6, 6.3 and 11.5°. With Jester, use the A menu, Beyond Visual Range – Radar, for scan elevation, azimuth and range.' },
    { title: 'TWS: ±20° 4-bar or ±40° 2-bar', text: 'Only these two patterns, so every track is refreshed every 2 s. In TWS this lab offers the same two: pick the width or the bars and the other follows.' },
    { title: 'MLC: a 266 kt wide notch', text: 'The main-lobe clutter filter removes ±133 kt around your own ground speed in look-down. In MLC AUTO it switches off when the antenna points more than 3° up: a target above you cannot notch. A second, zero-Doppler blind zone hides tail chases within ±100 kt of your speed (not modelled here).' },
    { title: 'PD SRCH', text: 'Pulse-Doppler search reaches farthest but shows no range: the DDD plots closure against azimuth and the TID shows no tracks.' },
  ],
  jf17: [
    { title: 'KLJ-7 scan options', text: 'Guides disagree. Chuck lists RWS azimuth 10, 30 or 60° with 1, 2 or 4 bars, and TWS pairs ±25° 3-bar and ±60° 2-bar (FlyAndWire adds ±10° 4-bar). This lab offers every width and bar count in both modes and lets the frame-time rule decide what TWS accepts. PRF is HI, MED or AUTO.' },
    { title: 'Antenna elevation on T6', text: 'The TDC shows the upper and lower coverage (11 / 9 means 11,000 to 9,000 ft) at its range. The antenna is on the T6 control; research found no keyboard default.' },
    { title: 'SAM sets the scan for you', text: 'In ASM the radar picks 30° 2-bar beyond 20 nm and 15° 4-bar inside 20 nm around the bugged target. NAM leaves it manual.' },
    { title: 'VS', text: 'High-PRF velocity search: closure against azimuth, no range, best against nose-on targets.' },
  ],
  m2000c: [
    { title: 'RECH: bars and azimuth', text: 'Azimuth 60, 30 or 15 (read as ± half-widths here) and 1, 2 or 4 bars; 2 bars cover about 5° and 4 bars about 10°. The VTB marks which bar painted a contact and shows V for closing, Λ for opening.' },
    { title: 'PRF: HFR, BFR, ENT', text: 'HFR (high PRF) gives processed contacts you can lock; BFR (low PRF) shows raw video; ENT interleaves them. Not modelled here.' },
    { title: 'No TWS', text: 'The RDI has no multi-target TWS. PSID tracks one target on a 1-bar scan and cannot guide the Super 530D; it is not modelled here. Every shot is a PSIC lock held to impact.' },
    { title: 'Antenna', text: 'Radar Antenna UP / DOWN / CENTER has no keyboard default. The TDC shows the beam top and bottom altitude at its range.' },
  ],
};
