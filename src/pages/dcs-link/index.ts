/**
 * DCS link (#/dcs): connection test between Fox3 Academy and DCS World on the same computer. Shows whether the
 * bridge and the export script are reachable, live own-ship telemetry, and a ping round trip that proves the
 * page can send to DCS. Setup in docs/dcs-link.md; protocol and client in docs/api/dcs-link.md.
 * ?shot=off|waiting|live renders a fixed preview without touching the network.
 */
import './style.css';
import type { PageFactory } from '../../app/page';
import { DcsLink, type LinkEvent, type LinkSnapshot } from '../../dcs/client';
import { BRIDGE_URL, DCS_LINK_PORTS } from '../../dcs/protocol';
import { button, callout, cleanup, coachBox, consolePanel, eventLog, h, lamp, pageHeader, readouts } from '../../ui';
import { linkView, ownShipRows, previewSnapshot } from './model';

const REFRESH_MS = 100;
const EXPORT_LINE = "local Fox3lfs = require('lfs'); dofile(Fox3lfs.writedir() .. [[Scripts\\Fox3Academy\\Fox3Link.lua]])";

const factory: PageFactory = () => {
  const bag = cleanup();
  let link: DcsLink | null = null;
  return {
    mount(ctx) {
      const preview = previewSnapshot(ctx.params.get('shot'));
      const units = ctx.app.units;

      const lamps = {
        bridge: lamp({ label: 'Bridge', tone: 'ok', title: 'Bridge process on this computer' }),
        dcs: lamp({ label: 'DCS', tone: 'ok', title: 'Telemetry frames from the export script' }),
        ping: lamp({ label: 'Ping', tone: 'advisory', title: 'Round trip to the export script' }),
      };
      const coach = coachBox({ id: 'dcs-coach', title: 'STATUS' });
      const linkRows = readouts({
        id: 'dcs-link-readouts',
        rows: [
          { id: 'bridge', label: 'Bridge' },
          { id: 'script', label: 'Export script' },
          { id: 'packets', label: 'Frames received' },
          { id: 'rate', label: 'Frame rate' },
          { id: 'age', label: 'Last frame' },
          { id: 'ownship', label: 'Own-ship export', title: 'Multiplayer servers choose what clients may export' },
          { id: 'sensor', label: 'Sensor export' },
          { id: 'object', label: 'Object export' },
        ],
      });
      const connectBtn = button({
        label: 'Disconnect', id: 'dcs-connect', size: 's',
        onClick: () => {
          if (!link) return;
          if (link.running) link.stop(); else link.start();
        },
      });

      const pingBtn = button({ label: 'Send ping', id: 'dcs-ping', variant: 'primary', onClick: () => void link?.ping() });
      const pingRows = readouts({
        id: 'dcs-ping-readouts',
        rows: [
          { id: 'sent', label: 'Sent' },
          { id: 'answered', label: 'Answered' },
          { id: 'lost', label: 'Lost' },
          { id: 'rtt', label: 'Last round trip' },
        ],
      });

      const ownRows = ownShipRows(null, units);
      const own = readouts({ id: 'dcs-own', variant: 'glass', columns: 2, rows: ownRows.map(r => ({ id: r.id, label: r.label, value: r.value })) });
      const log = eventLog({ id: 'dcs-log', title: 'Link log', max: 60, empty: 'Nothing yet.' });

      const linkPanel = consolePanel({
        title: 'Link', id: 'dcs-link-panel', actions: connectBtn.el,
        children: [h('div', { class: 'dcs-lamps' }, lamps.bridge.el, lamps.dcs.el, lamps.ping.el), coach.el, linkRows.el],
      });
      const txPanel = consolePanel({
        title: 'Transmit test', id: 'dcs-tx-panel',
        children: [
          h('p', { class: 'dcs-panel-note' }, 'Page to bridge to export script and back. Read only: it changes nothing in the game.'),
          pingBtn.el, pingRows.el,
        ],
      });
      const ownPanel = consolePanel({
        title: 'Own ship', id: 'dcs-own-panel',
        children: [own.el, h('p', { class: 'dcs-panel-note' }, 'Raw export values in your units. Not checked against the cockpit gauges.')],
      });

      const root = h('div', { class: 'dcs-page' },
        pageHeader({
          title: 'DCS link',
          lede: 'Connect Fox3 Academy to DCS World on this computer. Check that telemetry arrives from the game and that the page can send back.',
        }),
        preview ? h('p', { class: 'dcs-preview' }, 'Preview data. No connection is made.') : null,
        h('div', { class: 'dcs-grid' },
          h('div', { class: 'dcs-col' }, linkPanel.el, txPanel.el),
          h('div', { class: 'dcs-col' }, ownPanel.el, log.el)),
        setupSection());
      ctx.root.append(root);

      const render = (s: LinkSnapshot) => {
        const v = linkView(s);
        lamps.bridge.set(v.lamps.bridge);
        lamps.dcs.set(v.lamps.dcs);
        lamps.ping.set(v.lamps.ping);
        coach.set(v.coach.text, v.coach.why, v.coach.tone);
        for (const [id, value] of Object.entries(v.link)) linkRows.set(id, value);
        for (const [id, value] of Object.entries(v.ping)) pingRows.set(id, value);
        for (const r of ownShipRows(s.frame, units)) own.set(r.id, r.value);
        pingBtn.setDisabled(!v.pingReady);
        connectBtn.setLabel(s.bridge === 'off' ? 'Connect' : 'Disconnect');
      };

      if (preview) {
        render(preview);
        connectBtn.setDisabled(true);
        pingBtn.setDisabled(true);
        log.push('Preview. Start the bridge and open #/dcs to test for real.');
        return;
      }

      link = new DcsLink();
      bag.add(link.on(e => logEvent(log, e)));
      bag.add(() => link?.stop());
      link.start();
      render(link.snapshot());
      const timer = setInterval(() => { if (link) render(link.snapshot()); }, REFRESH_MS);
      bag.add(() => clearInterval(timer));
    },
    unmount() {
      bag.dispose();
      link = null;
    },
  };
};
export default factory;

function logEvent(log: ReturnType<typeof eventLog>, e: LinkEvent): void {
  switch (e.kind) {
    case 'bridge':
      if (e.state === 'up') log.push('Bridge connected.', { tone: 'ok' });
      else if (e.state === 'down') log.push(`No bridge at ${BRIDGE_URL}. Retrying.`, { tone: 'caution' });
      else if (e.state === 'off') log.push('Link off.', { tone: 'dim' });
      break;
    case 'dcs':
      if (e.state === 'live') log.push('Telemetry from DCS.', { tone: 'ok' });
      else if (e.state === 'stale') log.push('DCS quiet for 2 s.', { tone: 'caution' });
      break;
    case 'hello': log.push(`Export script v${e.script ?? '?'} started a mission.`, { tone: 'hi' }); break;
    case 'bye': log.push('DCS mission stopped.', { tone: 'dim' }); break;
    case 'ping': log.push(`Ping ${e.id} sent.`); break;
    case 'pong': log.push(`Pong ${e.id}: ${Math.round(e.rttMs)} ms round trip.`, { tone: 'ok' }); break;
    case 'ping-lost': log.push(`Ping ${e.id} not answered in 3 s. Is the export script installed and a mission running?`, { tone: 'warning' }); break;
    case 'error': log.push(e.message, { tone: 'warning' }); break;
  }
}

function setupSection(): HTMLElement {
  const code = (text: string) => h('pre', { class: 'dcs-code' }, h('code', null, text));
  return h('section', { class: 'dcs-setup ui-prose', 'aria-labelledby': 'dcs-setup-title' },
    h('h2', { id: 'dcs-setup-title' }, 'Set up'),
    h('ol', null,
      h('li', null,
        h('p', null, 'Copy the ', h('code', null, 'Fox3Academy'), ' folder from ', h('code', null, 'dcs-link/Scripts/'),
          ' in the Fox3 Academy repository to ', h('code', null, 'Saved Games\\DCS\\Scripts\\'), '.')),
      h('li', null,
        h('p', null, 'Add this line to the end of ', h('code', null, 'Saved Games\\DCS\\Scripts\\Export.lua'),
          '. Create the file if it is missing. Keep the lines other tools (Tacview, SRS, DCS-BIOS) put there.'),
        code(EXPORT_LINE)),
      h('li', null,
        h('p', null, 'Start the bridge in the Fox3 Academy folder (Node 24) and leave it running:'),
        code('npm run dcs-link')),
      h('li', null, h('p', null, 'Start a mission in DCS and sit in the jet. The DCS lamp lights within a second.'))),
    h('p', null, 'No DCS at hand? ', h('code', null, 'npm run dcs-link:fake'),
      ' sends made-up frames to the bridge and answers pings, so you can check the page alone.'),
    callout({
      kind: 'note', title: 'What the link does',
      body: h('p', null,
        `Everything stays on this computer: the export script talks to the bridge over UDP ports ${DCS_LINK_PORTS.fromDcs} and ${DCS_LINK_PORTS.toDcs}, `,
        `the page talks to the bridge at ${BRIDGE_URL}. The bridge only accepts this site and local dev servers. `,
        'The export script reads data and answers pings; it sends no commands to the jet.'),
    }),
    callout({
      kind: 'simplified', title: 'Not verified',
      body: h('p', null,
        'Multiplayer servers can block own-ship export; the Link panel shows what the server allows. ',
        'Units follow the ED reference Export.lua and have not been checked against cockpit gauges in game. ',
        'Chrome may ask to allow this site to reach devices on your local network: allow it for the link to work.'),
    }));
}
