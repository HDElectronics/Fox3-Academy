# design-sync notes — Fox3 Academy

Repo-specific gotchas for syncing this kit to claude.ai/design. Read before a re-sync.

## What this repo is, and what `design-system/` is for

The app has no UI framework: `src/ui` exports DOM factories that return an element or a handle with
`.el`. The design tooling renders React, so `design-system/` is a thin React binding over those same
factories — it re-implements no markup. A card in the design pane and a panel in the app are built by
the same `src/ui` code.

- `design-system/index.tsx` — one generic `fromFactory` HOC, plus `fromHostFactory` for the two
  overlays (`Modal`, `Toast`) that mount themselves into a `within` host.
- Props are the factories' own `<Name>Options` interfaces, re-exported as `<Name>Props`. Do not write
  prop types by hand; if a factory's options change, the binding follows automatically.
- Generic factories are instantiated at their common case: `Segmented`/`Select`/`Chips` at `string`,
  `DataTable` at `Record<string, unknown>`.
- The binding rebuilds the element whenever props change rather than mirroring each handle's imperative
  setters (`set`, `setDisabled`, `setOptions`). That is deliberate: a half-mirrored handle would drift.

## Slots: JSX into `Child` props

The kit composes with DOM nodes, so container props are typed `Child`. `useSlots` renders JSX passed to
those props into a detached host element and hands the host to the factory. The slot list is declared
per component at the bottom of `index.tsx`.

- Props nested inside arrays are NOT slots and cannot take JSX: `Tabs.tabs[].content`,
  `Checklist.steps[].text`, `Readouts.rows[].label`, `ScreenBezel.corners`, `DocLayout.sections[].content`.
  Use strings there.
- `Group.children`, `Row.items` and `Split.items` are array slots — the host is wrapped in an array.

## Build and config

- `cfg.buildCmd` is `cd design-system && node build.mjs`. That script bundles with esbuild (React and
  react-dom external), emits declarations with `tsc`, and concatenates `src/styles/{tokens,base,components}.css`
  into `dist/styles.css` with the Google Fonts `@import` on the first line.
- `tsconfig.json` uses `rootDir: ".."`, so declarations land at `dist/design-system/index.d.ts` with the
  `src/ui` tree beside them at `dist/src/ui/`. Pass `--entry design-system/dist/design-system/index.js`.
- `--node-modules design-system/node_modules` — that is where React lives. The repo root deliberately has
  no React; the app must stay framework-free (AGENTS.md, "No UI framework").
- `cfg.guidelinesGlob` is `[]` on purpose. The default glob would copy `design-system/docs/*.md` — the
  per-component docs — into `guidelines/` as duplicates.

## Previews

- `cfg.provider` is `CockpitGround`, a component in the binding. Preview cards mount outside `body`, so
  without it every card renders on white with browser-default text; the app gets the same treatment from
  `body` in `base.css`. Do not wrap individual previews in it again.
- `CockpitGround` sets `data-cockpit` on the document element, because the skins are defined as
  `:root[data-cockpit="ru"]`. Two skins cannot render in one cell — use one export per skin.
- Copy in previews follows the repo's rules (AGENTS.md rule 5): pilot-to-pilot, no exclamation marks, no
  emoji, and altitudes with no thousands separator, because B612 Mono draws a comma as a full cell.
- Preview content is gameplay-level only (AGENTS.md rule 1). No engineering-level weapon detail.

## Known render warns

- `[FONT_REMOTE]` for Russo One, IBM Plex Sans/Mono and B612 Mono. Expected: the families are served by
  Google Fonts at runtime, exactly as `index.html` does it. Nothing to fix.
- `tokens: 1 missing` — below the validator's threshold, and the remaining var is set at runtime.

## Re-sync risks

- **The binding is a second surface over `src/ui`.** It is generated from the factories' own types, so it
  does not drift silently — but a factory gaining a new `Child` prop will not become a JSX slot until the
  slot list in `index.tsx` is extended. Check the slot list when `src/ui` grows a container prop.
- **`design-system/docs/*.md` are the component docs the design agent reads.** They are hand-written and
  can go stale against the factories. Re-read them against `src/ui` when options change.
- **Fonts are fetched from Google at render time.** If that `@import` ever fails, every card falls back to
  system fonts and the cockpit look goes with it.
- **Screenshots and grades are machine state** under `.design-sync/.cache/` (gitignored). Verified state
  travels in the uploaded `_ds_sync.json`, not in git.
- **`dist/` of the binding is gitignored**, so a fresh clone must run `npm install` inside `design-system/`
  and `node build.mjs` before the converter.

## Preview authoring — what the first campaign learned

Folded from four parallel batches (controls, layout, panels, overlays). 27 components, 108 cells.

### Capture harness facts

- Each cell is captured alone at **900 x 700**, one page load per cell (`?story=`), with the provider's
  `var(--gap-4)` padding — so a full-width component gets about 868 px.
- 900 px keeps the kit's `max-width: 900px` breakpoints **active**: `LabLayout` renders its phone column
  and `DocLayout` its wrapped contents chips rather than a sticky sidebar.
- The shot is not full-page. Whole-screen frames (`LabLayout`, `DocLayout`) always continue past the fold;
  compose each cell so the feature it is named for lands above it.
- The review sheet is a scaled composite. Judge cropping and fine detail from
  `_screenshots/review/raw/<group>__<Name>__<Cell>.png`, not the sheet.
- Cells are listed alphabetically, not in source order, and a grade key is the export name — renaming an
  export forces a regrade.

### Two traps that cost a capture run each

- **Two open modals on one card crash the renderer.** `modal()` focuses its dialog and registers a
  document `focusin` listener that pulls focus back. Two open dialogs ping-pong synchronously:
  `RangeError: Maximum call stack size exceeded`, and the whole capture page dies, failing whatever was
  captured after it. The previews carry `inert` on each Modal host box, which makes `focus()` a no-op and
  paints identically. `cfg.overrides.Modal.cardMode = "single"` is the config-level alternative, at the
  cost of the other cells. Corollary for the app: never have two modals open at once — true of the app
  today (one debrief overlay per page), so this is a harness constraint, not a kit bug.
- **A nested `CockpitGround` loses to the provider.** React flushes child effects before parent effects,
  so a cell asking for `cockpit="ru"` is overwritten by the provider's default `us`. The skin previews
  re-assert it in a `queueMicrotask`. In the card's grid view the last cell to mount wins; in the graded
  shots each cell is its own page load, so they do not bleed.

### Binding limits worth knowing before extending it

- **Handle-only state cannot be previewed, and should not be faked.** `EventLog.push()`,
  `Checklist.setCurrent()` and `Readouts.setTone()` exist only on the handle; the binding rebuilds from
  the factory and never touches it. Previews show the resting state. Adding a prop to the binding is the
  honest fix if those states ever need to appear on a card.
- **`display: contents` portal hosts break direct-child CSS.** JSX passed to a slot renders into a
  `display:contents` host, so the element is a DOM grandchild and `.parent > .child` stops matching. It
  bit `.ui-lab__strip > .ui-bezel` (`flex: 1 1 280px`), leaving the strip's bezels at content width with
  their corners overlapping. `.ui-lab__console > *` has the same exposure. Wrap such items in a plain div
  with an explicit width.
- **Overlay hosts have no height.** `fromHostFactory` gives Modal and Toast a `min-height: 1px` relative
  host and the kit positions `--within` overlays absolutely inside it, so they need a sized box or the
  dialog collapses and the toast escapes the cell. Toasts also need `ms={0}`; the 3200 ms default empties
  the stack before the screenshot.
- **Container-query components need a narrow wrapper in a preview.** `Split` folds through
  `@container (max-width: N)` on itself, and no `stackBelow` value can fire at the 868 px capture width.
  Wrap it in a div with an inline `maxWidth` below the threshold.

### Component quirks the sheets exposed

- `Select` is a closed native select in a screenshot: `group` (optgroups) and per-option `disabled` never
  show. Its only visible axes are `inline`, `disabled` and box width.
- `Toggle`'s `style="switch"` is the only one that states its position in words; the `lamp` style only
  lights a strip, so always leave one cap off. `size` applies to the lamp style only.
- `Slider` needs `readoutCh` when `format` widens the readout, and `layoutSliderZones` drops a zone label
  within 9 % of a higher-priority neighbour — keep boundary values apart.
- `Readouts` `columns={2}` fills its container, so a wide card lays out three pairs per line, not two.
- `Lamp` `on` and `flash` do differ in a still (the flash is caught bright); `hi` and `caution` are both
  amber and need distinct labels to earn a place in one row.
- `Callout` kinds read apart by the left accent bar — `simplified` dashed, the others solid.
- `kbd()` splits on ` / `, ` and ` and spaces, so multi-key bindings can be written exactly as
  `src/data/procedures.ts` writes them (`'RCtrl + = / RCtrl + -'`).
- Cyrillic survives the mono font and the uppercase transforms.

### Content sourcing

Preview copy is grounded in `src/data`, not memory: bindings from `procedures.ts`, radar and missile
names from `aircraft.ts` / `missiles.ts`, RWR names and codes from `rwr.ts`. Obvious-looking guesses are
wrong here — it is `N019M` and `AN/APG-63(V)1`, not `N019` and `AN/APG-63`. Where a fact is not in
research, a `Callout` says "not verified" rather than asserting it (AGENTS.md rule 2).

### Known render warns

- `[FONT_REMOTE]` for the four Google families — expected, they load at runtime as `index.html` does.
- `[RENDER_THIN]` on `Lamp` and `EventLog` is **legitimate**: a lamp is a key-cap-sized annunciator, and a
  log with no lines is one row of phosphor text. Padding either would misrepresent the component.
