# Contributing

Fox3 Academy is a browser-based training companion for DCS World players. The current modules focus
on BVR skills; the [roadmap](ROADMAP.md) describes expansion into other aircraft procedures.

## Development workflow

1. Read AGENTS.md, ARCHITECTURE.md, and the relevant API documentation.
2. Select a bounded item from BACKLOG.md. Keep unrelated cleanup in a separate change.
3. Add a regression test for every logic fix. Check UI changes at desktop and phone widths.
4. Run `npm run check`. Describe the changed behavior, supporting evidence, and validation.
5. Update API docs when changing contracts and record completed work in CHANGELOG.md.

Use short-lived topic branches and focused commits. Do not commit generated builds, screenshots, local
credentials, private conversations, machine-specific paths, or deployment account details. The one
exception is the small curated set in `docs/images/` used by the README; regenerate those with
`scripts/shot.sh` and replace them only when the pages they show change visibly.

Pull requests run the CI workflow (`.github/workflows/ci.yml`): typecheck, tests and build.

## Evidence and scope

DCS facts belong in src/data with sources in docs/research. Prefer official module manuals and versioned,
reproducible in-game observations. Record source date and version where available. A manual claim does not
establish behavior in every DCS release; retain uncertainty when sources conflict.

Simulation models reproduce game-visible behavior. Engineering-level weapon models are outside scope.
Label training aids separately from the selected aircraft's DCS controls.

## Assets

Include assets only with explicit redistribution and modification rights. Record source, author, license,
required attribution, and changes alongside every asset. Do not extract assets from DCS installations or
redistribute marketplace content without the necessary rights. Retain procedural fallbacks and test loading
failures. Third-party assets retain their own licenses; the project's MIT license does not replace them.
