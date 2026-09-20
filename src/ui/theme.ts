/**
 * Read design tokens (styles/tokens.css) for canvas 2D and three.js code, which cannot use CSS vars.
 * The cockpit skin changes when the aircraft changes; pages are remounted then, so reading once at
 * mount is enough. Call readTheme() again if you keep a long-lived renderer.
 */
export interface Theme {
  ground: string; groundInk: string; groundMuted: string; panel: string; panel2: string; panel3: string; panelInk: string; panelMuted: string; panelLine: string; placard: string;
  screen: string; screen2: string; screenLine: string; sym: string; symDim: string; symHi: string; symInk: string;
  btn: string; btnInk: string; btnOn: string; btnOnInk: string;
  caution: string; warning: string; ok: string; friendly: string; hostile: string; missile: string; datalink: string;
  skyTop: string; skyHorizon: string; earth: string;
  fontDisplay: string; fontBody: string; fontMono: string;
  cockpit: 'ru' | 'us';
}

const MAP: Record<keyof Omit<Theme, 'cockpit'>, string> = {
  ground: '--ground', groundInk: '--ground-ink', groundMuted: '--ground-muted', panel: '--panel', panel2: '--panel-2', panel3: '--panel-3', panelInk: '--panel-ink', panelMuted: '--panel-muted',
  panelLine: '--panel-line', placard: '--placard', screen: '--screen', screen2: '--screen-2', screenLine: '--screen-line',
  sym: '--sym', symDim: '--sym-dim', symHi: '--sym-hi', symInk: '--sym-ink', btn: '--btn', btnInk: '--btn-ink', btnOn: '--btn-on',
  btnOnInk: '--btn-on-ink', caution: '--caution', warning: '--warning', ok: '--ok', friendly: '--friendly', hostile: '--hostile',
  missile: '--missile', datalink: '--datalink', skyTop: '--sky-top', skyHorizon: '--sky-horizon', earth: '--earth',
  fontDisplay: '--font-display', fontBody: '--font-body', fontMono: '--font-mono',
};

export function readTheme(el: Element = document.documentElement): Theme {
  const cs = getComputedStyle(el);
  const out = { cockpit: (document.documentElement.dataset.cockpit === 'ru' ? 'ru' : 'us') } as Theme;
  for (const [k, v] of Object.entries(MAP)) (out as unknown as Record<string, string>)[k] = cs.getPropertyValue(v).trim();
  return out;
}

/** 'rgba()' from a '#rrggbb' token and an alpha. */
export function alpha(hex: string, a: number): string {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map(c => c + c).join('') : m, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
