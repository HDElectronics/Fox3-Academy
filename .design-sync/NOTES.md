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
