/** Ground-attack render kit (Su-25T pages). Import from `src/render/attack`. See docs/api/render.md, "Attack scene". */
export { AttackScene, approachBearingsDeg, WEDGE_LENGTH_M } from './attackScene';
export type { AttackGeometry, AttackLayers, AttackSceneOptions } from './attackScene';
export { MarkLayer, smokePuff, markFade, smokeColours, SMOKE_PUFFS, SMOKE_TOP_M, SMOKE_RISE_S, MARK_FADE_S } from './marks';
export type { MarkLayers, SmokePuff } from './marks';
export { ShkvalTv, tvLut, toGreyImage } from './shkvalTv';
export type { ShkvalTvOptions } from './shkvalTv';
export { GroundUnitLayer, unitModelScale } from './groundUnits';
export { createAttackField, terrainHook, LOS_LIFT_M } from './terrainHook';
export type { AttackFieldOptions, AttackPad } from './terrainHook';
