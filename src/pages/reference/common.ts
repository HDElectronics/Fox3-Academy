/**
 * [OWNER: page-reference] Small DOM helpers shared by the reference sections: match highlighting,
 * tags, links to other lessons and the filter contract every filterable block implements.
 */
import { h } from '../../ui/dom';
import type { AircraftId, AircraftSpec } from '../../data/types';
import type { Units } from './model';
import { splitHits } from './model';

/** A block the quick filter reaches: apply() shows matching rows and returns how many matched. */
export interface Filterable {
  /** Section id (for the per-section count in the contents list). */
  section: string;
  apply(tokens: string[]): number;
}

/** Shared state every section needs. */
export interface RefCtx {
  ac: AircraftId;
  spec: AircraftSpec;
  units: Units;
  /** Switch the selected jet, returning the reader to a section after the remount. */
  switchJet(id: AircraftId, returnTo: string): void;
  /** Register a block with the quick filter. */
  filterable(f: Filterable): void;
}

/** Text with the query words wrapped in <mark>. */
export function hl(text: string, tokens: readonly string[]): (string | HTMLElement)[] {
  if (!tokens.length) return [text];
  return splitHits(text, tokens).map(p => (p.hit ? h('mark', { class: 'ref-mark' }, p.text) : p.text));
}

/** Small placard tag ("YOUR JET", "FC3"). */
export function tag(text: string, kind: 'jet' | 'dim' | 'warn' = 'dim'): HTMLElement {
  return h('span', { class: `ref-tag ref-tag--${kind}` }, text);
}

/** Link to another lesson route, styled as a small cockpit cap. */
export function lessonLink(label: string, route: string, title?: string): HTMLAnchorElement {
  return h('a', { class: 'ui-btn ui-btn--cap ui-btn--s ref-lesson', href: '#/' + route, title }, label, h('span', { 'aria-hidden': 'true', class: 'ref-lesson__arrow' }, '→'));
}

/** "No match" row / block text. */
export function emptyText(what: string): string {
  return `No ${what} match the filter.`;
}
