/**
 * Learn home: the lesson path as cards, one per step of src/app/lessonPath.ts, then the Fly card the path hands
 * off to. Completion comes from the progress model (`pathProgress`), so these cards, the Learn bar and Progress
 * count the same goals. Pure card models (`pathCards`, `flyCard`) are tested in pathCards.test.ts.
 */
import { routeFor } from '../../app/routes';
import { routeOf } from '../../app/lessonPath';
import { SINGLE_FLAG_ROUTES, doneElsewhere, type LessonRoute, type ProgressReader } from '../../app/learningProgress';
import type { Units } from '../../app/format';
import { AIRCRAFT } from '../../data/aircraft';
import type { AircraftId, AircraftSpec } from '../../data/types';
import { cx, h } from '../../ui';
import { LESSONS as STRIKE_LESSONS } from '../strike/lessons';
import { lessonsFor as casLessons } from '../cas/lessons';
import type { PathProgress, StepProgress } from '../progress/model';
import { lessonLine } from './facts';

export type CardState = 'done' | 'next' | 'todo';
export interface PathCard {
  /** Step number, 1-based. */
  num: number;
  route: string;
  label: string;
  title: string;
  line: string;
  state: CardState;
  /** 'Done', 'Next', 'Not flown', or '2 of 7' on a page with several lessons. */
  stateText: string;
  /** Route path and query the card opens: the first lesson left on that page, else the page. */
  path: string;
  foot: string | null;
}

/** Route titles open with the jets they teach ("Su-25T: find..."); the card sits under the jet's name already. */
export const ownTitle = (title: string): string => {
  const m = /^([^:]+): (.+)$/.exec(title);
  return m && Object.values(AIRCRAFT).some(a => m[1]!.includes(a.short)) ? m[2]!.charAt(0).toUpperCase() + m[2]!.slice(1) : title;
};

const isSingleFlag = (route: string): route is LessonRoute => (SINGLE_FLAG_ROUTES as readonly string[]).includes(route);

function card(step: StepProgress, i: number, isNext: boolean, spec: AircraftSpec | null, units: Units, get: ProgressReader): PathCard {
  const route = routeOf(step.link.path);
  const several = step.total > 1;
  const state: CardState = step.complete ? 'done' : isNext ? 'next' : 'todo';
  const stateText = step.complete ? 'Done' : several ? `${step.done} of ${step.total}` : isNext ? 'Next' : 'Not flown';
  const line = spec && isSingleFlag(route) ? lessonLine(route, spec, units) : ownTitle(routeFor(route).title);
  let foot: string | null = null;
  if (several) {
    // The page's first lesson often shares the page's name (Pattern & landing): then say how many there are.
    foot = !step.next ? 'Every lesson done'
      : step.next.label === step.link.label ? `${step.total} lessons on this page` : 'Next: ' + step.next.label;
  } else if (spec && isSingleFlag(route)) {
    const others = doneElsewhere(route, spec.id, get);
    if (others.length) foot = 'Done in ' + (others.length > 3 ? `${others.length} other jets` : others.map(o => AIRCRAFT[o].short).join(', '));
  }
  return { num: i + 1, route, label: step.link.label, title: step.link.title, line, state, stateText,
    path: step.next?.path ?? step.link.path, foot };
}

/** One card per step. `spec` is the fighter (for the BVR lesson lines); null for an attack jet. */
export function pathCards(p: PathProgress, spec: AircraftSpec | null, units: Units, get: ProgressReader): PathCard[] {
  return p.steps.map((s, i) => card(s, i, p.status.next.index === i, spec, units, get));
}

export interface FlyCardModel { path: string; title: string; line: string; flown: boolean; next: boolean }
/** The Fly card: the sortie the path hands off to. Lit as next once every step is done. */
export function flyCard(p: PathProgress, spec: AircraftSpec | null, units: Units): FlyCardModel {
  const jet = p.id;
  const line = spec ? lessonLine('sortie', spec, units)
    : jet === 'su25t' ? STRIKE_LESSONS.sortie.goal : casLessons(jet === 'a10c' ? 'a10c' : 'su25t').sortie.goal;
  return { path: p.fly.path, title: p.fly.title, line, flown: p.fly.done, next: p.status.complete };
}

// ------------------------------------------------------------------------------------------ DOM

function cardEl(c: PathCard): HTMLElement {
  return h('a', {
    class: 'hg-lesson', href: '#/' + c.path, dataset: { state: c.state, route: c.route }, id: `hg-lesson-${c.route}`,
    'aria-label': `${c.num}. ${c.label}: ${c.title}. ${c.stateText}.`,
  },
  h('span', { class: 'hg-lesson__num', 'aria-hidden': 'true' }, String(c.num)),
  h('span', { class: 'hg-lesson__route' }, c.label),
  h('span', { class: 'hg-lesson__state' }, h('span', { class: 'hg-lesson__lamp', 'aria-hidden': 'true' }), c.stateText),
  h('span', { class: 'hg-lesson__title' }, c.title),
  h('span', { class: 'hg-lesson__line' }, c.line),
  c.foot ? h('span', { class: 'hg-lesson__foot' }, c.foot) : null);
}

function flyEl(f: FlyCardModel): HTMLElement {
  const stateText = f.flown ? 'Flown' : f.next ? 'Next' : 'Not flown';
  return h('a', {
    class: cx('hg-lesson', 'hg-lesson--fly'), href: '#/' + f.path, dataset: { state: f.flown ? 'done' : f.next ? 'next' : 'todo', route: 'fly' }, id: 'hg-lesson-fly',
    'aria-label': `Then fly. ${f.title}. ${stateText}.`,
  },
  h('span', { class: 'hg-lesson__num', 'aria-hidden': 'true' }, '→'),
  h('span', { class: 'hg-lesson__route' }, 'Then fly'),
  h('span', { class: 'hg-lesson__state' }, h('span', { class: 'hg-lesson__lamp', 'aria-hidden': 'true' }), stateText),
  h('span', { class: 'hg-lesson__title' }, f.title),
  h('span', { class: 'hg-lesson__line' }, f.line));
}

/** The lesson path section: numbered cards, the Fly card last. */
export function pathSection(p: PathProgress, spec: AircraftSpec | null, units: Units, get: ProgressReader,
  lead: string, extra?: HTMLElement | null): HTMLElement {
  const cards = pathCards(p, spec, units, get).map(c => h('li', null, cardEl(c)));
  cards.push(h('li', null, flyEl(flyCard(p, spec, units))));
  return h('section', { class: 'hg-lessons', id: 'hg-lessons', 'aria-labelledby': 'hg-lessons-h' },
    h('header', { class: 'hg-sechead' },
      h('h2', { id: 'hg-lessons-h' }, 'Lesson path'),
      h('p', null, lead)),
    h('ol', { class: 'hg-path' }, cards),
    extra ?? null);
}

/** Selected jet, for the card lines: the fighter spec, or null for an attack jet. */
export const fighterSpecOf = (jet: AircraftId): AircraftSpec | null => {
  const spec = AIRCRAFT[jet];
  return spec.role === 'fighter' ? spec : null;
};
