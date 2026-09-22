# Fox3 Academy cockpit kit — how to build with it

This kit dresses a browser page as a fighter cockpit: a dark ground, painted side consoles, black glass
displays with phosphor symbology, and mono stencil legends. It trains DCS World pilots, so the copy is
pilot-to-pilot and the vocabulary is the game's.

## Wrap every screen in `CockpitGround`

Nothing is styled correctly outside it. `CockpitGround` paints the page ground, sets the body font, and
selects the cockpit skin on the document element — that is where the skin variables live, so a nested
wrapper cannot switch it.

```tsx
<CockpitGround cockpit="ru">   {/* "ru" = Soviet turquoise (Flankers, Fulcrums); "us" = gull grey (Western jets) */}
  <PageHeader title="Track while scan" lede="Build the picture, then designate." meta="Su-27 · N001 · FC3" />
  <ConsolePanel title="Radar" actions={<Button label="Reset" variant="ghost" size="s" />}>
    <Segmented id="mode" label="Radar mode" value="tws"
      options={[{ value: 'search', label: 'ОБЗ ДВБ', sub: 'Search' },
                { value: 'tws', label: 'СНП ДВБ', sub: 'Track while scan' }]} />
  </ConsolePanel>
</CockpitGround>
```

Only one skin can be active per page: `cockpit` is a page-level choice, not a per-panel one.

## The styling idiom: components plus tokens, no new class names

There is no utility-class vocabulary here. Build from the components, and use CSS variables for your own
layout glue (`style={{ display: 'flex', gap: 'var(--gap-3)' }}`). Do not hand-write markup with the kit's
internal `ui-*` classes — that duplicates a component instead of using it.

The tokens, all defined in `styles.css`:

| Family | Names |
|---|---|
| Page ground | `--ground` `--ground-ink` `--ground-muted` |
| Painted panel | `--panel` `--panel-2` `--panel-3` `--panel-ink` `--panel-muted` `--panel-line` `--placard` |
| Display glass | `--screen` `--screen-2` `--screen-line` `--sym` `--sym-dim` `--sym-hi` `--sym-ink` |
| Push-buttons | `--btn` `--btn-ink` `--btn-line` `--btn-on` `--btn-on-ink` |
| Status | `--caution` `--warning` `--ok` `--friendly` `--hostile` `--missile` `--datalink` |
| Type | `--font-display` `--font-body` `--font-mono` `--fs-xs` `--fs-s` `--fs-m` `--fs-l` `--fs-xl` `--fs-xxl` |
| Spacing | `--gap-1` … `--gap-6` `--r-1` `--r-2` |

Type rules: `--font-display` (Russo One) is for page titles only, `--font-body` for prose, `--font-mono`
(B612 Mono) for every instrument, label and button. That mono font draws a comma as a full cell, so write
figures without thousands separators — `28000 ft`, never `28,000 ft`.

## Composing: JSX goes in the container props

Container props take JSX: `ConsolePanel.children` and `.actions`, `Group.children`, `Row.items`,
`Split.items`, `Modal.body`, `Callout.title`/`.body`, `Disclosure.content`, `ScreenBezel.content`/
`.status`/`.footer`, `PageHeader.title`/`.lede`/`.actions`/`.meta`, `DocLayout.content`/`.tocHeader`,
`LabLayout.viewport`/`.console`/`.strip`, `Placard.text`, `EventLog.title`, `DataTable.caption`,
`Toast.text`, `CoachBox.text`/`.why`.

Props nested inside arrays are strings only, not JSX: `Tabs.tabs[].content`, `Checklist.steps[].text`,
`Readouts.rows[].label`, `ScreenBezel.corners`, `DocLayout.sections[].content`.

## What the components are for

`ConsolePanel` is the side-console container; `ScreenBezel` frames a display face; `Segmented` is the mode
selector (radar modes, scan widths, bars); `Readouts` is the instrument block, `variant="glass"` for
phosphor digits; `CoachBox` is the instructor's line — what to do now and why; `Callout` marks how far the
trainer's model is trusted (`simplified`, `dcs`, `real`, `note`); `Checklist` is a cockpit procedure with
its key bindings; `LabLayout` is the lab page frame (3D viewport, console, display strip).

## Two things this binding does not carry

State that the kit exposes only through an imperative handle has no prop: `EventLog` lines, `Checklist`
current-step, `Readouts` per-row tone. Render the resting state and drive those from app code.

Everything renders from the real `src/ui` factories, so a design here maps to the app's own components —
but the app itself is written with DOM factories, not React. Treat the JSX as the design surface.

## Where the truth is

`_ds/<folder>/styles.css` and its imports hold every token and component rule. Each component's
`.prompt.md` carries its props and intended use. Read those before styling; they beat this summary.
