/** International Standard Atmosphere, good to ~20 km. SI units. */
const T0 = 288.15, P0 = 101325, RHO0 = 1.225, L = 0.0065, R = 287.053, GAMMA = 1.4, G = 9.80665;
const H_TROP = 11000, T_TROP = T0 - L * H_TROP;
const P_TROP = P0 * Math.pow(T_TROP / T0, G / (L * R));

export function temperature(alt: number): number {
  return alt < H_TROP ? T0 - L * Math.max(alt, 0) : T_TROP;
}
export function pressure(alt: number): number {
  const h = Math.max(alt, 0);
  if (h < H_TROP) return P0 * Math.pow((T0 - L * h) / T0, G / (L * R));
  return P_TROP * Math.exp(-G * (h - H_TROP) / (R * T_TROP));
}
export function density(alt: number): number {
  return pressure(alt) / (R * temperature(alt));
}
export function soundSpeed(alt: number): number {
  return Math.sqrt(GAMMA * R * temperature(alt));
}
export function mach(speed: number, alt: number): number {
  return speed / soundSpeed(alt);
}
export function speedFromMach(m: number, alt: number): number {
  return m * soundSpeed(alt);
}
/** Density ratio σ = ρ/ρ0. */
export function sigma(alt: number): number {
  return density(alt) / RHO0;
}
