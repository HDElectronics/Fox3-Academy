/** Ground-attack render kit (Su-25T pages). Import from `src/render/attack`. See docs/api/render.md, "Attack scene". */
export { AttackScene } from './attackScene';
export type { AttackLayers, AttackSceneOptions } from './attackScene';
export { ShkvalTv, tvLut, toGreyImage } from './shkvalTv';
export type { ShkvalTvOptions } from './shkvalTv';
export { GroundUnitLayer, unitModelScale } from './groundUnits';
export { createAttackField, terrainHook, LOS_LIFT_M } from './terrainHook';
export type { AttackFieldOptions, AttackPad } from './terrainHook';
