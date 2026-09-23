/** Terrain APIs are metre-based; add the render groups under a 0.001-scaled scene root. */
export { createHeightField, heightAt, normalAt, slopeAt, lineOfSight } from './heightmap';
export type { HeightField, HeightFieldOptions, FlattenedArea, TerrainPoint } from './heightmap';
export { TerrainMesh } from './terrainMesh';
export type { TerrainMeshOptions, TerrainChunk } from './terrainMesh';
export { TerrainProps } from './props';
export type { TerrainPropsOptions } from './props';
