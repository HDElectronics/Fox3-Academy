/**
 * [OWNER: page-rwr-trainer] Top-down plan of your jet and the threats around it: the "truth" the RWR
 * is trying to describe. Own jet in the centre, nose up, clock positions round the edge, range rings
 * on a square-root scale (a 7 km SAM and a 250 km AWACS both fit). Threats can be dragged (sandbox),
 * or hidden until the quiz answer is in, then revealed with the recommended turn.
 * Canvas 2D, crisp at devicePixelRatio, colours from readTheme().
 */
import type { Theme } from '../../ui/theme';
import { MISSILES } from '../../data/missiles';
import { M_PER_NM } from '../../sim/math';
import {
  type Threat, type ThreatState, emitterShort, isAircraft, isSam, missilePlacement, stateAt, wrapPi,
} from './threats';
import type { Advice } from './quiz';

export type Units = 'metric' | 'imperial';

export interface PlanReveal {
  focusId: string | null;
  advice: Advice | null;
  /** Your own missile in the air (crank questions). */
  ownShot: { missile: string; targetId: string } | null;
}

const MAX_RANGE_M = 300_000;
const MIN_RANGE_M = 3_000;

export class PlanView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private th: Theme;
  private units: Units;
  private ro: ResizeObserver | null = null;
  private w = 0; private h = 0; private dpr = 1;
  private threats: readonly Threat[] = [];
  private tRel = 1e6;
  private selected: string | null = null;
  private hidden = false;
  private hiddenText = 'Truth hidden until you answer';
  private reveal: PlanReveal | null = null;
  private dragId: string | null = null;
  private offs: (() => void)[] = [];
  private interactive: boolean;
  /** Labels queued during a draw, placed after every glyph is down. */
  private queue: { x: number; y: number; a: string; b: string; colorB: string; note: string | null; prio: number }[] = [];
  /** Called when the user picks a threat (click or drag start). */
  onSelect: (id: string | null) => void = () => {};
  /** Called while dragging a threat, with its new bearing (rad) and ground range (m). */
  onDrag: (id: string, bearing: number, range: number) => void = () => {};

  constructor(canvas: HTMLCanvasElement, opts: { theme: Theme; units: Units; interactive: boolean }) {
    this.canvas = canvas;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('2D canvas unavailable');
    this.ctx = c;
    this.th = opts.theme;
    this.units = opts.units;
    this.interactive = opts.interactive;
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => this.fit());
      this.ro.observe(canvas);
    }
    this.fit();
    if (this.interactive) this.bindPointer();
  }

  setThreats(threats: readonly Threat[], tRel = 1e6): void { this.threats = threats; this.tRel = tRel; this.draw(); }
  setSelected(id: string | null): void { if (id !== this.selected) { this.selected = id; this.draw(); } }
  setHidden(hidden: boolean, text?: string): void { this.hidden = hidden; if (text) this.hiddenText = text; this.draw(); }
  setReveal(r: PlanReveal | null): void { this.reveal = r; this.draw(); }

  dispose(): void {
    this.ro?.disconnect();
    this.ro = null;
    for (const f of this.offs) f();
    this.offs = [];
  }

  // ------------------------------------------------------------------ geometry

  private get R(): number { return Math.min(this.w, this.h) / 2 - 22; }
  private get cx(): number { return this.w / 2; }
  private get cy(): number { return this.h / 2; }
  private rOf(range: number): number { return this.R * Math.sqrt(Math.min(MAX_RANGE_M, Math.max(0, range)) / MAX_RANGE_M); }
  private toXY(bearing: number, range: number): { x: number; y: number } {
    const r = this.rOf(range);
    return { x: this.cx + Math.sin(bearing) * r, y: this.cy - Math.cos(bearing) * r };
  }
  private fromXY(x: number, y: number): { bearing: number; range: number } {
    const dx = x - this.cx, dy = this.cy - y;
    const r = Math.min(this.R, Math.hypot(dx, dy));
    const range = MAX_RANGE_M * (r / this.R) ** 2;
    return { bearing: Math.atan2(dx, dy), range: Math.max(MIN_RANGE_M, range) };
  }

  /** Threat under a client point (CSS px), or null. */
  pick(clientX: number, clientY: number, slop = 14): string | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    let best: string | null = null, bestD = Infinity;
    for (const t of this.threats) {
      if (!stateAt(t, this.tRel)) continue;
      const p = this.toXY(t.bearing, t.range);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < slop + 8 && d < bestD) { best = t.id; bestD = d; }
    }
    return best;
  }

  private bindPointer(): void {
    const cv = this.canvas;
    const down = (e: PointerEvent) => {
      const id = this.pick(e.clientX, e.clientY, e.pointerType === 'touch' ? 20 : 12);
      this.onSelect(id);
      if (!id) return;
      this.dragId = id;
      cv.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!this.dragId) {
        cv.style.cursor = this.pick(e.clientX, e.clientY) ? 'grab' : 'default';
        return;
      }
      cv.style.cursor = 'grabbing';
      const rect = cv.getBoundingClientRect();
      const p = this.fromXY(e.clientX - rect.left, e.clientY - rect.top);
      this.onDrag(this.dragId, p.bearing, p.range);
    };
    const up = (e: PointerEvent) => {
      if (this.dragId && cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
      this.dragId = null;
      cv.style.cursor = 'default';
    };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.style.touchAction = 'none';
    this.offs.push(() => {
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
    });
  }

  private fit(): void {
    const cv = this.canvas;
    const w = cv.clientWidth, h = cv.clientHeight;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    this.draw();
  }

  // ------------------------------------------------------------------ drawing

  draw(): void {
    const { ctx, th } = this;
    if (this.w < 10 || this.h < 10) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = th.screen2;
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawGrid();
    if (!this.hidden) {
      if (this.reveal?.ownShot) this.drawOwnShot();
      this.queue = [];
      for (const t of this.threats) this.drawThreatLine(t);
      for (const t of this.threats) this.drawThreat(t);
      this.placeLabels();
      if (this.reveal?.advice) this.drawAdvice(this.reveal.advice);
    }
    this.drawOwnJet();
    if (this.hidden) {
      ctx.fillStyle = th.symDim;
      ctx.font = `600 ${this.fs(12)}px ${th.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.hiddenText.toUpperCase(), this.cx, this.cy + this.R * 0.45);
    }
  }

  private fs(px: number): number { return Math.max(9, Math.min(px, px * (this.R / 170))); }

  private drawGrid(): void {
    const { ctx, th } = this;
    const R = this.R;
    ctx.lineWidth = 1;
    ctx.strokeStyle = th.screenLine;
    ctx.beginPath(); ctx.arc(this.cx, this.cy, R, 0, Math.PI * 2); ctx.stroke();
    // Range rings.
    const ringsKm = this.units === 'metric' ? [10, 25, 50, 100, 200] : [5, 15, 30, 60, 120].map(n => (n * M_PER_NM) / 1000);
    const labels = this.units === 'metric' ? ['10', '25', '50', '100', '200 km'] : ['5', '15', '30', '60', '120 nm'];
    ctx.font = `${this.fs(10)}px ${th.fontMono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ringsKm.forEach((km, i) => {
      const r = this.rOf(km * 1000);
      ctx.strokeStyle = th.screenLine;
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = th.symDim;
      const a = (-35 * Math.PI) / 180;
      ctx.fillText(labels[i], this.cx + Math.sin(a) * r + 3, this.cy - Math.cos(a) * r);
    });
    // Beam line (3-9) and nose line.
    ctx.strokeStyle = th.screenLine;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(this.cx - R, this.cy); ctx.lineTo(this.cx + R, this.cy);
    ctx.moveTo(this.cx, this.cy - R); ctx.lineTo(this.cx, this.cy + R);
    ctx.stroke();
    ctx.setLineDash([]);
    // Clock ticks and numbers.
    ctx.textAlign = 'center';
    ctx.font = `600 ${this.fs(11)}px ${th.fontMono}`;
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      const s = Math.sin(a), c = Math.cos(a);
      ctx.strokeStyle = th.symDim;
      ctx.beginPath();
      ctx.moveTo(this.cx + s * (R - 6), this.cy - c * (R - 6));
      ctx.lineTo(this.cx + s * R, this.cy - c * R);
      ctx.stroke();
      ctx.fillStyle = k % 3 === 0 ? th.sym : th.symDim;
      ctx.fillText(String(k === 0 ? 12 : k), this.cx + s * (R + 11), this.cy - c * (R + 11));
    }
    ctx.fillStyle = th.symDim;
    ctx.font = `${this.fs(9)}px ${th.fontMono}`;
    ctx.fillText('BEAM', this.cx + R * 0.86, this.cy - 8);
    ctx.fillText('BEAM', this.cx - R * 0.86, this.cy - 8);
  }

  private stateColor(s: ThreatState): string {
    const th = this.th;
    return s === 'search' ? th.symDim : s === 'lock' ? th.caution : th.warning;
  }

  private drawThreatLine(t: Threat): void {
    const s = stateAt(t, this.tRel);
    if (!s) return;
    const { ctx } = this;
    const p = this.toXY(t.bearing, t.range);
    ctx.save();
    ctx.lineWidth = s === 'search' ? 1 : 1.6;
    ctx.strokeStyle = this.stateColor(s === 'active' ? 'search' : s);
    ctx.setLineDash(s === 'search' || s === 'active' ? [3, 5] : s === 'launch' ? [8, 4] : []);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(this.cx, this.cy); ctx.stroke();
    ctx.restore();
    if (s === 'active' && t.missile) {
      const mp = missilePlacement(t);
      const q = this.toXY(mp.bearing, mp.range);
      ctx.save();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = this.th.warning;
      ctx.setLineDash([8, 4]);
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(this.cx, this.cy); ctx.stroke();
      // Missile's path from the shooter.
      ctx.strokeStyle = this.th.missile;
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([1, 4]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      ctx.restore();
    }
  }

  private drawThreat(t: Threat): void {
    const s = stateAt(t, this.tRel);
    if (!s) return;
    const { ctx, th } = this;
    const p = this.toXY(t.bearing, t.range);
    const focus = this.reveal?.focusId === t.id;
    const sel = this.selected === t.id;
    // Selection / answer ring.
    if (sel || focus) {
      ctx.strokeStyle = th.symHi;
      ctx.lineWidth = focus ? 2.2 : 1.4;
      ctx.setLineDash(focus ? [] : [3, 3]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = th.hostile;
    ctx.strokeStyle = th.hostile;
    if (isAircraft(t.kind) || t.kind === 'awacs') {
      const heading = t.bearing + Math.PI + (t.aspect ?? 0);   // hot = nose toward us
      if (t.kind === 'awacs') this.awacsGlyph(p.x, p.y, heading);
      else this.jetGlyph(p.x, p.y, heading, 9);
    } else if (isSam(t.kind)) {
      this.samGlyph(p.x, p.y);
    }
    // Label.
    const name = emitterShort(t.kind).toUpperCase();
    const st = s === 'active' ? 'SEARCH' : s.toUpperCase();
    const line2 = `${st} · ${this.fmtRange(t.range)}`;
    this.queue.push({ x: p.x, y: p.y, a: `${t.id} ${name}`, b: line2, colorB: this.stateColor(s === 'active' ? 'search' : s), note: t.note ?? null, prio: focus || sel ? 0 : s === 'search' ? 2 : 1 });
    // SARH / STT launch: the missile is on its way along his line of sight.
    if (s === 'launch' && t.missile) {
      const q = this.toXY(t.bearing, t.range * 0.55);
      ctx.fillStyle = th.missile;
      this.dartGlyph(q.x, q.y, wrapPi(t.bearing + Math.PI));
    }
    // Active missile.
    if (s === 'active' && t.missile) {
      const mp = missilePlacement(t);
      const q = this.toXY(mp.bearing, mp.range);
      const toUs = Math.atan2(this.cx - q.x, -(this.cy - q.y));
      ctx.fillStyle = th.missile;
      this.dartGlyph(q.x, q.y, toUs);
      this.queue.push({ x: q.x, y: q.y, a: `${MISSILES[t.missile].name.toUpperCase()}`, b: `ACTIVE · ${this.fmtRange(mp.range)}`, colorB: th.warning, note: null, prio: 0 });
    }
  }

  private fmtRange(m: number): string {
    return this.units === 'metric' ? `${Math.round(m / 1000)} km` : `${Math.round(m / M_PER_NM)} nm`;
  }

  /**
   * Place the queued labels greedily (most important first): each tries eight spots round its glyph
   * and takes the first that clears the glyphs, your jet and the labels already placed.
   */
  private placeLabels(): void {
    const { ctx, th } = this;
    type Box = { x: number; y: number; w: number; h: number };
    const boxes: Box[] = [{ x: this.cx - 14, y: this.cy - 14, w: 28, h: 42 }];
    for (const l of this.queue) boxes.push({ x: l.x - 9, y: l.y - 9, w: 18, h: 18 });
    const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    ctx.font = `600 ${this.fs(10.5)}px ${th.fontMono}`;
    const lh = this.fs(12.5);
    const order = this.queue.map((l, i) => ({ l, i })).sort((p, q) => p.l.prio - q.l.prio || p.i - q.i);
    for (const { l, i } of order) {
      const w = Math.max(ctx.measureText(l.a).width, ctx.measureText(l.b).width, l.note ? ctx.measureText(l.note.toUpperCase()).width : 0) + 8;
      const hgt = lh * (l.note ? 3 : 2) + 3;
      const g = 12;
      const up = l.y < this.cy - 4;
      const spots: [number, number][] = [
        [l.x - w / 2, up ? l.y - g - hgt : l.y + g],
        [l.x - w / 2, up ? l.y + g : l.y - g - hgt],
        [l.x + g, l.y - hgt / 2],
        [l.x - g - w, l.y - hgt / 2],
        [l.x + g * 0.7, l.y - g * 0.7 - hgt],
        [l.x - g * 0.7 - w, l.y - g * 0.7 - hgt],
        [l.x + g * 0.7, l.y + g * 0.7],
        [l.x - g * 0.7 - w, l.y + g * 0.7],
      ];
      let best: Box | null = null, bestCost = Infinity;
      for (const [sx, sy] of spots) {
        const b = { x: Math.max(2, Math.min(this.w - w - 2, sx)), y: Math.max(2, Math.min(this.h - hgt - 2, sy)), w, h: hgt };
        const cost = boxes.reduce((c, o, k) => c + (k === i + 1 ? 0 : overlap(b, o)), 0);
        if (cost < bestCost) { bestCost = cost; best = b; }
        if (cost === 0) break;
      }
      if (!best) continue;
      boxes.push(best);
      this.drawLabelBox(best, l.a, l.b, l.colorB, l.note, lh);
    }
  }

  private drawLabelBox(b: { x: number; y: number; w: number; h: number }, a: string, bText: string, colorB: string, note: string | null, lh: number): void {
    const { ctx, th } = this;
    ctx.fillStyle = th.screen2;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const cx = b.x + b.w / 2;
    ctx.fillStyle = th.sym;
    ctx.fillText(a, cx, b.y + 2);
    ctx.fillStyle = colorB === th.symDim ? th.sym : colorB;
    ctx.globalAlpha = colorB === th.symDim ? 0.7 : 1;
    ctx.fillText(bText, cx, b.y + 2 + lh);
    ctx.globalAlpha = 1;
    if (note) { ctx.fillStyle = th.symHi; ctx.fillText(note.toUpperCase(), cx, b.y + 2 + lh * 2); }
  }

  private jetGlyph(x: number, y: number, heading: number, s: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.28, -s * 0.2);
    ctx.lineTo(s, s * 0.35);
    ctx.lineTo(s * 0.28, s * 0.3);
    ctx.lineTo(s * 0.45, s);
    ctx.lineTo(0, s * 0.72);
    ctx.lineTo(-s * 0.45, s);
    ctx.lineTo(-s * 0.28, s * 0.3);
    ctx.lineTo(-s, s * 0.35);
    ctx.lineTo(-s * 0.28, -s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private awacsGlyph(x: number, y: number, heading: number): void {
    const { ctx, th } = this;
    this.jetGlyph(x, y, heading, 10);
    ctx.save();
    ctx.strokeStyle = th.screen2;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  private samGlyph(x: number, y: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x, y - 9); ctx.lineTo(x + 8, y + 6); ctx.lineTo(x - 8, y + 6); ctx.closePath();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y + 1, 2.2, 0, Math.PI * 2); ctx.fill();
  }

  private dartGlyph(x: number, y: number, heading: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(2.2, 3); ctx.lineTo(3.5, 6); ctx.lineTo(-3.5, 6); ctx.lineTo(-2.2, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawOwnJet(): void {
    const { ctx, th } = this;
    ctx.fillStyle = th.friendly;
    this.jetGlyph(this.cx, this.cy, 0, 12);
    ctx.fillStyle = th.sym;
    ctx.font = `600 ${this.fs(10)}px ${th.fontMono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('YOU', this.cx, this.cy + 15);
  }

  private drawOwnShot(): void {
    const r = this.reveal?.ownShot;
    if (!r) return;
    const t = this.threats.find(x => x.id === r.targetId);
    if (!t) return;
    const { ctx, th } = this;
    const p = this.toXY(t.bearing, t.range);
    const q = this.toXY(t.bearing, t.range * 0.45);
    ctx.save();
    ctx.strokeStyle = th.friendly;
    ctx.globalAlpha = 0.8;
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(this.cx, this.cy); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = th.missile;
    this.dartGlyph(q.x, q.y, wrapPi(t.bearing));
  }

  private drawAdvice(a: Advice): void {
    const { ctx, th } = this;
    const R = this.R * 0.34;
    const turn = (a.turnDeg * Math.PI) / 180;
    ctx.save();
    ctx.strokeStyle = th.ok;
    ctx.fillStyle = th.ok;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = th.ok;
    ctx.shadowBlur = 6;
    let tipA = 0;
    if (Math.abs(turn) > 0.02) {
      const a0 = -Math.PI / 2, a1 = a0 + turn;
      ctx.beginPath(); ctx.arc(this.cx, this.cy, R, a0, a1, turn < 0); ctx.stroke();
      tipA = turn;
    } else {
      ctx.beginPath(); ctx.moveTo(this.cx, this.cy - 16); ctx.lineTo(this.cx, this.cy - R); ctx.stroke();
    }
    // Arrowhead at the new heading.
    const hx = this.cx + Math.sin(tipA) * R, hy = this.cy - Math.cos(tipA) * R;
    const dir = Math.abs(turn) > 0.02 ? tipA + (turn > 0 ? Math.PI / 2 : -Math.PI / 2) : 0;
    ctx.translate(hx, hy);
    ctx.rotate(dir);
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 3); ctx.lineTo(-5, 3); ctx.closePath(); ctx.fill();
    ctx.restore();
    // New heading line.
    if (Math.abs(turn) > 0.02) {
      ctx.save();
      ctx.strokeStyle = th.ok;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(this.cx, this.cy); ctx.lineTo(this.cx + Math.sin(tipA) * this.R * 0.92, this.cy - Math.cos(tipA) * this.R * 0.92); ctx.stroke();
      ctx.restore();
    }
    // The advice text itself goes in the bezel status (the page sets it): no room on the glass.
  }
}
