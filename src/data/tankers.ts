/**
 * [OWNER: sim] Tankers for the air-to-air refuelling trainer (issue #28): IL-78M (UPAZ hose pods, Su-33),
 * KC-135 (boom) and KC-135 MPRS / KC-130 (hose pods) for Western jets. What the player meets behind the tanker:
 * racetrack, hose pod or boom, hose bands, envelope. Arcade abstractions (AGENTS.md rule 1): no hose, boom,
 * hydraulic or fuel-system engineering. Everything but the UPAZ hose bands is a gameplay value (`verified: false`),
 * listed in docs/api/data.md ("Uncertain values", Flight ops).
 */
import type { HoseBand, Sourced, TankerData, TankerId } from '../sim/flightOps/types';

export const SU33_AAR = 'ED Su-33 Flaming Cliffs 3 manual, Air-to-air refuelling';
const TRAINER = 'Trainer value';

const ok = <T>(value: T, source: string, note?: string): Sourced<T> => ({ value, source, verified: true, note });
const nv = <T>(value: T, source: string, note?: string): Sourced<T> => ({ value, source, verified: false, note });

/** UPAZ hose bands by cone-to-pod distance, metres (Su-33 manual). */
export const UPAZ_BANDS: readonly { from: number; to: number; band: HoseBand }[] = [
  { from: 3, to: 13, band: 'yellow' },
  { from: 13, to: 16, band: 'yellowGreen' },
  { from: 16, to: 22, band: 'green' },
  { from: 22, to: 24, band: 'greenRed' },
  { from: 24, to: 26, band: 'red' },
];

const RACETRACK_NOTE = 'Gameplay value: the mission sets the tanker track.';
const HOSE_NOTE = 'Western hose pods have no coloured bands in the trainer; the UPAZ distances are reused as the arcade hose rule.';
const drogueEnvelope = nv({ lateralM: 3, belowPodM: [1.5, 7.5] as [number, number] }, TRAINER,
  'Arcade envelope: outside it the probe pulls out of the basket.');

export const TANKERS: Record<TankerId, TankerData> = {
  il78m: {
    id: 'il78m',
    name: 'IL-78M',
    kind: 'drogue',
    speedKt: nv(290, SU33_AAR, 'About 540 km/h, inside the Su-33 window of 500–570 km/h IAS; gameplay value.'),
    altFt: nv(19700, SU33_AAR, 'About 6000 m, inside the Su-33 window of 2000–9000 m; gameplay value.'),
    racetrack: { legNm: nv(30, TRAINER, RACETRACK_NOTE), bankDeg: nv(20, TRAINER, RACETRACK_NOTE) },
    drogue: {
      pod: { aft: 5, right: -14, up: -1.5 },
      podName: 'Left wing UPAZ pod',
      trailM: nv(26, SU33_AAR, 'Outer end of the red band; the fully trailed hose length is not given.'),
      droopM: nv(4.5, SU33_AAR, 'Middle of the 3–6 m hold below the pod; gameplay value.'),
      bands: ok(UPAZ_BANDS, SU33_AAR, 'Cone-to-pod distance: yellow 3–13 m, yellow+green 13–16, green 16–22, green+red 22–24, red 24–26.'),
      gauge: true,
      envelope: drogueEnvelope,
      maxClosureKt: nv(5, TRAINER, 'Arcade bounce limit.'),
    },
    fuel: { unit: 'kg', ratePerS: nv(15, TRAINER, 'Arcade fuel counter.') },
  },
  kc135: {
    id: 'kc135',
    name: 'KC-135',
    kind: 'boom',
    speedKt: nv(300, TRAINER, RACETRACK_NOTE),
    altFt: nv(20000, TRAINER, RACETRACK_NOTE),
    racetrack: { legNm: nv(30, TRAINER, RACETRACK_NOTE), bankDeg: nv(20, TRAINER, RACETRACK_NOTE) },
    boom: {
      pivot: { aft: 18, right: 0, up: -2 },
      nominal: { elevDeg: 30, extM: 12 },
      limits: nv({ elevDeg: [20, 40] as [number, number], azDeg: 15, extM: [9, 15] as [number, number] }, TRAINER,
        'Arcade boom envelope; the KC-135 limits and director lights are not verified.'),
      maxClosureKt: nv(3, TRAINER, 'Arcade limit: faster closure and the boom operator does not make contact.'),
    },
    fuel: { unit: 'lb', ratePerS: nv(50, TRAINER, 'Arcade fuel counter.') },
  },
  kc135mprs: {
    id: 'kc135mprs',
    name: 'KC-135 MPRS',
    kind: 'drogue',
    speedKt: nv(270, TRAINER, RACETRACK_NOTE),
    altFt: nv(20000, TRAINER, RACETRACK_NOTE),
    racetrack: { legNm: nv(30, TRAINER, RACETRACK_NOTE), bankDeg: nv(20, TRAINER, RACETRACK_NOTE) },
    drogue: {
      pod: { aft: 8, right: -17, up: -1 },
      podName: 'Left wing hose pod',
      trailM: nv(26, TRAINER, HOSE_NOTE),
      droopM: nv(4.5, TRAINER, HOSE_NOTE),
      bands: nv(UPAZ_BANDS, TRAINER, HOSE_NOTE),
      gauge: false,
      envelope: drogueEnvelope,
      maxClosureKt: nv(5, TRAINER, 'Arcade bounce limit.'),
    },
    fuel: { unit: 'lb', ratePerS: nv(30, TRAINER, 'Arcade fuel counter.') },
  },
  kc130: {
    id: 'kc130',
    name: 'KC-130',
    kind: 'drogue',
    speedKt: nv(230, TRAINER, RACETRACK_NOTE),
    altFt: nv(15000, TRAINER, RACETRACK_NOTE),
    racetrack: { legNm: nv(30, TRAINER, RACETRACK_NOTE), bankDeg: nv(20, TRAINER, RACETRACK_NOTE) },
    drogue: {
      pod: { aft: 4, right: -12, up: -1 },
      podName: 'Left wing hose pod',
      trailM: nv(26, TRAINER, HOSE_NOTE),
      droopM: nv(4.5, TRAINER, HOSE_NOTE),
      bands: nv(UPAZ_BANDS, TRAINER, HOSE_NOTE),
      gauge: false,
      envelope: drogueEnvelope,
      maxClosureKt: nv(5, TRAINER, 'Arcade bounce limit.'),
    },
    fuel: { unit: 'lb', ratePerS: nv(25, TRAINER, 'Arcade fuel counter.') },
  },
};

export const TANKER_CAVEATS: string[] = [
  'Tankers: the IL-78M with UPAZ pods for the Su-33 follows the Su-33 manual; the hose bands (yellow 3–13 m, yellow+green 13–16, green 16–22, green+red 22–24, red 24–26 m cone to pod) are sourced. Tanker speeds, altitudes, racetracks, pod positions, the KC-135 boom envelope, the KC-135 MPRS and KC-130 hoses and all fuel rates are gameplay values.',
  'Tankers: KC-135 director lights are not modelled; the trainer shows simplified up/down and forward/aft cues. Radio call wording other than "Intent to refuel" is not verified.',
  'Refuelling: contact, bounce, hose-band and boom-limit disconnects and the fuel counter are arcade rules, not hose, boom or fuel-system behaviour.',
];
