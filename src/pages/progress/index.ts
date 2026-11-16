/**
 * Fleet progress (#/progress): existing local completions, one card per jet, its goals grouped by lesson-path
 * step (src/app/lessonPath.ts) so it reads like the Learn path. ?shot=empty|mixed|complete is a read-only preview.
 */
import './style.css';
import type { PageFactory } from '../../app/page';
import { AIRCRAFT } from '../../data/aircraft';
import { h, cleanup, pageHeader } from '../../ui';
import type { ProgressReader } from '../../app/learningProgress';
import { fleetProgress, pathProgress, progressTotals, previewProgress, type JetProgress, type ProgressGoal } from './model';

const factory: PageFactory = () => {
  const bag = cleanup();
  return {
    mount(ctx) {
      const preview = previewProgress(ctx.params.get('shot'));
      const root = h('div', { class: 'progress-page' });
      ctx.root.append(root);
      const render = () => {
        const get: ProgressReader = preview ?? (key => ctx.app.getProgress(key));
        const jets = fleetProgress(get);
        const totals = progressTotals(jets);
        const selected = jets.find(j => j.id === ctx.app.jet);
        const ordered = selected ? [selected, ...jets.filter(j => j !== selected)] : jets;
        root.replaceChildren(
          pageHeader({
            title: 'Flight log',
            meta: 'All aircraft · Saved in this browser',
            lede: 'What you have completed, jet by jet, and the next lesson for each.',
            class: 'progress-intro',
          }),
          ...(preview ? [h('p', { class: 'progress-empty' }, 'Preview data. Saved progress is unchanged.')] : []),
          h('dl', { class: 'progress-summary', 'aria-label': 'Fleet progress' },
            stat('Goals completed', `${totals.completed} / ${totals.total}`),
            stat('Jets with completions', `${totals.started} / ${jets.length}`),
            stat('Jets complete', `${totals.finished} / ${jets.length}`)),
          ...(totals.completed === 0 ? [h('p', { class: 'progress-empty' }, 'No completed lessons saved yet. Choose a jet below to begin. Your results will appear here.')] : []),
          h('div', { class: 'progress-grid' }, ordered.map(j => card(j, j.id === ctx.app.jet, get))),
          h('p', { class: 'progress-note' }, 'Progress does not sync between devices. Only lessons available for each jet count.'),
        );
      };
      render();
      bag.add(ctx.app.subscribe((_, what) => { if (what === 'progress') render(); }));
    },
    unmount() { bag.dispose(); },
  };
};
export default factory;

function stat(label: string, value: string): HTMLElement {
  return h('div', null, h('dt', null, label), h('dd', null, value));
}

const status = (done: boolean, text?: string) =>
  h('span', { class: 'progress-status', dataset: { done: String(done) } }, text ?? (done ? 'Complete' : 'Incomplete'));
const goalItem = (goal: ProgressGoal) => h('li', null, h('a', { href: goal.href }, goal.label), status(goal.done));

/** The jet's goals grouped by lesson-path step; a page with several lessons lists them under its step. */
function lessonList(jet: JetProgress, get: ProgressReader): HTMLElement {
  const path = pathProgress(jet.id, get);
  const steps = path.steps.map((s, i) => {
    const head = h('span', { class: 'progress-step__name' }, h('span', { class: 'progress-step__num', 'aria-hidden': 'true' }, String(i + 1)), s.link.label);
    if (s.total === 1) return h('li', { class: 'progress-step' }, h('a', { href: s.goals[0]!.href }, head), status(s.complete));
    return h('li', { class: 'progress-step progress-step--group' },
      h('div', { class: 'progress-step__row' }, head, status(s.complete, s.complete ? 'Complete' : `${s.done} of ${s.total}`)),
      h('ul', { class: 'progress-lessons progress-lessons--sub' }, s.goals.map(goalItem)));
  });
  // A fighter's BVR sortie is its own goal after the path; an attack jet's sortie is a lesson of its pages.
  const sortie = jet.goals.find(g => g.id === 'sortie');
  return h('ol', { class: 'progress-lessons' }, steps,
    sortie ? h('li', { class: 'progress-step' }, h('a', { href: sortie.href },
      h('span', { class: 'progress-step__name' }, h('span', { class: 'progress-step__num', 'aria-hidden': 'true' }, '→'), 'Fly: ' + sortie.label)), status(sortie.done)) : null);
}

function card(jet: JetProgress, selected: boolean, get: ProgressReader): HTMLElement {
  const spec = AIRCRAFT[jet.id];
  const complete = jet.completed === jet.total;
  return h('article', { class: 'progress-card', dataset: { selected: String(selected), aircraft: jet.id } },
    h('header', null,
      h('p', { class: 'progress-card__kind' }, selected ? 'Selected jet' : spec.role === 'attack' ? 'Strike lessons' : 'Fighter lessons'),
      h('h2', null, spec.short), h('p', { class: 'progress-card__name' }, spec.name)),
    h('div', { class: 'progress-card__meter' },
      h('span', null, `${jet.completed} of ${jet.total} completed`),
      h('progress', { max: jet.total, value: jet.completed, 'aria-label': `${spec.short}: ${jet.completed} of ${jet.total} goals completed` })),
    jet.scores.length ? h('dl', { class: 'progress-scores' }, jet.scores.map(s => stat(s.label, s.value))) : null,
    jet.next ? h('a', { class: 'progress-continue ui-btn ui-btn--primary', href: jet.next.href }, `Continue: ${jet.next.label} →`)
      : h('p', { class: 'progress-complete' }, 'All current goals complete. Revisit any lesson below.'),
    h('details', { open: selected || complete },
      h('summary', null, 'Lessons and results'),
      lessonList(jet, get)),
  );
}
