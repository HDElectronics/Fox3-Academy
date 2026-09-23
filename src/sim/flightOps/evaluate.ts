/**
 * [OWNER: sim] Pattern grading: live approach geometry, gates in flight order, and a debrief score.
 *
 * Gates (a gate only appears once the aircraft reaches it, so a lesson started on final has fewer gates):
 * - initial: crossing the threshold northbound. Altitude ±100 ft, speed ±20 kt of the published numbers.
 * - break: a left turn of 45°+ bank that starts over or past the runway. Peak g within ±0.75 of the break g.
 * - downwind, abeam: checked when abeam the aim point southbound. Altitude ±50 ft; distance ±0.2 nm;
 *   gear down and landing flaps.
 * - ninety: heading passes east in the final turn. Gear down, AoA in the band.
 * - groove: entering the last 1 nm. Graded at touchdown: on speed 60 %+ of the final, glide RMS ≤ 0.7°,
 *   lineup RMS ≤ 1°.
 * - touchdown: no crash, sink rate ≤ 4.5 m/s, inside the zone. Zone (a trainer choice): from 350 ft short of
 *   to 1000 ft past the aim point, and never short of the threshold.
 */
import { M_PER_FT, M_PER_NM, MPS_PER_KT, R2D, D2R, clamp } from '../math';
import { aimPointM, aoaCue, loadFactor } from './model';
import {
  RUNWAY, type ApproachGeometry, type ApproachScore, type FlightOpsJetData, type FlightOpsState, type GateId,
  type GateResult,
} from './types';

export const TOUCHDOWN_ZONE_FT = { short: 350, long: 1000 } as const;
const FINAL_M = M_PER_NM;

/** Touchdown zone along z (runway frame): [near, far] = [zMax, zMin]. */
export function touchdownZone(d: FlightOpsJetData): { zNear: number; zFar: number } {
  const aim = aimPointM(d);
  return { zNear: -Math.max(0, aim - TOUCHDOWN_ZONE_FT.short * M_PER_FT), zFar: -(aim + TOUCHDOWN_ZONE_FT.long * M_PER_FT) };
}

export function approachGeometry(s: FlightOpsState, d: FlightOpsJetData): ApproachGeometry {
  const rangeM = s.pos.z + aimPointM(d);
  const glideErrDeg = Math.atan2(s.pos.y, Math.max(rangeM, 1)) * R2D - d.glideDeg.value;
  // Lineup angle as a localizer at the far end of the runway sees it.
  const lineupErrDeg = Math.atan2(s.pos.x, s.pos.z + RUNWAY.lengthM) * R2D;
  const headingOk = Math.abs(Math.atan2(Math.sin(s.heading), Math.cos(s.heading))) < 30 * D2R;
  const onFinal = s.phase === 'air' && rangeM > 0 && rangeM <= FINAL_M && headingOk && Math.abs(s.pos.x) < 600;
  return { rangeM, glideErrDeg, lineupErrDeg, onFinal };
}

const ft = (m: number) => Math.round(m / M_PER_FT);
const kts = (ms: number) => Math.round(ms / MPS_PER_KT);

const LABELS: Record<GateId, string> = {
  initial: 'Initial', break: 'Break', downwind: 'Downwind', abeam: 'Abeam', ninety: 'Ninety', groove: 'Groove',
  touchdown: 'Touchdown',
};

export class ApproachEvaluator {
  private readonly gates = new Map<GateId, GateResult>();
  private prev: { z: number; heading: number; t: number } | null = null;
  private breakStart: { t: number; z: number } | null = null;
  private breakPeakG = 0;
  private breakMaxBank = 0;
  private grooveAt: number | null = null;
  private finalT = 0;
  private onSpeedT = 0;
  private glideSq = 0;
  private glideSum = 0;
  private lineupSq = 0;
  private lineupSum = 0;
  private done = false;
  private crash: string | null = null;

  constructor(private readonly d: FlightOpsJetData) {}

  private pass(id: GateId, t: number, ok: boolean, notes: string[]) {
    if (!this.gates.has(id)) this.gates.set(id, { id, label: LABELS[id], passedAt: t, ok, notes });
  }

  update(s: FlightOpsState): void {
    if (this.done) return;
    const d = this.d;
    const p = this.prev;
    const dt = p ? Math.max(0, s.t - p.t) : 0;
    const north = Math.abs(Math.atan2(Math.sin(s.heading), Math.cos(s.heading))) < 45 * D2R;
    const south = Math.abs(Math.atan2(Math.sin(s.heading - Math.PI), Math.cos(s.heading - Math.PI))) < 45 * D2R;
    const aim = aimPointM(d);

    if (s.phase === 'air' && p) {
      // Initial: crossing the threshold northbound, gear up.
      if (!this.gates.has('initial') && p.z > 0 && s.pos.z <= 0 && north && !s.gearDown && !this.gates.has('groove')) {
        const alt = ft(s.pos.y), want = d.pattern.initialAltFt.value;
        const spd = kts(s.speed), wantKt = d.pattern.initialKt.value;
        this.pass('initial', s.t, Math.abs(alt - want) <= 100 && Math.abs(spd - wantKt) <= 20,
          [`${alt} ft, want ${want} ±100`, `${spd} kt, want ${wantKt} ±20`]);
      }
      // Break: start, then graded when the turn reaches south.
      if (!this.breakStart && !this.gates.has('break') && this.gates.has('initial') && s.bank < -45 * D2R) {
        this.breakStart = { t: s.t, z: s.pos.z };
      }
      if (this.breakStart && !this.gates.has('break')) {
        this.breakPeakG = Math.max(this.breakPeakG, loadFactor(s, d));
        this.breakMaxBank = Math.max(this.breakMaxBank, -s.bank);
        if (south) {
          const want = d.pattern.breakG.value;
          const g = Math.round(this.breakPeakG * 10) / 10;
          const where = this.breakStart.z <= 0;
          const past = Math.round(-this.breakStart.z / M_PER_FT);
          this.gates.set('break', {
            id: 'break', label: LABELS.break, passedAt: this.breakStart.t,
            ok: where && Math.abs(g - want) <= 0.75,
            notes: [`${g} g peak, want ${want}`, where ? `Broke ${past} ft past the threshold` : 'Broke short of the threshold',
              `${Math.round(this.breakMaxBank * R2D)}° bank`],
          });
        }
      }
      // Downwind and abeam: crossing abeam the aim point southbound.
      if (!this.gates.has('abeam') && south && s.pos.x < 0 && p.z < -aim && s.pos.z >= -aim) {
        const alt = ft(s.pos.y), want = d.pattern.downwindAltFt.value;
        const cfg = s.gearDown && s.flapIndex >= d.landingFlap;
        this.pass('downwind', s.t, Math.abs(alt - want) <= 50,
          [`${alt} ft, want ${want} ±50`, `${kts(s.speed)} kt`]);
        const nm = Math.round((-s.pos.x / M_PER_NM) * 100) / 100, wantNm = d.pattern.abeamNm.value;
        this.pass('abeam', s.t, Math.abs(nm - wantNm) <= 0.2 && cfg,
          [`${nm} nm abeam, want ${wantNm} ±0.2`, cfg ? 'Gear down, landing flaps' : 'Not configured: gear and landing flaps']);
      }
      // Ninety: heading passes east in the final turn.
      if (!this.gates.has('ninety') && this.gates.has('abeam') && s.pos.x < 0 && p.heading > Math.PI / 2 && p.heading < Math.PI * 1.1 && s.heading <= Math.PI / 2 && s.heading > 0) {
        const cue = aoaCue(s, d);
        this.pass('ninety', s.t, s.gearDown && cue === 'on',
          [`${ft(s.pos.y)} ft`, `AoA ${s.aoa.toFixed(1)} ${d.aoa.unit === 'deg' ? '°' : 'units'} (${cue === 'on' ? 'on speed' : cue})`]);
      }
    }

    // Final samples.
    const g = approachGeometry(s, d);
    if (g.onFinal && s.gearDown && g.rangeM > 0.1 * M_PER_NM) {
      if (this.grooveAt === null) this.grooveAt = s.t;
      this.finalT += dt;
      if (aoaCue(s, d) === 'on') this.onSpeedT += dt;
      this.glideSq += g.glideErrDeg ** 2 * dt; this.glideSum += g.glideErrDeg * dt;
      this.lineupSq += g.lineupErrDeg ** 2 * dt; this.lineupSum += g.lineupErrDeg * dt;
    }

    if (s.phase !== 'air' && (s.touchdown || s.phase === 'crashed')) this.finish(s);
    this.prev = { z: s.pos.z, heading: s.heading, t: s.t };
  }

  private finish(s: FlightOpsState) {
    this.done = true;
    this.crash = s.phase === 'crashed' ? (s.crashReason ?? 'Crashed') : null;
    const d = this.d;
    const f = this.finals();
    if (this.grooveAt !== null) {
      this.pass('groove', this.grooveAt,
        (f.onSpeed ?? 0) >= 0.6 && (f.glide ?? 9) <= 0.7 && (f.lineup ?? 9) <= 1,
        [
          `On speed ${Math.round((f.onSpeed ?? 0) * 100)} % of the final`,
          `Glide path ${(f.glide ?? 0).toFixed(2)}° RMS`,
          `Lineup ${(f.lineup ?? 0).toFixed(2)}° RMS`,
        ]);
    }
    const td = s.touchdown;
    const notes: string[] = [];
    let ok = false;
    if (td) {
      const zone = touchdownZone(d);
      const past = Math.round(-td.z / M_PER_FT);
      notes.push(`${past} ft past the threshold, aim ${d.aimPointFt.value}`, `${Math.round(td.vsMs * 196.85)} ft/min`);
      ok = s.phase !== 'crashed' && td.z <= zone.zNear && td.z >= zone.zFar;
    }
    if (s.phase === 'crashed') notes.push(s.crashReason ?? 'Crashed');
    this.pass('touchdown', td?.t ?? s.t, ok, notes);
  }

  private finals() {
    if (this.finalT <= 0) return { onSpeed: null, glide: null, lineup: null, glideMean: 0, lineupMean: 0 };
    return {
      onSpeed: this.onSpeedT / this.finalT,
      glide: Math.sqrt(this.glideSq / this.finalT),
      lineup: Math.sqrt(this.lineupSq / this.finalT),
      glideMean: this.glideSum / this.finalT,
      lineupMean: this.lineupSum / this.finalT,
    };
  }

  /** Whether the touchdown landed in the zone (null before touchdown). */
  private inZone(): boolean | null {
    const g = this.gates.get('touchdown');
    if (!g) return null;
    return g.ok;
  }

  score(): ApproachScore {
    const f = this.finals();
    const gates = [...this.gates.values()].sort((a, b) => a.passedAt - b.passedAt);
    const touchdownInZone = this.inZone();
    const base: ApproachScore = {
      gates, glideRmsDeg: f.glide, lineupRmsDeg: f.lineup, onSpeedFraction: f.onSpeed, touchdownInZone,
      total: null, verdict: null,
    };
    if (!this.done) return base;
    if (this.crash) return { ...base, total: 0, verdict: `Crashed: ${this.crash.toLowerCase()}.` };

    const okCount = gates.filter(g => g.ok).length;
    let total = (56 * okCount) / Math.max(1, gates.length);
    total += f.glide === null ? 0 : 14 * clamp(1 - f.glide / 1.0, 0, 1);
    total += f.lineup === null ? 0 : 10 * clamp(1 - f.lineup / 1.5, 0, 1);
    total += 10 * (f.onSpeed ?? 0);
    total += touchdownInZone ? 10 : 0;
    total = Math.round(clamp(total, 0, 100));

    const faults: string[] = [];
    if (f.glide !== null && f.glide > 0.5) faults.push(f.glideMean > 0 ? 'high in the groove' : 'low in the groove');
    if (f.lineup !== null && f.lineup > 0.8) faults.push(f.lineupMean > 0 ? 'right of centreline' : 'left of centreline');
    if (f.onSpeed !== null && f.onSpeed < 0.6) faults.push('off speed on final');
    if (!touchdownInZone) faults.push('touchdown outside the zone');
    if (!faults.length) faults.push(...gates.filter(g => !g.ok).map(g => `${g.label.toLowerCase()} out of limits`));
    const head = total >= 85 ? 'Good pass' : total >= 70 ? 'Fair pass' : total >= 50 ? 'Below average pass' : 'Poor pass';
    const verdict = faults.length ? `${head}: ${faults.join(', ')}.` : `${head}. On speed, on glide path, in the zone.`;
    return { ...base, total, verdict };
  }
}
