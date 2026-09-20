/**
 * Render kit (three.js). 1 render unit = 1 km; public APIs take sim metres unless named otherwise.
 * See docs/api/render.md for usage.
 */
export { Stage, FramePriority, disposeTree, isWebGLAvailable, WebGLUnavailableError } from './stage';
export type { StageOptions, FrameFn, FrameOptions } from './stage';
export { Environment } from './environment';
export type { EnvironmentOptions, CloudOptions } from './environment';
export { WorldView } from './worldView';
export type { WorldViewOptions } from './worldView';
export { ReplayView, rosterFromWorld, sampleIndex } from './replay';
export type { ReplayViewOptions, ReplayRoster, ReplayAircraft, ReplayMissile } from './replay';
export { TacticalScene, DEFAULT_LAYERS, guidanceText } from './tactical';
export type { Layers, TacticalOptions, PickOptions, EntitySource, AircraftLike, MissileLike, CountermeasureLike } from './tactical';
export { RadarVolume, altitudeCoverage, scanElevationLimits, barElevation, stepSyntheticScan, coverageText } from './radarVolume';
export type { RadarVolumeOptions, ScanStateLike } from './radarVolume';
export { CameraRig, orbitBasis, fitDistance } from './cameras';
export type { CameraMode, CameraRigOptions, FocusTarget, ModeOptions, FrameOptions as CameraFrameOptions } from './cameras';
export {
  JetMesh, getJetModel, jetMaterials, JET_DIMENSIONS, NOMINAL_JET_M, NOMINAL_MISSILE_M, createMissileMesh, getMissileGeometry,
  missileMaterials, smokeDensity, f14SweepForMach, solidMaterial,
} from './jets';
export type { JetModel } from './jets';
export { LineBatch } from './lines';
export type { LineStyle, LineBatchOptions } from './lines';
export { SymbolLayer, Shape } from './symbols';
export type { ShapeId, SymbolLayerOptions } from './symbols';
export { RibbonGeometry, Trail, createRibbonMaterial } from './ribbon';
export type { RibbonStyle } from './ribbon';
export { Tag, Note } from './tags';
export { readPalette, paletteFromTheme, sideColor } from './palette';
export type { Palette, VisualSide } from './palette';
export { ORDER, VERT_PRELUDE, VERT_END, FRAG_PRELUDE, FRAG_END, createSharedUniforms } from './shared';
export type { SharedUniforms } from './shared';
export {
  M_PER_UNIT, UNIT_PER_M, toUnits, toMetres, mToUnits, unitsToM, orientationQuaternion, headingQuaternion, pxPerUnitAt,
  boostedScale, lerpAngle,
} from './units';
export type { XYZ } from './units';
