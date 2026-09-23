/**
 * [OWNER: page-flight-ops] Canvas displays for the pattern and landing page: a simplified HUD, the AoA
 * indexer and a top-down pattern trace. Colours from design tokens (readTheme via Surface), mono font.
 */
import { Surface } from '../../ui/displays/surface';
import { alpha } from '../../ui/theme';
import { RUNWAY, approachGeometry, aoaCue, type FlightOpsJetData, type FlightOpsState, type GateResult } from '../../sim/flightOps';
import { R2D } from '../../sim/math';
import { aoaText, ftOf, gateState, indexerLamps, kt, lampToken, type PlannedGate } from './logic';

function tokenColor(s: Surface, t: 'ok' | 'caution' | 'warning' | 'neutral'): string {
  const th = s.theme;
  return t === 'ok' ? th.ok : t === 'caution' ? th.caution : t === 'warning' ? th.warning : th.groundInk;
}

// ------------------------------------------------------------------ HUD

/**
 * Simplified HUD: horizon and pitch ladder, the glide line (−glideDeg), the flight path marker, the jet's
 * AoA cue (E-bracket on the F/A-18C, AoA bracket on the F-16C, GSUP/GSDN text on the F-15C), speed,
 * altitude AGL and the gear/flap state.
 */
export class HudDisplay {
  private readonly s: Surface;
  private last: FlightOpsState | null = null;
  constructor(canvas: HTMLCanvasElement, private readonly d: FlightOpsJetData) {
    this.s = new Surface(canvas);
    this.s.onResize = () => { if (this.last) this.draw(this.last); };
  }

  draw(st: FlightOpsState): void {
    this.last = st;
    const s = this.s;
    if (!s.begin()) return;
    const { ctx, w, h, theme: th } = s;
    const d = this.d;
    ctx.fillStyle = th.screen;
    ctx.fillRect(0, 0, w, h);
    const k = h / 26;                       // px per degree
    const cx = w / 2;
    // Keep the flight path marker near the middle: it is what the pilot flies on the approach.
    const fy = h * 0.52;
    const cy = fy - (st.pitch - st.gamma) * R2D * k;   // boresight
    const pitchD = st.pitch * R2D;
    const fs = Math.max(10, Math.round(h / 17));
    ctx.font = `${fs}px ${th.fontMono}`;
    ctx.textBaseline = 'middle';
    ctx.lineCap = 'round';
    ctx.shadowColor = th.sym;
    ctx.shadowBlur = 3;

    // Ladder rotates with bank about the boresight.
    // Fixed text zones: speed box column (left), altitude box column (right), two text rows at the bottom.
    // The ladder is clipped out of them so numbers never collide.
    const bw = fs * 3.6, bh = fs * 1.5, by0 = h * 0.3 - bh / 2;
    const colW = 8 + bw + 6, textTop = h - fs * 2.6;
    ctx.save();
    ctx.beginPath(); ctx.rect(colW, 0, w - 2 * colW, textTop); ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-st.bank);
    const yOf = (elev: number) => (pitchD - elev) * k;
    ctx.strokeStyle = th.sym; ctx.fillStyle = th.sym; ctx.lineWidth = 1.5;
    // Horizon.
    ctx.beginPath(); ctx.moveTo(-w, yOf(0)); ctx.lineTo(-w * 0.08, yOf(0)); ctx.moveTo(w * 0.08, yOf(0)); ctx.lineTo(w, yOf(0)); ctx.stroke();
    for (let e = -20; e <= 20; e += 5) {
      if (e === 0) continue;
      const y = yOf(e), half = w * 0.14;
      ctx.setLineDash(e < 0 ? [5, 4] : []);
      ctx.beginPath(); ctx.moveTo(-half, y); ctx.lineTo(-half * 0.35, y); ctx.moveTo(half * 0.35, y); ctx.lineTo(half, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'left'; ctx.fillText(String(Math.abs(e)), half + 4, y);
    }
    // Glide line: the depression line the marker sits on in the groove.
    const gy = yOf(-d.glideDeg.value);
    ctx.strokeStyle = th.symHi; ctx.lineWidth = 1.5; ctx.setLineDash([10, 6]);
    const gl = Math.max(20, w / 2 - colW - fs * 2.6);
    ctx.beginPath(); ctx.moveTo(-gl, gy); ctx.lineTo(gl, gy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = th.symHi; ctx.textAlign = 'left'; ctx.fillText(`−${d.glideDeg.value}°`, gl + 4, gy);
    ctx.restore();

    // Waterline (boresight).
    ctx.strokeStyle = th.sym; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 16, cy); ctx.lineTo(cx - 8, cy); ctx.lineTo(cx - 4, cy + 5); ctx.lineTo(cx, cy);
    ctx.lineTo(cx + 4, cy + 5); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx + 16, cy); ctx.stroke();

    // Flight path marker (vertical offset only: the trainer has no sideslip or wind).
    const fx = cx;
    const r = Math.max(5, h / 34);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.moveTo(fx - r, fy); ctx.lineTo(fx - r * 2.4, fy); ctx.moveTo(fx + r, fy); ctx.lineTo(fx + r * 2.4, fy);
    ctx.moveTo(fx, fy - r); ctx.lineTo(fx, fy - r * 1.9); ctx.stroke();

    // AoA cue beside the marker.
    const gear = st.gearDown && st.phase === 'air';
    if (d.id === 'f15c') {
      const g = approachGeometry(st, d);
      const near = g.rangeM > 0 && g.rangeM < 4 * 1852 && Math.cos(st.heading) > 0.8;
      if (near && st.phase === 'air') {
        const cue = g.glideErrDeg > 0.35 ? 'GSDN' : g.glideErrDeg < -0.35 ? 'GSUP' : '';
        if (cue) { ctx.fillStyle = th.symHi; ctx.textAlign = 'center'; ctx.fillText(cue, cx, h * 0.72); }
      }
    } else if (gear) {
      const [lo, hi] = d.aoa.band.value;
      const on = (lo + hi) / 2;
      const kb = (r * 3) / Math.max(0.5, hi - on);   // bracket half-height ≈ 3 marker radii
      const off = Math.max(-r * 6, Math.min(r * 6, (st.aoa - on) * kb));
      const by = fy - off, bx = fx - r * 3.4, half = (hi - on) * kb;
      ctx.strokeStyle = th.symHi; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx + 6, by - half); ctx.lineTo(bx, by - half); ctx.lineTo(bx, by + half); ctx.lineTo(bx + 6, by + half);
      ctx.moveTo(bx, by); ctx.lineTo(bx + 5, by); ctx.stroke();
    }

    // Speed and altitude boxes, AoA, configuration.
    ctx.shadowBlur = 2;
    ctx.fillStyle = th.sym; ctx.strokeStyle = th.sym; ctx.lineWidth = 1;
    ctx.strokeRect(8, by0, bw, bh); ctx.strokeRect(w - 8 - bw, by0, bw, bh);
    ctx.textAlign = 'center';
    ctx.fillText(String(kt(st.speed)), 8 + bw / 2, by0 + bh / 2);
    ctx.fillText(String(Math.max(0, ftOf(st.pos.y))), w - 8 - bw / 2, by0 + bh / 2);
    ctx.font = `${Math.round(fs * 0.8)}px ${th.fontMono}`;
    ctx.fillText('KT', 8 + bw / 2, by0 + bh + fs * 0.7);
    ctx.fillText('FT AGL', w - 8 - bw / 2, by0 + bh + fs * 0.7);
    ctx.textAlign = 'left';
    ctx.fillText(`α ${aoaText(d, st.aoa)}`, 8, h - fs * 1.9);
    const flap = d.flapLabels[st.flapIndex] ?? '';
    ctx.fillText(`${st.gearDown ? (st.gearPos > 0.99 ? 'GEAR DN' : 'GEAR ↓') : st.gearPos > 0.01 ? 'GEAR ↑' : 'GEAR UP'}  FLAP ${d.flapsWithGear ? (st.flapPos > 0.5 ? 'DN' : 'UP') : flap}${st.speedbrakePos > 0.05 ? '  SPD BRK' : ''}`, 8, h - fs * 0.8);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(st.vs * 196.85)} FPM`, w - 8, h - fs * 1.9);
    ctx.fillText(`THR ${Math.round(st.throttle * 100)}${st.afterburner ? ' AB' : ''}`, w - 8, h - fs * 0.8);
    ctx.shadowBlur = 0;
  }

  dispose(): void { this.s.dispose(); }
}

// ------------------------------------------------------------------ AoA indexer

export class IndexerDisplay {
  private readonly s: Surface;
  private last: FlightOpsState | null = null;
  constructor(canvas: HTMLCanvasElement, private readonly d: FlightOpsJetData) {
    this.s = new Surface(canvas);
    this.s.onResize = () => this.draw(this.last);
  }

  draw(st: FlightOpsState | null): void {
    this.last = st;
    const s = this.s;
    if (!s.begin()) return;
    const { ctx, w, h, theme: th } = s;
    ctx.fillStyle = th.screen; ctx.fillRect(0, 0, w, h);
    const cue = st && st.gearDown && st.phase === 'air' ? aoaCue(st, this.d) : null;
    const lamps = indexerLamps(this.d, cue);
    const u = Math.min(w * 0.42, h / 4.4);
    const cx = w / 2;
    lamps.forEach((l, i) => {
      const cy = h / 2 + (i - 1) * u * 1.35;
      const col = tokenColor(s, lampToken(l.color));
      ctx.fillStyle = l.lit ? col : th.screenLine;
      ctx.strokeStyle = l.lit ? col : th.screenLine;
      ctx.shadowColor = col; ctx.shadowBlur = l.lit ? 10 : 0;
      ctx.lineWidth = u * 0.22;
      ctx.beginPath();
      if (l.pos === 'mid') {
        ctx.arc(cx, cy, u * 0.38, 0, Math.PI * 2); ctx.stroke();
      } else {
        // Chevrons: top points down (lower the nose), bottom points up (raise the nose).
        const dir = l.pos === 'top' ? 1 : -1;
        ctx.moveTo(cx - u * 0.75, cy - dir * u * 0.3); ctx.lineTo(cx, cy + dir * u * 0.3); ctx.lineTo(cx + u * 0.75, cy - dir * u * 0.3);
        ctx.stroke();
      }
    });
    ctx.shadowBlur = 0;
    ctx.font = `${Math.max(9, Math.round(Math.min(h / 16, w / 7)))}px ${th.fontMono}`;
    ctx.fillStyle = th.symDim; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(cue ? (cue === 'on' ? 'ON SPEED' : cue === 'slow' ? 'SLOW' : 'FAST') : 'OFF', cx, h - 4);
  }

  dispose(): void { this.s.dispose(); }
}

// ------------------------------------------------------------------ Pattern trace

export interface TracePoint { x: number; z: number; level: 0 | 1 | 2 }

/** Top-down pattern: runway, planned gates (coloured by result) and the flown track. North up. */
export class TraceDisplay {
  private readonly s: Surface;
  private args: { st: FlightOpsState | null; track: readonly TracePoint[]; results: readonly GateResult[] } = { st: null, track: [], results: [] };
  constructor(canvas: HTMLCanvasElement, private readonly gates: readonly PlannedGate[]) {
    this.s = new Surface(canvas);
    this.s.onResize = () => this.draw(this.args.st, this.args.track, this.args.results);
  }

  draw(st: FlightOpsState | null, track: readonly TracePoint[], results: readonly GateResult[]): void {
    this.args = { st, track, results };
    const s = this.s;
    if (!s.begin()) return;
    const { ctx, w, h, theme: th } = s;
    ctx.fillStyle = th.screen; ctx.fillRect(0, 0, w, h);
    // Bounds: runway, gates, jet, track; fixed aspect.
    let x0 = -600, x1 = 600, z0 = -RUNWAY.lengthM - 200, z1 = 600;
    const grow = (x: number, z: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
    for (const g of this.gates) grow(g.pos.x, g.pos.z);
    if (st) grow(st.pos.x, st.pos.z);
    for (let i = 0; i < track.length; i += 8) grow(track[i]!.x, track[i]!.z);
    const pad = 16;
    const sc = Math.min((w - pad * 2) / (x1 - x0 + 400), (h - pad * 2) / (z1 - z0 + 400));
    const ox = w / 2 - ((x0 + x1) / 2) * sc, oz = h / 2 - ((z0 + z1) / 2) * sc;
    const X = (x: number) => ox + x * sc, Z = (z: number) => oz + z * sc;

    // Runway.
    ctx.fillStyle = th.symDim;
    const rw = Math.max(3, RUNWAY.widthM * sc);
    ctx.fillRect(X(0) - rw / 2, Z(-RUNWAY.lengthM), rw, RUNWAY.lengthM * sc);
    // Extended centreline.
    ctx.strokeStyle = alpha(th.sym, 0.25); ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(X(0), Z(0)); ctx.lineTo(X(0), Z(z1 + 200)); ctx.stroke(); ctx.setLineDash([]);

    // Track.
    const cols = [th.ok, th.caution, th.warning];
    ctx.lineWidth = 2;
    for (let i = 1; i < track.length; i++) {
      const a = track[i - 1]!, b = track[i]!;
      ctx.strokeStyle = cols[b.level]!;
      ctx.beginPath(); ctx.moveTo(X(a.x), Z(a.z)); ctx.lineTo(X(b.x), Z(b.z)); ctx.stroke();
    }

    // Gates.
    const fs = Math.max(9, Math.round(Math.min(w, h) / 26));
    ctx.font = `${fs}px ${th.fontMono}`; ctx.textBaseline = 'middle';
    for (const g of this.gates) {
      const state = gateState(g.id, results);
      const col = state === 'ok' ? th.ok : state === 'miss' ? th.warning : th.symHi;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X(g.pos.x), Z(g.pos.z), 5, 0, Math.PI * 2);
      if (state === 'pending') ctx.stroke(); else ctx.fill();
      const left = g.pos.x < -50;
      const dy = g.id === 'initial' ? fs * 0.6 : g.id === 'touchdown' ? -fs * 0.6 : 0;
      ctx.textAlign = left ? 'right' : 'left';
      ctx.fillText(g.label.toUpperCase(), X(g.pos.x) + (left ? -9 : 9), Z(g.pos.z) + dy);
    }

    // Jet.
    if (st) {
      ctx.save();
      ctx.translate(X(st.pos.x), Z(st.pos.z)); ctx.rotate(st.heading);
      ctx.fillStyle = th.symHi;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = th.symDim; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('N ↑', 6, 6);
  }

  dispose(): void { this.s.dispose(); }
}
