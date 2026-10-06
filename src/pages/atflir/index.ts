/** F/A-18C ATFLIR foundations. Page-local synthetic pod and simplified laser delivery exercises. */
import type { PageFactory } from '../../app/page';
import { h, button, row, group, labLayout, bindKeys, cleanup, setText } from '../../ui';
import { ATFLIR_CAVEATS, ATFLIR_SOURCE } from '../../data/atflir';
import { LESSON_ORDER, LESSONS, lessonId, progressKey } from './lessons';
import { AtflirSession, FOVS } from './model';
import { SlewInput, SLEW_TAP } from './slew';
import { LaserDeliverySession, type TroubleCase } from './delivery';
import { deliveryControls } from './deliveryControls';
import { LGB_CAVEATS, LGB_SOURCE } from '../../data/fa18cLgb';
import { createLaserCockpit } from './cockpit';
import { PodView } from './display';
import './style.css';
const page: PageFactory = () => {
  const clean = cleanup();
  return {
    mount(ctx) {
      const id = lessonId(ctx.params.get('lesson')), lesson = LESSONS[id];
      let session = new AtflirSession(id), saved = false;
      const preview = ctx.params.has('shot');
      const cases = ['code', 'track', 'laser'] as const;
      const troubleCase: TroubleCase = cases.find(c => c === ctx.params.get('case')) ?? 'code';
      const isDelivery = id === 'laser' || id === 'delivery' || id === 'troubleshoot';
      let delivery = isDelivery ? new LaserDeliverySession(id, troubleCase) : null;
      const preparePod = () => {
        if (!delivery) return;
        session.focused = true; session.x = 140; session.y = -70; session.fov = 2;
        session.message = 'Assigned truck acquired. Use Undesignate if you need to reposition.';
        session.mode = 'AUTO'; session.tracked = 'assigned'; session.designation = { x: 140, y: -70 };
        if (id === 'troubleshoot' && troubleCase === 'track') session.loseTrack();
      };
      preparePod();
      if (ctx.params.get('shot') === 'track') {
        session.focused = true; session.x = 140; session.y = -70; session.fov = 2;
        session.mode = 'AUTO'; session.tracked = 'assigned';
        session.message = 'AUTO acquired: single truck. Synthetic image preview; progress is not saved.';
      }
      if (delivery && ['bomb', 'impact', 'miss'].includes(ctx.params.get('shot') ?? '')) {
        delivery.setBombCode('1688'); delivery.armed = true; delivery.masterArm = true;
        delivery.startRun(); delivery.setRelease(true); delivery.step(8, { onTarget: true });
        if (ctx.params.get('shot') === 'miss') delivery.armed = false;
        delivery.step(ctx.params.get('shot') === 'bomb' ? 5 : 12, { onTarget: true });
      }
      const podHost = h('div', { class: 'atflir-pod-host' });
      let pod: PodView | null = null, range: PodView | null = null;
      let nightVision = ctx.params.get('look') !== 'clean';
      const overview = false;
      let followBomb = true;
      if (ctx.params.get('image') === 'tv') session.ir = false;
      if (ctx.params.get('image') === 'black') session.whiteHot = false;
      const message = h('p', { class: 'atflir-feedback', role: 'status', 'aria-live': 'polite' });
      const status = h('p', { class: 'atflir-state' });
      const result = h('p', { class: 'atflir-result', role: 'status' });
      const steps = lesson.steps.map(text => h('li', null, text));
      const nextId = LESSON_ORDER[LESSON_ORDER.indexOf(id) + 1];
      const next = button({ label: nextId ? 'Next lesson' : 'View progress', onClick: () => ctx.navigate(nextId ? `atflir?lesson=${nextId}` : 'progress') });
      const act = (fn: () => void) => { fn(); update(); };
      const look = button({ label: 'Night vision look', lamp: true, onClick: () => act(() => { nightVision = !nightVision; }) });
      const cameraButton = button({ label: 'Camera: follow bomb', size: 's', onClick: () => act(() => { followBomb = !followBomb; }) });
      const cockpit = createLaserCockpit(() => delivery, () => session, () => update());
      clean.add(() => cockpit.dispose());
      const scs = button({ label: 'SCS Right', keys: 'RAlt+/', onClick: () => act(() => session.scs()) });
      const un = button({ label: 'Undesignate', keys: 'S', onClick: () => act(() => session.undesignate()) });
      const dep = button({ label: 'Hold TDC depress', lamp: true, onClick: () => act(() => session.depress(!session.depressed)) });
      dep.el.title = 'Trainer latch: click to hold or release. Keyboard Enter is hold/release.';
      const fov = button({ label: 'FOV', keys: 'I', onClick: () => act(() => session.cycleFov()) });
      const sensor = button({ label: 'IR / TV', onClick: () => act(() => { session.ir = !session.ir; }) });
      const polarity = button({ label: 'WHT / BLK', onClick: () => act(() => { session.whiteHot = !session.whiteHot; }) });
      const deliveryPanel = delivery ? deliveryControls(() => delivery!, () => update(), clean) : null;
      const input = new SlewInput();
      const tap = (x: number, y: number) => act(() => session.slew(x * SLEW_TAP[session.fov]!, y * SLEW_TAP[session.fov]!));
      const hold = (source: string, x: number, y: number) => { if (input.press(source, x, y)) tap(x, y); };
      const direction = (label: string, keys: string, x: number, y: number) => {
        const b = button({ label, keys, onClick: e => { if (e.detail === 0) tap(x, y); } }).el;
        clean.on<PointerEvent>(b, 'pointerdown', e => {
          if (e.button !== 0) return;
          b.setPointerCapture(e.pointerId); hold(`pointer:${e.pointerId}`, x, y);
        });
        const release = (e: PointerEvent) => input.release(`pointer:${e.pointerId}`);
        clean.on<PointerEvent>(b, 'pointerup', release);
        clean.on<PointerEvent>(b, 'pointercancel', release);
        clean.on<PointerEvent>(b, 'lostpointercapture', release);
        return b;
      };
      const directions = h('div', { class: 'atflir-slew' },
        direction('Up', ';', 0, -1), direction('Left', ',', -1, 0),
        direction('Down', '.', 0, 1), direction('Right', '/', 1, 0));
      const releaseInputs = () => { input.clear(); session.depress(false); delivery?.setTrigger(false); delivery?.setRelease(false); };
      clean.on(window, 'blur', releaseInputs);
      clean.on(document, 'visibilitychange', () => { if (document.hidden) releaseInputs(); });
      let slewFrame = 0, previous = performance.now();
      const advanceSlew = (now: number) => {
        const dt = document.hidden ? 0 : Math.min(.05, (now - previous) / 1000);
        const [dx, dy] = input.step(dt, session.fov); previous = now;
        if (dx || dy) session.slew(dx, dy);
        if (delivery && !preview) delivery.step(dt, { onTarget: session.target === 'assigned' && session.designation !== null && (session.mode === 'SCENE' || session.tracked === 'assigned') });
        if (dx || dy || delivery) update(true);
        slewFrame = requestAnimationFrame(advanceSlew);
      };
      slewFrame = requestAnimationFrame(advanceSlew);
      clean.add(() => { cancelAnimationFrame(slewFrame); input.clear(); });
      const obstruction = button({ label: 'Obscure target', onClick: () => act(() => {
        if (session.obscured) { session.obscured = false; session.message = 'Obstruction cleared. Reposition in INR/SCENE and request AUTO again.'; }
        else session.loseTrack();
      }) });
      const tabs = h('nav', { class: 'atflir-lessons', 'aria-label': 'ATFLIR lessons' }, LESSON_ORDER.map((key, i) => h('a', {
        href: `#/atflir?lesson=${key}`, 'aria-current': key === id ? 'page' : undefined,
      }, `${i + 1}. ${LESSONS[key].title}`)));
      const controls = h('div', { class: 'atflir-controls' }, tabs,
        h('section', { class: 'atflir-brief' }, h('div', { class: 'ui-placard' }, `Exercise ${LESSON_ORDER.indexOf(id) + 1} / ${LESSON_ORDER.length}`),
          h('h2', null, lesson.title), h('p', null, lesson.goal), h('ol', { class: 'atflir-steps' }, steps), result, next.el),
        id === 'troubleshoot' ? h('nav', { class: 'atflir-lessons', 'aria-label': 'Troubleshooting cases' }, cases.map(c => h('a', { href: `#/atflir?lesson=troubleshoot&case=${c}`, 'aria-current': troubleCase === c ? 'page' : undefined }, `${c === 'code' ? 'Code mismatch' : c === 'track' ? 'Lost track' : 'Laser off'}${ctx.app.getProgress(`atflir:troubleshoot:${c}:fa18c`) ? ' · Done' : ''}`))) : null,
        deliveryPanel?.el,
        group({ label: 'Right DDI · Sensor control', children: [row(scs.el, un.el), dep.el,
          h('small', null, 'TDC depress: hold Enter, or use the on-screen latch.')] }),
        group({ label: 'TDC slew', children: [directions], hint: 'Hold a direction button or key to slew smoothly. Tap for fine adjustments; narrower FOV slows the slew.' }),
        group({ label: 'Image', children: [row(fov.el, sensor.el, polarity.el)] }),
        group({ label: 'Viewing aid', children: [look.el], hint: 'Green phosphor filter. A visual aid, not a separate ATFLIR mode.' }),
        (id === 'recover' || isDelivery) ? group({ label: 'Optional lost-track practice', children: [obstruction.el], hint: 'A scripted obstruction, not DCS masking behavior.' }) : null,
        button({ label: 'Restart exercise', variant: 'ghost', onClick: () => { input.clear(); session = new AtflirSession(id); delivery = isDelivery ? new LaserDeliverySession(id, troubleCase) : null; preparePod(); cockpit.reset(); saved = false; update(); } }).el,
        h('details', null, h('summary', null, 'Sources & training limits'), h('p', null, ATFLIR_SOURCE), delivery ? h('p', null, LGB_SOURCE) : null,
          h('ul', null, [...ATFLIR_CAVEATS, ...(delivery ? LGB_CAVEATS : [])].map(text => h('li', null, text)))));
      const viewport = h('div', { class: 'atflir-view' },
        h('div', { class: 'atflir-viewhead' }, h('span', null, '3D TRAINING RANGE'), h('span', { class: 'atflir-view-tools' }, cameraButton.el)),
        podHost, status, message);
      const layout = labLayout({ id: 'atflir', class: 'atflir', header: { title: 'ATFLIR', meta: 'F/A-18C · Pod & laser weapons',
        lede: 'Find, designate and track. Set laser codes, deliver a GBU-12 and troubleshoot the shot.' }, viewport, strip: cockpit.blocks, console: controls });
      ctx.root.append(layout.el); clean.add(() => layout.destroy());
      try {
        range = new PodView(session); podHost.append(range.el); clean.add(() => range?.dispose());
        pod = new PodView(session); cockpit.podHost.append(pod.el); clean.add(() => pod?.dispose());
      } catch (error) {
        podHost.append(h('p', { class: 'atflir-webgl-error', role: 'alert' }, 'The 3D pod view needs WebGL. Enable graphics acceleration and reload to use this trainer.'));
        console.error('ATFLIR 3D view failed to initialise', error);
      }
      function update(continuous = false) {
        const done = delivery?.done ?? session.done;
        const complete = delivery?.complete ?? session.complete;
        if (complete && !saved && !preview) {
          if (id === 'troubleshoot') {
            ctx.app.setProgress(`atflir:troubleshoot:${troubleCase}:fa18c`, true);
            if (cases.every(c => ctx.app.getProgress(`atflir:troubleshoot:${c}:fa18c`) === true)) ctx.app.setProgress(progressKey(id), true);
          } else ctx.app.setProgress(progressKey(id), true);
          saved = true;
        }
        deliveryPanel?.update(); cockpit.update();
        pod?.setDelivery(delivery); range?.setDelivery(delivery);
        range?.setFollowBomb(followBomb); cameraButton.setLabel(followBomb ? 'Camera: follow bomb' : 'Camera: range');
        setText(message, delivery ? `${delivery.message} ${session.message}` : session.message);
        setText(status, `TDC ${session.focused ? 'FLIR' : 'NOT ASSIGNED'} · ${FOVS[session.fov]} · ${session.mode === 'AUTO' && !session.tracked ? 'INR AUTO' : session.mode}`);
        steps.forEach((step, i) => { step.dataset.done = String(done[i]); step.setAttribute('aria-label', `${done[i] ? 'Complete' : 'Pending'}: ${lesson.steps[i]}`); });
        setText(result, complete ? preview ? 'Preview — progress not saved.' : id === 'troubleshoot' ? 'Case complete. Choose the next case above; all three finish this lesson.' : 'Exercise complete. Progress saved.' : ctx.app.getProgress(progressKey(id)) === true ? 'Previously completed. This attempt starts fresh.' : 'Complete all three checks to save this lesson.');
        next.el.hidden = !complete || (id === 'troubleshoot' && ctx.app.getProgress(progressKey(id)) !== true);
        dep.setLit(session.depressed); dep.el.setAttribute('aria-pressed', String(session.depressed));
        dep.setLabel(session.depressed ? 'Release TDC depress' : 'Hold TDC depress');
        polarity.setDisabled(!session.ir); fov.setLabel(FOVS[session.fov]!);
        obstruction.setLabel(session.obscured ? 'Clear obstruction' : 'Obscure target');
        look.setLit(nightVision); look.el.setAttribute('aria-pressed', String(nightVision));
        look.setDisabled(false);
        sensor.setLabel(session.ir ? 'IR' : 'TV'); polarity.setLabel(session.whiteHot ? 'WHT' : 'BLK');
        pod?.update(session, nightVision, overview, preview, continuous);
        range?.update(session, false, true, preview, continuous);
      }
      clean.add(bindKeys({
        Space: { down: () => act(() => delivery?.setTrigger(true)), up: () => act(() => delivery?.setTrigger(false)) },
        'RAlt+Space': { down: () => act(() => delivery?.setRelease(true)), up: () => act(() => delivery?.setRelease(false)) },
        'RAlt+/': () => act(() => session.scs()), S: () => act(() => session.undesignate()),
        I: () => act(() => session.cycleFov()),
        Enter: { down: () => act(() => session.depress(true)), up: () => act(() => session.depress(false)) },
        ';': { down: () => hold('up', 0, -1), up: () => input.release('up') },
        ',': { down: () => hold('left', -1, 0), up: () => input.release('left') },
        '.': { down: () => hold('down', 0, 1), up: () => input.release('down') },
        '/': { down: () => hold('right', 1, 0), up: () => input.release('right') },
      }));
      update();
    },
    unmount() { clean.dispose(); },
  };
};
export default page;
