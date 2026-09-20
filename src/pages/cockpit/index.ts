/** Original 2D cockpit diagrams with sourced, individually selectable DCS controls. */
import './style.css';
import type { PageFactory } from '../../app/page';
import { cockpitFor, COCKPIT_REGIONS, COCKPIT_CAVEATS, type CockpitPanel, type CockpitControl } from '../../data/cockpit';
import { h, cleanup, setText, disclosure, button } from '../../ui';
import { allControls, findControl, searchControls, sourceUrl, mfdButtonPosition } from './model';

const factory: PageFactory = () => {
  const bag = cleanup();
  return {
    mount(ctx) {
      const cockpit = cockpitFor(ctx.app.aircraft);
      if (!cockpit) {
        ctx.root.append(h('section', { class: 'cp-unavailable' },
          h('p', { class: 'cp-eyebrow' }, 'Cockpit explorer'), h('h1', null, ctx.app.spec.short),
          h('p', null, 'This aircraft has not been mapped yet. The first explorer covers the F-16C Viper.'),
          button({ label: 'Explore the F-16C', variant: 'primary', onClick: () => ctx.navigate('cockpit?ac=f16c') }).el,
          h('a', { href: '#/reference' }, 'Open this aircraft’s bindings and procedures')));
        return;
      }
      const catalogue = allControls(cockpit);
      const initial = findControl(cockpit, ctx.params.get('control'));
      let selectedPanel = initial?.panel ?? cockpit.panels.find(p => p.id === ctx.params.get('panel')) ?? cockpit.panels[0]!;
      let selectedControl: CockpitControl | null = initial?.control ?? null;
      let query = ctx.params.get('q') ?? '';
      let mobile = matchMedia('(max-width: 900px)').matches;
      const page = h('section', { class: 'cp-page', id: 'cockpit-explorer', dataset: { view: initial && mobile ? 'details' : 'map' } });
      const heading = h('h1', null, 'Know your cockpit');
      const progress = h('span', { class: 'cp-progress' });
      const search = h('input', { id: 'cp-search', type: 'search', placeholder: 'Search controls, functions or labels', autocomplete: 'off', spellcheck: 'false' });
      search.value = query;
      const regionSelect = h('select', { id: 'cp-region', 'aria-label': 'Cockpit region' },
        COCKPIT_REGIONS.map(region => h('option', { value: region.id }, region.label)));
      regionSelect.value = selectedPanel.region;
      const status = h('p', { class: 'cp-search-status', role: 'status' });
      const panelNav = h('nav', { class: 'cp-panel-nav', 'aria-label': 'Cockpit panels' });
      const overview = h('div', { class: 'cp-overview', 'aria-label': 'Schematic cockpit panel map' });
      const panelDiagram = h('section', { class: 'cp-diagram', 'aria-label': 'Selected panel controls' });
      const results = h('div', { class: 'cp-results', hidden: true });
      const overviewFold = disclosure({ title: 'Cockpit layout', content: overview });
      const map = h('div', { class: 'cp-map' }, overviewFold, panelDiagram, results);
      const details = h('aside', { class: 'cp-detail', 'aria-label': 'Control explanation' });
      const workspace = h('div', { class: 'cp-workspace' }, panelNav, map, details);
      const back = button({ label: 'Back to panel', onClick: () => {
        page.dataset.view = 'map';
        requestAnimationFrame(() => {
          const selected = [...map.querySelectorAll<HTMLButtonElement>('[data-control][aria-pressed="true"]')].find(el => el.offsetParent !== null);
          (selected ?? search).focus();
        });
      } });
      back.el.classList.add('cp-mobile-back');
      page.append(h('header', { class: 'cp-head' },
        h('div', null, h('p', { class: 'cp-eyebrow' }, `${cockpit.name} · 2D cockpit explorer`), heading,
          h('p', null, 'Pick a panel. Select a control. Understand its role in DCS.')),
        h('div', { class: 'cp-coverage' }, `${catalogue.length} items · ${cockpit.panels.length} panels`, progress)),
        h('div', { class: 'cp-tools' }, h('label', { for: 'cp-search', class: 'cp-search-label' }, 'Find a control', search),
          h('label', { for: 'cp-region', class: 'cp-region-label' }, 'Area', regionSelect)), status, workspace, back.el,
        disclosure({ title: 'Coverage, accuracy and sources', content: h('div', { class: 'cp-scope' },
          COCKPIT_CAVEATS.map(text => h('p', null, text)),
          h('a', { href: cockpit.source.url, target: '_blank', rel: 'noopener noreferrer' }, cockpit.source.title),
          h('p', null, 'Coverage includes mapped physical controls and read-only displays. Software pages, individual display symbols and every warning-lamp state are not separate controls.')) }));
      ctx.root.append(page);
      bag.add(() => page.remove());

      function updateProgress() {
        const count = catalogue.filter(({ control }) => ctx.app.getProgress(`cockpit:f16c:${control.id}:viewed`) === true).length;
        setText(progress, `${count} explored`);
      }
      function selectControl(panel: CockpitPanel, control: CockpitControl) {
        selectedPanel = panel; selectedControl = control;
        regionSelect.value = panel.region;
        ctx.app.setProgress(`cockpit:f16c:${control.id}:viewed`, true);
        render();
        if (mobile) page.dataset.view = 'details';
        details.querySelector<HTMLElement>('h2')?.focus({ preventScroll: !mobile });
      }
      function selectPanel(panel: CockpitPanel) {
        selectedPanel = panel; selectedControl = null; query = ''; search.value = ''; regionSelect.value = panel.region;
        page.dataset.view = 'map'; render();
      }
      function controlButton(panel: CockpitPanel, control: CockpitControl, compact = false): HTMLButtonElement {
        const b = h('button', { type: 'button', class: compact ? 'cp-result' : 'cp-control',
          'aria-pressed': String(selectedControl?.id === control.id),
          dataset: { kind: control.kind, control: control.id }, onclick: () => selectControl(panel, control) },
          compact ? h('span', { class: 'cp-result__panel' }, panel.label) : h('span', { class: 'cp-control__symbol', 'aria-hidden': 'true' }),
          h('span', { class: 'cp-control__label' }, control.label),
          h('span', { class: 'cp-control__kind' }, control.kind),
          compact ? h('span', { class: 'cp-result__summary' }, control.summary) : null);
        if (control.dcsStatus === 'not-implemented') b.append(h('span', { class: 'cp-control__note' }, 'Manual: not implemented'));
        if (control.dcsStatus === 'uncertain') b.append(h('span', { class: 'cp-control__note' }, 'Needs verification'));
        return b;
      }
      function panelControls(panel: CockpitPanel): HTMLElement {
        if (!/^front-(left|right)-mfd$/.test(panel.id)) {
          return h('div', { class: 'cp-control-grid' }, panel.controls.map(control => controlButton(panel, control)));
        }
        const bezel = h('div', { class: 'cp-mfd', 'aria-label': 'MFD bezel: buttons in clockwise numbered order' });
        const adjustments = h('div', { class: 'cp-control-grid cp-mfd-adjustments' });
        for (const control of panel.controls) {
          const b = controlButton(panel, control);
          const number = /^OSB (\d+)$/.exec(control.label)?.[1];
          if (number) {
            const position = mfdButtonPosition(Number(number));
            b.style.gridColumn = String(position.column); b.style.gridRow = String(position.row);
            bezel.append(b);
          } else if (control.kind === 'display') {
            b.classList.add('cp-mfd-screen'); bezel.append(b);
          } else adjustments.append(b);
        }
        return h('div', { class: 'cp-mfd-panel' }, bezel, adjustments);
      }
      function renderDetails() {
        details.replaceChildren();
        if (!selectedControl) {
          details.append(h('p', { class: 'cp-eyebrow' }, 'Control guide'), h('h2', null, 'Start with a control'),
            h('p', null, 'Select any labelled item to see what it does, its positions, how to operate it in DCS, and the source.'),
            h('p', { class: 'cp-muted' }, 'Switches and knobs here open explanations. They do not change a simulated aircraft state.'),
            h('a', { href: '#/reference?go=procs' }, 'Aircraft procedures →'));
          return;
        }
        const c = selectedControl;
        const statusLabel = c.dcsStatus === 'not-implemented' ? 'Manual: not implemented'
          : c.dcsStatus === 'uncertain' ? 'Needs verification' : 'Documented item';
        details.append(h('p', { class: 'cp-eyebrow' }, selectedPanel.label), h('h2', { tabindex: '-1' }, c.label),
          h('span', { class: 'cp-status', dataset: { status: c.dcsStatus ?? 'documented' } }, statusLabel),
          h('p', { class: 'cp-purpose' }, c.summary),
          h('h3', null, 'How to use it'), h('p', null, c.operation),
          h('h3', null, 'What changes'), h('p', null, c.effect));
        if (c.positions?.length) details.append(h('h3', null, 'Positions and actions'),
          h('dl', { class: 'cp-positions' }, c.positions.map(position => [h('dt', null, position.label), h('dd', null, position.effect)])));
        if (c.notes) details.append(h('p', { class: 'cp-note' }, c.notes));
        if (!['indicator', 'display', 'panel', 'fixture'].includes(c.kind)) {
          details.append(h('h3', null, 'DCS controls'),
            h('p', null, c.binding?.command ?? 'Use the clickable cockpit or find this control in the F-16C Controls menu.'),
            h('p', { class: 'cp-binding' }, c.binding?.verified && c.binding.keys ? `Guide-listed shortcut: ${c.binding.keys}` : 'Keyboard default not verified. Assign a binding in DCS if needed.'));
        } else details.append(h('p', { class: 'cp-muted' }, c.kind === 'panel'
          ? 'Panel overview only. Its individual internal controls are not mapped.'
          : c.kind === 'fixture' ? 'Physical fixture. See the notes for the limits of its documented interaction.'
          : 'Read-only indication or display. Select its related controls to learn how the presentation changes.'));
        details.append(h('h3', null, 'Source'), h('div', { class: 'cp-sources' }, c.sources.map(ref =>
          h('a', { href: sourceUrl(cockpit!, ref.page), target: '_blank', rel: 'noopener noreferrer' }, `DCS guide · p. ${ref.page}${ref.section ? ` · ${ref.section}` : ''}`))),
          h('a', { class: 'cp-related', href: '#/reference?go=procs' }, 'Open aircraft procedures →'));
      }
      function render() {
        const filtered = searchControls(cockpit!, query);
        const searching = query.trim().length > 0;
        const regionPanels = cockpit!.panels.filter(panel => panel.region === regionSelect.value);
        panelNav.replaceChildren(h('p', { class: 'cp-eyebrow' }, 'Panels'), ...regionPanels.map(panel =>
          h('button', { type: 'button', class: 'cp-panel-link', 'aria-current': panel.id === selectedPanel.id ? 'true' : 'false', onclick: () => selectPanel(panel) },
            h('span', null, panel.label), h('small', null, String(panel.controls.length)))));
        overview.replaceChildren(h('div', { class: 'cp-canopy', 'aria-hidden': 'true' }, 'Forward'),
          ...COCKPIT_REGIONS.map(region => h('button', { type: 'button', class: `cp-area cp-area--${region.id}`,
            'aria-pressed': String(regionSelect.value === region.id), onclick: () => {
              const first = cockpit!.panels.find(panel => panel.region === region.id); if (first) selectPanel(first);
            } }, h('span', null, region.label), h('small', null, `${cockpit!.panels.filter(panel => panel.region === region.id).length} panels`))),
          h('p', { class: 'cp-map-caption' }, 'Cockpit regions · original schematic, not to scale'));
        panelDiagram.replaceChildren(h('header', { class: 'cp-panel-head' }, h('p', { class: 'cp-eyebrow' }, `${selectedPanel.controls.length} selectable items`),
          h('h2', null, selectedPanel.label), h('p', null, selectedPanel.summary)),
          panelControls(selectedPanel));
        results.hidden = !searching; overviewFold.hidden = searching; panelDiagram.hidden = searching;
        results.replaceChildren(...filtered.map(({ panel, control }) => controlButton(panel, control, true)));
        if (searching && !filtered.length) results.append(h('h2', null, 'No matching controls'), h('p', null, 'Try a cockpit label, system name or action, such as lighting, fuel, trim or radio.'));
        setText(status, searching ? `${filtered.length} matching items across the cockpit` : `${COCKPIT_REGIONS.find(r => r.id === selectedPanel.region)?.label} / ${selectedPanel.label}`);
        renderDetails(); updateProgress();
      }
      bag.on(search, 'input', () => { query = search.value; page.dataset.view = 'map'; render(); });
      bag.on(regionSelect, 'change', () => {
        const first = cockpit.panels.find(panel => panel.region === regionSelect.value); if (first) selectPanel(first);
      });
      const media = matchMedia('(max-width: 900px)');
      bag.on(media, 'change', () => { mobile = media.matches; if (!mobile) page.dataset.view = 'map'; });
      if (initial) ctx.app.setProgress(`cockpit:f16c:${initial.control.id}:viewed`, true);
      render();
      if (initial) details.querySelector<HTMLElement>('h2')?.focus({ preventScroll: !mobile });
    },
    unmount() { bag.dispose(); },
  };
};
export default factory;
