/**
 * [OWNER: page-cas] The 9-line brief the JTAC reads for a scenario, and the kneeboard grading. Line order and
 * contents follow the ED A-10C II manual (docs/research/cas-jtac.md): IP, heading and offset, distance, target
 * elevation MSL, target type, grid, mark, friendlies, egress, then remarks. Units follow the English DCS radio
 * calls (nm, ft); the grid is a trainer grid, not a real UTM/MGRS square (the Su-25T cannot enter coordinates).
 */
import type { World } from '../../sim/world';
import { type CasScenario, type XZ, bearingDeg, distM } from './scenario';

export type NineLineMark = 'none' | 'wp' | 'laser' | 'ir';
export type NineLineField = 'ip' | 'heading' | 'distance' | 'elevation' | 'description' | 'location' | 'mark' | 'friendlies' | 'egress';
export const NINE_LINE_ORDER: readonly NineLineField[] = ['ip', 'heading', 'distance', 'elevation', 'description', 'location', 'mark', 'friendlies', 'egress'];

export const M_PER_NM = 1852;
export const FT_PER_M = 3.28084;

export interface NineLine {
  ip: string;
  /** IP to target, deg true (rounded to 1°). */
  headingDeg: number;
  /** Offset side, or null (the trainer never offsets). */
  offset: 'left' | 'right' | null;
  distanceNm: number;
  elevationFt: number;
  description: string;
  grid: string;
  mark: NineLineMark;
  /** Friendlies from the target: cardinal direction and distance (m). */
  friendlies: { dir: string; distM: number };
  egress: string;
  /** Final attack heading window (deg true) given in the remarks. */
  attackHdgDeg: readonly [number, number];
  /** Remarks lines (weapon, threats, attack headings, danger close). */
  remarks: string[];
  dangerClose: boolean;
}

const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'] as const;
export function cardinal(deg: number): string { return DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!; }

/**
 * Trainer grid for a point: two letters and 4 + 4 digits at 10 m resolution (e.g. "GH 5000 5000" at the origin).
 * Not a real MGRS square; the lesson only needs the pilot to copy and read it back.
 */
export function trainerGrid(p: XZ): string {
  const e = Math.round((p.x + 50000) / 10), n = Math.round((50000 - p.z) / 10);
  const pad = (v: number) => String(Math.max(0, Math.min(9999, v))).padStart(4, '0');
  return `GH ${pad(e)} ${pad(n)}`;
}

function centre(world: World, ids: readonly string[]): XZ {
  let x = 0, z = 0, n = 0;
  for (const id of ids) { const u = world.groundUnits.get(id); if (u) { x += u.pos.x; z += u.pos.z; n++; } }
  return n ? { x: x / n, z: z / n } : { x: 0, z: 0 };
}

/** The danger-close trainer distance (m): friendlies closer than this to the target make the brief "danger close". */
export const DANGER_CLOSE_M = 500;

export function makeNineLine(sc: CasScenario, mark: NineLineMark = 'wp'): NineLine {
  const w = sc.world;
  const tgt = centre(w, sc.targets);
  const fr = centre(w, sc.friendlies);
  const frDist = distM(tgt, fr);
  const dangerClose = frDist < DANGER_CLOSE_M;
  const [a, b] = sc.attackHdgDeg;
  const pad3 = (d: number) => String(Math.round(d) % 360).padStart(3, '0');
  return {
    ip: sc.ip.name,
    headingDeg: Math.round(bearingDeg(sc.ip, tgt)) % 360,
    offset: null,
    distanceNm: Math.round((distM(sc.ip, tgt) / M_PER_NM) * 10) / 10,
    elevationFt: Math.round((w.groundHeight(tgt.x, tgt.z) * FT_PER_M) / 10) * 10,
    description: `${sc.targets.length} tanks`,
    grid: trainerGrid(tgt),
    mark,
    friendlies: { dir: cardinal(bearingDeg(tgt, fr)), distM: Math.round(frDist / 50) * 50 },
    egress: sc.egress.name,
    attackHdgDeg: sc.attackHdgDeg,
    remarks: [
      'Weapon: Vikhr, or rockets on the smoke talk-on',
      `Final attack heading ${pad3(a)} to ${pad3(b)}`,
      ...(sc.sams.length ? ['Threat: SA-15 north of the target, ZSU-23-4 near the column'] : []),
      ...(dangerClose ? ['Danger close'] : []),
    ],
    dangerClose,
  };
}

/** One line as the JTAC reads it (trainer wording). */
export function lineText(nl: NineLine, f: NineLineField): string {
  switch (f) {
    case 'ip': return `IP ${nl.ip}`;
    case 'heading': return `${String(nl.headingDeg).padStart(3, '0')}${nl.offset ? `, offset ${nl.offset}` : ''}`;
    case 'distance': return `${nl.distanceNm.toFixed(1)} nm`;
    case 'elevation': return `${nl.elevationFt} ft MSL`;
    case 'description': return nl.description;
    case 'location': return nl.grid;
    case 'mark': return nl.mark === 'wp' ? 'WP' : nl.mark === 'ir' ? 'IR pointer' : nl.mark === 'laser' ? 'Laser' : 'None';
    case 'friendlies': return `${nl.friendlies.dir} ${nl.friendlies.distM} m`;
    case 'egress': return `Egress ${nl.egress}`;
  }
}

/** What the pilot wrote on the kneeboard card (free text per field; empty = not copied). */
export type KneeboardEntry = Partial<Record<NineLineField, string>>;

/** Lines the lesson needs right to pass: where to go, what height the target sits at, where it is, the mark, friendlies. */
export const KEY_FIELDS: readonly NineLineField[] = ['ip', 'elevation', 'location', 'mark', 'friendlies'];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const num = (s: string) => { const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : NaN; };

/** Grade one field; numbers get a small tolerance (heading 3°, distance 0.3 nm, elevation 50 ft, friendlies 100 m). */
export function gradeField(nl: NineLine, f: NineLineField, entry: string | undefined): boolean {
  if (!entry || !entry.trim()) return false;
  const e = norm(entry);
  switch (f) {
    case 'ip': return e.replace(/^ip /, '') === norm(nl.ip);
    case 'heading': { const v = num(entry); return Number.isFinite(v) && Math.abs(((v - nl.headingDeg + 540) % 360) - 180) <= 3; }
    case 'distance': return Math.abs(num(entry) - nl.distanceNm) <= 0.3;
    case 'elevation': return Math.abs(num(entry) - nl.elevationFt) <= 50;
    case 'description': return e.includes(norm(nl.description).split(' ').at(-1)!.replace(/s$/, ''));
    case 'location': return e.replace(/\s/g, '') === norm(nl.grid).replace(/\s/g, '');
    case 'mark': {
      const want = { wp: ['wp', 'white phosphorus', 'smoke', 'willy pete'], laser: ['laser'], ir: ['ir', 'ir pointer'], none: ['none', 'no mark'] }[nl.mark];
      return want.some(x => e === x);
    }
    case 'friendlies': return e.includes(nl.friendlies.dir) && Math.abs(num(entry) - nl.friendlies.distM) <= 100;
    case 'egress': return e.replace(/^egress /, '') === norm(nl.egress);
  }
}

export interface KneeboardGrade { correct: NineLineField[]; wrong: NineLineField[]; passed: boolean }

export function gradeKneeboard(nl: NineLine, entry: KneeboardEntry): KneeboardGrade {
  const correct: NineLineField[] = [], wrong: NineLineField[] = [];
  for (const f of NINE_LINE_ORDER) (gradeField(nl, f, entry[f]) ? correct : wrong).push(f);
  return { correct, wrong, passed: KEY_FIELDS.every(f => correct.includes(f)) };
}
