/**
 * [OWNER: page-radar-lab] Pure scan-geometry helpers for the Radar Lab (no DOM, unit-tested).
 * They mirror the sim's radar model (src/sim/radar.ts) so the console can show numbers for scan
 * settings the pilot has not selected yet (frame-time table, "what would this cover" readouts).
 */
import { AIRCRAFT } from '../../data/aircraft';
import type { AircraftId, AircraftSpec, RadarSpec } from '../../data/types';
import { D2R, M_PER_FT, M_PER_NM, MPS_PER_KT, R2D, clamp, lerp } from '../../sim/math';
import type { Units } from '../../app/format';

/** detectKm in the data is against this RCS (m²), as radar.ts REF_RCS_M2. */
export const REF_RCS = 5;

/** Frame time (s) for one full pattern: bars × width / scan rate, as radar.ts frameTimeFor. */
export function frameTime(r: RadarSpec, azHalfDeg: number, bars: number): number {
  return (bars * 2 * azHalfDeg) / r.scanRateDegPerS;
}

/** Longest wait between two looks at one spot: odd bar counts alternate the sweep direction. */
export function revisitTime(frame: number, bars: number): number {
  return frame * (bars % 2 === 1 ? 2 : 1);
}

/** Half-height (deg) of a bar pattern: bar centres ± half a beam at the edges. */
export function patternHalfDeg(r: RadarSpec, bars: number): number {
  return ((Math.max(1, bars) - 1) / 2) * r.barSpacingDeg + r.beamWidthDeg / 2;
}

/** Top / bottom (deg, rel horizon) of the bar pattern around the antenna elevation. */
export function patternLimitsDeg(r: RadarSpec, elCenterDeg: number, bars: number): { top: number; bottom: number } {
  const half = patternHalfDeg(r, bars);
  return { top: elCenterDeg + half, bottom: elCenterDeg - half };
}

/** Antenna elevation limit (deg) so the whole pattern stays inside the gimbal, as radar.ts clampCenters. */
export function elCenterLimitDeg(r: RadarSpec, bars: number): number {
  return Math.max(0, r.gimbalElDeg - patternHalfDeg(r, bars));
}

/** Scan-centre limit (deg) so the azimuth window stays inside the gimbal. */
export function azCenterLimitDeg(r: RadarSpec, azHalfDeg: number): number {
  return Math.max(0, r.gimbalAzDeg - Math.min(azHalfDeg, r.gimbalAzDeg));
}

/**
 * Altitude band covered at a horizontal range (flat earth): altitude ± range × tan(angle).
 * This is the "40 / 10" pair the VSD, DDI and FCR print beside the cursor.
 */
export function coverageAt(ownAltM: number, groundRangeM: number, topDeg: number, bottomDeg: number): { top: number; bottom: number } {
  const t = (d: number) => Math.tan(clamp(d, -83, 83) * D2R);
  return { top: ownAltM + groundRangeM * t(topDeg), bottom: ownAltM + groundRangeM * t(bottomDeg) };
}

/** Height (m) one degree of elevation spans at a horizontal range: the "1° ≈ 100 ft per nm" rule. */
export function metresPerDegree(groundRangeM: number): number {
  return groundRangeM * Math.tan(D2R);
}

/** Antenna elevation (deg) that points the scan centre at a height difference over a range (range-angle aiming). */
export function elevationFor(heightDiffM: number, groundRangeM: number): number {
  return Math.atan2(heightDiffM, Math.max(1, groundRangeM)) * R2D;
}

/** Detection range (km), as radar.ts detectionRange: head-on → tail by aspect, × look-down, × RCS^¼. */
export function detectKm(r: RadarSpec, targetType: AircraftId, aspectDeg: number, lookDown: boolean): number {
  const d = r.detectKm;
  const hot = d.headOn * (lookDown ? d.lookDownHeadOnFactor ?? d.lookDownFactor : 1);
  const cold = d.tail * (lookDown ? d.lookDownFactor : 1);
  let km = lerp(hot, cold, (1 - Math.cos(aspectDeg * D2R)) / 2);
  km *= Math.pow(Math.max(AIRCRAFT[targetType].rcsM2, 0.01) / (d.referenceRcsM2 ?? REF_RCS), 0.25);
  return km;
}

/** Half-width (deg) of the heading window that keeps a target inside a radial-speed gate: asin(gate / speed). */
export function beamWindowDeg(gateKts: number, groundSpeedKts: number): number {
  if (groundSpeedKts <= gateKts) return 90;
  return Math.asin(gateKts / groundSpeedKts) * R2D;
}

/**
 * F-16C A2 (±25°) and 3B exist only in TWS with a bugged or cursor target (data.md gotcha). The lab has
 * no bug, so they are shown but not selectable on the Viper.
 */
export function bugOnlyOptions(ac: AircraftId): { az: number[]; bars: number[] } {
  return ac === 'f16c' ? { az: [25], bars: [3] } : { az: [], bars: [] };
}

/** Detection now preserves the table's separate hot/cold look-down endpoints. */
export function lookDownCaveat(_ac: AircraftId, _short = false): string | null {
  return null;
}

/** Clock position of a relative bearing (deg, + right): '12 o\'clock', '1 o\'clock' … */
export function clock(azDeg: number): string {
  const n = ((Math.round(azDeg / 30) % 12) + 12) % 12;
  return `${n === 0 ? 12 : n} o'clock`;
}

/** Can this az/bar pair run in TWS (all three limits, as radar.ts fitTws checks)? */
export function twsAllows(r: RadarSpec, azHalfDeg: number, bars: number): boolean {
  const t = r.tws;
  if (!t) return false;
  if (r.twsPatterns) return r.twsPatterns.some(([a, b]) => a === azHalfDeg && b === bars);
  if (t.maxAzHalfWidthDeg !== undefined && azHalfDeg > t.maxAzHalfWidthDeg + 1e-9) return false;
  if (t.maxBars !== undefined && bars > t.maxBars) return false;
  if (t.maxFrameTimeS !== undefined && frameTime(r, azHalfDeg, bars) > t.maxFrameTimeS + 1e-9) return false;
  return true;
}

/**
 * TWS patterns DCS actually offers, where research lists them and they are stricter than the data's limits
 * (±az half-width, bars). F-14: only ±20° 4-bar and ±40° 2-bar (tomcat-thunder-mirage.md). F/A-18C: 2B up to
 * 80°, 4B up to 40°, 6B at 20° total, no 1B (hornet-viper.md). null = the data limits decide.
 */
export function twsPatterns(ac: AircraftId): readonly (readonly [number, number])[] | null {
  return AIRCRAFT[ac].radar.twsPatterns ?? null;
}

/**
 * The TWS pattern to use when the pilot picks a width or a bar count in TWS: the same width (or bars) with the
 * other value kept if DCS offers that pair, else the first listed pair. Null when the jet has no pattern list.
 */
export function twsPatternFor(ac: AircraftId, cur: { azHalfDeg: number; bars: number }, want: { azHalfDeg?: number; bars?: number }): { azHalfDeg: number; bars: number } | null {
  const pats = twsPatterns(ac);
  if (!pats) return null;
  const az = want.azHalfDeg ?? cur.azHalfDeg, bars = want.bars ?? cur.bars;
  const exact = pats.find(([a, b]) => a === az && b === bars);
  if (exact) return { azHalfDeg: exact[0], bars: exact[1] };
  const byWant = want.bars !== undefined && want.azHalfDeg === undefined
    ? pats.filter(([, b]) => b === bars).sort((x, y) => Math.abs(x[0] - az) - Math.abs(y[0] - az))
    : pats.filter(([a]) => a === az).sort((x, y) => Math.abs(x[1] - bars) - Math.abs(y[1] - bars));
  const pick = byWant[0] ?? [...pats].sort((x, y) => Math.abs(x[0] - az) - Math.abs(y[0] - az) || y[1] - x[1])[0];
  return { azHalfDeg: pick[0], bars: pick[1] };
}

export interface ScanCombo { azHalfDeg: number; bars: number; frame: number; revisit: number; tws: boolean; bugOnly: boolean }

/** Every width × bars pair this jet offers, with its frame time and whether TWS accepts it. */
export function scanCombos(ac: AircraftId): ScanCombo[] {
  const r = AIRCRAFT[ac].radar;
  const bug = bugOnlyOptions(ac);
  const out: ScanCombo[] = [];
  for (const a of [...r.azHalfWidthOptionsDeg].sort((x, y) => x - y)) {
    for (const b of [...r.barOptions].sort((x, y) => x - y)) {
      const f = frameTime(r, Math.min(a, r.gimbalAzDeg), b);
      const pats = twsPatterns(ac);
      const tws = twsAllows(r, a, b) && (!pats || pats.some(([pa, pb]) => pa === a && pb === b));
      out.push({ azHalfDeg: a, bars: b, frame: f, revisit: revisitTime(f, b), tws, bugOnly: bug.az.includes(a) || bug.bars.includes(b) });
    }
  }
  return out;
}

/** Shortest frame time the pilot can select (RWS, no bug-only options). */
export function minFrame(ac: AircraftId): number {
  const c = scanCombos(ac).filter(x => !x.bugOnly);
  return Math.min(...c.map(x => x.frame));
}

/** Can the pilot change the scan width / bars at all on this jet? */
export function scanFreedom(spec: AircraftSpec): { width: boolean; bars: boolean; positions: number[] | null } {
  const r = spec.radar;
  const ru = spec.display === 'ru-hud';
  return { width: r.azHalfWidthOptionsDeg.length > 1, bars: r.barOptions.length > 1, positions: ru ? [-30, 0, 30] : null };
}

/** Smallest display range (m) of the jet that is at least `needM`, else the largest. */
export function rangeScaleFor(r: RadarSpec, needM: number): number {
  const km = r.rangeScalesKm.find(k => k * 1000 >= needM) ?? r.rangeScalesKm[r.rangeScalesKm.length - 1];
  return km * 1000;
}

/** A round range for exercise text: the largest multiple of 5 km (metric) or 5 nm (imperial) not above `maxM`. */
export function niceRange(maxM: number, u: Units, step = 5): number {
  const unit = u === 'metric' ? 1000 : M_PER_NM;
  const n = Math.max(1, Math.floor(maxM / unit / step)) * step;
  return n * unit;
}

/** Round altitude for exercise text: whole thousands of feet (imperial) or hundreds of metres (metric). */
export function niceAlt(m: number, u: Units): number {
  return u === 'metric' ? Math.round(m / 100) * 100 : Math.round(m / M_PER_FT / 1000) * 1000 * M_PER_FT;
}

// ------------------------------------------------------------------------------------------ formatting

export const kt = (mps: number) => mps / MPS_PER_KT;
export const kmh = (mps: number) => mps * 3.6;

/** Signed degrees: '+3.5°' / '−12.0°'. */
export function sdeg(d: number, dp = 1): string {
  const v = Math.abs(d) < 0.05 ? 0 : d;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(dp) + '°';
}

/** Altitude in the pilot's units, with thousands separators: '9,000 m' / '30,000 ft'. */
export function alt(m: number, u: Units): string {
  if (u === 'metric') return (Math.round(m / 10) * 10).toFixed(0) + ' m';
  return (Math.round(m / M_PER_FT / 100) * 100).toFixed(0) + ' ft';
}

/** Compact altitude for tight spots: '9.0 km' / '30k ft'. */
export function altShort(m: number, u: Units): string {
  if (u === 'metric') return (m / 1000).toFixed(1) + ' km';
  const kft = m / M_PER_FT / 1000;
  return (Math.abs(kft) < 10 ? kft.toFixed(1) : Math.round(kft).toString()) + 'k ft';
}

/** Height difference, always with a sign: '+2,000 ft' / '−4.6 km'. */
export function dAlt(m: number, u: Units): string {
  const sign = m > 0 ? '+' : m < 0 ? '−' : '';
  if (u === 'metric') return sign + (Math.abs(m) >= 1000 ? (Math.abs(m) / 1000).toFixed(1) + ' km' : Math.round(Math.abs(m) / 10) * 10 + ' m');
  return sign + (Math.round(Math.abs(m) / M_PER_FT / 100) * 100).toFixed(0) + ' ft';
}

/** Range in the pilot's units: '35 km' / '19 nm' (one decimal under 10). */
export function rng(m: number, u: Units): string {
  const v = u === 'metric' ? m / 1000 : m / M_PER_NM;
  return (v < 9.95 ? v.toFixed(1) : Math.round(v).toString()) + (u === 'metric' ? ' km' : ' nm');
}

/** Range number only (for sliders and axes). */
export const rngValue = (m: number, u: Units) => (u === 'metric' ? m / 1000 : m / M_PER_NM);
export const rngUnit = (u: Units) => (u === 'metric' ? 'km' : 'nm');
export const rngToM = (v: number, u: Units) => (u === 'metric' ? v * 1000 : v * M_PER_NM);

/** Speed as a pilot reads a gate: '54 kt (100 km/h)' in both unit systems, knots first for imperial. */
export function gateText(mps: number, u: Units): string {
  const k = Math.round(kt(mps)), h = Math.round(kmh(mps) / 5) * 5;
  return u === 'metric' ? `${h} km/h (${k} kt)` : `${k} kt (${h} km/h)`;
}

/** Radial speed readout in the pilot's units. */
export function speedText(mps: number, u: Units): string {
  return u === 'metric' ? Math.round(kmh(mps)) + ' km/h' : Math.round(kt(mps)) + ' kt';
}

export function seconds(s: number): string {
  return (s < 9.95 ? s.toFixed(1) : Math.round(s).toString()) + ' s';
}
