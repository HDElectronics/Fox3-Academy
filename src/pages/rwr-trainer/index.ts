/**
 * [OWNER: page-rwr-trainer] #/rwr: learn the selected jet's RWR at a glance, then prove it in a quiz.
 * Learn: the RWR big in the centre with a numbered anatomy guide, and a sandbox plan with draggable
 * threats. Quiz: generated pictures on the RWR alone, answered by tap, clock or choice, then the truth.
 *
 * URL params: ?mode=learn|quiz, ?ac=<AircraftId> (sets the jet once, then drops the param),
 * learn: ?shot=demo|lock|sarh|fox3|busy|clear|part-<id>, ?tab=parts|cues|misreads;
 * quiz: ?diff=easy|medium|hard, ?timer=1, ?kind=<QuestionKind>, ?seed=<n>, ?shot=answer|wrong.
 */
import './style.css';
import type { Page, PageFactory } from '../../app/page';
import { AIRCRAFT } from '../../data/aircraft';
import type { AircraftId } from '../../data/types';
import { RWRS } from '../../data/rwr';
import { h, cleanup, pageHeader, segmented, toggle } from '../../ui';
import { RwrAudio } from '../../ui/displays';
import { type ModeController, type ModeHost, RWR_SHORT } from './common';
import { mountLearn } from './learn';
import { mountQuiz } from './quizView';

type Mode = 'learn' | 'quiz';

const factory: PageFactory = (): Page => {
  const bag = cleanup();
  let raf = 0;
  let mode: ModeController | null = null;
  let audio: RwrAudio | null = null;

  return {
    mount(ctx) {
      // ?ac=<id>: select that jet once (screenshots, links), then drop the param so the top bar keeps working.
      const acParam = ctx.params.get('ac');
      if (acParam !== null) {
        const rest = new URLSearchParams(ctx.params);
        rest.delete('ac');
        const qs = rest.toString();
        history.replaceState(history.state, '', `#/rwr${qs ? '?' + qs : ''}`);
        if (acParam in AIRCRAFT && acParam !== ctx.app.aircraft) {
          ctx.app.setAircraft(acParam as AircraftId);   // the router remounts this page for the new jet
          return;
        }
      }

      const spec = ctx.app.spec;
      const rs = RWRS[spec.rwr];
      let current: Mode = ctx.params.get('mode') === 'quiz' ? 'quiz' : 'learn';

      audio = new RwrAudio({ rwr: spec.rwr, volume: 0.18 });
      const audioTgl = toggle({
        id: 'rwrt-audio', label: 'RWR audio', style: 'switch', size: 's', value: false,
        disabled: !RwrAudio.supported, title: RwrAudio.supported ? 'Stylised search, lock and launch tones' : 'No WebAudio in this browser',
        onChange: v => { if (!audio) return; if (v) void audio.start(); else audio.stop(); },
      });
      const modeSeg = segmented<Mode>({
        id: 'rwrt-mode', ariaLabel: 'Mode', value: current, size: 's',
        options: [{ value: 'learn', label: 'Learn' }, { value: 'quiz', label: 'Quiz' }],
        onChange: m => switchMode(m),
      });
      const lede = h('span');
      const head = pageHeader({
        title: 'RWR trainer', compact: true, class: 'rwrt__head',
        meta: `${spec.short} · ${rs.name}`,
        lede,
        actions: h('div', { class: 'rwrt__actions' }, modeSeg.el, audioTgl.el),
      });
      const left = h('div', { class: 'rwrt__left' });
      const centre = h('div', { class: 'rwrt__centre' });
      const right = h('div', { class: 'rwrt__right' });
      const root = h('div', { class: 'rwrt', id: 'rwrt', dataset: { mode: current, rwr: spec.rwr } }, head, left, centre, right);
      ctx.root.append(root);
      bag.add(() => root.remove());

      const t0 = performance.now();
      const host: ModeHost = { app: ctx.app, spec, left, centre, right, params: ctx.params, now: () => (performance.now() - t0) / 1000 };

      let first = true;
      function switchMode(m: Mode) {
        // Screenshot / link params (shot, kind, seed, tab) apply to the first mount only.
        if (!first) {
          const keep = new URLSearchParams();
          for (const k of ['diff', 'timer']) { const v = ctx.params.get(k); if (v !== null) keep.set(k, v); }
          host.params = keep;
        }
        first = false;
        mode?.unmount();
        mode = null;
        left.replaceChildren(); centre.replaceChildren(); right.replaceChildren();
        current = m;
        root.dataset.mode = m;
        modeSeg.set(m);
        lede.textContent = m === 'learn'
          ? `Place threats around you and watch ${RWR_SHORT[spec.rwr]} react. Hover or tap a part in the guide to find it on the display.`
          : 'Read the picture, answer, then see the truth. Ten right in one run marks the lesson done.';
        const qs = new URLSearchParams(host.params);
        qs.delete('ac');
        qs.set('mode', m);
        history.replaceState(history.state, '', `#/rwr?${qs.toString()}`);
        mode = m === 'learn' ? mountLearn(host) : mountQuiz(host);
      }
      switchMode(current);

      const frame = () => {
        raf = requestAnimationFrame(frame);
        if (!mode) return;
        const t = host.now();
        mode.frame(t);
        if (audio?.enabled) audio.update(mode.contacts(), t);
      };
      raf = requestAnimationFrame(frame);
    },

    unmount() {
      cancelAnimationFrame(raf);
      raf = 0;
      mode?.unmount();
      mode = null;
      audio?.dispose();
      audio = null;
      bag.dispose();
    },
  };
};

export default factory;
