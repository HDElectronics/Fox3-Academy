/**
 * CSS2D tags (Tacview-style labels) and small annotation notes. Text updates are cheap (only written
 * when changed); positions are in render units and set by the owner every frame.
 */
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Object3D } from 'three';

export type TagKind = 'aircraft' | 'missile' | 'track';

export class Tag {
  readonly obj: CSS2DObject;
  readonly el: HTMLDivElement;
  private titleEl: HTMLElement;
  private typeEl: HTMLSpanElement;
  private flagEl: HTMLSpanElement;
  private subEl: HTMLSpanElement;
  private body: HTMLDivElement;
  private state = { title: '', type: '', flag: '', sub: '', side: '', dead: false, selected: false, opacity: 1, visible: true, ox: 0, dy: 0 };
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

  /** Extra offset in CSS px: ox pushes the tag right of the anchor, dy down (declutter). */
  place(ox: number, dy: number): void {
    const s = this.state;
    const qx = Math.round(ox), qy = Math.round(dy);
    if (s.ox === qx && s.dy === qy) return;
    s.ox = qx; s.dy = qy;
    this.body.style.transform = qx || qy ? `translate(${qx}px, ${qy}px)` : '';
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
export class Note {
  readonly obj: CSS2DObject;
  private span: HTMLSpanElement;
  private text = '';

  constructor(parent: Object3D, cls = '', color?: string, plate = true) {
    const el = document.createElement('div');
    el.className = 'r3-note' + (cls ? ' ' + cls : '');
    if (color) el.style.setProperty('--note-color', color);
    this.span = document.createElement('span');
    if (plate) this.span.className = 'r3-plate';
    el.appendChild(this.span);
    this.obj = new CSS2DObject(el);
    this.obj.center.set(0, 0);
    parent.add(this.obj);
  }

  set(text: string): void { if (text !== this.text) { this.text = text; this.span.textContent = text; } }
  set visible(v: boolean) { this.obj.visible = v; }
  dispose(): void { this.obj.removeFromParent(); this.obj.element.remove(); }
}
