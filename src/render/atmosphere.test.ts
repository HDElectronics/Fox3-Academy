import { describe, expect, it } from 'vitest';
import { Color, MeshStandardMaterial, Vector3 } from 'three';
import { createAtmosphereUniforms, MAX_PADS, patchHaze, patchSurface, W_ATMOS, W_CLOUD, W_LAND, W_NOISE } from './atmosphere';
import { polarDisc } from './environment';
import { paletteFromTheme, WORLD, type Palette } from './palette';

// Neutral stub palette (every key a grey Color), like the terrain tests.
const stub = new Proxy({}, { get: () => new Color().setScalar(0.5) }) as Palette;

/** Run a material's onBeforeCompile against a minimal fake of three's standard shader source. */
function compileFake(material: MeshStandardMaterial) {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: 'void main() {\n#include <begin_vertex>\n}',
    fragmentShader: [
      'void main() {', '#include <color_fragment>', '#include <roughnessmap_fragment>', '#include <normal_fragment_maps>',
      '#include <lights_fragment_end>', '#include <opaque_fragment>', '#include <tonemapping_fragment>', '}',
    ].join('\n'),
  };
  material.onBeforeCompile(shader as never, undefined as never);
  return shader;
}

// Identifiers a GLSL ES 3.00 compiler rejects (and words HLSL back ends have choked on).
const RESERVED = ['patch', 'sample', 'input', 'output', 'filter', 'common', 'partition', 'active', 'superp', 'smooth', 'flat', 'near', 'far', 'base'];
const declares = (src: string, word: string) => new RegExp(`\\b(float|vec[234]|int|bool|mat[234])\\s+${word}\\b`).test(src);

describe('world palette', () => {
  it('exposes every WORLD colour, linear, on the palette', () => {
    const p = paletteFromTheme(Object.fromEntries(['skyTop', 'skyHorizon', 'earth', 'missile', 'caution'].map(k => [k, '#808080'])) as never);
    for (const k of Object.keys(WORLD) as (keyof typeof WORLD)[]) {
      expect(p[k], k).toBeInstanceOf(Color);
      expect(p[k].getHexString(), k).toBe(new Color(WORLD[k]).getHexString());
    }
    // Derived world entries follow the world palette.
    expect(p.sea.equals(p.seaDeep)).toBe(true);
    expect(p.haze.equals(p.horizon)).toBe(true);
  });
});

describe('atmosphere shading', () => {
  it('shares one set of uniform objects and the sun direction', () => {
    const sun = new Vector3(0, 1, 0);
    const clock = { value: 3 };
    const u = createAtmosphereUniforms(stub, sun, clock, 60);
    expect(u.uSunDir.value).toBe(sun);
    expect(u.uClock).toBe(clock);
    expect(u.uHazeKm.value).toBe(60);
    expect(u.uCloudCover.value).toBe(0);
  });

  it('declares no reserved identifiers in any world GLSL', () => {
    for (const src of [W_NOISE, W_ATMOS, W_CLOUD, W_LAND]) for (const w of RESERVED) expect(declares(src, w), w).toBe(false);
  });

  it('patches the far ground and the terrain into distinct programs with every injection point', () => {
    const atmosphere = createAtmosphereUniforms(stub, new Vector3(0, 1, 0), { value: 0 });
    const ground = new MeshStandardMaterial(), terrain = new MeshStandardMaterial();
    patchSurface(ground, { kind: 'ground', atmosphere, grid: { uGridColor: { value: new Color() }, uGridKm: { value: 10 }, uGridAlpha: { value: 0.1 } } });
    patchSurface(terrain, { kind: 'terrain', atmosphere, reliefM: 380 });
    expect(ground.customProgramCacheKey()).not.toBe(terrain.customProgramCacheKey());
    expect(ground.defines).toHaveProperty('W_GROUND');
    expect(terrain.defines).toHaveProperty('W_TERRAIN');

    const g = compileFake(ground), t = compileFake(terrain);
    for (const s of [g, t]) {
      expect(s.vertexShader).toContain('vWorldPos = (modelMatrix');
      expect(s.fragmentShader).toContain('atmoApply(gl_FragColor.rgb, cameraPosition, vWorldPos)');
      expect(s.fragmentShader).toContain('wCloudShade(vWorldPos)');
      expect(s.uniforms.uSunDir).toBe(atmosphere.uSunDir);
      for (const w of RESERVED) expect(declares(s.fragmentShader, w), w).toBe(false);
    }
    expect(g.uniforms.uGridKm).toBeDefined();
    expect((t.uniforms.uPads!.value as unknown[]).length).toBe(MAX_PADS);
    expect(t.uniforms.uRelief!.value).toBe(380);
  });

  it('adds only the haze to plain lit materials', () => {
    const atmosphere = createAtmosphereUniforms(stub, new Vector3(0, 1, 0), { value: 0 });
    const m = new MeshStandardMaterial();
    patchHaze(m, atmosphere, 'runway');
    const s = compileFake(m);
    expect(s.fragmentShader).toContain('atmoApply(');
    expect(s.fragmentShader).not.toContain('wLand(');
    expect(m.customProgramCacheKey()).toContain('runway');
  });
});

describe('polarDisc', () => {
  it('covers the radius with upward-facing triangles, dense near the centre', () => {
    const g = polarDisc(2000, 0.05, 26, 48);
    const p = g.getAttribute('position'), idx = g.index!;
    let max = 0;
    for (let i = 0; i < p.count; i++) { max = Math.max(max, Math.hypot(p.getX(i), p.getZ(i))); expect(p.getY(i)).toBe(0); }
    expect(max).toBeCloseTo(2000, 3);
    const a = new Vector3(), b = new Vector3(), c = new Vector3();
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(p, idx.getX(i)); b.fromBufferAttribute(p, idx.getX(i + 1)); c.fromBufferAttribute(p, idx.getX(i + 2));
      expect(b.clone().sub(a).cross(c.clone().sub(a)).y).toBeGreaterThan(0);
    }
    // The first ring sits 50 m from the eye, so near-field varyings never span hundreds of km.
    expect(Math.hypot(p.getX(1), p.getZ(1))).toBeCloseTo(0.05, 6);
    g.dispose();
  });
});
