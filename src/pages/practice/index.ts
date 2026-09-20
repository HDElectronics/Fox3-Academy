/** Practice directory: existing experiments and the manual TWS lab. */
import './style.css';
import type { PageFactory } from '../../app/page';
import { PRACTICE_LINKS } from '../../app/navigation';
import { h } from '../../ui';

const factory: PageFactory = () => ({
  mount(ctx) {
    ctx.root.append(h('div', { class: 'practice-hub' },
      h('header', { class: 'practice-intro' },
        h('p', { class: 'practice-eyebrow' }, ctx.app.spec.short + ' · Hands-on practice'),
        h('h1', null, 'Your controls. Your pace.'),
        h('p', null, 'Choose a lab, change the setup and see what happens in 3D. Use the aircraft selector above to practise in another jet.')),
      h('div', { class: 'practice-grid' }, PRACTICE_LINKS.map((link, index) =>
        h('a', { class: 'practice-card', href: '#/' + link.path },
          h('span', { class: 'practice-card__kind' }, index === 0 ? 'Manual lab' : 'Interactive experiment'),
          h('h2', null, link.label), h('p', null, link.description ?? ''),
          h('span', { class: 'practice-card__open' }, 'Open lab →')))),
      h('div', { class: 'practice-next' },
        h('p', null, 'Need the basics? Follow the lessons. Ready to put it together? Fly an engagement and review the debrief.'),
        h('a', { href: '#/learn' }, 'Learn the sequence'),
        h('a', { href: '#/sortie' }, 'Fly a sortie')),
      h('p', { class: 'practice-note' }, 'DCS gameplay practice with simplified simulation rules. These labs are not a complete aircraft or cockpit simulator.')));
  },
  unmount() {},
});
export default factory;
