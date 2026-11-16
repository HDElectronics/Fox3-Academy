/**
 * Colours for WebGL, derived from the design tokens (styles/tokens.css via ui/theme.ts readTheme()).
 * Symbology and UI colours are tokens or mixes of tokens. The world (sky, sea, land, clouds) has its own
 * small palette below, `WORLD`: a clear high-altitude day that both cockpit skins share, kept muted so
 * the token-coloured symbology stays on top.
 */
import { Color } from 'three';
import type { Side } from '../sim/types';
import { readTheme, type Theme } from '../ui/theme';

/**
 * World colours (sRGB hex). Muted and slightly desaturated so the symbology stays the most saturated thing
 * on screen. Field colours are albedos: the lighting and the haze set what the eye finally sees.
 */
export const WORLD = {
  /** Zenith seen from altitude: deeper than --sky-top. */
  zenith: '#173f86',
  /** Clear blue some 20° above the horizon. */
  skyMid: '#4f86cc',
  /** Bright warm-white band on the horizon. */
  horizon: '#e6e7e1',
  /** Air between the eye and the ground far below: blue-grey. */
  airHaze: '#9fb6cb',
  /** Direct sunlight (slightly warm white). */
  sunlight: '#fff3df',
  cloudLit: '#ffffff',
  cloudShade: '#8d9fb4',
  seaDeep: '#173954',
  seaShallow: '#2b6576',
  /** Field patchwork: pasture, young crop, straw, ploughed soil. */
  fieldA: '#647549',
  fieldB: '#7d8754',
  fieldC: '#9e966a',
  fieldD: '#786b56',
  forest: '#34482c',
  scrub: '#6b6c49',
  soil: '#8f805d',
  rock: '#8a867b',
  sand: '#c6b78d',
} as const;

export interface Palette {
  friendly: Color;
  hostile: Color;
  neutral: Color;
  missile: Color;
  datalink: Color;
  sym: Color;
  symDim: Color;
  symHi: Color;
  caution: Color;
  warning: Color;
  ok: Color;
  screen: Color;
  skyTop: Color;
  skyHorizon: Color;
  earth: Color;
  /** Derived: open sea far below (earth pulled toward the zenith blue, desaturated). */
  sea: Color;
  /** Derived: distance haze (the horizon token). */
  haze: Color;
  /** Derived: smoke and chaff grey. */
  smoke: Color;
  /** Derived: dark soot for explosions. */
  soot: Color;
  /** Derived: sun disc / glow tint. */
  sun: Color;
  /** Derived: canopy glass tint. */
  canopy: Color;
  /** Derived: nozzles, intake mouths. */
  dark: Color;
  // ---- World (WORLD above, linear). Flat fields so a stub palette still works in tests.
  zenith: Color;
  skyMid: Color;
  horizon: Color;
  airHaze: Color;
  sunlight: Color;
  cloudLit: Color;
  cloudShade: Color;
  seaDeep: Color;
  seaShallow: Color;
  fieldA: Color;
  fieldB: Color;
  fieldC: Color;
  fieldD: Color;
  forest: Color;
  scrub: Color;
  soil: Color;
  rock: Color;
  sand: Color;
}

/** Visual side of an entity. 'neutral' is for galleries and the hangar. */
export type VisualSide = Side | 'neutral';

let warned = false;
function col(v: string, name: string): Color {
  const c = new Color();
  if (!v) {
    if (!warned) { console.warn(`render: design token ${name} is empty; is styles/tokens.css loaded?`); warned = true; }
    return c.setScalar(0.5);
  }
  return c.set(v);
}

const mix = (a: Color, b: Color, k: number) => a.clone().lerp(b, k);

export function paletteFromTheme(t: Theme): Palette {
  const skyTop = col(t.skyTop, '--sky-top');
  const skyHorizon = col(t.skyHorizon, '--sky-horizon');
  const earth = col(t.earth, '--earth');
  const screen = col(t.screen, '--screen');
  const missile = col(t.missile, '--missile');
  const caution = col(t.caution, '--caution');
  const panelMuted = col(t.panelMuted, '--panel-muted');
  const w = (k: keyof typeof WORLD) => new Color(WORLD[k]);
  const seaDeep = w('seaDeep'), horizon = w('horizon');
  return {
    friendly: col(t.friendly, '--friendly'),
    hostile: col(t.hostile, '--hostile'),
    neutral: mix(panelMuted, missile, 0.35),
    missile,
    datalink: col(t.datalink, '--datalink'),
    sym: col(t.sym, '--sym'),
    symDim: col(t.symDim, '--sym-dim'),
    symHi: col(t.symHi, '--sym-hi'),
    caution,
    warning: col(t.warning, '--warning'),
    ok: col(t.ok, '--ok'),
    screen,
    skyTop,
    skyHorizon,
    earth,
    sea: seaDeep.clone(),
    haze: horizon.clone(),
    smoke: mix(skyHorizon, missile, 0.55),
    soot: mix(screen, earth, 0.35),
    sun: mix(missile, caution, 0.12),
    canopy: mix(screen, skyTop, 0.35),
    dark: mix(screen, earth, 0.25),
    zenith: w('zenith'), skyMid: w('skyMid'), horizon, airHaze: w('airHaze'), sunlight: w('sunlight'),
    cloudLit: w('cloudLit'), cloudShade: w('cloudShade'), seaDeep, seaShallow: w('seaShallow'),
    fieldA: w('fieldA'), fieldB: w('fieldB'), fieldC: w('fieldC'), fieldD: w('fieldD'),
    forest: w('forest'), scrub: w('scrub'), soil: w('soil'), rock: w('rock'), sand: w('sand'),
  };
}

/** Read the live tokens (call after the cockpit skin is set). */
export function readPalette(el?: Element): Palette {
  return paletteFromTheme(readTheme(el));
}

export function sideColor(p: Palette, side: VisualSide): Color {
  return side === 'blue' ? p.friendly : side === 'red' ? p.hostile : p.neutral;
}
