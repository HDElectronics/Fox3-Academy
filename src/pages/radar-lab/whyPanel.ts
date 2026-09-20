/**
 * [OWNER: page-radar-lab] The "Why" panel: for the clicked target, why the radar does or does not see it
 * right now (gimbal, azimuth, bars, range, notch), one check per row plus the lead reason in words.
 * `whySentence` is pure (tested); the panel only renders it.
 */
import { button, h, readouts, setAttr, setText, placard, type ReadoutsHandle } from '../../ui';
import type { Units } from '../../app/format';
import { D2R, MPS_PER_KT } from '../../sim/math';
import { alt, dAlt, gateText, rng, sdeg, seconds, speedText } from './geometry';

export interface WhyData {
  callsign: string;
  type: string;
  units: Units;
  range: number;
  groundRange: number;
  alt: number;
  ownAlt: number;
  aspectDeg: number;
  /** Degrees rel nose / horizon. */
  az: number;
  el: number;
  azLo: number;
  azHi: number;
  gimbalAz: number;
  top: number;
  bottom: number;
  inGimbal: boolean;
  inAz: boolean;
  inBars: boolean;
  detectRange: number;
  beyond: boolean;
  lookDown: boolean;
  radial: number;
  gate: number;
  notched: boolean;
  notchNeedsLookDown: boolean;
  seenNow: boolean;
  lastPaintAgo: number | null;
  frame: number;
  radarOff: boolean;
  /** Target RCS (m²) used for the detection range. */
  rcs: number;
  /** VS (velocity search) is selected and he is not closing fast enough to show. */
  vsOpening?: boolean;
}

export type WhyTone = 'ok' | 'caution' | 'warning';

/** Status word, tone, lead sentence and the other reasons (short). */
export function whySentence(d: WhyData): { status: string; tone: WhyTone; lead: string; also: string[] } {
  const u = d.units;
  const also: string[] = [];
  const reasons: { short: string; long: string }[] = [];
  if (d.radarOff) return { status: 'RADAR OFF', tone: 'warning', lead: 'The radar is off.', also };
  if (!d.inGimbal) {
    reasons.push({ short: 'outside the gimbal', long: `Outside the gimbal: ${sdeg(d.az, 0)} off the nose, the antenna only reaches ±${d.gimbalAz}°. Turn toward him.` });
  } else if (!d.inAz) {
    const right = d.az > d.azHi;
    const by = right ? d.az - d.azHi : d.azLo - d.az;
    reasons.push({ short: 'outside the azimuth', long: `Outside the scan azimuth: ${by.toFixed(0)}° ${right ? 'right' : 'left'} of the scan edge. Slew the scan centre ${right ? 'right' : 'left'} or widen the scan.` });
  }
  if (!d.inBars) {
    const above = d.el > d.top;
    const byDeg = above ? d.el - d.top : d.bottom - d.el;
    const edge = above ? d.top : d.bottom;
    const edgeAlt = d.ownAlt + d.groundRange * Math.tan(edge * D2R);
    reasons.push({
      short: above ? 'above the bars' : 'below the bars',
      long: `${byDeg.toFixed(1)}° ${above ? 'above' : 'below'} the scan: ${dAlt(d.alt - edgeAlt, u).replace(/^[+−]/, '')} ${above ? 'over the top' : 'under the bottom'} of the bars at ${rng(d.groundRange, u)}. Tilt the antenna ${above ? 'up' : 'down'}.`,
    });
  }
  if (d.beyond) {
    const asp = d.aspectDeg < 60 ? 'hot' : d.aspectDeg > 120 ? 'cold' : 'beaming';
    reasons.push({ short: 'beyond range', long: `Beyond detection range: he is ${rng(d.range, u)} away; your radar sees a ${asp}${d.lookDown ? ', look-down' : ''} ${d.type} (${d.rcs} m²) at ${rng(d.detectRange, u)}. Close in, or wait for him to turn hot.` });
  }
  if (d.notched) {
    reasons.push({
      short: 'in the notch',
      long: `In the notch: ${speedText(d.radial, u)} radial speed against the ground, under your ${gateText(d.gate, u)} gate. He is beaming you${d.notchNeedsLookDown ? ' with ground behind him' : ''}.`,
    });
  }
  if (d.vsOpening) {
    reasons.push({ short: 'not closing (VS)', long: 'Not closing: VS plots closure only, so a target that is not flying toward you never shows. Go back to RWS to see him.' });
  }
  if (reasons.length) {
    for (const r of reasons.slice(1)) also.push(r.short);
    if (d.seenNow) {
      // The radar lost him, but the last brick / coasting track is still on the display.
      return { status: 'FADING', tone: 'caution', lead: `${reasons[0].long} His last return is still fading on your scope.`, also };
    }
    return { status: 'NOT SEEN', tone: 'warning', lead: reasons[0].long, also };
  }
  if (d.seenNow) {
    const ago = d.lastPaintAgo ?? 0;
    return { status: 'PAINTED', tone: 'ok', lead: `Painted ${seconds(Math.max(0, ago))} ago: inside the azimuth and the bars, inside detection range, clear of the notch.`, also };
  }
  return { status: 'IN SCAN', tone: 'caution', lead: `Inside the scan and detectable: wait for the beam to cross him. One frame takes ${seconds(d.frame)}.`, also };
}

export class WhyPanel {
  readonly el: HTMLElement;
  private title: HTMLElement;
  private sub: HTMLElement;
  private status: HTMLElement;
  private lead: HTMLElement;
  private also: HTMLElement;
  private rows: ReadoutsHandle;
  private body: HTMLElement;
  private empty: HTMLElement;

  constructor(onNext: () => void) {
    this.title = h('div', { class: 'rl-why__name' });
    this.sub = h('div', { class: 'rl-why__sub' });
    this.status = h('span', { class: 'rl-why__status', role: 'status' });
    this.rows = readouts({
      id: 'rl-why-rows', variant: 'panel',
      rows: [
        { id: 'az', label: 'Azimuth' },
        { id: 'bars', label: 'Bars' },
        { id: 'range', label: 'Range' },
        { id: 'dop', label: 'Doppler' },
      ],
    });
    this.lead = h('p', { class: 'rl-why__lead' });
    this.also = h('p', { class: 'rl-why__also' });
    this.body = h('div', { class: 'rl-why__body' }, h('div', { class: 'rl-why__head' }, h('div', null, this.title, this.sub), this.status), this.rows.el, this.lead, this.also);
    this.empty = h('p', { class: 'rl-why__empty' }, 'Click a jet in the 3D view, on the radar display or in the side view to see why it is, or is not, on your scope.');
    const next = button({ label: 'Next target', size: 's', variant: 'cap', id: 'rl-why-next', onClick: onNext });
    this.el = h('div', { class: 'ui-strip-block rl-why', id: 'rl-why' },
      h('div', { class: 'rl-why__top' }, placard('Why'), next.el), this.empty, this.body);
    this.show(null);
  }

  show(d: WhyData | null): void {
    this.body.hidden = !d;
    this.empty.hidden = !!d;
    if (!d) return;
    const u = d.units;
    const w = whySentence(d);
    setText(this.title, `${d.callsign} · ${d.type}`);
    setText(this.sub, `${rng(d.range, u)} · ${alt(d.alt, u)} · aspect ${Math.round(d.aspectDeg)}°`);
    setText(this.status, w.status);
    setAttr(this.status, 'data-tone', w.tone);
    const r = this.rows;
    r.set('az', d.inGimbal ? `${sdeg(d.az, 0)} · ${sdeg(d.azLo, 0)}…${sdeg(d.azHi, 0)}` : `${sdeg(d.az, 0)} · gimbal ±${d.gimbalAz}°`);
    r.setTone('az', d.inGimbal && d.inAz ? 'ok' : 'warning');
    r.set('bars', `${sdeg(d.el)} · ${sdeg(d.bottom)}…${sdeg(d.top)}`);
    r.setTone('bars', d.inBars ? 'ok' : 'warning');
    r.set('range', `${rng(d.range, u)} · sees ${rng(d.detectRange, u)}`);
    r.setTone('range', d.beyond ? 'warning' : d.range > 0.8 * d.detectRange ? 'caution' : 'ok');
    r.set('dop', `${speedText(d.radial, u)} · gate ${gateShort(d.gate, u)}`);
    r.setTone('dop', d.notched ? 'warning' : 'ok');
    setText(this.lead, w.lead);
    setText(this.also, w.also.length ? 'Also ' + w.also.join(', ') + '.' : '');
    this.also.hidden = !w.also.length;
  }
}

/** Gate in the pilot's units, rounded as gateText rounds it ('210 km/h', '113 kt'). */
function gateShort(mps: number, u: Units): string {
  return u === 'metric' ? `${Math.round(mps * 3.6 / 5) * 5} km/h` : `${Math.round(mps / MPS_PER_KT)} kt`;
}
