/** Pilot-facing unit formatting. Russian jets default to metric, Western to imperial. */
import { M_PER_FT, M_PER_NM, MPS_PER_KT } from '../sim/math';
import { mach as machOf } from '../sim/atmosphere';

export type Units = 'metric' | 'imperial';

export const fmtRange = (m: number, u: Units, dp = 0) =>
  u === 'metric' ? (m / 1000).toFixed(dp) + ' km' : (m / M_PER_NM).toFixed(dp) + ' nm';
export const rangeValue = (m: number, u: Units) => (u === 'metric' ? m / 1000 : m / M_PER_NM);
export const rangeUnit = (u: Units) => (u === 'metric' ? 'km' : 'nm');

export const fmtAlt = (m: number, u: Units) =>
  u === 'metric' ? Math.round(m / 10) * 10 + ' m' : Math.round(m / M_PER_FT / 100) * 100 + ' ft';
export const fmtAltShort = (m: number, u: Units) =>
  u === 'metric' ? (m / 1000).toFixed(1) + 'k' : Math.round(m / M_PER_FT / 1000) + 'k';

export const fmtSpeed = (mps: number, u: Units) =>
  u === 'metric' ? Math.round(mps * 3.6) + ' km/h' : Math.round(mps / MPS_PER_KT) + ' kt';
export const fmtMach = (mps: number, alt: number) => 'M' + machOf(mps, alt).toFixed(2);

export const fmtDeg = (rad: number, dp = 0) => ((rad * 180) / Math.PI).toFixed(dp) + '°';
export const fmtTime = (s: number) =>
  String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
/** Clock-code bearing: rad rel nose → "2 o'clock". */
export function clockCode(rel: number): string {
  let h = Math.round(((rel * 180) / Math.PI) / 30);
  h = ((h % 12) + 12) % 12;
  return (h === 0 ? 12 : h) + " o'clock";
}
