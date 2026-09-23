/**
 * [OWNER: page-radar-lab] Which DCS keys operate the radar in this jet, read from PROCEDURES binds.
 * Every jet stores the keyboard default in the structured `keyboard` field.
 * Where a jet has no keyboard default for a lab function, the FC3 default is offered instead and
 * flagged `fallback` so the UI can say so.
 */
import { AIRCRAFT } from '../../data/aircraft';
import { PROCEDURES } from '../../data/procedures';
import type { FighterId, KeyBind } from '../../data/types';
import { parseChord, splitAlternatives } from '../../ui/keys';

export interface KeyPair {
  /** First alternative: up / left / wider / zoom in / farther. */
  a: string;
  /** Second alternative: down / right / narrower / zoom out / nearer. */
  b: string;
  /** Text for kbd(): 'RShift + ; / RShift + .'. */
  text: string;
  /** Not this jet's own default: the FC3 key offered as a lab shortcut. */
  fallback: boolean;
}

export interface LabKeys {
  elev: KeyPair | null;
  zone: KeyPair | null;
  width: KeyPair | null;
  range: KeyPair | null;
  /** FC3 Russian range-angle aiming: expected target range + / −. */
  expRange: KeyPair | null;
  mode: { key: string; text: string; hold: boolean; fallback: boolean } | null;
  /** Cursor slew: physical keys ; . , / (up, down, left, right). */
  cursor: { text: string; fallback: boolean };
}

const FC3_DEFAULT = {
  elev: 'RShift + ; / RShift + .',
  zone: 'RShift + , / RShift + /',
  width: 'RCtrl + = / RCtrl + -',
  range: '= / -',
  mode: 'RAlt + I',
};

function pairOf(text: string | null, fallback: boolean): KeyPair | null {
  if (!text) return null;
  const alts = splitAlternatives(text);
  if (alts.length !== 2) return null;
  const [a, b] = alts.map(s => parseChord(s));
  if (!a || !b) return null;
  return { a: a.text, b: b.text, text, fallback };
}

function find(ac: FighterId, re: RegExp): KeyBind | undefined {
  return PROCEDURES[ac].binds.find(b => re.test(b.action));
}

export function labKeys(ac: FighterId): LabKeys {
  const own = (re: RegExp) => { const b = find(ac, re); return b ? b.keyboard : null; };
  const spec = AIRCRAFT[ac];
  const out: LabKeys = {
    elev: pairOf(own(/antenna elevation|scan elevation/i), false),
    zone: pairOf(own(/scan zone left/i), false),
    width: spec.radar.azHalfWidthOptionsDeg.length > 1 ? pairOf(own(/scan width/i), false) : null,
    range: pairOf(own(/display range|^range scale/i), false),
    expRange: pairOf(own(/expected target range/i), false),
    mode: null,
    cursor: { text: '; , . /', fallback: true },
  };
  const modeBind = find(ac, /RWS \/ TWS|TWS on \/ off/i);
  const modeKey = modeBind ? modeBind.keyboard : null;
  if (modeKey && parseChord(modeKey)) {
    out.mode = { key: parseChord(modeKey)?.text ?? modeKey, text: modeKey, hold: /hold 1 s/i.test(modeBind?.action ?? ''), fallback: false };
  }
  const cursor = own(/cursor.*slew/i);
  if (cursor && /;/.test(cursor)) out.cursor = { text: cursor, fallback: false };

  // Chords the jet already uses: a fallback must not steal one (Hornet '= / -' is antenna elevation).
  const used = new Set<string>();
  for (const k of [';', '.', ',', '/']) used.add(parseChord(k)?.text ?? k);
  const take = (p: KeyPair | null) => { if (p) { used.add(p.a); used.add(p.b); } return p; };
  take(out.elev); take(out.zone); take(out.width); take(out.range); take(out.expRange);
  if (out.mode) used.add(out.mode.key);
  const free = (p: KeyPair | null) => !!p && !used.has(p.a) && !used.has(p.b);

  if (!out.elev) { const p = pairOf(FC3_DEFAULT.elev, true); if (free(p)) out.elev = take(p); }
  if (!out.zone && !spec.radar.azHalfWidthOptionsDeg.every(a => a >= spec.radar.gimbalAzDeg)) {
    const p = pairOf(FC3_DEFAULT.zone, true); if (free(p)) out.zone = take(p);
  }
  if (!out.width && spec.radar.azHalfWidthOptionsDeg.length > 1) { const p = pairOf(FC3_DEFAULT.width, true); if (free(p)) out.width = take(p); }
  if (!out.range) { const p = pairOf(FC3_DEFAULT.range, true); if (free(p)) out.range = take(p); }
  if (!out.mode && spec.radar.tws && spec.radar.modes.includes('tws') && !used.has('RAlt+I')) {
    out.mode = { key: 'RAlt+I', text: FC3_DEFAULT.mode, hold: false, fallback: true };
  }
  return out;
}
