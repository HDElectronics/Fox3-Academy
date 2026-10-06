import { h, button, screenBezel, setText } from '../../ui';
import { readTheme } from '../../ui/theme';
import { createUfc } from '../harm/ufc';
import { LaserCodeEntry } from './codeEntry';
import type { LaserDeliverySession } from './delivery';
import type { AtflirSession } from './model';
import '../harm/cockpit.css';
/** Reuses HARM's bezel and UFC components. HUD geometry and abbreviated SMS are training aids. */
export function createLaserCockpit(get: () => LaserDeliverySession | null, sensor: () => AtflirSession, changed: () => void) {
  let entry = new LaserCodeEntry();
  const hint = h('p', { class: 'atflir-ufc-hint', role: 'status' });
  const ufc = createUfc({ id: 'atflir-ufc', onKey: key => {
    const result = entry.key(key), d = get();
    if (d && result) { if (result.source === 'LTDC') d.setLaserCode(result.code); else d.setBombCode(result.code); }
    changed();
  } });
  const open = (source: 'LTDC' | 'CODE') => { entry.open(source); changed(); };
  const storeReadout = h('div', { class: 'atflir-stores-readout' });
  const code = button({ label: 'CODE', size: 's', onClick: () => open('CODE') });
  code.el.title = 'STORES CODE (PB1): open UFC bomb code entry';
  const stores = h('div', { class: 'atflir-stores ui-fill' },
    h('div', { class: 'atflir-ddi-top' }, code.el, h('span', null, 'A/G')), storeReadout,
    h('div', { class: 'atflir-stores-bottom' }, 'MFUZ OFF', h('br'), 'EFUZ INST'));
  const podHost = h('div', { class: 'atflir-ddi-pod' });
  const ufcButton = button({ label: 'UFC', size: 's', onClick: () => open('LTDC') });
  ufcButton.el.title = 'FLIR UFC (PB14): open LTDC code entry';
  const trig = button({ label: 'TRIG', size: 's', lamp: true, onClick: () => { const d = get(); if (d) { d.trig = !d.trig; d.setTrigger(false); changed(); } } });
  trig.el.title = 'FLIR TRIG (PB11): select manual laser trigger';
  const flir = h('div', { class: 'atflir-flir ui-fill' }, podHost, h('div', { class: 'atflir-ddi-bottom' }, trig.el, ufcButton.el));
  const hud = h('canvas', { width: 400, height: 400, 'aria-label': 'HUD: simplified aligned AUTO delivery cues' });
  const theme = readTheme();
  const blocks = [
    screenBezel({ label: 'HUD · TRAINING', content: hud, aspect: '1', id: 'atflir-hud' }).el,
    screenBezel({ label: 'LEFT DDI · STORES', content: stores, aspect: '1', id: 'atflir-stores' }).el,
    screenBezel({ label: 'RIGHT DDI · FLIR', content: flir, aspect: '1', id: 'atflir-flir' }).el,
    h('div', { class: 'ui-strip-block atflir-ufc-block' }, h('div', { class: 'ui-placard' }, 'UFC'), ufc.el, hint),
  ];
  return { blocks, podHost, reset() { entry = new LaserCodeEntry(); }, dispose() { ufc.dispose(); }, update() {
    const d = get(); ufc.draw(entry.view()); setText(hint, entry.message);
    code.setDisabled(!d); ufcButton.setDisabled(!d); trig.setDisabled(!d); trig.setLit(d?.trig ?? false);
    setText(storeReadout, d ? `82LG\nAUTO\n${d.bombCode}\n${d.phase === 'flight' || d.phase === 'hit' || d.phase === 'miss' ? '0' : '1'} STORE\n${d.masterArm ? 'ARM' : 'SAFE'}` : 'STORES\nNO WEAPON\nSENSOR TRAINING');
    const c = hud.getContext('2d'); if (!c) return;
    c.clearRect(0,0,400,400); c.fillStyle = theme.screen; c.fillRect(0,0,400,400);
    c.strokeStyle = theme.sym; c.fillStyle = theme.sym; c.lineWidth = 2; c.font = `18px ${theme.fontMono}`; c.textAlign = 'center';
    c.fillText('A/G', 200, 32); c.fillText(d ? 'AUTO · 82LG' : 'FLIR', 200, 65);
    c.beginPath(); c.moveTo(200,95); c.lineTo(200,300); c.moveTo(170,220); c.lineTo(190,220); c.moveTo(210,220); c.lineTo(230,220); c.moveTo(200,200); c.lineTo(200,210); c.stroke();
    c.beginPath(); c.arc(200,220,10,0,Math.PI*2); c.stroke();
    if (sensor().designation) { c.beginPath(); c.moveTo(200,275); c.lineTo(210,285); c.lineTo(200,295); c.lineTo(190,285); c.closePath(); c.stroke(); }
    if (d?.phase === 'approach') { const y = 110 + (1 - d.timer / 8) * 110; c.beginPath(); c.moveTo(172,y); c.lineTo(228,y); c.stroke(); }
    c.fillText(d?.cue ? `${d.cue} ${Math.ceil(d.cueTime)}` : d?.phase.toUpperCase() ?? 'DESIGNATE', 200, 330);
    c.font = `13px ${theme.fontMono}`; c.fillText('SCRIPTED ALIGNED PASS',200,375);
  } };
}
