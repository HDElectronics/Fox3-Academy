/**
 * Uniforms shared by every custom shader of one Stage (viewport, DPR, pixel scale, clock) and the
 * GLSL snippets that make custom shaders work with the Stage's logarithmic depth buffer.
 */
import { Vector2 } from 'three';

export interface SharedUniforms {
  /** Viewport size in CSS pixels. */
  uViewport: { value: Vector2 };
  /** Device pixel ratio actually used by the renderer. */
  uDpr: { value: number };
  /** Render units per CSS pixel at a view depth of 1 unit: 2·tan(fov/2) / viewportHeight. */
  uPxScale: { value: number };
  /** Real seconds since the Stage started (for purely cosmetic animation). */
  uClock: { value: number };
}

export function createSharedUniforms(): SharedUniforms {
  return {
    uViewport: { value: new Vector2(1, 1) },
    uDpr: { value: 1 },
    uPxScale: { value: 0.001 },
    uClock: { value: 0 },
  };
}

/** Vertex prelude: three's common helpers + log depth varyings. */
export const VERT_PRELUDE = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
`;
/** Put at the very end of main() in a vertex shader (after gl_Position is set). */
export const VERT_END = /* glsl */ `
#include <logdepthbuf_vertex>
`;
export const FRAG_PRELUDE = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
`;
/** Put at the end of main() in a fragment shader (after gl_FragColor is set, colours in linear space). */
export const FRAG_END = /* glsl */ `
#include <logdepthbuf_fragment>
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

/** Render-order bands so transparent layers stack predictably. */
export const ORDER = {
  sky: -1000,
  ground: -900,
  clouds: -10,
  shadows: 1,
  volume: 2,
  trails: 3,
  cones: 4,
  lines: 5,
  points: 6,
  overlay: 8,
} as const;
