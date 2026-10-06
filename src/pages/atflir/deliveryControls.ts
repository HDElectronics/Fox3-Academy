/** Compact training controls; cockpit page navigation is described, not replicated. */
import { h, button, group, setText, type Cleanup } from '../../ui';
import { bindKeyboardHold } from './hold';
import { LGB_FACTS } from '../../data/fa18cLgb';
import type { LaserDeliverySession } from './delivery';
export function deliveryControls(get: () => LaserDeliverySession, changed: () => void, clean: Cleanup) {
  const act = (fn: () => void) => { fn(); changed(); };
  const arm = button({ label: 'LTD/R SAFE', lamp: true, onClick: () => act(() => { get().armed = !get().armed; }) });
  const master = button({ label: 'MASTER ARM SAFE', lamp: true, onClick: () => act(() => { get().masterArm = !get().masterArm; }) });
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
    h('small', null, 'Use CODE on the left DDI or UFC on the right DDI, select the UFC option, type 1688 or 1687, then ENT.'),
    arm.el, trigger, master.el, run.el, release, retry.el, readout,
    h('small', null, 'Simplified: 8 s approach, 12 s flight. Keep matching illumination for the final 3 s. These are training timings, not DCS performance.'),
    h('details', null, h('summary', null, 'Cockpit procedure'), h('p', null, LGB_FACTS.podCode), h('p', null, LGB_FACTS.bombCode), h('p', null, LGB_FACTS.trigger), h('p', null, LGB_FACTS.release)),
  ] });
  return { el, update() {
    const s = get();
    arm.setLabel(s.armed ? 'LTD/R ARM' : 'LTD/R SAFE'); arm.setLit(s.armed);
    master.setLabel(s.masterArm ? 'MASTER ARM ARM' : 'MASTER ARM SAFE'); master.setLit(s.masterArm);
    run.setDisabled(s.phase !== 'idle');
    const laserOnly = s.lesson === 'laser';
    master.el.hidden = run.el.hidden = release.hidden = retry.el.hidden = laserOnly;
    setText(readout, `LTDC ${s.laserCode} · BOMB ${s.bombCode} · ${s.laserOn ? 'LASING' : 'LASER OFF'}\n${s.phase.toUpperCase()}${s.cue ? ` · ${s.cue} ${Math.ceil(s.cueTime)} s` : ''}`);
  } };
}
