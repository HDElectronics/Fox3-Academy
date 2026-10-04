/**
 * Learn cards for the pages a jet has beyond the shared fighter path (navigation.ts `lessonGroups`, group 'jet'):
 * HARM & SEAD on the F/A-18C, Shkval & Vikhr and CAS & JTAC on the Su-25T, Targeting pod and CAS & JTAC on the
 * A-10C II. Progress comes from the fleet progress model, so Learn and Progress count the same goals. The attack
 * jets have no BVR lesson path: their Learn landing is these cards alone.
 */
import { lessonGroups } from '../../app/navigation';
import { routeFor } from '../../app/routes';
import { AIRCRAFT } from '../../data/aircraft';
import type { AircraftId } from '../../data/types';
import { button, h } from '../../ui';
import { jetProgress, type ProgressGoal } from '../progress/model';
import type { ProgressReader } from './facts';

export interface JetPage { path: string; label: string; title: string; goals: ProgressGoal[]; done: number; next: ProgressGoal | null }

/** Route titles open with the jets they teach ("Su-25T: find..."); the card sits under the jet's name already. */
const ownTitle = (title: string): string => {
  const m = /^([^:]+): (.+)$/.exec(title);
  return m && Object.values(AIRCRAFT).some(a => m[1]!.includes(a.short)) ? m[2]!.charAt(0).toUpperCase() + m[2]!.slice(1) : title;
};

/** The jet's own pages with their goals (a goal belongs to the page its link opens). */
export function jetPages(jet: AircraftId, get: ProgressReader): JetPage[] {
  const goals = jetProgress(jet, get).goals;
  const group = lessonGroups(jet).find(g => g.id === 'jet');
  return (group?.links ?? []).map(link => {
    const path = link.path.split('?')[0]!;
    const mine = goals.filter(g => g.href.startsWith(`#/${path}?`));
    return { path, label: link.label, title: ownTitle(routeFor(path).title), goals: mine, done: mine.filter(g => g.done).length, next: mine.find(g => !g.done) ?? null };
  });
}

/** The first page with a goal left, and that goal. */
export function nextJetGoal(pages: readonly JetPage[]): { page: JetPage; goal: ProgressGoal } | null {
  for (const page of pages) if (page.next) return { page, goal: page.next };
  return null;
}

function card(p: JetPage, i: number, isNext: boolean, open: (href: string) => void): HTMLElement {
  const total = p.goals.length;
  const state = total > 0 && p.done === total ? 'done' : isNext ? 'next' : 'todo';
  const stateText = state === 'done' ? 'Done' : `${p.done} of ${total}`;
  const href = p.next?.href ?? `#/${p.path}`;
  return h('button', {
    type: 'button', class: 'hg-lesson', dataset: { state, route: p.path }, id: `hg-lesson-${p.path}`,
    onclick: () => open(href),
    'aria-label': `${p.label}: ${p.title}. ${p.done} of ${total} lessons done.`,
  },
  h('span', { class: 'hg-lesson__num', 'aria-hidden': 'true' }, String(i + 1)),
  h('span', { class: 'hg-lesson__route' }, p.label),
  h('span', { class: 'hg-lesson__state' }, h('span', { class: 'hg-lesson__lamp', 'aria-hidden': 'true' }), stateText),
  h('span', { class: 'hg-lesson__title' }, p.title),
  p.next ? h('span', { class: 'hg-lesson__foot' }, 'Next: ' + p.next.label) : h('span', { class: 'hg-lesson__foot' }, 'Every lesson done'));
}

/** Section of cards for the jet's own pages; null when the jet has none. `markNext` lights the page Continue opens (the attack landing). */
export function jetPagesSection(jet: AircraftId, get: ProgressReader, open: (href: string) => void, opts: { heading: string; lead: string; markNext?: boolean }): HTMLElement | null {
  const pages = jetPages(jet, get);
  if (!pages.length) return null;
  const next = nextJetGoal(pages);
  return h('section', { class: 'hg-lessons hg-jetpages', id: 'hg-jetpages', 'aria-labelledby': 'hg-jetpages-h' },
    h('header', { class: 'hg-sechead' }, h('h2', { id: 'hg-jetpages-h' }, opts.heading), h('p', null, opts.lead)),
    h('ol', { class: 'hg-path' }, pages.map((p, i) => h('li', null, card(p, i, !!opts.markNext && next?.page === p, open)))));
}

/** Learn landing for an attack jet: who it is, Continue, and its pages. */
export function attackLanding(jet: AircraftId, get: ProgressReader, open: (href: string) => void): HTMLElement {
  const spec = AIRCRAFT[jet];
  const pages = jetPages(jet, get);
  const next = nextJetGoal(pages);
  const started = pages.some(p => p.done > 0);
  const intro = h('header', { class: 'hg-intro' },
    h('div', null, h('p', { class: 'hg-intro__eyebrow' }, 'Learn · ' + spec.short),
      h('h2', null, 'Find it. Mark it. Hit it.'),
      h('p', null, `The ${spec.short} has no air-to-air radar, so its lessons are its own cockpit and close air support.`)),
    h('div', { class: 'hg-entry-links' }, h('a', { href: '#/progress' }, 'Progress across jets →')));
  const id = h('div', { class: 'hg-id hg-id--plain' },
    h('h1', { class: 'hg-name' }, spec.name),
    h('div', { class: 'hg-cta' },
      next ? button({ label: `${started ? 'Continue' : 'Start learning'}: ${next.page.label}, ${next.goal.label}  →`, variant: 'primary', size: 'l', id: 'hg-next', onClick: () => open(next.goal.href) }).el
        : h('p', null, 'Every lesson done. Revisit any page below.')));
  const section = jetPagesSection(jet, get, open, { heading: 'Lessons', lead: `Written for the ${spec.short}. Each page has its own lesson list.`, markNext: true });
  return h('div', { class: 'hg', id: 'hangar' }, intro, id, section);
}
