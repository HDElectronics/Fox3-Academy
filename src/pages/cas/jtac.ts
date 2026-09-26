/**
 * [OWNER: page-cas] The AI JTAC as the DCS player meets it (docs/research/cas-jtac.md, ED A-10C II manual "F4 JTAC"):
 * check-in, control type, 9-line, remarks, readback, report IP inbound, continue, smoke inside 10 nm ("mark is on
 * the deck"), contact the mark, talk-on, In, cleared hot or abort, Off, re-attack or depart, BDA, check out.
 * Pure page logic over the World: the page forwards radio-menu actions and World events, calls step() after
 * world.step(), and renders the calls. Jet-agnostic: the page supplies an aim adapter (the Shkval point for the Su-25T).
 * When the AI clears or aborts is not documented by ED: those are trainer rules, labelled in the UI.
 */
import type { World } from '../../sim/world';
import type { EntityId, SimEvent } from '../../sim/types';
import type { CommsMenuNode } from '../../data/types';
import { buildCommsMenu, type JtacAction, type JtacMenuState } from '../../data/cas';
import { type CasScenario, type XZ, bearingDeg, distM } from './scenario';
import { type NineLine, NINE_LINE_ORDER, cardinal, lineText, M_PER_NM } from './nineLine';
import { headingErrorDeg } from './safety';

export type JtacState =
  | 'idle' | 'checked-in' | 'nine-line' | 'remarks-ready' | 'remarks' | 'readback' | 'await-ip' | 'inbound'
  | 'mark-down' | 'talk-on' | 'cleared' | 'aborted' | 'off' | 'complete' | 'checked-out';

export type { JtacAction };

/** Dialogue state → the data module's menu state (which items the DCS JTAC submenu shows). */
const MENU_STATE: Record<JtacState, JtacMenuState> = {
  idle: 'idle', 'checked-out': 'idle', 'checked-in': 'control', 'nine-line': 'control', 'remarks-ready': 'remarks',
  remarks: 'remarks', readback: 'readback', 'await-ip': 'ip', inbound: 'inbound', 'mark-down': 'mark',
  'talk-on': 'run-in', aborted: 'run-in', cleared: 'cleared', off: 'post', complete: 'post',
};

export interface JtacCall {
  t: number;
  from: 'jtac' | 'pilot';
  text: string;
  /** Wording taken from the ED manual; false = trainer wording (labelled simplified). */
  verified: boolean;
  /** Clearance calls get a tone in the log. */
  tone?: 'ok' | 'caution' | 'warning';
}

/** Why a release broke clearance discipline (scored). */
export type Violation = 'no-clearance' | 'after-abort' | 'outside-heading';

/** What the pilot's sight is on right now: a briefed target, another unit, or nothing usable. */
export type AimState = { kind: 'target'; unitId: EntityId } | { kind: 'other'; unitId: EntityId | null } | { kind: 'none' };

export interface JtacOptions {
  callsign?: string;
  /** Pilot callsign used in the pilot's calls. */
  pilot?: string;
  /** Seconds between JTAC lines (trainer pace). */
  lineGapS?: number;
  /** Smoke goes down inside this range after IP inbound (ED manual: 10 nm). */
  markRangeM?: number;
  aim(): AimState;
}

/** Trainer offset of the smoke from the target centre (m): the talk-on starts from it. */
const MARK_OFFSET_M: readonly [number, number] = [120, 220];

export class JtacController {
  state: JtacState = 'idle';
  readonly calls: JtacCall[] = [];
  readonly violations: { t: number; why: Violation; weaponId: EntityId }[] = [];
  /** Clearance at each release, by weapon id. */
  readonly releases = new Map<EntityId, { t: number; cleared: boolean; headingErrDeg: number }>();
  markId: EntityId | null = null;
  attacks = 0;
  private queue: { at: number; call: Omit<JtacCall, 't'>; then?: () => void }[] = [];
  private listeners = new Set<(c: JtacCall) => void>();
  private evCursor = 0;
  readonly callsign: string;
  readonly pilot: string;
  private gap: number;
  private markRangeM: number;

  constructor(private readonly world: World, private readonly sc: CasScenario, readonly nineLine: NineLine, private readonly opts: JtacOptions) {
    this.callsign = opts.callsign ?? 'Axeman 1-1';
    this.pilot = opts.pilot ?? 'Frogfoot 1';
    this.gap = opts.lineGapS ?? 2;
    this.markRangeM = opts.markRangeM ?? 10 * M_PER_NM;
    this.evCursor = world.events.length;
  }

  /** True while JTAC calls are still queued (the menu hides replies until the JTAC has finished). */
  get busy(): boolean { return this.queue.length > 0; }

  onCall(fn: (c: JtacCall) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Actions the trainer JTAC accepts right now (the menu shows the rest disabled). */
  allowed(): JtacAction[] {
    const s = this.state, busy = this.queue.length > 0;
    const out: JtacAction[] = [];
    if (s === 'idle' || s === 'checked-out') out.push('check-in');
    if (s === 'checked-in' && !busy) out.push('ready-to-copy');
    if (s === 'remarks-ready' && !busy) out.push('ready-remarks');
    if (s === 'readback' && !busy) out.push('readback');
    if (s === 'await-ip' && !busy) out.push('ip-inbound');
    if (s === 'mark-down' && !busy) out.push('contact-mark');
    if ((s === 'talk-on' || s === 'aborted') && !busy) out.push('in');
    if (s === 'cleared') out.push('off');
    if (s !== 'idle' && s !== 'checked-out') {
      out.push('repeat-brief', 'what-target');
      if (this.attacks > 0) out.push('request-bda');
      out.push('unable', 'check-out');
    }
    return out;
  }

  /** The DCS radio menu for this state (root list, F4 JTACs, this JTAC's submenu). Unsupported items are disabled. */
  menu(): CommsMenuNode[] {
    const ok = new Set<string>([...this.allowed(), 'menu-back', 'menu-exit']);
    const walk = (nodes: CommsMenuNode[]): CommsMenuNode[] => nodes.map(n => n.children
      ? { ...n, children: walk(n.children) }
      : n.action && !ok.has(n.action) ? { ...n, disabled: true } : n);
    return walk(buildCommsMenu(this.callsign, MENU_STATE[this.state], this.nineLine.mark));
  }

  /** A radio-menu action from the pilot. Returns false when the item is not valid in this state. */
  act(a: JtacAction): boolean {
    const nl = this.nineLine;
    const say = (text: string) => this.push({ from: 'pilot', text, verified: false });
    if (!this.allowed().includes(a)) return false;
    switch (a) {
      case 'check-in':
        say(`${this.callsign}, ${this.pilot}, checking in: ${this.sc.controlPoint.name}, weapons Vikhr and rockets, playtime 15 minutes.`);
        this.jtac(`${this.pilot}, ${this.callsign}, type 2 in effect. Advise when ready for 9-line.`, false, () => { this.state = 'checked-in'; });
        break;
      case 'ready-to-copy':
        say('Ready to copy.');
        this.state = 'nine-line';
        NINE_LINE_ORDER.forEach(f => this.jtac(lineText(nl, f), false));
        this.jtac('Advise when ready for remarks.', false, () => { this.state = 'remarks-ready'; });
        break;
      case 'ready-remarks':
        say('Ready to copy remarks.');
        this.state = 'remarks';
        nl.remarks.forEach(r => this.jtac(r, false));
        this.jtac('Read back.', false, () => { this.state = 'readback'; });
        break;
      case 'readback':
        say(`${lineText(nl, 'location')}, ${lineText(nl, 'elevation')}, final attack heading ${nl.remarks.find(r => r.startsWith('Final'))?.replace('Final attack heading ', '') ?? 'none'}${nl.dangerClose ? ', danger close' : ''}.`);
        this.jtac('Readback correct. Report IP inbound.', false, () => { this.state = 'await-ip'; });
        break;
      case 'ip-inbound':
        say('IP inbound.');
        this.jtac('Continue.', true, () => { this.state = 'inbound'; });
        break;
      case 'contact-mark': {
        say('Contact the mark.');
        this.jtac(this.talkOn(), false, () => { this.state = 'talk-on'; });
        break;
      }
      case 'in': this.inCall(); break;
      default: return false;
      case 'off':
        say('Off.');
        this.afterAttack();
        break;
      case 'repeat-brief':
        say('Repeat brief.');
        NINE_LINE_ORDER.forEach(f => this.jtac(lineText(nl, f), false));
        break;
      case 'what-target':
        say('What is my target?');
        this.jtac(`${nl.description}, grid ${nl.grid}.${this.markId ? ' ' + this.talkOn() : ''}`, false);
        break;
      case 'request-bda':
        say('Request BDA.');
        this.jtac(this.bda(), false);
        break;
      case 'unable':
        say('Unable to comply.');
        this.jtac('Copy.', false);
        break;
      case 'check-out':
        say('Checking out.');
        this.jtac(`${this.pilot}, cleared to depart. ${this.callsign} out.`, false, () => { this.state = 'checked-out'; });
        break;
    }
    return true;
  }

  /** Advance the call queue and apply the JTAC's rules. Call after world.step(). */
  step(): void {
    const w = this.world;
    while (this.queue.length && this.queue[0]!.at <= w.t) {
      const q = this.queue.shift()!;
      this.emit({ ...q.call, t: w.t });
      q.then?.();
    }
    const me = this.sc.me;
    // Smoke goes down once inside the mark range after IP inbound (ED manual: 10 nm).
    if (this.state === 'inbound' && !this.queue.length && this.nineLine.mark === 'wp' && distM(me.pos, this.sc.target) <= this.markRangeM) {
      this.dropMark();
      this.jtac('Mark is on the deck.', true, () => { this.state = 'mark-down'; });
    }
    this.readEvents();
  }

  /** Talk-on from the mark to the target (trainer wording). */
  talkOn(): string {
    const m = this.markId ? this.world.marks.get(this.markId) : null;
    const tgt = this.targetCentre();
    if (!m || !tgt) return `${this.nineLine.description} at grid ${this.nineLine.grid}.`;
    const d = Math.round(distM(m.pos, tgt) / 10) * 10;
    return `From the mark, ${cardinal(bearingDeg(m.pos, tgt))} ${d} m, ${this.nineLine.description}. That is your target.`;
  }

  private dropMark(): void {
    const tgt = this.targetCentre();
    if (!tgt) return;
    const w = this.world;
    const r = MARK_OFFSET_M[0] + w.rand() * (MARK_OFFSET_M[1] - MARK_OFFSET_M[0]);
    // Put the smoke on the JTAC's side of the target, never on the friendlies.
    const away = bearingDeg(tgt, w.groundUnits.get(this.sc.jtac)!.pos) + (w.rand() - 0.5) * 120;
    const a = (away * Math.PI) / 180;
    const m = w.spawnMark({ type: 'smoke', colour: 'white', side: 'blue', ownerId: this.sc.jtac, pos: { x: tgt.x + Math.sin(a) * r, z: tgt.z - Math.cos(a) * r } });
    this.markId = m.id;
  }

  private inCall(): void {
    const me = this.sc.me;
    const hdg = ((me.heading * 180) / Math.PI + 360) % 360;
    this.push({ from: 'pilot', text: `In, heading ${String(Math.round(hdg) % 360).padStart(3, '0')}.`, verified: false });
    const err = headingErrorDeg(hdg, this.sc.attackHdgDeg);
    const aim = this.opts.aim();
    if (err > 0) {
      this.jtac(`Abort, abort, abort. Final attack heading ${this.window()}.`, false, () => { this.state = 'aborted'; }, 'warning');
    } else if (aim.kind === 'other') {
      this.jtac('Abort, abort, abort. That is not your target.', false, () => { this.state = 'aborted'; }, 'warning');
    } else if (aim.kind === 'none') {
      this.jtac(`Continue. ${this.talkOn()}`, false, () => { this.state = 'talk-on'; }, 'caution');
    } else {
      this.jtac(`${this.pilot}, cleared hot.`, true, () => { this.state = 'cleared'; }, 'ok');
    }
  }

  private afterAttack(): void {
    this.attacks++;
    const left = this.sc.targets.filter(id => this.world.groundUnits.get(id)?.alive).length;
    if (left === 0) {
      this.jtac(`${this.bda()} Cleared to depart ${this.nineLine.egress}.`, false, () => { this.state = 'complete'; });
    } else {
      this.jtac(`${this.bda()} Cleared re-attack. Report IP inbound.`, false, () => { this.state = 'await-ip'; });
    }
  }

  private bda(): string {
    const dead = this.sc.targets.filter(id => !this.world.groundUnits.get(id)?.alive).length;
    const n = this.sc.targets.length;
    return dead === n ? 'Good hits, target destroyed.' : dead ? `Good hits, ${dead} of ${n} destroyed.` : 'No effect on the target.';
  }

  private readEvents(): void {
    const ev = this.world.events;
    for (; this.evCursor < ev.length; this.evCursor++) {
      const e: SimEvent = ev[this.evCursor]!;
      if (e.type !== 'ag-launch' || e.shooterId !== this.sc.me.id) continue;
      const hdg = ((this.sc.me.heading * 180) / Math.PI + 360) % 360;
      const err = headingErrorDeg(hdg, this.sc.attackHdgDeg);
      const cleared = this.state === 'cleared' && err === 0;
      this.releases.set(e.weaponId, { t: e.t, cleared, headingErrDeg: err });
      if (this.state === 'cleared' && err > 0) this.violations.push({ t: e.t, why: 'outside-heading', weaponId: e.weaponId });
      if (this.state === 'aborted') this.violations.push({ t: e.t, why: 'after-abort', weaponId: e.weaponId });
      else if (this.state !== 'cleared') this.violations.push({ t: e.t, why: 'no-clearance', weaponId: e.weaponId });
      // Players report this call on a release without clearance (not verified wording).
      if (!cleared && !this.queue.some(q => q.call.tone === 'warning')) this.jtac('Abort, abort, abort. You do not have permission to fire.', false, () => { if (this.state !== 'complete') this.state = 'aborted'; }, 'warning');
    }
  }

  private window(): string {
    const [a, b] = this.sc.attackHdgDeg, p = (d: number) => String(Math.round(d) % 360).padStart(3, '0');
    return `${p(a)} to ${p(b)}`;
  }

  private targetCentre(): XZ | null {
    let x = 0, z = 0, n = 0;
    for (const id of this.sc.targets) { const u = this.world.groundUnits.get(id); if (u?.alive) { x += u.pos.x; z += u.pos.z; n++; } }
    return n ? { x: x / n, z: z / n } : null;
  }

  /** Queue a JTAC call after the previous one (trainer pace). */
  private jtac(text: string, verified: boolean, then?: () => void, tone?: JtacCall['tone']): void {
    const last = this.queue.at(-1)?.at ?? this.world.t;
    this.queue.push({ at: Math.max(last, this.world.t) + this.gap, call: { from: 'jtac', text, verified, ...(tone ? { tone } : {}) }, then });
  }

  private push(c: Omit<JtacCall, 't'>): void { this.emit({ ...c, t: this.world.t }); }

  private emit(c: JtacCall): void {
    this.calls.push(c);
    this.world.emit({ t: c.t, type: 'note', text: `${c.from === 'jtac' ? this.callsign : this.pilot}: ${c.text}` });
    for (const fn of this.listeners) fn(c);
  }
}
