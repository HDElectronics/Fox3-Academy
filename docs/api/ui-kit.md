# UI kit (`src/ui`) — API

Cockpit controls, panels and layouts for every page. Plain DOM factories: each returns
`{ el, ...small handle }`; you append `el` and keep the handle. Styles are in
`src/styles/components.css` (already imported by `main.ts`), colours only from `tokens.css`.

```ts
import { labLayout, consolePanel, disclosure, screenBezel, segmented, slider, button, coachBox,
         checklist, eventLog, readouts, callout, bindKeys, kbd, cleanup } from '../../ui';
```

Harness with every component in both skins: `/sandbox/ui.html?skin=ru|us&view=kit|lab|doc`
(`&modal=1`, `&toast=1` for screenshots, `?selftest=1` runs 33 DOM behaviour checks and prints
`SELFTEST PASS 33/33` to the console).

---

## Rules that apply to every factory

- **Ids are yours.** Form controls (`toggle`, `segmented`, `slider`, `select`, `chips`, `tabs`)
  require a stable `id`; sub-elements derive from it (`<id>-<value>`, `<id>-tab-<tab>`,
  `<id>-panel-<tab>`, `<id>-label`, `<id>-out`).
- **`set(value)` never fires `onChange`** unless you pass `emit = true`. User input always fires it.
  So you can sync controls from the sim every frame without feedback loops.
- **Labels are uppercase mono** on caps and placards (CSS). Pass normal text (`'Scan width'`).
  `button({ keepCase: true })` keeps case.
- **`keys`** on buttons, toggles, segments, chips and tabs prints the DCS key on the cap as `<kbd>`
  and sets `aria-keyshortcuts`. It does not bind anything: bind with `bindKeys`.
- **Surfaces.** Components without their own background (placards, tabs, readouts, checklist, ghost
  buttons, key hints) take colours from the surface they sit on: *ground* (page background, light
  ink), *panel* (`.ui-console`, `.ui-surface`, the lab strip, modal: the cockpit paint and its ink),
  *glass* (bezels, coach, log: phosphor on black). Put controls inside a `consolePanel` or an element
  with class `ui-surface` to get panel ink. Page-local CSS can use the same variables:
  `--s-ink`, `--s-label`, `--s-title`, `--s-rule`.
- **Soviet paint (`ru`) has black ink on turquoise.** Never put `--caution`/`--sym` coloured text
  directly on a turquoise panel (1.8:1). Tones on panel readouts show as a lamp dot; coloured text
  belongs on glass or caps.

---

## Controls (`controls.ts`)

| Factory | Returns | Notes |
|---|---|---|
| `button({ label, id?, onClick?, variant?: 'cap'\|'primary'\|'ghost', size?: 's'\|'m'\|'l', keys?, lamp?, lit?, disabled?, title?, ariaLabel?, block?, keepCase?, class? })` | `{ el, setLabel(c), setDisabled(b), setLit(b) }` | `primary` = lit cap for the one main action on a panel. `lamp: true` adds a lamp strip that `setLit(true)` lights (SHOOT / ПР cue). `ghost` = underlined text action. A lit `primary` (FIRE with the shoot cue) keeps its dark legend and glows, with a dark lamp bar when it has `lamp`; a lit `ghost` goes bold in the surface ink. |
| `toggle({ id, label, value?, onChange?, style?: 'lamp'\|'switch', states?: [off, on], keys?, size?, disabled?, title? })` | `{ el, value, set(v, emit?), toggle(emit = true), setDisabled }` | `lamp`: latching push-button, `aria-pressed`, lamp strip lit when on. `switch`: lever with ON/OFF legend, `role=switch` + `aria-checked` (use for settings: audio, master arm). |
| `segmented<T extends string\|number>({ id, label?, ariaLabel?, options: { value, label, sub?, title?, disabled?, keys? }[], value, onChange?, size?: 's', fill? })` | `{ el, group, value, set(v, emit?), setDisabled(v, b), setOption(v, patch), setOptions(opts, value?) }` | Radio group of caps. Arrow keys / Home / End move and select (skipping disabled), roving tabindex. `sub` is a small second line (e.g. frame time). `fill` stretches segments; they wrap when there is no room. **`setOption(v, { label?, sub?, title?, disabled?, keys? })` updates one cap in place** (no rebuild, focus stays): use it for live frame times or per-jet limits. `setOptions` rebuilds only when something a cap shows changed, and keeps keyboard focus on the same value. |
| `slider({ id, label, min, max, step?, value, unit?, format?, onInput?, onChange?, marks?, zones?, readoutCh?, disabled?, hint? })` | `{ el, input, value, set(v, emit?), setUnit(u), setRange(min, max, step?), setDisabled, setMarks(marks), setZones(zones) }` | Native range input with a black-glass digital readout (`<output>`). `onInput` is live while dragging, `onChange` on release. `marks`: numbers or `{ value, label?, title? }` ticks; **`setMarks(marks)` replaces them live** (e.g. Rmin / Rne / Rmax from `dlzFor`), is cheap when unchanged, and drops marks outside min..max. `aria-valuetext` includes the unit. |
| `select<T extends string>({ id, label?, ariaLabel?, options: { value, label, disabled?, group? }[], value, onChange?, inline? })` | `{ el, select, value, set(v, emit?), setOptions(opts, v?), setDisabled }` | Native select as a cap; `group` builds `<optgroup>`s. |
| `chips<T extends string>({ id, label?, ariaLabel?, options: { value, label, title?, disabled?, keys? }[], value: T[], onChange?(values, changed, on) })` | `{ el, value, has(v), set(values, emit?), toggle(v, on?, emit = true) }` | Any-of-N switches with an indicator lamp (`aria-pressed`). For 3D layer toggles and filters. |
| `tabs({ id, tabs: { id, label, content?, keys? }[], value?, onChange?, ariaLabel?, fill? })` | `{ el, list, panels: Record<id, HTMLElement>, value, set(id, emit?) }` | `role=tablist`; arrows move and select. Fill `panels[id]` any time. |
| `placard(text, { id?, for?, tag? })` | `HTMLElement` | Small letter-spaced label (a `<label>` when `for` is given). |
| `group({ label, children, hint?, inline?, id?, class? })` | `HTMLFieldSetElement` | Fieldset with a placard legend. |
| `row(...children)` | `HTMLDivElement` | Wrapping flex row; top-aligns when it holds labelled fields. |
| `mobileAction(source, label?)` | `{ el, destroy() }` | Compact phone action that mirrors a source button's label, disabled/hidden/lit state and clicks it. Put `el` in `labLayout.mobileActions`; call `destroy()` in unmount. |

## Panels (`panels.ts`)

| Factory | Returns | Notes |
|---|---|---|
| `consolePanel({ title, id?, actions?, children?, dense?, fasteners? = true, class? })` | `{ el, body, setTitle }` | Painted side-console panel: placard title row (white on grey, black on turquoise), quarter-turn fasteners in the corners. Append more content to `body`. |
| `disclosure({ title, content, open?, id? })` | `HTMLDetailsElement` | Native `<details>` for secondary controls or explanation. Keyboard and disclosure state come from the browser; it owns no listeners and needs no cleanup. |
| `screenBezel({ label, id?, content?, corners?: { tl?, tr?, bl?, br? }, aspect?, status?, footer?, class? })` | `{ el, glass, setCorner(c, content), setLabel, setStatus }` | Black-glass display in a dark frame with a placard label (`'VSD'`, `'СПО-15'`) and optional status at the right of the label row. `content` (a `<canvas>` or an element with class `ui-fill`) is stretched to fill `glass`. `aspect` (CSS, e.g. `'4 / 3'`, `'1'`) fixes the glass shape; without it the container must give the glass a height. Corner readouts are phosphor mono text, `white-space: pre` (use `\n` for two lines). |
| `coachBox({ id?, title? = 'NOW', text?, why?, tone? })` | `{ el, set(text, why?, tone?), setTone(t), setTitle(text) }` | "What to do now + why". `role=status`, polite live region. Pass strings: `set()` skips identical text, and the lamp blinks once when the advice changes. Tone colours the bar and lamp: `caution`, `warning`, `ok`, `hi`, `dim` (default = lit-button colour). |
| `checklist({ id?, steps: { id?, text, keys?, note? }[], done? })` | `{ el, setDone(step, done = true), isDone, setCurrent(step\|null), reset(), doneCount, total }` | Steps by id or index. Done = lit square with a tick (and "(done)" for screen readers); current = highlighted, `aria-current="step"`. |
| `eventLog({ id?, max? = 40, title?, live? = false, empty? })` | `{ el, push(text, { t?, tone? }), clear(), size }` | Mono phosphor log, newest first, capped. `t` = sim seconds shown `mm:ss`. `live: true` announces lines (off by default: sim logs are chatty). Height via CSS `--log-h` (default 11.5em). |
| `readouts({ id?, rows: { id, label, value?, unit?, title? }[], variant?: 'panel'\|'glass', columns?: 1\|2 })` | `{ el, set(id, value, unit?), setTone(id, tone\|null), row(id) }` | Label/value rows with tabular numbers. `set` is cheap when unchanged; still throttle to ~10 Hz. `glass` = phosphor digits in a black window (tones colour the digits); `panel` tones show a lamp dot. |
| `callout({ kind: 'simplified'\|'dcs'\|'real'\|'note', title?, body, id? })` | `HTMLElement` | "Simplified here" (dashed), "In DCS" (dark bar), "Real jet" (double bar), or your own title. |
| `lamp({ label, tone?: 'caution'\|'warning'\|'ok'\|'hi'\|'advisory', state?, id?, title? })` | `{ el, state, set('off'\|'on'\|'flash'\|boolean) }` | Annunciator legend (LOCK, LAUNCH, ПР, SHOOT). `flash` blinks at 2 Hz, steady under reduced motion. `advisory` uses the lit-button colour. |
| `modal({ title, body?, actions?: { label, onClick?, primary?, keys?, id?, closes? = true }[], id?, within?, dismissable? = true, tone?, onClose?, open?, class? })` | `{ el, dialog, body, isOpen, open(), close(), setTitle, setBody, setTone, destroy() }` | Result overlay. Focus goes to the primary action, Tab is trapped, Escape / backdrop / × close (when dismissable), focus returns to where it was. `within: lab.view` covers only the 3D viewport. `tone` shows a lamp by the title. **Call `destroy()` in unmount.** |
| `toast(text, { tone?, ms? = 3200, within? })` | `dismiss()` | Bottom-centre status line with a lamp; max 4 stacked. `ms: 0` stays until dismissed. `clearToasts(within?)` removes all. |
| `dataTable({ columns: { key, label, cell?, num?, mono? }[], rows, caption?, id?, highlight? })` | `HTMLElement` | Scrolls sideways inside its own box on narrow screens (never the page). `num` = right-aligned tabular; `highlight(row)` tints a row (e.g. the selected jet). |

Type: `Tone = 'caution' | 'warning' | 'ok' | 'hi' | 'dim'`.

## Layout (`layout.ts`)

### `labLayout({ viewport, console, strip?, header?, id?, mobileOrder?, mobileTabs?, mobileActions?, class? })`
→ `{ el, view, console, strip, overlay(corner, ...children), focus(panel), destroy() }`

One-screen tool. Desktop (> 900 px): compact header + 3D viewport + display strip on the left, the
side console full height on the right (it scrolls internally; the page does not). Its height uses the
shell's measured `--shell-h` so the contextual navigation cannot clip the bottom. ≤ 900 px without
tabs: one column — header, viewport (4:3, ≤ 62vh), strip, console (`mobileOrder: 'console-first'`
swaps the last two). No horizontal page scroll at 390 px.

`mobileTabs: true` replaces the phone stack with accessible World / Displays / Controls tabs while
leaving the desktop grid unchanged. World is selected first. Arrow keys, Home and End move and
activate tabs without reaching page-level flight or radar key bindings;
`focus('world'|'displays'|'controls')` selects one programmatically. Hidden panes stay
mounted, so switching does not recreate or reset the simulation. The selected pane fills the space
between the page header, tabs and actions; Displays and Controls scroll inside that space.
`mobileActions` renders an optional
phone-only sticky bottom action bar. Its controls wrap when needed, preserve a 44 px touch target and
include the device safe-area inset. **Call `destroy()` in unmount when `mobileTabs` is enabled** to
remove the media-query listener and ResizeObserver. Layouts without `mobileTabs` install neither.

- `viewport`: your 3D container (give it to `Stage`). It gets class `ui-fill` and fills the area.
- `strip`: screen bezels (with `aspect`) sized to the strip height (`--lab-strip-h`,
  `clamp(210px, 31vh, 320px)`), plus optional data blocks. For readouts in the strip wrap them in
  `h('div', { class: 'ui-strip-block' }, placard('Own ship'), readouts(...).el)` rather than a nested
  console panel. Do not give strip bezels a `footer` (their glass height is computed without one).
- `header`: `{ title, lede?, meta?, actions? }` rendered compact (title in Russo One).
- `overlay('tl'|'tr'|'bl'|'br', ...)`: controls over a viewport corner (camera selector, layer chips).
- Page CSS overrides: `--lab-console-w` (default `clamp(300px, 27vw, 380px)`), `--lab-strip-h`.

### `docLayout({ title, lede?, meta?, actions?, sections?, content?, toc?, tocTitle?, tocHeader?, id?, class? })`
→ `{ el, main, toc, links, go(id), destroy() }`

`tocHeader` goes at the top of the contents panel under its placard (a filter box); `links` maps each
section id to its contents button (count badges, hiding links) without querying kit markup.

Reading page: page title, 65ch prose measure (`.ui-prose`), a sticky contents panel on wide
screens (a wrapped list on top ≤ 1000 px) with scroll-spy. `sections: { id, title, content }[]`
renders `<section id>` with an `h2` each and lists them; or pass your own `content` and `toc`.
Tables, splits and bezels may use the full column width. **Call `destroy()` in unmount** (it
disconnects the IntersectionObserver).

### `split({ items, columns?, stackBelow?: 480 | 620 | 760 = 480, id?, class? })` → `HTMLElement`
Side-by-side displays (radar + RWR bezels) that stack when *their own box* is narrower than
`stackBelow` (container query), so it works inside a console, a doc column or a full page.

### `pageHeader({ title, lede?, actions?, meta?, compact? })` → `HTMLElement`
The page title in the display face (the only place Russo One is used), with a lede.

## Keyboard (`keys.ts`)

### `bindKeys(map, target = window, { strictSides?, enabled? }?)` → `unbind()`

```ts
const unbind = bindKeys({
  'RAlt+I': () => world.setRadarMode(me.id, mode === 'tws' ? 'rws' : 'tws'),
  'Enter': () => designateUnderCursor(),
  'Backspace': () => world.unlock(me.id),
  'RCtrl+= / RCtrl+−': e => zoom(e.code === 'Equal' ? +1 : -1),       // alternatives
  ';': { down: () => slew.up = 1, up: () => slew.up = 0 },              // hold to slew
  'RShift+; / RShift+.': { down: e => tilt(e.code === 'Semicolon' ? 1 : -1), repeat: true },
  'Space': { down: () => world.launch(me.id), inModal: false },
}, window, { enabled: () => !paused });
// unmount(): unbind();
```

- **Chord syntax** (case-insensitive, spaces around `+` ignored): modifiers `LAlt RAlt Alt LCtrl
  RCtrl Ctrl LShift RShift Shift LWin RWin`; keys `A–Z 0–9 F1–F24 ; , . / = - + [ ] ' \` ` and
  `Space Enter Backspace Tab Esc Insert Delete Home End PageUp PageDown Up Down Left Right Num0–Num9
  Num. Num+ Num- Num* Num/ NumEnter`, or a lone modifier (`'LShift'`). Unicode minus `−` and
  bracket-dash notation `[RAlt-I]` are accepted. Alternatives: `' / '`, `' or '`, `' and '`
  (spaces required, so `'RShift+/'` is one chord).
- Matches `KeyboardEvent.code` (physical key, like DCS), so it works on any layout and with macOS
  Option (Option+I types `ˆ` but is still `KeyI`). AltGr on Windows counts as RAlt.
- **Modifier sides**: exact side wins; with `strictSides: false` (default) `LAlt+I` also fires
  `'RAlt+I'` unless `'LAlt+I'` is bound too. Modifiers not in the chord must be up (`'I'` does not
  fire on Shift+I; nothing fires with Cmd/Win held unless the chord says `Win`).
- Per binding: `down`, `up` (also called with no event if the window loses focus while held),
  `repeat` (default false: one call per press), `preventDefault` (default true), `inInputs`,
  `inModal` (both default false).
- Ignored: typing in text fields; keys inside an `aria-modal` dialog; Enter/Space on a control the
  user reached **by keyboard** (it activates the control) — but a control the user just **clicked**
  does not swallow Enter/Space, so "click TWS, then Enter to designate" works; arrow keys inside
  sliders, radio groups, tab lists and selects.
- **First binding wins**: a handled key is `preventDefault`ed and later `bindKeys` maps skip events
  that are already `defaultPrevented`. Keep one map per page.

### Display and parsing
- `kbd(keys)` → `<span class="ui-keys">` with `<kbd>` pieces: `'RAlt+I'` → `[RAlt] + [I]`. Handles
  alternatives (`'RCtrl+= / RCtrl+−'`), sequences (`'RShift + ; , . /'`) and prose (`'unbound'`,
  `'Backspace (medium confidence)'`) as muted text. Modifier caps have a tooltip ("Right Alt
  (Option on a Mac)"). Feed it `PROCEDURES[ac].binds[i].keys` directly.
- `keyHint({ label, keys, note?, id? })` → a "label ........ [keys]" row for key maps.
- `parseChord(s)` → `Chord | null`; `parseKeyList(s)` → `Chord[]`; `splitAlternatives(s)`;
  `chordText(s)` → `'RAlt + I'`; `ariaShortcut(s)` → `'Alt+I'`; `matchChord(chord, event, heldCodes)`
  → `0 | 1 | 2`; `isTextField(target)`; `isModifierCode(code)`.
  Use `parseKeyList(bind.keys).length > 0` to test whether a data string is bindable.

## DOM helpers (`dom.ts`)

`h(tag, attrs, ...children)` (unchanged contract), `append`, `setText`, `$`, `$$`, plus:
- `on(target, type, fn, opts?)` → `off()`.
- `cleanup()` → `{ add(fn), on(target, type, fn, opts?), dispose() }`: collect everything a page
  must undo; `dispose()` runs in reverse, logs errors, is safe to call twice.
- `setAttr(el, name, value | null)` (cheap when unchanged), `clear(el)`, `srOnly(text)`, `cx(...classes)`.
- Jet names never wrap at their hyphen: `append` (so every `h()` string child) and `setText` put each
  hyphenated jet designation ("Su-27", "MiG-29S", "F/A-18C", "Flanker-B", plural and variant suffixes
  included) in a `span.jet-name` (`white-space: nowrap`, `base.css`). A no-break hyphen would fall back to
  another font. Option, textarea, title and non-HTML parents keep plain text. Helpers in `jetName.ts`:
  `jetName(s)` (one span), `proseNodes(text)`, `jetNameParts(text)` (pure split, `null` when no jet).
  Strings assigned with `textContent` directly bypass this.

---

## Example: a lab page skeleton

```ts
import type { Page, PageFactory } from '../../app/page';
import { h, cleanup, labLayout, consolePanel, screenBezel, segmented, slider, coachBox, checklist,
         eventLog, readouts, callout, placard, bindKeys } from '../../ui';

const factory: PageFactory = (): Page => {
  const bag = cleanup();
  return {
    mount(ctx) {
      const spec = ctx.app.spec;
      const view3d = h('div');
      const radarCanvas = h('canvas');
      const mode = segmented({ id: 'tws-mode', label: 'Radar mode', value: 'rws', fill: true,
        options: spec.radar.modes.filter(m => m !== 'off').map(m => ({ value: m, label: spec.radar.modeLabels[m] ?? m.toUpperCase() })),
        onChange: m => world.setRadarMode(me.id, m) });
      const range = slider({ id: 'tws-range', label: 'Display range', min: 10, max: 160, step: 10, value: 80,
        unit: ctx.app.units === 'metric' ? 'km' : 'nm' });
      const coach = coachBox({ text: 'Find the bandits: search in RWS at 80.' });
      const steps = checklist({ steps: [{ id: 'tws', text: 'Switch to TWS', keys: 'RAlt+I' }, { id: 'desig', text: 'Designate', keys: 'Enter' }] });
      const log = eventLog({ max: 30 });
      const own = readouts({ rows: [{ id: 'alt', label: 'Altitude' }, { id: 'spd', label: 'Speed' }] });
      const radar = screenBezel({ label: 'VSD', aspect: '4 / 3', content: radarCanvas });

      const lab = labLayout({
        header: { title: 'Track while scan', meta: `${spec.short} · ${spec.radar.name}` },
        viewport: view3d,
        strip: [radar.el, h('div', { class: 'ui-strip-block' }, placard('Own ship'), own.el)],
        console: [
          consolePanel({ title: 'Lesson', children: [coach.el, steps.el, log.el] }).el,
          consolePanel({ title: 'Radar', children: [mode.el, range.el] }).el,
          callout({ kind: 'simplified', body: 'One brick per sweep; no PRF modelling.' }),
        ],
      });
      ctx.root.append(lab.el);
      bag.add(bindKeys({ 'RAlt+I': () => mode.set(mode.value === 'tws' ? 'rws' : 'tws', true) }));
      // Stage in view3d, RadarDisplay on radarCanvas; bag.add(() => stage.dispose()) ...
    },
    unmount() { bag.dispose(); },
  };
};
export default factory;
```

## Gotchas

- **Hash routing**: never use `<a href="#section">` for in-page links (it navigates the router).
  `docLayout` contents are buttons calling `go(id)`.
- **Headless screenshots at 390 are really 500 px wide.** `scripts/shot.sh … 390` renders a 500 CSS
  px layout (Chrome headless minimum) and crops it. To check a true 390 layout wrap the page in the
  frame: `scripts/shot.sh '/sandbox/ui-frame.html?w=390&h=2400&src=<url-encoded path>' out.png 390 2400`
  (the `src` is relative to `/sandbox/`, e.g. `..%2F%23%2Ftws` for `/#/tws`).
- The 3D viewport background before WebGL draws is `--sky-top`; the lab page must not scroll on
  desktop, so keep console content in the console (it scrolls) rather than under the layout.
- Bezel content that is not a `<canvas>` needs class `ui-fill` to be stretched.
- **`hidden` always hides.** `components.css` has `[hidden] { display: none !important }`, so
  `el.hidden = true` works on caps and other flex/grid components (no page-local rule needed).
- `coachBox.set` and `readouts.set` compare strings: build the string, don't pass new nodes every frame.
- Canvas / WebGL colours: read `readTheme()` from `src/ui/theme.ts`, never CSS vars directly.
- `base.css` sets `body { color: var(--panel-ink) }`, which is near-black in the Soviet skin; text
  placed straight on the page background needs a surface (`labLayout`, `docLayout`, `consolePanel`,
  `.ui-surface`) or `color: var(--s-ink)`.

### Slider zone bands

`zones?: SliderZones` and `setZones(zones | null)` add or remove decorative bands below the native
range input. All values use the slider's own units. `bands` contain `{ from, to, tone }`, where tone
is `hatched`, `solid`, or `outline`; `marks` contain `{ value, label, cue?, priority? }`. A cue draws a
vertical line through the band. Higher-priority labels survive when boundaries are crowded; their
cue lines remain visible. `exact: true` adds a dashed outline for calculated results.

Bands clip to the current min/max; out-of-range marks are omitted. `setRange` recomputes placement,
and unchanged `setZones` calls skip DOM rebuilding. The native input, focus, keyboard controls and
readout remain intact. Zones are `aria-hidden` decoration: supply a textual explanation of their
meaning beside the slider, as Missile Lab does with its launch-zone summary.
