/**
 * [OWNER: page-rwr-trainer] Quiz mode: generated scenarios shown only on the jet's RWR (with an
 * optional lead-up and audio). Five question kinds: tap the locker, clock of the launch, identify,
 * SARH vs active seeker, and what to do now. The plan view reveals the truth after each answer,
 * with a one or two line debrief. Runs end after three misses; best score and "done" (10 in a run)
 * are saved per jet.
 */
import {
  h, setText, cleanup, consolePanel, screenBezel, segmented, button, coachBox, callout, toggle, readouts, kbd, toast,
  bindKeys, cx, type Child,
} from '../../ui';
import { RwrDisplay } from '../../ui/displays';
import { readTheme } from '../../ui/theme';
import { RWRS } from '../../data/rwr';
import type { RwrId } from '../../data/types';
import type { RwrContact } from '../../sim/types';
import { RwrFeed, clockText, missileIdFor, stateAt } from './threats';
import {
  type Answer, type Difficulty, type Given, type Question, type QuestionKind, type RunState, DONE_AT, MAX_MISSES, QUESTION_KINDS,
  TIME_LIMIT_S, answerText, applyAnswer, grade, makeQuestion, newRun, runOver,
} from './quiz';
import { PlanView } from './plan';
import { type ModeController, type ModeHost, RWR_SHORT, chaffBinds, rwrBezel } from './common';

const KIND_LABEL: Record<QuestionKind, string> = {
  'tap-lock': 'Who is locking you?',
  'launch-clock': 'Where is the launch?',
  identify: 'What is it?',
  seeker: 'Which guidance?',
  action: 'What now?',
};
/** RWRs whose lock / launch look is partly assumed (RWR_CAVEATS), said once in the quiz too. */
const RWR_QUIZ_NOTE: Partial<Record<RwrId, string>> = {
  jf17rwr: 'How the JF-17 RWR shows an active missile is not documented: this display uses MAWS-style "M" and numbers.',
  serval: 'The Serval\'s real symbols, and how it shows lock and launch, were not researched: ED-style codes and cues stand in.',
  alr56m: 'Viper codes are assumed to match the Hornet list.',
};
const CLOCK_KEYS: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '0': 10, '-': 11, '=': 12 };

export function mountQuiz(host: ModeHost): ModeController {
  const bag = cleanup();
  const { spec, app, params } = host;
  const ac = spec.id;
  const rwrId = spec.rwr;
  const rs = RWRS[rwrId];
  const lamps = rs.kind === 'lamps';
  const theme = readTheme();
  const feed = new RwrFeed();
  const bestKey = `rwr:${ac}:best`;
  const doneKey = `rwr:${ac}:done`;

  const diffParam = params.get('diff');
  let difficulty: Difficulty = diffParam === 'easy' || diffParam === 'hard' ? diffParam : 'medium';
  let timerOn = params.get('timer') === '1';
  const kindParam = params.get('kind');
  const forcedKind = QUESTION_KINDS.find(k => k === kindParam);
  const seedParam = Number(params.get('seed'));
  let seedBase = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : Math.floor(Math.random() * 1e9);
  const shot = params.get('shot');

  let run: RunState = newRun();
  let q: Question | null = null;
  let qN = 0;
  let qStart = 0;
  let timerStart = 0;
  let answered = false;
  let current: RwrContact[] = [];
  let lastTimerText = '';
  let shotDone = false;

  // ------------------------------------------------------------------ centre: the RWR

  const rb = rwrBezel(spec, 'rwrt-quiz-rwr');
  const display = new RwrDisplay(rb.canvas, { rwr: rwrId });
  bag.add(() => display.dispose());
  const hint = h('p', { class: 'rwrt-under__hint' });
  host.centre.append(rb.el, h('div', { class: 'rwrt-under' }, hint));
  bag.on(rb.canvas, 'click', (e: MouseEvent) => {
    if (!q || answered || q.answer.type !== 'tap') return;
    const pe = e as PointerEvent;
    const id = display.pickContact(e.clientX, e.clientY, pe.pointerType === 'touch' ? 14 : 6);
    if (id) answer({ type: 'tap', id });
    else toast(lamps ? 'Tap a lit lamp.' : 'Tap a symbol.', { within: rb.bezel.glass, ms: 1400 });
  });

  // ------------------------------------------------------------------ left: question

  const kindEl = h('span', { class: 'rwrt-q__kind' });
  const countEl = h('span', { class: 'rwrt-q__count' });
  const timerEl = h('span', { class: 'rwrt-q__timer', 'aria-live': 'off' });
  const promptEl = h('h2', { class: 'rwrt-q__prompt', id: 'rwrt-q-prompt' });
  const contextEl = h('p', { class: 'rwrt-q__context' });
  const answersEl = h('div', { class: 'rwrt-answers', role: 'group', 'aria-labelledby': 'rwrt-q-prompt' });
  const debrief = coachBox({ id: 'rwrt-debrief', title: 'DEBRIEF' });
  debrief.el.hidden = true;
  const replayBtn = button({ label: 'Replay lead-up', size: 's', keys: 'R', onClick: () => replay() });
  const nextBtn = button({ label: 'Next', variant: 'primary', keys: 'Enter', onClick: () => next() });
  nextBtn.el.hidden = true;
  const qPanel = consolePanel({
    title: 'Question', id: 'rwrt-question',
    actions: timerEl,
    children: [
      h('div', { class: 'rwrt-q__meta' }, kindEl, countEl),
      promptEl, contextEl, answersEl, debrief.el,
      h('div', { class: 'rwrt-q__actions' }, replayBtn.el, nextBtn.el),
    ],
  });
  host.left.append(qPanel.el);

  // ------------------------------------------------------------------ right: truth + run

  const planCanvas = h('canvas', { 'aria-label': 'Plan view: the real threats, shown after you answer.' });
  const planBezel = screenBezel({ id: 'rwrt-truth', label: 'Plan · truth', aspect: '1', content: planCanvas, status: 'Hidden' });
  const plan = new PlanView(planCanvas, { theme, units: app.units, interactive: false });
  bag.add(() => plan.dispose());

  const stats = readouts({
    id: 'rwrt-run', columns: 2, rows: [
      { id: 'score', label: 'Score' }, { id: 'streak', label: 'Streak' },
      { id: 'misses', label: 'Misses' }, { id: 'best', label: `Best · ${spec.short}` },
    ],
  });
  const diffSeg = segmented<Difficulty>({
    id: 'rwrt-diff', label: 'Difficulty', value: difficulty, fill: true, size: 's',
    options: [
      { value: 'easy', label: 'Easy', sub: '1–2 jets' },
      { value: 'medium', label: 'Medium', sub: '2–3 + decoys' },
      { value: 'hard', label: 'Hard', sub: '3–5, rear' },
    ],
    onChange: d => { difficulty = d; startRun(); },
  });
  const timerTgl = toggle({
    id: 'rwrt-timer', label: 'Timer', style: 'switch', size: 's', value: timerOn,
    onChange: v => { timerOn = v; timerStart = host.now(); lastTimerText = ''; setText(timerEl, ''); },
  });
  const progressEl = h('p', { class: 'rwrt-note rwrt-progress' });
  const newRunBtn = button({ label: 'New run', size: 's', onClick: () => startRun() });

  host.right.append(
    consolePanel({ title: 'Truth', id: 'rwrt-truth-panel', children: [planBezel.el] }).el,
    consolePanel({
      title: 'Run', id: 'rwrt-run-panel', actions: newRunBtn.el,
      children: [stats.el, progressEl, diffSeg.el, h('div', { class: 'rwrt-row' }, timerTgl.el, h('span', { class: 'rwrt-note' }, `${TIME_LIMIT_S[difficulty]} s a question`))],
    }).el,
    callout({
      kind: 'simplified',
      body: h('ul', { class: 'rwrt-simple' },
        h('li', null, 'The "what now" answers follow the DCS basics: beam a SARH shooter, beam an active missile, chaff only in the beam, drag when already cold. A real fight also weighs range, altitude and energy.'),
        h('li', null, lamps ? 'Bearings sit near the SPO lamp angles so every picture has one fair reading.' : 'Bearings sit near clock positions so every picture has one fair reading.'),
        h('li', null, 'A two-second lead-up plays before each picture holds: that is how a launch (lock first) differs from an active missile (nothing first).'),
        RWR_QUIZ_NOTE[rwrId] ? h('li', null, RWR_QUIZ_NOTE[rwrId]) : null),
    }),
  );
  const timerNote = timerTgl.el.nextElementSibling;

  // ------------------------------------------------------------------ flow

  function startRun() {
    run = newRun();
    qN = 0;
    seedBase = Math.floor(Math.random() * 1e9);
    if (timerNote) setText(timerNote, `${TIME_LIMIT_S[difficulty]} s a question`);
    updateStats();
    next();
  }

  function next() {
    if (q && answered && runOver(run)) { startRun(); return; }
    qN++;
    q = makeQuestion({ rwr: rwrId, own: ac, difficulty, seed: seedBase + qN * 7919, kind: forcedKind });
    answered = false;
    qStart = host.now();
    timerStart = qStart;
    feed.reset();
    feed.age(q.threats, 0, qStart);
    plan.setThreats(q.threats, 1e6);
    plan.setReveal(null);
    plan.setHidden(true, 'Hidden until you answer');
    planBezel.setStatus('Hidden');
    display.setHighlight(null);
    setText(kindEl, KIND_LABEL[q.kind]);
    setText(countEl, `Q ${run.answered + 1}`);
    setText(promptEl, q.prompt);
    setText(contextEl, q.context ?? '');
    contextEl.hidden = !q.context;
    setText(hint, q.answer.type === 'tap'
      ? (lamps ? 'Tap the lamp of the threat that locks you.' : 'Tap the symbol of the threat that locks you.')
      : `Answer from ${RWR_SHORT[rwrId]} alone. Replay the lead-up with R.`);
    renderAnswers(q.answer);
    debrief.el.hidden = true;
    nextBtn.el.hidden = true;
    setText(timerEl, '');
  }

  function replay() {
    if (!q) return;
    qStart = host.now();
    feed.reset();
    feed.age(q.threats, 0, qStart);
  }

  let answerBtns: { id: string; el: HTMLButtonElement }[] = [];

  function renderAnswers(a: Answer) {
    answerBtns = [];
    answersEl.replaceChildren();
    answersEl.dataset.type = a.type;
    if (a.type === 'clock') {
      const face = h('div', { class: 'rwrt-clock' }, h('span', { class: 'rwrt-clock__you', 'aria-hidden': 'true' }, 'YOU'));
      for (let c = 1; c <= 12; c++) {
        const b = h('button', {
          type: 'button', class: 'rwrt-clock__btn',
          'aria-label': clockText(c), onclick: () => answer({ type: 'clock', clock: c }),
        }, String(c));
        b.style.setProperty('--a', `${c * 30}deg`);
        answerBtns.push({ id: String(c), el: b });
        face.append(b);
      }
      answersEl.append(face, h('p', { class: 'rwrt-keyline' }, 'Keys ', kbd('1'), '–', kbd('9'), ', ', kbd('0'), ' = 10, ', kbd('-'), ' = 11, ', kbd('='), ' = 12'));
      return;
    }
    const opts = a.type === 'tap' ? a.candidates : a.options;
    if (a.type === 'tap') answersEl.append(h('p', { class: 'rwrt-note' }, 'Tap it on the RWR, or pick it here:'));
    const grid = h('div', { class: cx('rwrt-choices', opts.length > 4 && 'rwrt-choices--grid') });
    opts.forEach((o, i) => {
      const b = button({
        label: o.label, keys: i < 9 ? String(i + 1) : undefined, block: true, keepCase: true, class: 'rwrt-choice',
        onClick: () => answer(a.type === 'tap' ? { type: 'tap', id: o.id } : { type: 'choice', id: o.id }),
      });
      answerBtns.push({ id: o.id, el: b.el });
      grid.append(b.el);
    });
    answersEl.append(grid);
  }

  function answer(g: Given) {
    if (!q || answered) return;
    answered = true;
    const ok = grade(q, g);
    run = applyAnswer(run, ok);
    // Mark the buttons.
    const a = q.answer;
    const correctIds = a.type === 'clock' ? a.correct.map(String) : a.correct;
    const chosen = g.type === 'clock' ? String(g.clock) : g.type === 'choice' || g.type === 'tap' ? g.id.replace(/-M$/, '') : null;
    for (const b of answerBtns) {
      b.el.disabled = true;
      b.el.classList.toggle('is-right', correctIds.includes(b.id));
      b.el.classList.toggle('is-wrong', b.id === chosen && !correctIds.includes(b.id));
    }
    // Reveal the truth.
    plan.setHidden(false);
    plan.setThreats(q.threats, 1e6);
    plan.setReveal({ focusId: q.focusId, advice: q.advice, ownShot: q.ownShot });
    planBezel.setStatus(q.advice ? q.advice.label : 'Revealed');
    // Mark the answer on the RWR too (an active missile's own contact when it is the warning).
    const focusId = q.focusId;
    const ft = q.threats.find(t => t.id === focusId);
    display.setHighlight(ft && stateAt(ft, 1e6) === 'active' && q.kind !== 'tap-lock' && q.kind !== 'identify' ? missileIdFor(ft.id) : focusId);
    // Debrief.
    const head = ok ? 'Correct.' : g.type === 'timeout' ? `Time. The answer: ${answerText(q)}.` : `Not quite. The answer: ${answerText(q)}.`;
    const extra: Child[] = [q.explain];
    const adv = q.advice?.action;
    if (adv === 'chaff' || adv === 'notch-left' || adv === 'notch-right') {
      const cb = chaffBinds(ac);
      if (cb.length) {
        const parts: Child[] = [`Chaff in the ${spec.short}: `];
        cb.forEach((b, i) => {
          if (i) parts.push(' or ');
          if (b.keys) parts.push(kbd(b.keys));
          if (b.hotas) parts.push(b.keys ? ` (${b.hotas})` : b.hotas);
          if (b.note) parts.push(` (${b.note})`);
        });
        extra.push(h('span', { class: 'rwrt-chaffkey' }, parts));
      }
    }
    const over = runOver(run);
    if (over) extra.push(h('strong', { class: 'rwrt-over' }, `Run over: ${run.score} correct.`));
    debrief.set(head, h('span', null, extra), ok ? 'ok' : 'warning');
    debrief.el.hidden = false;
    nextBtn.setLabel(over ? 'New run' : 'Next');
    nextBtn.el.hidden = false;
    setText(timerEl, '');
    // Progress.
    const best = Number(app.getProgress(bestKey) ?? 0) || 0;
    if (run.score > best) app.setProgress(bestKey, run.score);
    if (run.score >= DONE_AT && app.getProgress(doneKey) !== true) {
      app.setProgress(doneKey, true);
      toast(`${spec.short} RWR lesson done: ${DONE_AT} right in one run.`, { tone: 'ok' });
    }
    updateStats();
    // Keep keyboard flow: focus Next.
    if (document.activeElement && answersEl.contains(document.activeElement)) nextBtn.el.focus();
  }

  function updateStats() {
    const best = Number(app.getProgress(bestKey) ?? 0) || 0;
    stats.set('score', String(run.score));
    stats.set('streak', String(run.streak));
    stats.set('misses', `${run.misses} / ${MAX_MISSES}`);
    stats.set('best', String(best));
    stats.setTone('misses', run.misses >= MAX_MISSES - 1 ? 'warning' : null);
    stats.setTone('streak', run.streak >= 5 ? 'ok' : null);
    const done = app.getProgress(doneKey) === true;
    setText(progressEl, done
      ? `Done for the ${spec.short}: you got ${DONE_AT} right in one run. Try Hard.`
      : `${DONE_AT} right in one run marks this lesson done for the ${spec.short}. ${MAX_MISSES} misses end a run.`);
  }

  // ------------------------------------------------------------------ keys

  const digit = (k: string) => () => {
    if (!q || answered) return;
    const a = q.answer;
    if (a.type === 'clock') { const c = CLOCK_KEYS[k]; if (c) answer({ type: 'clock', clock: c }); return; }
    const i = Number(k) - 1;
    if (!(i >= 0)) return;
    const opts = a.type === 'tap' ? a.candidates : a.options;
    const o = opts[i];
    if (o) answer(a.type === 'tap' ? { type: 'tap', id: o.id } : { type: 'choice', id: o.id });
  };
  const keyMap: Record<string, () => void> = {};
  for (const k of Object.keys(CLOCK_KEYS)) keyMap[k] = digit(k);
  keyMap['Enter'] = () => { if (answered) next(); };
  keyMap['R'] = () => replay();
  bag.add(bindKeys(keyMap));

  // ------------------------------------------------------------------ start

  updateStats();
  next();

  return {
    frame(t) {
      if (!q) return;
      const tRel = t - qStart;
      current = feed.update(q.threats, tRel, t);
      display.draw(current, t);
      if (!answered && timerOn) {
        const left = TIME_LIMIT_S[difficulty] - (t - timerStart);
        const txt = `${Math.max(0, Math.ceil(left))} s`;
        if (txt !== lastTimerText) { lastTimerText = txt; setText(timerEl, txt); timerEl.dataset.low = String(left < 4); }
        if (left <= 0) answer({ type: 'timeout' });
      }
      // Screenshot helper: answer once the lead-up has played.
      if (!shotDone && (shot === 'answer' || shot === 'wrong') && tRel > q.leadS + 0.4) {
        shotDone = true;
        const a = q.answer;
        if (shot === 'answer') {
          answer(a.type === 'clock' ? { type: 'clock', clock: a.correct[0] } : a.type === 'tap' ? { type: 'tap', id: a.correct[0] } : { type: 'choice', id: a.correct[0] });
        } else {
          const wrongChoice = a.type === 'clock' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find(c => !a.correct.includes(c)) ?? 1
            : (a.type === 'tap' ? a.candidates : a.options).find(o => !a.correct.includes(o.id))?.id ?? '';
          answer(a.type === 'clock' ? { type: 'clock', clock: Number(wrongChoice) } : a.type === 'tap' ? { type: 'tap', id: String(wrongChoice) } : { type: 'choice', id: String(wrongChoice) });
        }
      }
    },
    contacts: () => current,
    unmount() { bag.dispose(); },
  };
}

