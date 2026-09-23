/** Synthetic training terrain. Metres; x east, y up, z south. No renderer or sim dependency. */
export interface TerrainPoint { x: number; y: number; z: number }
export interface HeightFieldOptions {
  seed?: number;
  /** Centred on the origin; default 40000 × 40000 metres. */
  extentM?: number | { x: number; z: number };
  /** Number of cells along each axis (default 512, maximum 2048). */
  segments?: number;
  maxReliefM?: number;
}
export interface FlattenedArea {
  x: number; z: number; radiusM: number; heightM: number;
  /** Outer radius including the grid safety margin and smooth transition. */
  outerRadiusM: number;
}
export interface HeightField {
  readonly seed: number;
  readonly extentM: Readonly<{ x: number; z: number }>;
  readonly segments: number;
  readonly cellXM: number;
  readonly cellZM: number;
  readonly maxReliefM: number;
  /** Row-major nodes: heights[rowZ * (segments + 1) + columnX]. Treat as read-only. */
  readonly heights: Float64Array;
  readonly flattenedAreas: readonly FlattenedArea[];
  /** Flatten before constructing render objects. Later overlapping calls take precedence. */
  flatten(x: number, z: number, radiusM: number, heightM: number): void;
}

/** Small deterministic PRNG shared by terrain generation and decorative scatter. */
export function terrainRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function finite(...values: number[]): void {
  if (!values.every(Number.isFinite)) throw new RangeError('Terrain coordinates and options must be finite');
}
function lattice(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), u = smooth(x - ix), v = smooth(z - iz);
  return mix(mix(lattice(ix, iz, seed), lattice(ix + 1, iz, seed), u),
    mix(lattice(ix, iz + 1, seed), lattice(ix + 1, iz + 1, seed), u), v);
}

export function createHeightField(opts: HeightFieldOptions = {}): HeightField {
  const seed = opts.seed ?? 1, segments = opts.segments ?? 512, maxReliefM = opts.maxReliefM ?? 600;
  const extent = opts.extentM ?? 40000;
  const extentM = typeof extent === 'number' ? { x: extent, z: extent } : { ...extent };
  finite(seed, segments, maxReliefM, extentM.x, extentM.z);
  if (!Number.isInteger(segments) || segments < 2 || segments > 2048 || extentM.x <= 0 || extentM.z <= 0 || maxReliefM < 0)
    throw new RangeError('Terrain requires 2–2048 cells, positive extent and non-negative relief');
  const rand = terrainRandom(seed), ox = rand() * 1000, oz = rand() * 1000;
  const cellXM = extentM.x / segments, cellZM = extentM.z / segments;
  const heights = new Float64Array((segments + 1) ** 2);
  const areas: FlattenedArea[] = [];
  const field: HeightField = {
    seed, segments, maxReliefM, extentM, cellXM, cellZM, heights, flattenedAreas: areas,
    flatten(x, z, radiusM, heightM) {
      finite(x, z, radiusM, heightM);
      if (radiusM <= 0) throw new RangeError('Flatten radius must be positive');
      // Include all corners of every cell intersecting the disc. Bilinear queries anywhere inside
      // the requested radius are then exactly flat, even for sub-cell target pads.
      const inner = radiusM + Math.hypot(cellXM, cellZM);
      const blend = Math.max(radiusM * 0.25, 2 * Math.max(cellXM, cellZM));
      const outerRadiusM = inner + blend;
      for (let iz = 0; iz <= segments; iz++) for (let ix = 0; ix <= segments; ix++) {
        const d = Math.hypot(ix * cellXM - extentM.x / 2 - x, iz * cellZM - extentM.z / 2 - z);
        if (d >= outerRadiusM) continue;
        const i = iz * (segments + 1) + ix;
        const weight = d <= inner ? 1 : 1 - smooth((d - inner) / blend);
        heights[i] = mix(heights[i], heightM, weight);
      }
      areas.push({ x, z, radiusM, heightM, outerRadiusM });
    },
  };
  // Broad valleys, folded ridges and smaller undulations. These are scenery choices, not geographic data.
  for (let iz = 0; iz <= segments; iz++) for (let ix = 0; ix <= segments; ix++) {
    const x = (ix * cellXM - extentM.x / 2) / 6000 + ox;
    const z = (iz * cellZM - extentM.z / 2) / 6000 + oz;
    const valley = noise(x * 0.55, z * 0.55, seed);
    let sum = 0, amplitude = 0.5, frequency = 1;
    for (let octave = 0; octave < 5; octave++) {
      const n = noise(x * frequency, z * frequency, seed + octave * 1013);
      const ridge = 1 - Math.abs(2 * n - 1);
      sum += amplitude * (0.45 * n + 0.55 * ridge * ridge);
      amplitude *= 0.5; frequency *= 2.07;
    }
    heights[iz * (segments + 1) + ix] = maxReliefM * clamp(sum * (0.35 + 0.65 * valley), 0, 1);
  }
  return field;
}

/** Bilinear sampling; queries outside the finite extent clamp to its nearest edge. */
export function heightAt(field: HeightField, x: number, z: number): number {
  finite(x, z);
  const n = field.segments;
  const gx = clamp((x + field.extentM.x / 2) / field.cellXM, 0, n);
  const gz = clamp((z + field.extentM.z / 2) / field.cellZM, 0, n);
  const ix = Math.min(n - 1, Math.floor(gx)), iz = Math.min(n - 1, Math.floor(gz));
  const u = gx - ix, v = gz - iz, i = iz * (n + 1) + ix, h = field.heights;
  return mix(mix(h[i], h[i + 1], u), mix(h[i + n + 1], h[i + n + 2], u), v);
}

/** Unit upward normal from finite differences (one-sided at edges). */
export function normalAt(field: HeightField, x: number, z: number): TerrainPoint {
  finite(x, z);
  const hx = field.extentM.x / 2, hz = field.extentM.z / 2;
  x = clamp(x, -hx, hx); z = clamp(z, -hz, hz);
  const x0 = Math.max(-hx, x - field.cellXM / 2), x1 = Math.min(hx, x + field.cellXM / 2);
  const z0 = Math.max(-hz, z - field.cellZM / 2), z1 = Math.min(hz, z + field.cellZM / 2);
  const nx = -(heightAt(field, x1, z) - heightAt(field, x0, z)) / (x1 - x0);
  const nz = -(heightAt(field, x, z1) - heightAt(field, x, z0)) / (z1 - z0);
  const length = Math.hypot(nx, 1, nz);
  return { x: nx / length, y: 1 / length, z: nz / length };
}
/** Inclination in radians: 0 = level, PI/2 = vertical. */
export function slopeAt(field: HeightField, x: number, z: number): number {
  return Math.acos(clamp(normalAt(field, x, z).y, 0, 1));
}

/**
 * True only when the whole segment (including endpoints) is strictly above the bilinear field.
 * Outside the map returns false: no terrain coverage means no confirmed clearance.
 * Every crossed cell is checked, including the quadratic interior minimum along diagonal rays;
 * stepM optionally adds subdivisions, so even a large step cannot jump over a narrow ridge.
 */
export function lineOfSight(field: HeightField, from: TerrainPoint, to: TerrainPoint, stepM?: number): boolean {
  finite(from.x, from.y, from.z, to.x, to.y, to.z);
  if (stepM !== undefined && (!Number.isFinite(stepM) || stepM <= 0)) throw new RangeError('LOS step must be positive');
  const hx = field.extentM.x / 2, hz = field.extentM.z / 2;
  if ([from, to].some(p => Math.abs(p.x) > hx || Math.abs(p.z) > hz)) return false;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const cuts = [0, 1];
  for (let i = 1; i < field.segments; i++) {
    if (dx !== 0) { const t = (i * field.cellXM - hx - from.x) / dx; if (t > 0 && t < 1) cuts.push(t); }
    if (dz !== 0) { const t = (i * field.cellZM - hz - from.z) / dz; if (t > 0 && t < 1) cuts.push(t); }
  }
  if (stepM !== undefined) {
    const count = Math.ceil(Math.hypot(dx, dy, dz) / stepM);
    if (count > 1000000) throw new RangeError('LOS step requests too many samples');
    for (let i = 1; i < count; i++) cuts.push(i / count);
  }
  cuts.sort((a, b) => a - b);
  const clearance = (t: number) => from.y + dy * t - heightAt(field, from.x + dx * t, from.z + dz * t);
  for (let i = 1; i < cuts.length; i++) {
    const t0 = cuts[i - 1], t1 = cuts[i], c0 = clearance(t0), c1 = clearance(t1);
    if (Math.min(c0, c1) <= 1e-7) return false;
    const cm = clearance((t0 + t1) / 2);
    const a = 2 * (c1 + c0 - 2 * cm), b = c1 - c0 - a;
    if (a > 0) {
      const u = -b / (2 * a);
      if (u > 0 && u < 1 && a * u * u + b * u + c0 <= 1e-7) return false;
    }
  }
  return true;
}
