/**
 * Colours for WebGL, derived from the design tokens (styles/tokens.css via ui/theme.ts readTheme()).
 * Nothing here is a design colour of its own: every entry is a token or a mix of tokens.
 */
import { Color } from 'three';
import type { Side } from '../sim/types';
import { readTheme, type Theme } from '../ui/theme';

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
    sea: mix(earth, skyTop, 0.42).lerp(skyHorizon, 0.08),
    haze: skyHorizon.clone(),
    smoke: mix(skyHorizon, missile, 0.55),
    soot: mix(screen, earth, 0.35),
    sun: mix(missile, caution, 0.12),
    canopy: mix(screen, skyTop, 0.35),
    dark: mix(screen, earth, 0.25),
  };
}

/** Read the live tokens (call after the cockpit skin is set). */
export function readPalette(el?: Element): Palette {
  return paletteFromTheme(readTheme(el));
}

export function sideColor(p: Palette, side: VisualSide): Color {
  return side === 'blue' ? p.friendly : side === 'red' ? p.hostile : p.neutral;
}
