/**
 * [OWNER: sim] Ships for the carrier Case I trainer (issue #26): the Supercarrier CVN (F/A-18C, F-14B) and the
 * Kuznetsov (Su-33). What the player meets on deck: angled landing area, wires, glide slope, landing aid.
 * Gameplay values where the sources publish nothing (`verified: false`, listed in docs/api/data.md).
 */
import type { ShipData, ShipId, Sourced } from '../sim/flightOps/types';

export const SUPERCARRIER = 'ED DCS Supercarrier Operations Guide';
export const HORNET_CASE1 = 'ED F/A-18C Early Access Guide, Case 1';
export const SU33_MANUAL = 'ED Su-33 Flaming Cliffs 3 manual';

const ok = <T>(value: T, source: string, note?: string): Sourced<T> => ({ value, source, verified: true, note });
const nv = <T>(value: T, source: string, note?: string): Sourced<T> => ({ value, source, verified: false, note });

const SHIP_SPEED_NOTE = 'Gameplay value: the mission sets the ship speed. The trainer has no wind, so wind over the deck equals ship speed.';

export const SHIPS: Record<ShipId, ShipData> = {
  cvn: {
    id: 'cvn',
    name: 'Supercarrier (CVN)',
    speedKt: nv(15, SUPERCARRIER, SHIP_SPEED_NOTE),
    angledDeckDeg: nv(9, SUPERCARRIER, 'About 9° left of the ship heading; not given in the guide.'),
    glideDeg: nv(3.5, HORNET_CASE1, 'The Hornet guide gives 3.5°; the Supercarrier LSO section gives 3.6°. Conflict to settle in game.'),
    wires: ok(4, SUPERCARRIER),
    wireSpacingM: nv(12, SUPERCARRIER, 'About 12 m (40 ft); not given in the guide.'),
    firstWireFromRampM: nv(55, SUPERCARRIER, 'Not given; gameplay value.'),
    landingAreaLengthM: 230,
    landingAreaWidthM: 26,
    deckHeightM: 20,
    lights: 'iflols',
    lso: ok(true, SUPERCARRIER, 'LSO calls and grades.'),
  },
  kuznetsov: {
    id: 'kuznetsov',
    name: 'Admiral Kuznetsov',
    speedKt: nv(15, SU33_MANUAL, SHIP_SPEED_NOTE),
    angledDeckDeg: nv(7, SU33_MANUAL, 'About 7°; not given in the manual.'),
    glideDeg: nv(3.5, SU33_MANUAL, 'Not given; the CVN value is used.'),
    wires: ok(4, SU33_MANUAL, 'Svetlana-2 arresting gear: four wires.'),
    wireSpacingM: ok(12, SU33_MANUAL, 'Wires 12 m apart.'),
    firstWireFromRampM: nv(50, SU33_MANUAL, 'Not given; gameplay value.'),
    landingAreaLengthM: 200,
    landingAreaWidthM: 24,
    deckHeightM: 18,
    lights: 'luna3',
    lso: nv(false, SU33_MANUAL, 'No LSO calls or grades are verified for the Kuznetsov; the trainer grades the pass itself.'),
  },
};

/**
 * Hull outline for the render (gameplay dimensions, metres). The ramp point (FlightOpsState.ship.x/z) is the
 * stern on the ship's centreline; the hull runs `lengthM` forward along the ship heading, `beamM` wide
 * (flight deck), and the landing area starts at the ramp along the angled axis.
 */
export const SHIP_HULL: Record<ShipId, { lengthM: number; beamM: number }> = {
  cvn: { lengthM: 333, beamM: 77 },
  kuznetsov: { lengthM: 305, beamM: 72 },
};

export const SHIP_CAVEATS: string[] = [
  'Ships: ship speed (15 kt), angled-deck angles (CVN 9°, Kuznetsov 7°), the CVN wire spacing and both first-wire distances are gameplay values. CVN four wires and the Kuznetsov four wires 12 m apart are sourced.',
  'Glide slope 3.5° (Hornet guide) conflicts with 3.6° (Supercarrier LSO section); the Kuznetsov uses the same 3.5°.',
  'Kuznetsov: Luna-3 colours (green on glide slope, yellow high, red low) are sourced; the colour band width and any LSO calls or grades are not.',
  'The trainer has no wind: wind over the deck equals ship speed. Hull and landing-area dimensions and deck heights are drawing values.',
];
