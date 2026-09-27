/**
 * [OWNER: page-cas] Kneeboard 9-line card: one field per line in the DCS order, typed by the pilot while the JTAC
 * reads, then graded against the brief with the right answers revealed. Pure DOM (no canvas).
 */
import { h, placard, type Cleanup } from '../../ui';
import { NINE_LINE_ORDER, gradeKneeboard, lineText, type KneeboardEntry, type KneeboardGrade, type NineLine, type NineLineField } from './nineLine';

const LABEL: Record<NineLineField, string> = {
  ip: '1 IP', heading: '2 Heading', distance: '3 Distance', elevation: '4 Elevation', description: '5 Target',
  location: '6 Grid', mark: '7 Mark', friendlies: '8 Friendlies', egress: '9 Egress',
};
/** Neutral hints: the format of each line, never a value from the brief. */
const HINT: Record<NineLineField, string> = {
  ip: 'IP name', heading: 'deg', distance: 'nm', elevation: 'ft MSL', description: 'type and number',
  location: 'grid', mark: 'mark type', friendlies: 'direction and m', egress: 'egress point',
};

export interface KneeboardHandle {
  el: HTMLElement;
  values(): KneeboardEntry;
  /** Grade the card, mark each line right or wrong and show the brief's line next to it. */
  grade(nl: NineLine): KneeboardGrade;
  /** Show the remarks as the JTAC reads them. */
  setRemarks(lines: string[]): void;
  /** Fill every line from the brief (scripted demos and screenshots). */
  fill(nl: NineLine, only?: readonly NineLineField[]): void;
  reset(): void;
}

export function kneeboard(bag: Cleanup, o: { onInput?: () => void } = {}): KneeboardHandle {
  const inputs = new Map<NineLineField, HTMLInputElement>();
  const answers = new Map<NineLineField, HTMLElement>();
  const rows = NINE_LINE_ORDER.map(f => {
    const id = `cas-kb-${f}`;
    const input = h('input', { id, type: 'text', class: 'cas-kb__input', autocomplete: 'off', spellcheck: 'false', placeholder: HINT[f], 'aria-label': `Line ${LABEL[f]}` }) as HTMLInputElement;
    bag.on(input, 'input', () => { row.classList.remove('is-ok', 'is-bad'); o.onInput?.(); });
    // Keys typed on the card must not fly the jet or open the radio menu.
    bag.on(input, 'keydown', (e: Event) => e.stopPropagation());
    const answer = h('span', { class: 'cas-kb__answer', hidden: true });
    const row = h('div', { class: 'cas-kb__row' }, h('label', { class: 'cas-kb__label', for: id }, LABEL[f]), input, answer);
    inputs.set(f, input); answers.set(f, answer);
    return row;
  });
  const remarks = h('ul', { class: 'cas-kb__remarks', 'aria-label': 'Remarks' });
  const el = h('div', { class: 'cas-kb', role: 'group', 'aria-label': 'Kneeboard 9-line card' },
    placard('Kneeboard · 9-line'), h('div', { class: 'cas-kb__grid' }, rows), placard('Remarks'), remarks);

  return {
    el,
    values() {
      const out: KneeboardEntry = {};
      for (const [f, i] of inputs) if (i.value.trim()) out[f] = i.value.trim();
      return out;
    },
    grade(nl) {
      const g = gradeKneeboard(nl, this.values());
      NINE_LINE_ORDER.forEach((f, k) => {
        const ok = g.correct.includes(f);
        rows[k]!.classList.toggle('is-ok', ok);
        rows[k]!.classList.toggle('is-bad', !ok);
        const a = answers.get(f)!;
        a.textContent = ok ? 'correct' : lineText(nl, f);
        a.hidden = false;
      });
      return g;
    },
    setRemarks(lines) { remarks.replaceChildren(...lines.map(l => h('li', null, l))); },
    fill(nl, only = NINE_LINE_ORDER) { for (const f of only) inputs.get(f)!.value = lineText(nl, f); },
    reset() {
      for (const i of inputs.values()) i.value = '';
      for (const a of answers.values()) { a.hidden = true; a.textContent = ''; }
      for (const r of rows) r.classList.remove('is-ok', 'is-bad');
      remarks.replaceChildren();
    },
  };
}
