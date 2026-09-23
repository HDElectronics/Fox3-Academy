/** Flight-ops render kit: runway, carrier, approach overlay and the pattern/approach scene (metres, scaled by `root`). */
export { RunwayMesh, runwayMarkings } from './runway';
export type { RunwayOptions } from './runway';
export { CarrierMesh, deckOutline, landingLocal, landingPaint, lensCell, shipLocal, shipToLanding } from './carrier';
export type { DeckStrip } from './carrier';
export { ApproachOverlay, glidePoint } from './approach';
export type { ApproachGate, ApproachGeometryOptions, ErrLevel, GateState } from './approach';
export { FlightOpsScene, LSO_EYE, CARRIER_CORRIDOR_M } from './scene';
export type { FlightOpsCamera, FlightOpsSceneOptions } from './scene';
