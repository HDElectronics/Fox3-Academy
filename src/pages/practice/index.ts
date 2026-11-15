/**
 * Practice (#/practice): the labs, free of any lesson sequence. Same header pattern as Reference and Progress
 * (ui `pageHeader`); the way back into the lesson path is the shell's second row (Continue).
 */
import './style.css';
import type { PageFactory } from '../../app/page';
import { PRACTICE_LINKS } from '../../app/navigation';
import { h, pageHeader } from '../../ui';

const factory: PageFactory = () => ({
  mount(ctx) {
    ctx.root.append(h('div', { class: 'practice-hub' },
      pageHeader({
        title: 'Practice labs',
        meta: `${ctx.app.spec.short} · No lesson sequence`,
        lede: 'Choose a lab, change the setup and see what happens in 3D. Use the aircraft selector above to practise in another jet.',
        class: 'practice-intro',
      }),
      h('ul', { class: 'practice-grid' }, PRACTICE_LINKS.map((link, index) => h('li', null,
        h('a', { class: 'practice-card', href: '#/' + link.path },
          h('span', { class: 'practice-card__kind' }, index === 0 ? 'Manual lab' : 'Interactive experiment'),
          h('h2', null, link.label), h('p', null, link.description ?? ''),
          h('span', { class: 'practice-card__open', 'aria-hidden': 'true' }, 'Open lab →'))))),
      h('p', { class: 'practice-note' }, 'DCS gameplay practice with simplified simulation rules. These labs are not a complete aircraft or cockpit simulator.')));
  },
  unmount() {},
});
export default factory;
