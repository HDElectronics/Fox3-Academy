/**
 * CSS2D tags (Tacview-style labels) and small annotation notes. Text updates are cheap (only written
 * when changed); positions are in render units and set by the owner every frame.
 */
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Object3D } from 'three';

/** CSS-pixel rectangle relative to a label's projected anchor. */
export interface LabelBounds { left: number; top: number; width: number; height: number }

/** Page-owned labels can join a TacticalScene without transferring ownership of their DOM. */
export interface DeclutterLabel {
  readonly obj: CSS2DObject;
  readonly visible: boolean;
  bounds(): LabelBounds;
  place(x: number, y: number): void;
  setLayoutVisible(visible: boolean): void;
}

/** Measure the painted child, including CSS centering, independently of the CSS2D anchor transform. */
class LabelLayout {
  private x = 0;
  private y = 0;
  constructor(private anchor: HTMLElement, private body: HTMLElement) {}
  bounds(fallback: LabelBounds): LabelBounds {
    const a = this.anchor.getBoundingClientRect(), b = this.body.getBoundingClientRect();
    return b.width > 0 && b.height > 0
      ? { left: b.left - a.left - this.x, top: b.top - a.top - this.y, width: b.width, height: b.height }
      : fallback;
  }
  place(x: number, y: number): void {
    x = Math.round(x); y = Math.round(y);
    if (x === this.x && y === this.y) return;
    this.x = x; this.y = y;
    // Individual translate preserves the centered/above transforms supplied by the stylesheet.
    this.body.style.translate = x || y ? `${x}px ${y}px` : '';
  }
  show(visible: boolean): void {
    const value = visible ? '' : 'hidden';
    if (this.body.style.visibility !== value) this.body.style.visibility = value;
  }
}

/** Shared layout priorities (lower wins). SAM site tags yield to jets and missiles. Coverage annotations yield to every entity and lesson tag. */
export const LabelPriority = { selected: 0, aircraft: 1, missile: 2, site: 2.5, annotation: 3, coverage: 4 } as const;

export interface LabelRegistration {
  priority?: number;
  offset?: { x: number; y: number };
  /** Largest CSS-pixel move from the preferred spot before the label hides instead. Default: layout limit. */
  maxMove?: number;
}

/** Page code that can place labels in a TacticalScene's shared layout (WorldView, ReplayView). */
export interface LabelHost {
  registerLabel(label: DeclutterLabel, options?: LabelRegistration): () => void;
}

/** Registry is independent of entity resets; callers release page labels before disposing them. */
export class LabelRegistry {
  private labels = new Map<DeclutterLabel, LabelRegistration>();
  register(label: DeclutterLabel, options: LabelRegistration = {}): () => void {
    if (this.labels.has(label)) throw new Error('Label is already registered');
    const registration: LabelRegistration = { ...options, offset: options.offset ? { ...options.offset } : undefined };
    this.labels.set(label, registration);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (this.labels.get(label) !== registration) return;
      this.labels.delete(label);
      label.place(0, 0); label.setLayoutVisible(true);
    };
  }
  entries(): IterableIterator<[DeclutterLabel, LabelRegistration]> { return this.labels.entries(); }
  clear(): void {
    for (const label of this.labels.keys()) { label.place(0, 0); label.setLayoutVisible(true); }
    this.labels.clear();
  }
}

export interface LabelCandidate extends LabelBounds {
  priority: number;
  /** Per-label move limit in CSS px (capped by the layout limit). */
  maxMove?: number;
  /** Last frame's placement offset; spots near it are preferred so labels do not flicker between sides. */
  prev?: { x: number; y: number };
}
export interface LabelPlacement { x: number; y: number; visible: boolean }

/** A spot within this many px of last frame's wins unless another is this much closer to home (hysteresis). */
const STICKY_PX = 8;

/** Place near the preferred anchor, inside the viewport, without overlapping earlier priority labels.
 * When local space is exhausted, hide lower-priority text rather than obscuring another label.
 * Pure and O(n²) in visible labels; cheap enough to run every frame.
 */
export function layoutLabels(labels: readonly LabelCandidate[], width: number, height: number): LabelPlacement[] {
  const margin = 6, gap = 4, layoutMove = width < 600 ? 100 : 160;
  const placed: LabelBounds[] = [];
  const result = labels.map(() => ({ x: 0, y: 0, visible: false }));
  const order = labels.map((label, index) => ({ label, index })).sort((a, b) => a.label.priority - b.label.priority || a.index - b.index);
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  for (const { label: l, index } of order) {
    if (l.width > width - 2 * margin || l.height > height - 2 * margin) continue;
    const maxMove = Math.min(layoutMove, l.maxMove ?? layoutMove);
    const xs = [clamp(l.left, margin, width - margin - l.width)];
    const ys = [clamp(l.top, margin, height - margin - l.height)];
    const prevLeft = l.prev ? l.left + l.prev.x : NaN, prevTop = l.prev ? l.top + l.prev.y : NaN;
    if (l.prev) { xs.push(prevLeft); ys.push(prevTop); }
    for (const p of placed) {
      xs.push(p.left - gap - l.width, p.left + p.width + gap);
      ys.push(p.top - gap - l.height, p.top + p.height + gap);
    }
    let best: LabelBounds | null = null, distance = Infinity;
    for (const left of xs) for (const top of ys) {
      if (left < margin || top < margin || left + l.width > width - margin || top + l.height > height - margin) continue;
      const move = Math.hypot(left - l.left, top - l.top);
      const d = Math.hypot(left - prevLeft, top - prevTop) <= STICKY_PX ? move - STICKY_PX : move;
      if (move > maxMove || d >= distance) continue;
      if (placed.some(p => left < p.left + p.width + gap && left + l.width + gap > p.left && top < p.top + p.height + gap && top + l.height + gap > p.top)) continue;
      best = { left, top, width: l.width, height: l.height }; distance = d;
    }
    if (best) {
      placed.push(best);
      result[index] = { x: best.left - l.left, y: best.top - l.top, visible: true };
    }
  }
  return result;
}

export type TagKind = 'aircraft' | 'missile' | 'track' | 'site';

export class Tag implements DeclutterLabel {
  readonly obj: CSS2DObject;
  readonly el: HTMLDivElement;
  private titleEl: HTMLElement;
  private typeEl: HTMLSpanElement;
  private flagEl: HTMLSpanElement;
  private subEl: HTMLSpanElement;
  private body: HTMLDivElement;
  private layout: LabelLayout;
  private state = { title: '', type: '', flag: '', sub: '', side: '', dead: false, selected: false, opacity: 1, visible: true };
  /** Approximate size in CSS px (from text length), for decluttering. */
  width = 60;
  height = 30;

  constructor(parent: Object3D, kind: TagKind, side: string) {
    const el = document.createElement('div');
    el.className = 'r3-tag';
    el.dataset.kind = kind;
    el.dataset.side = side;
    const body = document.createElement('div');
    body.className = 'r3-tag-body';
    this.titleEl = document.createElement('b');
    this.typeEl = document.createElement('span');
    this.flagEl = document.createElement('span');
    this.flagEl.className = 'r3-flag';
    this.subEl = document.createElement('span');
    this.subEl.className = 'r3-sub';
    body.append(this.titleEl, this.typeEl, this.flagEl, this.subEl);
    el.appendChild(body);
    this.el = el;
    this.body = body;
    this.layout = new LabelLayout(el, body);
    this.obj = new CSS2DObject(el);
    this.obj.center.set(0, 0);
    this.state.side = side;
    parent.add(this.obj);
  }

  set(title: string, type: string, sub: string, flag = ''): void {
    const s = this.state;
    if (s.title !== title) { s.title = title; this.titleEl.textContent = title; }
    const t = type ? ' ' + type : '';
    if (s.type !== t) { s.type = t; this.typeEl.textContent = t; }
    if (s.flag !== flag) { s.flag = flag; this.flagEl.textContent = flag; this.flagEl.hidden = !flag; }
    if (s.sub !== sub) { s.sub = sub; this.subEl.textContent = sub; this.subEl.hidden = !sub; }
    const len = Math.max(title.length + t.length + (flag ? flag.length + 1 : 0), sub.length);
    this.width = len * 6.7 + 14;
    this.height = sub ? 31 : 18;
  }

  /** Offset in CSS pixels; preserves the stylesheet's anchor alignment. */
  place(x: number, y: number): void { this.layout.place(x, y); }
  setLayoutVisible(visible: boolean): void { this.layout.show(visible); }
  bounds(): LabelBounds {
    if (this.el.dataset.kind === 'track') return this.layout.bounds({ left: 12, top: 8 - this.height, width: this.width, height: this.height });
    const missile = this.el.dataset.kind === 'missile';
    return this.layout.bounds({ left: missile ? 8 : 11, top: missile ? 4 : -3 - this.height, width: this.width, height: this.height });
  }

  setSide(side: string): void { if (this.state.side !== side) { this.state.side = side; this.el.dataset.side = side; } }
  setDead(d: boolean): void { if (this.state.dead !== d) { this.state.dead = d; this.el.dataset.dead = String(d); } }
  setSelected(v: boolean): void { if (this.state.selected !== v) { this.state.selected = v; this.el.dataset.selected = String(v); } }
  /** Colour the tag with a state tone ('caution' amber, 'warning' red, 'ok', 'hi' designation, 'dim'); null = side colour. */
  setTone(tone: string | null): void {
    if ((this.el.dataset.tone ?? null) === tone) return;
    if (tone) this.el.dataset.tone = tone; else delete this.el.dataset.tone;
  }
  setFlagAttr(name: string, v: string): void { if (this.el.dataset[name] !== v) this.el.dataset[name] = v; }
  setOpacity(o: number): void {
    const q = Math.round(o * 20) / 20;
    if (this.state.opacity !== q) { this.state.opacity = q; this.body.style.opacity = String(q); }
  }
  set visible(v: boolean) { this.obj.visible = v; this.state.visible = v; }
  get visible(): boolean { return this.state.visible; }

  dispose(): void {
    this.obj.removeFromParent();
    this.el.remove();
  }
}

/** A one-line annotation (coverage altitudes, markers). */
export class Note implements DeclutterLabel {
  readonly obj: CSS2DObject;
  private span: HTMLSpanElement;
  private text = '';
  private layout: LabelLayout;
  private cls: string;

  constructor(parent: Object3D, cls = '', color?: string, plate = true) {
    const el = document.createElement('div');
    el.className = 'r3-note' + (cls ? ' ' + cls : '');
    if (color) el.style.setProperty('--note-color', color);
    this.cls = cls;
    this.span = document.createElement('span');
    this.layout = new LabelLayout(el, this.span);
    if (plate) this.span.className = 'r3-plate';
    el.appendChild(this.span);
    this.obj = new CSS2DObject(el);
    this.obj.center.set(0, 0);
    parent.add(this.obj);
  }

  set(text: string): void { if (text !== this.text) { this.text = text; this.span.textContent = text; } }
  set visible(v: boolean) { this.obj.visible = v; }
  get visible(): boolean { return this.obj.visible; }
  place(x: number, y: number): void { this.layout.place(x, y); }
  setLayoutVisible(visible: boolean): void { this.layout.show(visible); }
  bounds(): LabelBounds {
    const width = this.text.length * 6.5 + 10, height = 16;
    return this.layout.bounds({ width, height,
      left: this.cls.includes('r3-center') ? -width / 2 : this.cls.includes('r3-left') ? -width - 6 : 6,
      top: this.cls.includes('r3-above') ? -height - 5 : -7 });
  }
  dispose(): void { this.obj.removeFromParent(); this.obj.element.remove(); }
}
