/** Compact training controls; cockpit page navigation is described, not replicated. */
import { h, button, row, group, setText, type Cleanup } from '../../ui';
import { bindKeyboardHold } from './hold';
import { LGB_CODE_PRESETS, LGB_FACTS } from '../../data/fa18cLgb';
import type { LaserDeliverySession, LaserCode } from './delivery';
export function deliveryControls(get: () => LaserDeliverySession, changed: () => void, clean: Cleanup) {
  const act = (fn: () => void) => { fn(); changed(); };
  const code = (label: string, apply: (code: LaserCode) => void) => {
    const select = h('select', { 'aria-label': label }, LGB_CODE_PRESETS.map(c => h('option', { value: c }, c)));
    return row(h('label', null, label, select), button({ label: 'ENT', onClick: () => act(() => apply(select.value as LaserCode)) }).el);
  };
  const arm = button({ label: 'LTD/R SAFE', lamp: true, onClick: () => act(() => { get().armed = !get().armed; }) });
  const master = button({ label: 'MASTER ARM SAFE', lamp: true, onClick: () => act(() => { get().masterArm = !get().masterArm; }) });
  const trig = button({ label: 'TRIG', lamp: true, onClick: () => act(() => { get().trig = !get().trig; get().setTrigger(false); }) });
  const held = (label: string, setter: (held: boolean) => void) => {
    const b = button({ label, onClick: e => { if (e.detail === 0) act(() => { setter(true); setter(false); }); } }).el;
    clean.on<PointerEvent>(b, 'pointerdown', e => { if (e.button !== 0) return; b.setPointerCapture(e.pointerId); act(() => setter(true)); });
    bindKeyboardHold(b, value => act(() => setter(value)), clean);
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) clean.on(b, event, () => act(() => setter(false)));
    return b;
  };
  const trigger = held('Hold trigger · Space', value => get().setTrigger(value));
  const release = held('Hold Weapon Release · RAlt+Space', value => get().setRelease(value));
  const run = button({ label: 'Start aligned training pass', onClick: () => act(() => get().startRun()) });
  const retry = button({ label: 'Reload for another pass', variant: 'ghost', onClick: () => act(() => get().retry()) });
  const readout = h('p', { class: 'atflir-delivery-readout' });
  const el = group({ label: 'Laser & stores', children: [
    h('small', null, 'Preset: A/G · 82LG (GBU-12) · AUTO · MFUZ OFF · EFUZ INST. Aligned flight is scripted; confirm the target in FLIR.'),
    code('FLIR UFC → LTDC', value => get().setLaserCode(value)),
    code('SMS → CODE', value => get().setBombCode(value)),
    row(arm.el, trig.el), trigger, master.el, run.el, release, retry.el, readout,
    h('small', null, 'Simplified: 8 s approach, 12 s flight. Keep matching illumination for the final 3 s. These are training timings, not DCS performance.'),
    h('details', null, h('summary', null, 'Cockpit procedure'), h('p', null, LGB_FACTS.podCode), h('p', null, LGB_FACTS.bombCode), h('p', null, LGB_FACTS.trigger), h('p', null, LGB_FACTS.release)),
  ] });
  return { el, update() {
    const s = get();
    arm.setLabel(s.armed ? 'LTD/R ARM' : 'LTD/R SAFE'); arm.setLit(s.armed);
    master.setLabel(s.masterArm ? 'MASTER ARM ARM' : 'MASTER ARM SAFE'); master.setLit(s.masterArm);
    trig.setLit(s.trig); trig.el.setAttribute('aria-pressed', String(s.trig));
    run.setDisabled(s.phase !== 'idle');
    const laserOnly = s.lesson === 'laser';
    master.el.hidden = run.el.hidden = release.hidden = retry.el.hidden = laserOnly;
    setText(readout, `LTDC ${s.laserCode} · BOMB ${s.bombCode} · ${s.laserOn ? 'LASING' : 'LASER OFF'}\n${s.phase.toUpperCase()}${s.cue ? ` · ${s.cue} ${Math.ceil(s.cueTime)} s` : ''}`);
  } };
}
