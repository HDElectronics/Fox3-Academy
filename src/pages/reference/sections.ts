/**
 * [OWNER: page-reference] The reference's URL state, pure so the page and its tests agree on it.
 * ?go=<section> is the section in view in its short form ('missiles' for #ref-missiles); absent means the top of
 * the page. ?q= is the quick filter. Both apply in place; the one-shot params (a jet, a screenshot pre-roll, a
 * missile row or procedure tab to open) need a fresh mount.
 */

/** Params that select a jet or set up content once: a change to any of them remounts the page. */
export const ONE_SHOT_PARAMS = ['ac', 'shot', 'open', 'proc'] as const;

/** Section id to its ?go= form: 'ref-missiles' → 'missiles'. */
export const sectionParam = (id: string): string => id.replace(/^ref-/, '');

/** A ?go= or ?shot= value to a section the page rendered ('missiles' or 'ref-missiles'), else null. */
export function sectionFromParam(value: string | null, rendered: readonly string[]): string | null {
  const v = value?.trim();
  if (!v) return null;
  const id = 'ref-' + v.replace(/^ref-/, '');
  return rendered.includes(id) ? id : null;
}

/** True when a query change can be applied without a remount (only ?go=, ?q= or params the page ignores changed). */
export function appliesInPlace(params: URLSearchParams): boolean {
  return ONE_SHOT_PARAMS.every(k => !params.has(k));
}

/**
 * The query for a reading state. Other params keep their place; q is trimmed and dropped when empty; go names the
 * section in view and is dropped for the first section, which is the top of the page.
 */
export function referenceQuery(params: URLSearchParams, state: { q: string; section: string | null; first: string | null }): string {
  const p = new URLSearchParams(params);
  const q = state.q.trim();
  if (q) p.set('q', q); else p.delete('q');
  if (state.section && state.section !== state.first) p.set('go', sectionParam(state.section)); else p.delete('go');
  return p.toString();
}
