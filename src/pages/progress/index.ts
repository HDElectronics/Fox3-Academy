/** Fleet progress (#/progress): existing local completions. ?shot=empty|mixed|complete is a read-only preview. */
import './style.css';
import type { PageFactory } from '../../app/page';
import { AIRCRAFT } from '../../data/aircraft';
import { h, cleanup } from '../../ui';
import { fleetProgress, progressTotals, previewProgress, type JetProgress } from './model';

const factory: PageFactory = () => {
  const bag = cleanup();
  return {
    mount(ctx) {
      const preview = previewProgress(ctx.params.get('shot'));
      const root = h('div', { class: 'progress-page' });
      ctx.root.append(root);
      const render = () => {
        const jets = fleetProgress(preview ?? (key => ctx.app.getProgress(key)));
        const totals = progressTotals(jets);
        const selected = jets.find(j => j.id === ctx.app.jet);
        const ordered = selected ? [selected, ...jets.filter(j => j !== selected)] : jets;
        root.replaceChildren(
          h('header', { class: 'progress-intro' },
            h('p', { class: 'progress-eyebrow' }, 'Learn · All aircraft'),
            h('h1', null, 'Your flight log'),
            preview ? h('p', { class: 'progress-empty' }, 'Preview data. Saved progress is unchanged.') : null,
            h('p', null, 'See what you have completed and choose the next lesson for any jet.'),
            h('p', { class: 'progress-note' }, 'Saved in this browser. Progress does not sync between devices. Only lessons available for each jet count.')),
          h('dl', { class: 'progress-summary', 'aria-label': 'Fleet progress' },
            stat('Goals completed', `${totals.completed} / ${totals.total}`),
            stat('Jets with completions', `${totals.started} / ${jets.length}`),
            stat('Jets complete', `${totals.finished} / ${jets.length}`)),
          ...(totals.completed === 0 ? [h('p', { class: 'progress-empty' }, 'No completed lessons saved yet. Choose a jet below to begin. Your results will appear here.')] : []),
          h('div', { class: 'progress-grid' }, ordered.map(j => card(j, j.id === ctx.app.jet))),
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

function card(jet: JetProgress, selected: boolean): HTMLElement {
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
      h('ul', { class: 'progress-lessons' }, jet.goals.map(goal => h('li', null,
        h('a', { href: goal.href }, goal.label),
        h('span', { class: 'progress-status', dataset: { done: String(goal.done) } }, goal.done ? 'Complete' : 'Incomplete'))))),
  );
}
