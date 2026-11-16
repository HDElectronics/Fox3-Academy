/**
 * 3D models (#/models, under Reference): every exterior file the app ships, at true size, to check its shape against
 * the real thing and to compare two side by side. The catalogue comes from src/assets/models/manifest.json grouped by
 * the app's data (catalogue.ts); the facts are measured from the loaded geometry, set beside the app's own figures
 * (JET_DIMENSIONS, MISSILES) and the manifest's authorship and caveats. Not a lesson: no progress, not in the path.
 *
 * URL params (each view is a URL, so a headless screenshot needs no pre-roll):
 *   ?id=<asset id>   the model (default: the jet picked in the top bar)
 *   ?compare=<id>    a second model beside it, same scale, noses aligned
 *   ?view=three-quarter|side|top|front    ?shade=paint|clay|wire    ?src=file|fallback (the app's procedural stand-in)
 *   ?shot=<any>      screenshots: keeps the turntable off; everything else is already in the URL
 * List links add a history entry (Back returns to the previous model); arrow keys and the view / shading controls
 * replace it. The router applies every change in place (update).
 */
import './style.css';
import manifest from '../../assets/models/manifest.json';
import type { PageFactory } from '../../app/page';
import { AG_WEAPONS } from '../../data/agWeapons';
import { isWebGLAvailable } from '../../render/stage';
import { assetUrl, type AssetId } from '../../render/assetRegistry';
import {
  append, bindKeys, button, cleanup, consolePanel, disclosure, h, labLayout, readouts, segmented, select, setText, toggle,
  type ReadoutsHandle,
} from '../../ui';
import {
  CATEGORIES, SHADES, VIEWS, appFigures, buildCatalogue, deltaPercent, fmtBytes, fmtLength, gridSpacing, hasFallback,
  lengthParts, parseState, referenceParts, stateQuery, stepItem, storesWithoutModel,
  type CatalogueItem, type CategoryId, type ManifestRecord, type Shade, type Source, type ViewId, type ViewerState,
} from './catalogue';
import { consumersOf } from './usage';
import { ModelViewer, type SlotStatus, type ViewerStatus } from './viewer';

const RECORDS = manifest as ManifestRecord[];
const SHADE_LABEL: Record<Shade, string> = { paint: 'Paint', clay: 'Clay', wire: 'Wire' };
const SHADE_TITLE: Record<Shade, string> = {
  paint: 'Authored colours and materials',
  clay: 'One matte grey, flat shaded: shape and facets without the paint',
  wire: 'Triangle edges: where the geometry is dense or thin',
};
/** Figures that differ from the app's by this much or more get a caution lamp. */
const MISMATCH_PCT = 3;

const factory: PageFactory = () => {
  const bag = cleanup();
  let apply: ((params: URLSearchParams) => boolean) | null = null;
  return {
    mount(ctx) {
      const units = ctx.app.units;
      const cat = buildCatalogue(RECORDS, id => assetUrl(id as AssetId) !== undefined);
      let state = parseState(ctx.params, cat, ctx.app.jet);
      const shot = ctx.params.has('shot');
      const itemOf = (id: string) => cat.byId.get(id)!;
      const href = (next: ViewerState) => '#/models?' + stateQuery(next);
      /** A list link: that model first; picking the compared one swaps the two. */
      const pick = (id: string): ViewerState => (id === state.compare ? { ...state, id, compare: state.id } : { ...state, id });
      const go = (next: ViewerState, replace = false) => ctx.navigate('models?' + stateQuery(next), { replace });

      // ---------------------------------------------------------------- catalogue
      let shownCategory: CategoryId = itemOf(state.id).category;
      const catSeg = segmented<CategoryId>({
        id: 'mdl-cat', ariaLabel: 'Category', size: 's', fill: true, value: shownCategory,
        options: cat.groups.map(g => ({ value: g.def.id, label: g.def.short, sub: String(g.items.length), title: g.def.label })),
        onChange: v => { shownCategory = v; renderList(); },
      });
      const listTitle = h('p', { class: 'mdl-list__title' });
      const list = h('ul', { class: 'mdl-list', 'aria-label': 'Models' });
      const listNote = h('p', { class: 'mdl-list__note' });
      const linkFor = new Map<string, HTMLAnchorElement>();
      const renderList = () => {
        const group = cat.groups.find(g => g.def.id === shownCategory) ?? cat.groups[0]!;
        setText(listTitle, `${group.def.label} · ${group.items.length}`);
        linkFor.clear();
        list.replaceChildren(...group.items.map(item => {
          const a = h('a', { class: 'mdl-item', href: href(pick(item.id)), title: item.name },
            h('span', { class: 'mdl-item__name' }, item.name),
            h('span', { class: 'mdl-item__id' }, item.hasFile ? item.id : `${item.id} · no file`));
          linkFor.set(item.id, a);
          return h('li', null, a);
        }));
        const guns = storesWithoutModel();
        listNote.hidden = group.def.id !== 'ag' || guns.length === 0;
        setText(listNote, `No model for the guns (${guns.join(', ')}): rounds draw as tracers.`);
        markList();
      };
      const markList = () => {
        for (const [id, a] of linkFor) {
          if (id === state.id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
          a.dataset.compare = String(id === state.compare);
          a.title = id === state.compare ? `${itemOf(id).name}: compared; open it first` : itemOf(id).name;
          a.href = href(pick(id));
        }
      };
      const catalogue = consolePanel({
        title: 'Catalogue', id: 'mdl-catalogue',
        actions: h('span', { class: 'mdl-count' }, `${cat.items.length} files`),
        children: [catSeg.el, listTitle, list, listNote],
      });

      // ---------------------------------------------------------------- compare
      const compareSel = select<string>({
        id: 'mdl-compare', label: 'Compare with', value: state.compare ?? '',
        options: [{ value: '', label: 'None' }, ...cat.groups.flatMap(g => g.items.map(i => ({ value: i.id, label: `${i.name} (${i.id})`, group: g.def.label })))],
        onChange: v => go({ ...state, compare: v || null }),
      });
      const swapBtn = button({
        label: 'Swap', size: 's', id: 'mdl-swap', title: 'Put the compared model first',
        onClick: () => { if (state.compare) go({ ...state, id: state.compare, compare: state.id, source: 'file' }); },
      });
      const compareFacts = h('div', { class: 'mdl-compare-facts' });
      const comparePanel = consolePanel({ title: 'Compare', id: 'mdl-compare-panel', children: [compareSel.el, swapBtn.el, compareFacts] });

      // ---------------------------------------------------------------- facts
      const srcSeg = segmented<Source>({
        id: 'mdl-src', label: 'Drawn from', size: 's', value: state.source,
        options: [
          { value: 'file', label: 'File', title: 'The GLB the app ships' },
          { value: 'fallback', label: 'App fallback', title: 'The procedural stand-in the app builds while the file loads or if it fails' },
        ],
        onChange: v => go({ ...state, source: v }, true),
      });
      const factsBody = h('div', { class: 'mdl-facts' });
      const factsPanel = consolePanel({ title: 'Facts', id: 'mdl-facts', children: [srcSeg.el, factsBody] });
      let facts: ReadoutsHandle | null = null;

      // ---------------------------------------------------------------- view overlays
      const plateName = h('b', { class: 'mdl-plate__name' });
      const plateSub = h('span', { class: 'mdl-plate__sub' });
      const plate = h('div', { class: 'mdl-plate', role: 'status', 'aria-live': 'polite' }, plateName, plateSub);
      const viewSeg = segmented<ViewId>({
        id: 'mdl-view', ariaLabel: 'Camera', size: 's', value: state.view,
        options: VIEWS.map(v => ({ value: v.id, label: v.label, keys: v.keys, title: v.id === 'three-quarter' ? 'Three-quarter view' : `${v.label} view` })),
        onChange: v => go({ ...state, view: v }, true),
      });
      const shadeSeg = segmented<Shade>({
        id: 'mdl-shade', ariaLabel: 'Shading', size: 's', value: state.shade,
        options: SHADES.map(s => ({ value: s, label: SHADE_LABEL[s], title: `${SHADE_TITLE[s]} (W cycles)` })),
        onChange: v => go({ ...state, shade: v }, true),
      });
      const spin = toggle({ id: 'mdl-spin', label: 'Turntable', keys: 'T', size: 's', onChange: on => viewer?.setTurntable(on) });
      const reframe = button({ label: 'Frame', size: 's', id: 'mdl-frame', keys: 'F', title: 'Back to the preset view', onClick: () => viewer?.frame() });
      const legend = h('div', { class: 'mdl-legend' });

      const viewport = h('div', { class: 'mdl-viewport' });
      const lab = labLayout({
        id: 'mdl-lab', class: 'mdl-lab',
        header: {
          title: '3D models',
          meta: `${cat.items.length} files · original Fox3 art`,
          lede: 'Every exterior the app ships, at true size. Check the shape, then put two side by side.',
        },
        viewport,
        console: [catalogue.el, comparePanel.el, factsPanel.el],
      });
      bag.add(() => lab.destroy());
      lab.overlay('tl', plate);
      lab.overlay('tr', viewSeg.el);
      lab.overlay('bl', shadeSeg.el, spin.el, reframe.el);
      lab.overlay('br', legend);
      ctx.root.append(h('div', { class: 'mdl-page' }, lab.el));

      // ---------------------------------------------------------------- 3D
      let viewer: ModelViewer | null = null;
      let status: ViewerStatus | null = null;
      if (isWebGLAvailable()) {
        try {
          viewer = new ModelViewer(viewport, { units, ariaLabel: '3D model view', onStatus: s => { status = s; renderStatus(); } });
        } catch (e) { console.warn('3D models: no WebGL view', e); viewer = null; }
      }
      if (!viewer) viewport.append(h('p', { class: 'mdl-no3d' }, 'The 3D view needs WebGL. The catalogue and the manifest facts still apply.'));
      bag.add(() => { viewer?.dispose(); viewer = null; });
      for (const c of [spin, reframe]) if (!viewer) c.setDisabled(true);

      const slotSpec = (id: string, source: Source) => ({ id, name: itemOf(id).name, source });
      const showModels = () => viewer?.show(slotSpec(state.id, state.source), state.compare ? slotSpec(state.compare, 'file') : null);

      // ---------------------------------------------------------------- facts rendering
      const sizeRows = (item: CatalogueItem) => [
        { id: 'len', label: 'Length' },
        { id: 'wid', label: item.category === 'aircraft' ? 'Span' : 'Width' },
        { id: 'hgt', label: 'Height' },
      ];
      const renderFacts = () => {
        const item = itemOf(state.id);
        const app = appFigures(item.id);
        const rows = [
          { id: 'cat', label: 'Category', value: CATEGORIES.find(c => c.id === item.category)?.label ?? item.record.category },
          ...sizeRows(item),
          ...(app ? [
            { id: 'appLen', label: 'App length', title: `${app.source} in the app's code and data` },
            app.spanM !== undefined ? { id: 'appWid', label: 'App span', title: `${app.source}` } : null,
            app.diameterM !== undefined ? { id: 'appDia', label: 'App body dia.', title: `${app.source}: body only; the measured width includes the fins` } : null,
            { id: 'scale', label: 'Scale in app', title: 'The app fits the file\'s length to the app length, the same factor on every axis' },
          ].filter((r): r is NonNullable<typeof r> => r !== null) : []),
          { id: 'tris', label: 'Triangles' },
          { id: 'file', label: 'File', value: item.hasFile ? `${assetFileName(item.id)} · ${fmtBytes(item.record.bytes)}` : 'none bundled' },
        ];
        facts = readouts({ id: 'mdl-readouts', rows });
        const app2 = (id: string, m: number | undefined) => { if (m !== undefined) { const [v, u] = lengthParts(m, units); facts!.set(id, v, u); } };
        if (app) { app2('appLen', app.lengthM); app2('appWid', app.spanM); app2('appDia', app.diameterM); }

        const used = consumersOf(item);
        const aliasNames = item.aliases.map(a => (AG_WEAPONS as Record<string, { name: string }>)[a]?.name ?? a);
        const caveats = item.record.source_caveats ?? [];
        const caveatChars = caveats.join(' ').length;
        const refs = item.record.references ?? [];
        factsBody.replaceChildren();
        append(factsBody, [
          h('h4', { class: 'mdl-facts__name' }, item.name),
          facts.el,
          app ? h('p', { class: 'mdl-note' }, `In the lessons ${item.category === 'aircraft' ? 'JetMesh' : 'MissileVisual'} scales this file by one factor to the app length, so span and height keep the file's proportions.`) : null,
          aliasNames.length ? h('p', { class: 'mdl-note' }, `Also drawn for ${aliasNames.join(', ')}.`) : null,
          h('div', { class: 'mdl-used' },
            h('p', { class: 'mdl-used__title' }, 'Drawn by'),
            used.length
              ? h('ul', { class: 'mdl-used__list' }, used.map(c => h('li', null, c.text)))
              : h('p', { class: 'mdl-note mdl-note--warn' }, item.id === 'apkws'
                ? 'No page draws this file: APKWS rockets in flight keep a procedural body.'
                : 'No page draws this file yet: it ships for loadouts the app does not show in 3D.')),
          item.record.authorship ? h('p', { class: 'mdl-prose' }, item.record.authorship) : null,
          caveats.length ? disclosure({
            title: `Caveats (${caveats.length})`, open: caveatChars <= 320,
            content: h('ul', { class: 'mdl-caveats' }, caveats.map(c => h('li', null, c))),
          }) : h('p', { class: 'mdl-note' }, 'The manifest lists no caveats for this file.'),
          refs.length ? disclosure({
            title: `References (${refs.length})`,
            content: h('ul', { class: 'mdl-refs' }, refs.map(r => {
              const p = referenceParts(r);
              return h('li', null, h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer' }, p.label), p.note ? h('span', { class: 'mdl-refs__use' }, p.note) : null);
            })),
          }) : null,
        ]);
        srcSeg.set(state.source);
        srcSeg.setDisabled('fallback', !hasFallback(item.id));
        renderStatus();
      };

      const statusOf = (id: string): SlotStatus | null => status?.slots.find(s => s.id === id) ?? null;
      const renderStatus = () => {
        const item = itemOf(state.id);
        const s = statusOf(state.id);
        setText(plateName, item.name);
        const what = s?.drawn === 'fallback' ? (s.fileFailed ? 'file failed to load · app fallback' : 'app fallback') : `${assetFileName(item.id)}`;
        setText(plateSub, !viewer ? 'no 3D view' : !s || s.state === 'loading' ? `${item.id} · loading` : s.state === 'failed' ? `${item.id} · file failed to load, no fallback` : `${item.id} · ${what}`);
        // Loading until every model in the view has settled (the view shows them together).
        plate.dataset.state = !s || status?.phase === 'loading' ? 'loading' : s.state;
        if (facts) {
          const stats = s?.state === 'ready' ? s.stats : null;
          const app = appFigures(item.id);
          const put = (id: string, m: number | undefined, appM?: number) => {
            if (m === undefined) { facts!.set(id, '—', ''); facts!.setTone(id, null); return; }
            const [v, u] = lengthParts(m, units);
            const d = deltaPercent(m, appM);
            facts!.set(id, v, d !== null && d !== 0 ? `${u} (${d > 0 ? '+' : ''}${d} %)` : u);
            facts!.setTone(id, d !== null && Math.abs(d) >= MISMATCH_PCT ? 'caution' : null);
          };
          put('len', stats?.size.z, app?.lengthM);
          put('wid', stats?.size.x, app?.spanM);
          put('hgt', stats?.size.y);
          facts.set('tris', stats ? String(stats.triangles) : '—', stats ? `in ${stats.meshes} meshes` : '');
          if (app) facts.set('scale', stats && stats.size.z > 0 ? `×${(app.lengthM / stats.size.z).toFixed(3)}` : '—', '');
        }
        // Compare facts: the second model in short.
        const cid = state.compare;
        compareFacts.hidden = !cid;
        swapBtn.setDisabled(!cid);
        if (cid) {
          const cs = statusOf(cid), st = cs?.state === 'ready' ? cs.stats : null;
          const L = (m: number | undefined) => (m === undefined ? '—' : fmtLength(m, units));
          compareFacts.replaceChildren(
            h('p', { class: 'mdl-compare-facts__name' }, itemOf(cid).name),
            h('p', { class: 'mdl-compare-facts__dims' }, st ? `L ${L(st.size.z)} · W ${L(st.size.x)} · H ${L(st.size.y)} · ${st.triangles} tris` : cs?.state === 'failed' ? 'file failed to load' : 'loading'));
        }
        const all = status?.slots.filter(x => x.state === 'ready' && x.stats) ?? [];
        const maxDim = Math.max(0, ...all.map(x => Math.max(x.stats!.size.x, x.stats!.size.y, x.stats!.size.z)));
        const g = gridSpacing(maxDim || 10);
        setText(legend, `Grid ${g.minor} m · major ${g.major} m`);
      };

      // ---------------------------------------------------------------- apply the URL
      const applyState = (next: ViewerState, first: boolean) => {
        const prev = state;
        state = next;
        const models = first || prev.id !== next.id || prev.compare !== next.compare || prev.source !== next.source;
        if (first || prev.view !== next.view) { viewSeg.set(next.view); viewer?.setView(next.view); }
        if (first || prev.shade !== next.shade) { shadeSeg.set(next.shade); viewer?.setShade(next.shade); }
        compareSel.set(next.compare ?? '');
        if (first || prev.id !== next.id) {
          const c = itemOf(next.id).category;
          if (c !== shownCategory || first) { shownCategory = c; catSeg.set(c); renderList(); }
        }
        markList();
        if (models) { status = null; showModels(); }
        if (first || prev.id !== next.id || prev.source !== next.source) renderFacts(); else renderStatus();
        revealInList(next.id);
      };
      /** Keep the selection in view inside the list's own scroll box (never scrolls the page). */
      const revealInList = (id: string) => {
        const a = linkFor.get(id)?.parentElement;
        if (!a) return;
        const top = a.offsetTop, bottom = top + a.offsetHeight;
        if (top < list.scrollTop) list.scrollTop = top;
        else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
      };
      applyState(state, true);
      apply = params => { applyState(parseState(params, cat, ctx.app.jet), false); return true; };

      // ---------------------------------------------------------------- keys
      // Stepping passes over the compared model, so the comparison stays on while you sweep.
      const step = (d: number) => go({ ...state, id: stepItem(cat.items.filter(i => i.id !== state.compare), state.id, d) }, true);
      bag.add(bindKeys({
        'Left / Up': { down: () => step(-1), repeat: true },
        'Right / Down': { down: () => step(1), repeat: true },
        '1 / 2 / 3 / 4': e => { const v = VIEWS[Number(e.code.slice(-1)) - 1]; if (v) go({ ...state, view: v.id }, true); },
        'T': () => { if (viewer && !shot) spin.toggle(true); },
        'W': () => go({ ...state, shade: SHADES[(SHADES.indexOf(state.shade) + 1) % SHADES.length]! }, true),
        'F': () => viewer?.frame(),
      }));
    },
    update(params) { return apply?.(params) ?? false; },
    unmount() { apply = null; bag.dispose(); },
  };
};

/** The file a registry id loads (AGM-65D/H/L share agm65.glb). */
function assetFileName(id: string): string { return `${id}.glb`; }

export default factory;
