/** Flight-ops render kit: runway, carrier, approach overlay and the pattern/approach scene (metres, scaled by `root`). */
export { RunwayMesh, runwayMarkings } from './runway';
export type { RunwayOptions } from './runway';
export { CarrierMesh, deckOutline, landingLocal, landingPaint, lensCell, shipLocal, shipToLanding } from './carrier';
export type { DeckStrip } from './carrier';
export { LaunchDeck, CAT_TRACK_M, JBD, catTracks, jbdRaise, launchPositions, skiJumpHeight, skiJumpProfile, stoppersUp } from './launchDeck';
export { ApproachOverlay, glidePoint } from './approach';
export type { ApproachGate, ApproachGeometryOptions, ErrLevel, GateState } from './approach';
export { FlightOpsScene, LSO_EYE, DECK_EYE, CARRIER_CORRIDOR_M, WING_EYE, RECEIVER_EYE } from './scene';
export type { FlightOpsCamera, FlightOpsSceneOptions } from './scene';
export { TankerMesh, TANKER_LAYOUT, bandStripes, hoseMarkAt, hosePoints, rollPoint, tankerLocal } from './tanker';
export type { TankerLayout } from './tanker';
