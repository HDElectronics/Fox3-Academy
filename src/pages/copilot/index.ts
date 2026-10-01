/**
 * Copilot (#/copilot): a second-screen helper for the F/A-18C while you fly in DCS. Reads the DCS link
 * (src/dcs), turns each frame into a Situation and runs the Hornet rules (src/copilot): alerts on screen and
 * spoken. Threats from the RWR and the radar lock against the app's launch zones, fuel and limits watch, approach
 * AoA and configuration checks, field or carrier.
 * ?shot=approach|carrier|bingo|threat|off renders a fixed frame without touching the network.
 */
import './style.css';
import type { PageFactory } from '../../app/page';
import { CopilotEngine, type ActiveAlert, type Callout } from '../../copilot/engine';
import { HORNET_FACTS, HORNET_RULES, flapsFull, hookDown } from '../../copilot/hornet';
import { HORNET_COCKPIT_NOTE } from '../../copilot/hornetCockpit';
import { FuelTrend, situationOf, type Situation } from '../../copilot/situation';
import { LockTracker, ThreatTracker, lockOf, threatsOf } from '../../copilot/threats';
import { HornetLockTracker, HornetThreatTracker, hornetLock, hornetThreats } from '../../copilot/hornetSensors';
import { CopilotVoice } from '../../copilot/voice';
import { DcsLink, type LinkSnapshot } from '../../dcs/client';
import type { DcsFrame } from '../../dcs/protocol';
import {
  button, callout, cleanup, consolePanel, eventLog, h, lamp, pageHeader, readouts, segmented, setText, slider, toggle,
} from '../../ui';
import {
  aoaView, flapsText, fuelView, hornetLockView, hornetThreatRows, loadSettings, lockView, PHASE_TEXT, positionText, previewFrame, profileMatches, saveSettings, threatRows,
  type CopilotSettings,
} from './model';

const REFRESH_MS = 100;

const factory: PageFactory = () => {
  const bag = cleanup();
  return {
    mount(ctx) {
      const preview = previewFrame(ctx.params.get('shot'));
      const settings: CopilotSettings = { ...loadSettings(), ...preview?.settings };
      const engine = new CopilotEngine(HORNET_RULES, settings);
      const voice = new CopilotVoice();
      bag.add(() => voice.stop());
      const persist = () => { if (!preview) saveSettings(settings); };

      // Link status
      const lamps = { bridge: lamp({ label: 'Bridge', tone: 'ok' }), dcs: lamp({ label: 'DCS', tone: 'ok' }) };
      const linkText = h('span', { class: 'cp-linktext' });
      const profileNote = h('p', { class: 'cp-banner', hidden: true });

      // Alerts
      const alertList = h('ul', { class: 'cp-alerts', 'aria-live': 'off' });

      // Threats (RWR) and radar lock
      const threatList = h('ul', { class: 'cp-threats' });
      const lockName = h('div', { class: 'cp-lock__name' });
      const lockRows = readouts({
        id: 'cp-lock', variant: 'glass', columns: 2,
        rows: [{ id: 'mode', label: 'Mode' }, { id: 'range', label: 'Range' }, { id: 'closure', label: 'Closure' }, { id: 'aspect', label: 'Aspect' }, { id: 'alt', label: 'Altitude' }, { id: 'where', label: 'Bearing' }],
      });
      const dlzZone = h('div', { class: 'cp-dlz__zone' });
      const dlzMarks = { rmin: h('i', { class: 'cp-dlz__mark', title: 'Rmin' }), rne: h('i', { class: 'cp-dlz__mark cp-dlz__mark--ne', title: 'No escape' }), rmax: h('i', { class: 'cp-dlz__mark', title: 'Rmax' }), now: h('i', { class: 'cp-dlz__now', title: 'Target' }) };
      const dlzBox = h('div', { class: 'cp-dlz', hidden: true }, dlzZone, h('div', { class: 'cp-dlz__bar' }, h('i', { class: 'cp-dlz__ne' }), dlzMarks.rmin, dlzMarks.rne, dlzMarks.rmax, dlzMarks.now));
      const lockNote = h('div', { class: 'cp-lock__note' });
      const lockBox = h('div', { class: 'cp-lock', dataset: { state: 'off' } }, lockName, lockRows.el, dlzBox, lockNote);
      const threatTracker = new ThreatTracker();
      const lockTracker = new LockTracker();
      const hornetThreatTracker = new HornetThreatTracker();
      const hornetLockTracker = new HornetLockTracker();

      // AoA
      const aoaState = h('div', { class: 'cp-aoa__state' });
      const aoaValue = h('div', { class: 'cp-aoa__value' });
      const aoaBox = h('div', { class: 'cp-aoa', dataset: { state: 'off' } },
        h('div', { class: 'cp-aoa__chev cp-aoa__chev--slow', 'aria-hidden': 'true' }, '▼'),
        h('div', { class: 'cp-aoa__ring', 'aria-hidden': 'true' }),
        h('div', { class: 'cp-aoa__chev cp-aoa__chev--fast', 'aria-hidden': 'true' }, '▲'),
        aoaState, aoaValue);

      // Fuel
      const fuelTotal = h('div', { class: 'cp-fuel__total' });
      const fuelRows = readouts({
        id: 'cp-fuel', variant: 'glass',
        rows: [{ id: 'joker', label: 'Joker' }, { id: 'bingo', label: 'Bingo' }, { id: 'flow', label: 'Fuel flow' }, { id: 'endurance', label: 'To bingo' }],
      });
      const fuelBox = h('div', { class: 'cp-fuel', dataset: { state: 'off' } }, h('div', { class: 'cp-fuel__label' }, 'FUEL  LB'), fuelTotal, fuelRows.el);

      // Configuration
      const cfgLamps = {
        gear: lamp({ label: 'Gear', tone: 'ok' }),
        flaps: lamp({ label: 'Flaps', tone: 'ok' }),
        hook: lamp({ label: 'Hook', tone: 'ok' }),
        brake: lamp({ label: 'Speed brake', tone: 'caution' }),
      };
      const cfgRows = readouts({
        id: 'cp-config',
        rows: [
          { id: 'gear', label: 'Gear' }, { id: 'flaps', label: 'Flaps' }, { id: 'hook', label: 'Hook' }, { id: 'brake', label: 'Speed brake' },
          { id: 'arm', label: 'Master arm' }, { id: 'lbar', label: 'Launch bar' }, { id: 'source', label: 'Read from', title: HORNET_COCKPIT_NOTE },
        ],
      });

      // Flight
      const flight = readouts({
        id: 'cp-flight', variant: 'glass', columns: 2,
        rows: [{ id: 'phase', label: 'Phase' }, { id: 'ias', label: 'IAS' }, { id: 'agl', label: 'Radar alt' }, { id: 'vvi', label: 'Vertical' }, { id: 'g', label: 'G' }, { id: 'mach', label: 'Mach' }, { id: 'aoa', label: 'AoA (DCS)' }],
      });

      const log = eventLog({ id: 'cp-log', title: 'Callouts', max: 80, empty: 'No callouts yet.' });

      // Controls
      const voiceToggle = toggle({
        id: 'cp-voice', label: 'Voice', style: 'switch', value: false,
        disabled: !voice.available, title: voice.available ? 'Spoken callouts' : 'This browser has no speech synthesis',
        onChange: on => { voice.muted = !on; if (on) voice.test('Copilot voice on.'); else voice.stop(); },
      });
      voice.muted = true;
      const modeSeg = segmented({
        id: 'cp-mode', label: 'Landing', value: settings.mode, size: 's',
        options: [{ value: 'field', label: 'Field' }, { value: 'carrier', label: 'Carrier' }],
        onChange: v => { settings.mode = v; engine.reset(); persist(); },
      });
      const bingoSource = segmented({
        id: 'cp-bingo-source', label: 'Bingo from', value: settings.bingoSource, size: 's',
        options: [{ value: 'ifei', label: 'IFEI' }, { value: 'manual', label: 'This setting' }],
        onChange: v => { settings.bingoSource = v; persist(); },
      });
      const bingo = slider({
        id: 'cp-bingo', label: 'Bingo', min: 0, max: 10000, step: 100, value: settings.bingoLb, unit: 'lb',
        hint: 'Used when the IFEI BINGO cannot be read, or when Bingo from is This setting.',
        onChange: v => { settings.bingoLb = v; persist(); },
      });
      const joker = slider({
        id: 'cp-joker', label: 'Joker above bingo', min: 0, max: 5000, step: 100, value: settings.jokerMarginLb, unit: 'lb',
        onChange: v => { settings.jokerMarginLb = v; persist(); },
      });
      const voiceTest = button({ label: 'Test voice', id: 'cp-voice-test', size: 's', disabled: !voice.available, onClick: () => voice.test() });

      const root = h('div', { class: 'cp-page' },
        pageHeader({
          title: 'Copilot',
          lede: 'F/A-18C helper for a second screen while you fly in DCS. It watches fuel, limits and your approach, and calls out what needs attention.',
          meta: h('div', { class: 'cp-link' }, lamps.bridge.el, lamps.dcs.el, linkText),
        }),
        preview ? h('p', { class: 'cp-banner' }, 'Preview data. No connection is made.') : null,
        profileNote,
        h('div', { class: 'cp-grid' },
          h('section', { class: 'cp-main', 'aria-label': 'Alerts and approach' },
            consolePanel({ title: 'Alerts', id: 'cp-alerts-panel', children: alertList }).el,
            h('div', { class: 'cp-pair' },
              consolePanel({ title: 'Threats (RWR)', id: 'cp-threat-panel', children: threatList }).el,
              consolePanel({ title: 'Radar lock', id: 'cp-lock-panel', children: lockBox }).el),
            h('div', { class: 'cp-pair' },
              consolePanel({ title: 'Approach AoA', id: 'cp-aoa-panel', children: aoaBox }).el,
              consolePanel({ title: 'Fuel', id: 'cp-fuel-panel', children: fuelBox }).el)),
          h('section', { class: 'cp-side', 'aria-label': 'Aircraft and settings' },
            consolePanel({ title: 'Configuration', id: 'cp-config-panel', children: [h('div', { class: 'cp-lamps' }, cfgLamps.gear.el, cfgLamps.flaps.el, cfgLamps.hook.el, cfgLamps.brake.el), cfgRows.el] }).el,
            consolePanel({ title: 'Flight', id: 'cp-flight-panel', children: flight.el }).el,
            consolePanel({ title: 'Settings', id: 'cp-settings-panel', children: [h('div', { class: 'cp-row' }, voiceToggle.el, voiceTest.el), modeSeg.el, bingoSource.el, bingo.el, joker.el] }).el,
            log.el)),
        notes());
      ctx.root.append(root);

      const renderAlerts = (active: ActiveAlert[], live: boolean) => {
        if (!live) {
          alertList.replaceChildren(h('li', { class: 'cp-alert', dataset: { severity: 'dim' } }, 'No live data from DCS'));
          return;
        }
        alertList.replaceChildren(...(active.length
          ? active.map(a => h('li', { class: 'cp-alert', dataset: { severity: a.severity } }, a.text))
          : [h('li', { class: 'cp-alert', dataset: { severity: 'clear' } }, 'All clear')]));
      };

      let lastKey = '';
      let threatKey = '';
      const fuelTrend = new FuelTrend();
      const render = (frame: DcsFrame | null, link: Pick<LinkSnapshot, 'bridge' | 'dcs'>, t: number) => {
        const live = link.dcs === 'live' && frame !== null;
        const s: Situation = situationOf(live ? frame : null);
        s.fuelFlowLbH = live ? fuelTrend.update(t, s.fuelLb) : undefined;
        const ruled = live ? engine.step(s, t) : { active: [], calls: [] as Callout[] };
        // The Hornet's own displays when it sends them; the FC3 sensor functions otherwise.
        const hornet = live && frame!.self?.name === 'FA-18C_hornet' && frame!.disp !== undefined;
        const threats = live && !hornet ? threatsOf(frame!.rwr?.emitters) : [];
        const lock = live && !hornet ? lockOf(frame) : null;
        const hThreats = hornet ? hornetThreats(frame) : null;
        const hLock = hornet ? hornetLock(frame) : null;
        const none = { active: [], calls: [] };
        const th = !live ? none : hornet ? hornetThreatTracker.update(hThreats, t) : threatTracker.update(threats, t);
        const lk = !live ? none : hornet ? hornetLockTracker.update(hLock, frame, t) : lockTracker.update(lock, t);
        const order = { warning: 0, caution: 1, advisory: 2 } as const;
        const active = [...th.active, ...ruled.active, ...lk.active].sort((a, b) => order[a.severity] - order[b.severity]);
        const calls = [...th.calls, ...ruled.calls, ...lk.calls].sort((a, b) => order[a.severity] - order[b.severity]);
        for (const c of calls) {
          voice.say(c);
          log.push(c.text, { tone: c.severity === 'warning' ? 'warning' : c.severity === 'caution' ? 'caution' : 'ok' });
        }
        const key = active.map(a => a.id + a.text).join('|') + live;
        if (key !== lastKey) { lastKey = key; renderAlerts(active, live); }

        lamps.bridge.set(link.bridge === 'up' ? 'on' : link.bridge === 'connecting' ? 'flash' : 'off');
        lamps.dcs.set(link.dcs === 'live' ? 'on' : link.dcs === 'stale' ? 'flash' : 'off');
        setText(linkText, link.bridge !== 'up' ? 'Start the bridge: npm run dcs-link' : link.dcs === 'live' ? (s.type ?? 'DCS') : 'Waiting for DCS');
        const match = live ? profileMatches(s) : null;
        profileNote.hidden = match !== false;
        if (match === false) setText(profileNote, `DCS reports ${s.type}. This copilot profile is for the F/A-18C; its calls may not fit.`);

        const sensorBlocked = live && frame!.allow.sensor === false;
        const rows = hornet ? hornetThreatRows(hThreats) : threatRows(threats);
        const tkey = sensorBlocked ? 'blocked' : live ? rows.map(r => r.id + r.state + r.where).join('|') : 'off';
        if (tkey !== threatKey) {
          threatKey = tkey;
          threatList.replaceChildren(...(sensorBlocked ? [h('li', { class: 'cp-threat', dataset: { state: 'none' } }, 'Sensor export blocked by the server')]
            : !live ? [h('li', { class: 'cp-threat', dataset: { state: 'none' } }, 'No data')]
              : rows.length ? rows.map(r => h('li', { class: 'cp-threat', dataset: { state: r.state } }, h('b', null, r.tag), h('span', null, r.where), h('span', null, r.name)))
                : [h('li', { class: 'cp-threat', dataset: { state: 'none' } }, 'RWR clear')]));
        }
        const lv = hornet ? hornetLockView(hLock) : lockView(lock);
        setText(lockNote, lv?.note ?? '');
        lockBox.dataset.state = lv ? (lv.dlz?.zone ?? 'track') : 'off';
        setText(lockName, lv ? lv.name : sensorBlocked ? 'Sensor export blocked' : 'NO LOCK');
        for (const id of ['mode', 'range', 'closure', 'aspect', 'alt', 'where'] as const) lockRows.set(id, lv ? lv[id] : '—');
        dlzBox.hidden = !lv?.dlz;
        if (lv?.dlz) {
          setText(dlzZone, `${lv.dlz.label}  ${lv.dlz.zoneText}`);
          for (const k of ['rmin', 'rne', 'rmax', 'now'] as const) dlzMarks[k].style.left = `${(lv.dlz.marks[k] * 100).toFixed(1)}%`;
          (dlzBox.querySelector('.cp-dlz__ne') as HTMLElement).style.width = `${(lv.dlz.marks.rne * 100).toFixed(1)}%`;
        }

        const a = aoaView(s);
        aoaBox.dataset.state = live ? a.state : 'off';
        setText(aoaState, live ? a.label : 'NO DATA');
        setText(aoaValue, live ? a.value : '—');

        const f = fuelView(s, settings);
        fuelBox.dataset.state = live ? f.state : 'off';
        setText(fuelTotal, live ? f.total : '—');
        fuelRows.set('joker', f.joker); fuelRows.set('bingo', f.bingo + (f.bingoFrom === 'ifei' ? '  IFEI' : ''));
        fuelRows.set('flow', live ? f.flow : '—'); fuelRows.set('endurance', live ? f.endurance : '—');

        const pos = (id: keyof typeof cfgLamps, v: ReturnType<typeof positionText>, label?: string) => {
          cfgLamps[id].set(live && !!v?.lit);
          cfgRows.set(id, live ? (label ?? v?.text ?? 'Not exported') : '—');
        };
        const sw = s.cockpit?.switches;
        pos('gear', positionText(s.gear), sw?.gearHandle && s.gear === undefined ? `HANDLE ${sw.gearHandle}` : undefined);
        const full = flapsFull(s);
        cfgLamps.flaps.set(live && full === true);
        cfgRows.set('flaps', live ? (sw?.flapSwitch ?? (s.flaps === undefined ? 'Not exported' : flapsText(s.flaps))) : '—');
        const hook = hookDown(s);
        cfgLamps.hook.set(live && hook === true);
        cfgRows.set('hook', live ? (hook === undefined ? 'Not exported' : hook ? 'DOWN' : 'UP') : '—');
        pos('brake', positionText(s.speedbrake, 'OUT', 'IN'));
        cfgRows.set('arm', live && sw?.masterArm ? sw.masterArm : '—');
        cfgRows.set('lbar', live && sw?.launchBar ? sw.launchBar : '—');
        cfgRows.set('source', !live ? '—' : s.cockpit ? 'Cockpit switches' : 'Export positions');

        const n = (v: number | undefined, f: (x: number) => string) => (live && v !== undefined ? f(v) : '—');
        flight.set('phase', live ? PHASE_TEXT[s.phase] : '—');
        flight.set('ias', n(s.iasKt, x => `${Math.round(x)} kt`));
        flight.set('agl', n(s.aglFt, x => `${Math.round(x / 10) * 10} ft`));
        flight.set('vvi', n(s.vviFpm, x => `${Math.round(x / 10) * 10} ft/min`));
        flight.set('g', n(s.g, x => x.toFixed(1)));
        flight.set('mach', n(s.mach, x => x.toFixed(2)));
        flight.set('aoa', n(s.aoaDeg, x => `${x.toFixed(1)}°`));
      };

      if (preview) {
        const link = { bridge: preview.frame ? 'up' : 'down', dcs: preview.frame ? 'live' : 'none' } as const;
        render(preview.frame, link, 0);
        render(preview.frame, link, 10);
        voiceToggle.setDisabled(true);
        voiceTest.setDisabled(true);
        return;
      }

      const link = new DcsLink();
      bag.add(() => link.stop());
      link.start();
      const t0 = performance.now();
      const timer = setInterval(() => {
        const snap = link.snapshot();
        render(snap.frame, snap, (performance.now() - t0) / 1000);
      }, REFRESH_MS);
      bag.add(() => clearInterval(timer));
    },
    unmount() { bag.dispose(); },
  };
};
export default factory;

function notes(): HTMLElement {
  const f = HORNET_FACTS;
  const tag = (v: { verified: boolean }) => (v.verified ? '' : ' (not verified)');
  return h('section', { class: 'cp-notes ui-prose', 'aria-labelledby': 'cp-notes-title' },
    h('h2', { id: 'cp-notes-title' }, 'What the copilot calls'),
    h('ul', null,
      h('li', null, `Approach, gear down below 5000 ft: on speed, slow or fast against the AoA indexer band ${f.aoaBandDeg.value[0]}–${f.aoaBandDeg.value[1]}° (on speed ${f.onSpeedAoaDeg.value}°).`),
      h('li', null, `Carrier: check hook with the gear down, and configure below ${f.carrierConfigMaxKt.value} KIAS.`),
      h('li', null, `Flaps not FULL on approach. Gear out above ${f.gearMaxKt.value} kt${tag(f.gearMaxKt)}.`),
      h('li', null, `Joker and bingo against the numbers you set. Over G above ${f.maxG.value} G${tag(f.maxG)}. Master warning.`),
      h('li', null, 'Gear up below 1000 ft, slower than 200 kt and descending.')),
    callout({
      kind: 'simplified', title: 'Not verified',
      body: h('p', null,
        'Gear, flap and hook positions come from the DCS export function written for Flaming Cliffs jets; the Hornet may not fill all of them. ',
        'The AoA unit follows the ED reference Export.lua. The copilot adds to the jet\'s own warnings; it does not replace them.'),
    }),
    h('p', null, 'Needs the DCS link: export script installed and ', h('code', null, 'npm run dcs-link'), ' running. See Reference, DCS link.'));
}
