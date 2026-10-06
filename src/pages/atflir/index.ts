/** F/A-18C ATFLIR foundations. Page-local synthetic pod; no flight or weapon simulation. */
import type { PageFactory } from '../../app/page';
import { h, button, row, group, labLayout, bindKeys, cleanup, setText } from '../../ui';
import { ATFLIR_CAVEATS, ATFLIR_SOURCE } from '../../data/atflir';
import { LESSON_ORDER, LESSONS, lessonId, progressKey } from './lessons';
import { AtflirSession, FOVS } from './model';
import { drawPod } from './display';
import './style.css';
const page: PageFactory = () => {
  const clean = cleanup();
  return {
    mount(ctx) {
      const id = lessonId(ctx.params.get('lesson')), lesson = LESSONS[id];
      let session = new AtflirSession(id), saved = false;
      const preview = ctx.params.has('shot');
      if (ctx.params.get('shot') === 'track') {
        session.focused = true; session.x = 140; session.y = -70; session.fov = 2;
        session.mode = 'AUTO'; session.tracked = 'assigned';
        session.message = 'AUTO acquired: single truck. Synthetic image preview; progress is not saved.';
      }
      const canvas = h('canvas', { 'aria-label': 'Synthetic ATFLIR image: warehouse at centre, assigned truck above and right, other truck left.', role: 'img' });
      const message = h('p', { class: 'atflir-feedback', role: 'status', 'aria-live': 'polite' });
      const status = h('p', { class: 'atflir-state' });
      const result = h('p', { class: 'atflir-result', role: 'status' });
      const steps = lesson.steps.map(text => h('li', null, text));
      const nextId = LESSON_ORDER[LESSON_ORDER.indexOf(id) + 1];
      const next = button({ label: nextId ? 'Next lesson' : 'View progress', onClick: () => ctx.navigate(nextId ? `atflir?lesson=${nextId}` : 'progress') });
      const act = (fn: () => void) => { fn(); update(); };
      const scs = button({ label: 'SCS Right', keys: 'RAlt+/', onClick: () => act(() => session.scs()) });
      const un = button({ label: 'Undesignate', keys: 'S', onClick: () => act(() => session.undesignate()) });
      const dep = button({ label: 'Hold TDC depress', lamp: true, onClick: () => act(() => session.depress(!session.depressed)) });
      dep.el.title = 'Trainer latch: click to hold or release. Keyboard Enter is hold/release.';
      const fov = button({ label: 'FOV', keys: 'I', onClick: () => act(() => session.cycleFov()) });
      const sensor = button({ label: 'IR / TV', onClick: () => act(() => { session.ir = !session.ir; }) });
      const polarity = button({ label: 'WHT / BLK', onClick: () => act(() => { session.whiteHot = !session.whiteHot; }) });
      const slew = (x: number, y: number) => act(() => session.slew(x * [20, 10, 5][session.fov]!, y * [20, 10, 5][session.fov]!));
      const directions = h('div', { class: 'atflir-slew' },
        button({ label: 'Up', keys: ';', onClick: () => slew(0, -1) }).el,
        button({ label: 'Left', keys: ',', onClick: () => slew(-1, 0) }).el,
        button({ label: 'Down', keys: '.', onClick: () => slew(0, 1) }).el,
        button({ label: 'Right', keys: '/', onClick: () => slew(1, 0) }).el);
      const obstruction = button({ label: 'Obscure target', onClick: () => act(() => {
        if (session.obscured) { session.obscured = false; session.message = 'Obstruction cleared. Reposition in INR/SCENE and request AUTO again.'; }
        else session.loseTrack();
      }) });
      const tabs = h('nav', { class: 'atflir-lessons', 'aria-label': 'ATFLIR lessons' }, LESSON_ORDER.map((key, i) => h('a', {
        href: `#/atflir?lesson=${key}`, 'aria-current': key === id ? 'page' : undefined,
      }, `${i + 1}. ${LESSONS[key].title}`)));
      const controls = h('div', { class: 'atflir-controls' }, tabs,
        h('section', { class: 'atflir-brief' }, h('div', { class: 'ui-placard' }, `Exercise ${LESSON_ORDER.indexOf(id) + 1} / 4`),
          h('h2', null, lesson.title), h('p', null, lesson.goal), h('ol', { class: 'atflir-steps' }, steps), result, next.el),
        group({ label: 'Right DDI · Sensor control', children: [row(scs.el, un.el), dep.el,
          h('small', null, 'TDC depress: hold Enter, or use the on-screen latch.')] }),
        group({ label: 'TDC slew', children: [directions], hint: 'Each click nudges the view. Hold a keyboard direction for repeated inputs.' }),
        group({ label: 'Image', children: [row(fov.el, sensor.el, polarity.el)] }),
        id === 'recover' ? group({ label: 'Optional lost-track practice', children: [obstruction.el], hint: 'A scripted obstruction, not DCS masking behavior.' }) : null,
        button({ label: 'Restart exercise', variant: 'ghost', onClick: () => { session = new AtflirSession(id); saved = false; update(); } }).el,
        h('details', null, h('summary', null, 'Sources & training limits'), h('p', null, ATFLIR_SOURCE),
          h('ul', null, ATFLIR_CAVEATS.map(text => h('li', null, text)))));
      const viewport = h('div', { class: 'atflir-view' },
        h('div', { class: 'atflir-viewhead' }, h('span', null, 'RIGHT DDI / FLIR'), h('span', null, 'SYNTHETIC TRAINING VIEW')),
        canvas, status, message);
      const layout = labLayout({ id: 'atflir', class: 'atflir', header: { title: 'ATFLIR', meta: 'F/A-18C · Foundation lessons',
        lede: 'Give the pod control. Find, designate and track. Recover when the image stops following.' }, viewport, console: controls });
      ctx.root.append(layout.el); clean.add(() => layout.destroy());
      function update() {
        if (session.complete && !saved && !preview) { ctx.app.setProgress(progressKey(id), true); saved = true; }
        setText(message, session.message);
        setText(status, `TDC ${session.focused ? 'FLIR' : 'NOT ASSIGNED'} · ${FOVS[session.fov]} · ${session.mode === 'AUTO' && !session.tracked ? 'INR AUTO' : session.mode}`);
        steps.forEach((step, i) => { step.dataset.done = String(session.done[i]); step.setAttribute('aria-label', `${session.done[i] ? 'Complete' : 'Pending'}: ${lesson.steps[i]}`); });
        setText(result, session.complete ? preview ? 'Preview — progress not saved.' : 'Exercise complete. Progress saved.' : ctx.app.getProgress(progressKey(id)) === true ? 'Previously completed. This attempt starts fresh.' : 'Complete all three checks to save this lesson.');
        next.el.hidden = !session.complete;
        dep.setLit(session.depressed); dep.el.setAttribute('aria-pressed', String(session.depressed));
        dep.setLabel(session.depressed ? 'Release TDC depress' : 'Hold TDC depress');
        polarity.setDisabled(!session.ir); fov.setLabel(FOVS[session.fov]!);
        obstruction.setLabel(session.obscured ? 'Clear obstruction' : 'Obscure target');
        drawPod(canvas, session);
      }
      clean.add(bindKeys({
        'RAlt+/': () => act(() => session.scs()), S: () => act(() => session.undesignate()),
        I: () => act(() => session.cycleFov()),
        Enter: { down: () => act(() => session.depress(true)), up: () => act(() => session.depress(false)) },
        ';': { down: () => slew(0, -1), repeat: true }, ',': { down: () => slew(-1, 0), repeat: true },
        '.': { down: () => slew(0, 1), repeat: true }, '/': { down: () => slew(1, 0), repeat: true },
      }));
      update();
    },
    unmount() { clean.dispose(); },
  };
};
export default page;
