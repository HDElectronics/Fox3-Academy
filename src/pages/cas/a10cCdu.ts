/**
 * [OWNER: page-cas] A-10C II CDU (Control Display Unit) logic for the CAS page, pure (no DOM), so tests can press it:
 * the 10 x 24 screen, the 15-character scratchpad (BCK, SPC, CLR, `CDU INPUT ERR`), the WP / PREV function keys,
 * the WP MENU and WAYPT page 1/2 line select keys (L3 lookup, ± rocker, R3 name, L5 elevation, L7 grid zone,
 * L9 UTM grid, R7 copy, R9 L/L ↔ UTM), the waypoint database (INIT POSIT, the flight plan, copied mission points),
 * markpoint pages and the MARK annunciation (FA clears it), and the AAP STEER PT dial with the STEER toggle
 * (also DMS Fwd/Aft with the HUD as SOI and the UFC STEER rocker). Pages, keys and line text follow
 * docs/research/a10c-cdu.md §1-4 (ED manual pp. 202-215, 276-287, 551-563); the PAGE dial is taken as OTHER.
 * Trainer-simplified: one grid zone and square (nineLine.ts trainer grid), flat-earth trainer lat/long, the static
 * `D5/B1` status, the 4 + 4 split of an 8-digit grid, the copy keeping the L/L / UTM mode, setting the STEER PT dial
 * keeps the steerpoint, PREV toggles between the last two pages. Not modelled: SYS, NAV, OSET, FPM pages, WAYPT
 * page 2/2, ANCHOR PT, FROM PT, WG84 datum, DTOT, L/L entry, the PAGE dial info pages, the elevation sign flip.
 */
import type { Markpoint } from './a10cHotas';
import type { XZ } from './scenario';
import { FT_PER_M, TRAINER_ZONE, parseTrainerGrid, trainerGrid5, trainerLatLon } from './nineLine';

export const CDU_COLS = 24, CDU_ROWS = 10, SCRATCH_MAX = 15;
export type CduLsk = 'L3' | 'L5' | 'L7' | 'L9' | 'R3' | 'R5' | 'R7' | 'R9';
export type CduFsk = 'SYS' | 'NAV' | 'WP' | 'OSET' | 'FPM' | 'PREV';
export type SteerPtDial = 'FLT PLAN' | 'MARK' | 'MISSION';
export type CduPage = 'blank' | 'wpmenu' | 'waypt';
/** Sticky, for lesson checks. */
export type CduMilestone = 'wp-menu' | 'waypt' | 'copy' | 'utm' | 'grid' | 'named' | 'steer-user';

export interface CduWaypoint { number: number; id: string; x: number; z: number; elevFt: number; cr: boolean; flightPlan: boolean; user: boolean }
export interface CduSteerpoint { kind: 'waypoint' | 'mark'; number: number | null; letter: string | null; id: string; x: number; z: number }

export interface CduHost {
  groundHeightM(x: number, z: number): number;
  marks(): readonly Markpoint[];
  log(text: string, tone?: 'ok' | 'caution'): void;
  /** Called after the steerpoint changes (STEER toggle / dial database cycling, or a grid entry moving it). */
  steerChanged?(sp: CduSteerpoint): void;
}

export interface CduInit { init: XZ; plan: { id: string; x: number; z: number }[] }

type Shown = { kind: 'waypoint'; number: number } | { kind: 'mark'; letter: string };

/** Static DTSAS / EGI FOM status on line 1 (from the manual figure, not modelled). */
const STATUS = 'D5/B1';
const NAME_RE = /^[A-Z]([A-Z0-9. ]{0,10}[A-Z0-9.])?$/;

/** One CDU row: a left field from column 0 and a right field ending at column 24; the left one is cut to fit. */
function row(left: string, right = ''): string {
  if (!right) return left.slice(0, CDU_COLS);
  const room = CDU_COLS - right.length - 1;
  const l = left.length > room ? left.slice(0, Math.max(0, room)) : left;
  return l.padEnd(CDU_COLS - right.length) + right;
}

export class A10cCdu {
  page: CduPage = 'blank';
  dial: SteerPtDial = 'FLT PLAN';
  scratch = '';
  error = false;
  annunciation: string | null = null;
  utm = false;
  readonly milestones = new Set<CduMilestone>();

  private init: CduInit;
  private wps: CduWaypoint[] = [];
  private prevPage: CduPage = 'blank';
  private shownPt: Shown = { kind: 'waypoint', number: 0 };
  private lastWp = 0;
  /** Last known copy of the shown mark, in case its letter is gone from the host list. */
  private shownMarkCache: Markpoint | null = null;
  /** The steerpoint; a mark steerpoint keeps its coordinates even if the letter is overwritten. */
  private steerPt: CduSteerpoint = { kind: 'waypoint', number: 0, letter: null, id: '', x: 0, z: 0 };
  /** Renamed marks (letter → id); default `MRK C`. A new mark on that letter resets it. */
  private markIds = new Map<string, string>();

  constructor(private readonly host: CduHost, init: CduInit) {
    this.init = init;
    this.reset(init);
  }

  reset(init?: CduInit): void {
    if (init) this.init = init;
    const elev = (x: number, z: number) => Math.round(this.host.groundHeightM(x, z) * FT_PER_M);
    const { init: p0, plan } = this.init;
    this.wps = [
      { number: 0, id: 'INIT POSIT', x: p0.x, z: p0.z, elevFt: elev(p0.x, p0.z), cr: true, flightPlan: false, user: false },
      ...plan.map((p, i) => ({ number: i + 1, id: p.id, x: p.x, z: p.z, elevFt: elev(p.x, p.z), cr: true, flightPlan: true, user: false })),
    ];
    this.page = 'blank';
    this.prevPage = 'blank';
    this.dial = 'FLT PLAN';
    this.scratch = '';
    this.error = false;
    this.annunciation = null;
    this.utm = false;
    this.milestones.clear();
    this.markIds.clear();
    this.shownPt = { kind: 'waypoint', number: 0 };
    this.shownMarkCache = null;
    this.lastWp = 0;
    this.steerPt = this.wpSteer(this.wp(1) ?? this.wp(0)!);
  }

  // ------------------------------------------------------------------ database
  waypoints(): readonly CduWaypoint[] { return this.wps; }

  steerpoint(): CduSteerpoint {
    const s = this.steerPt;
    if (s.kind === 'waypoint') {
      const w = this.wp(s.number!);
      if (w) return this.wpSteer(w);
    }
    return { ...s };
  }

  shown(): Shown { return { ...this.shownPt }; }

  private wp(n: number): CduWaypoint | undefined { return this.wps.find(w => w.number === n); }
  private wpSteer(w: CduWaypoint): CduSteerpoint { return { kind: 'waypoint', number: w.number, letter: null, id: w.id, x: w.x, z: w.z }; }
  private sortedMarks(): Markpoint[] { return [...this.host.marks()].sort((a, b) => a.letter.localeCompare(b.letter)); }
  private markId(letter: string): string { return this.markIds.get(letter) ?? `MRK ${letter}`; }
  private liveMark(letter: string): Markpoint | undefined { return this.host.marks().find(m => m.letter === letter); }
  private nextNumber(): number { return Math.max(...this.wps.map(w => w.number)) + 1; }
  private elevFt(x: number, z: number): number { return Math.round(this.host.groundHeightM(x, z) * FT_PER_M); }

  /** The mark shown on the WAYPT page (live, else the last known copy). */
  private shownMark(): Markpoint | null {
    if (this.shownPt.kind !== 'mark') return null;
    return this.liveMark(this.shownPt.letter) ?? this.shownMarkCache;
  }

  private showWp(n: number): void { this.shownPt = { kind: 'waypoint', number: n }; this.lastWp = n; this.shownMarkCache = null; }
  private showMark(m: Markpoint): void { this.shownPt = { kind: 'mark', letter: m.letter }; this.shownMarkCache = { ...m }; }

  // ------------------------------------------------------------------ steerpoint
  setDial(d: SteerPtDial): void {
    this.dial = d;
    this.host.log(`STEER PT ${d}`);
  }

  steer(dir: 1 | -1): void {
    const cur = this.steerPt;
    if (this.dial === 'MARK') {
      const marks = this.sortedMarks();
      if (!marks.length) { this.host.log('No markpoints', 'caution'); return; }
      const i = cur.kind === 'mark' ? marks.findIndex(m => m.letter === cur.letter) : -1;
      const m = marks[this.step(i, marks.length, dir)]!;
      this.steerPt = { kind: 'mark', number: null, letter: m.letter, id: this.markId(m.letter), x: m.x, z: m.z };
    } else {
      const db = this.wps.filter(w => this.dial === 'MISSION' || w.flightPlan).sort((a, b) => a.number - b.number);
      if (!db.length) { this.host.log('No flight plan waypoints', 'caution'); return; }
      const i = cur.kind === 'waypoint' ? db.findIndex(w => w.number === cur.number) : -1;
      const w = db[this.step(i, db.length, dir)]!;
      this.steerPt = this.wpSteer(w);
      if (w.user) this.milestones.add('steer-user');
    }
    const sp = this.steerpoint();
    this.host.log(`Steerpoint ${sp.kind === 'mark' ? sp.letter : sp.number} ${sp.id}`);
    this.host.steerChanged?.(sp);
  }

  /** Next index in a wrapped list; from outside the list, +1 goes to the first and -1 to the last. */
  private step(i: number, n: number, dir: 1 | -1): number {
    if (i < 0) return dir > 0 ? 0 : n - 1;
    return (i + dir + n) % n;
  }

  // ------------------------------------------------------------------ keys
  fsk(k: CduFsk): void {
    if (k === 'PREV') { const p = this.page; this.page = this.prevPage; this.prevPage = p; return; }
    if (k === 'WP') { this.go('wpmenu'); this.milestones.add('wp-menu'); return; }
    this.go('blank');
    this.host.log(`CDU ${k} page: not modelled`);
  }

  private go(p: CduPage): void {
    if (p === this.page) return;
    this.prevPage = this.page;
    this.page = p;
  }

  key(ch: string): void {
    if (this.error || ch.length !== 1) return;
    const c = ch.toUpperCase();
    if (!/^[A-Z0-9./]$/.test(c)) return;
    this.type(c);
  }

  space(): void { if (!this.error) this.type(' '); }
  bck(): void { if (!this.error) this.scratch = this.scratch.slice(0, -1); }
  clr(): void { this.scratch = ''; this.error = false; }
  fa(): void { this.annunciation = null; }

  private type(c: string): void { if (this.scratch.length < SCRATCH_MAX) this.scratch += c; }
  private fail(): void { this.error = true; }
  private accept(): void { this.scratch = ''; }

  rocker(dir: 1 | -1): void {
    if (this.page !== 'waypt') return;
    const s = this.shownPt;
    if (s.kind === 'waypoint') {
      const db = [...this.wps].sort((a, b) => a.number - b.number);
      const i = db.findIndex(w => w.number === s.number);
      this.showWp(db[this.step(i, db.length, dir)]!.number);
    } else {
      const marks = this.sortedMarks();
      if (!marks.length) return;
      const i = marks.findIndex(m => m.letter === s.letter);
      this.showMark(marks[this.step(i, marks.length, dir)]!);
    }
  }

  onMark(m: Markpoint): void {
    this.markIds.delete(m.letter);
    if (m.letter === 'Z') return;
    this.showMark(m);
    this.go('waypt');
    this.annunciation = `MARK ${m.letter}`;
  }

  lsk(k: CduLsk): void {
    if (this.page === 'wpmenu') this.wpMenuLsk(k);
    else if (this.page === 'waypt') this.wayptLsk(k);
  }

  private wpMenuLsk(k: CduLsk): void {
    switch (k) {
      case 'L3': {
        const sp = this.steerPt;
        if (sp.kind === 'waypoint' && this.wp(sp.number!)) this.showWp(sp.number!);
        else if (sp.kind === 'mark') this.showMark(this.liveMark(sp.letter!) ?? { letter: sp.letter!, x: sp.x, z: sp.z });
        else this.showWp(this.lastWp);
        this.go('waypt');
        this.milestones.add('waypt');
        return;
      }
      case 'R3':
        this.showWp(this.wp(this.lastWp) ? this.lastWp : 0);
        this.go('waypt');
        this.milestones.add('waypt');
        return;
      case 'L5': this.host.log('ANCHOR PT: not modelled'); return;
      case 'R5': this.host.log('FROM PT: not modelled'); return;
      case 'R9': this.host.log('WG84: not modelled'); return;
      default: return;
    }
  }

  private wayptLsk(k: CduLsk): void {
    const s = this.shownPt;
    const w = s.kind === 'waypoint' ? this.wp(s.number) : undefined;
    const mark = this.shownMark();
    const text = this.scratch;
    // Data-entry keys need a scratchpad (and do nothing while the input error shows).
    const needsInput = k === 'L3' || k === 'R3' || k === 'L5' || k === 'L7' || k === 'L9';
    if (needsInput && (!text || this.error)) return;
    switch (k) {
      case 'L3': {
        if (/^\d+$/.test(text)) {
          const n = Number(text);
          if (!this.wp(n)) return this.fail();
          this.showWp(n);
        } else if (/^[A-Z]$/.test(text)) {
          const m = this.liveMark(text);
          if (!m) return this.fail();
          this.showMark(m);
        } else return this.fail();
        return this.accept();
      }
      case 'R3': return this.rename(text, w, s.kind === 'mark' ? s.letter : null);
      case 'L5': {
        if (!w || !/^\d{1,5}$/.test(text)) return this.fail();
        w.elevFt = Number(text);
        w.cr = false;
        return this.accept();
      }
      case 'L7': {
        if (!w) return this.fail();
        if (!this.utm) return this.llNotModelled();
        if (text.replace(/\s+/g, '') !== TRAINER_ZONE) return this.fail();
        return this.accept();
      }
      case 'L9': {
        if (!w) return this.fail();
        if (!this.utm) return this.llNotModelled();
        const p = parseTrainerGrid(text);
        if (!p) return this.fail();
        w.x = p.x; w.z = p.z;
        w.elevFt = this.elevFt(p.x, p.z);
        w.cr = true;
        this.milestones.add('grid');
        this.accept();
        if (this.steerPt.kind === 'waypoint' && this.steerPt.number === w.number) this.host.steerChanged?.(this.steerpoint());
        return;
      }
      case 'R7': {
        const src = w ?? (mark ? { x: mark.x, z: mark.z, elevFt: this.elevFt(mark.x, mark.z) } : null);
        if (!src) return;
        const n = this.nextNumber();
        this.wps.push({ number: n, id: `MSN${String(n).padStart(3, '0')}`, x: src.x, z: src.z, elevFt: src.elevFt, cr: w ? w.cr : true, flightPlan: false, user: true });
        this.showWp(n);
        this.milestones.add('copy');
        return;
      }
      case 'R9':
        this.utm = !this.utm;
        if (this.utm) this.milestones.add('utm');
        return;
      case 'R5': this.host.log('DTOT: not modelled'); return;
    }
  }

  private llNotModelled(): void { this.host.log('L/L entry is not modelled: switch to UTM with R9', 'caution'); }

  private rename(text: string, w: CduWaypoint | undefined, letter: string | null): void {
    if (!w && !letter) return;
    if (!NAME_RE.test(text)) return this.fail();
    const taken = (id: string) => id.toUpperCase() === text.toUpperCase();
    const clash = this.wps.some(o => o !== w && taken(o.id)) || this.host.marks().some(m => m.letter !== letter && taken(this.markId(m.letter)));
    if (clash) return this.fail();
    if (w) {
      w.id = text;
      if (w.user) this.milestones.add('named');
    } else {
      this.markIds.set(letter!, text);
      const sp = this.steerPt, live = this.liveMark(letter!);
      if (sp.kind === 'mark' && sp.letter === letter && live && live.x === sp.x && live.z === sp.z) sp.id = text;
    }
    this.accept();
  }

  // ------------------------------------------------------------------ screen
  lines(): string[] {
    const sp = this.steerPt;
    const title = this.page === 'waypt' ? 'WAYPT' : this.page === 'wpmenu' ? 'WP MENU' : '';
    const spLabel = sp.kind === 'mark' ? sp.letter! : String(sp.number);
    const out: string[] = new Array<string>(CDU_ROWS).fill('');
    // Title padded to 7, with at least one space before the flight plan field (`WP MENU` fills all 7).
    out[0] = row(`${title.padEnd(Math.max(7, title.length + 1))}${this.dial === 'FLT PLAN' ? 'F1' : '  '}  ${spLabel}`, STATUS);
    out[1] = row(this.annunciation ?? '');
    let r10 = '';
    if (this.page === 'wpmenu') {
      out[2] = row('→STEERPOINT', 'WAYPOINT←');
      out[4] = row('→ANCHOR PT', 'FROM PT←');
      out[8] = row('', 'WG84[]');
    } else if (this.page === 'waypt') {
      r10 = 'P1/2';
      const s = this.shownPt;
      const w = s.kind === 'waypoint' ? this.wp(s.number) : undefined;
      const m = this.shownMark();
      const pos = w ?? m ?? { x: 0, z: 0 };
      const ed = w ? '[]' : '';
      const isSteer = s.kind === 'waypoint' ? sp.kind === 'waypoint' && sp.number === s.number : sp.kind === 'mark' && sp.letter === s.letter;
      const label = s.kind === 'waypoint' ? String(s.number) : s.letter;
      const id = w ? w.id : this.markId(s.kind === 'mark' ? s.letter : '');
      const elev = w ? w.elevFt : this.elevFt(pos.x, pos.z);
      const ll = trainerLatLon(pos);
      out[2] = row(`±${label}${isSteer ? ' SP' : ''}`, `${id}[]`);
      out[3] = row('', 'UNK');
      out[4] = row(`${ed}EL:${elev}`, 'DTOT[]');
      out[5] = row(w ? (w.cr ? 'CR' : 'NO CR') : '');
      out[6] = row(this.utm ? `${ed}${TRAINER_ZONE} WG84` : `${ed}${ll.lat}`, `?${this.nextNumber()}⊕`);
      out[8] = row(this.utm ? `${ed}${trainerGrid5(pos)}` : `${ed}${ll.lon}`, this.utm ? 'UTM↕' : 'L/L↕');
    }
    out[9] = row(this.error ? 'CDU INPUT ERR' : `[${this.scratch}`, r10);
    return out;
  }

  cursorCol(): number | null { return this.error ? null : 1 + this.scratch.length; }
}
