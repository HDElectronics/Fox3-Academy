# Render kit (`src/render`): API

The three.js layer shared by every 3D page: a `Stage` (renderer, labels, loop), the hazy
high-altitude `Environment`, procedural jets and missiles for every `AircraftId` (ten fighters and the Su-25T, straight wing,
wingtip split airbrakes), `WorldView`
(live sim), `ReplayView` (recorded sim), `RadarVolume` and `CameraRig`.

```ts
import { Stage, WorldView, ReplayView, RadarVolume, CameraRig, JetMesh, rosterFromWorld, stepSyntheticScan } from '../../render';
```

**Scale and frame.** 1 render unit = 1 km. Sim frame is also the scene frame (x east, y up, z south,
north = −z). **Every public API takes sim metres** (positions, distances, ranges), except objects
you add to `stage.scene` yourself, which are in km units: convert with `toUnits()` / `mToUnits()`.

Harness (also the best usage reference): `/sandbox/render.html`
`?view=gallery` (all ten jets; `&side=red|blue|neutral`, `&cam=top`, `&only=su27`, `&missiles=1`),
`?view=world` (live World with every layer; `&cam=orbit|chase|top|cockpit`, `&units=imperial`,
`&cockpit=ru`, `&clouds=1`, `&surface=land`, `&notch=1`, `&vel=1`, `&truth=0`, `&focus=M1&dist=2500`),
`?view=hero&ac=f14b` (hangar-style jet + stylised scan volume; `&interactive=0` non-interactive camera,
`&orbit=20` auto-orbit in deg/s), `?view=world&cam=chase&look=M2&warp=12` (padlock on an incoming missile), `?view=replay&t=44.6&warp=60`,
`?view=stress` (10 jets, 20 missiles; logs kit JS time), `?view=lose` (WebGL context loss),
`?view=dispose` (6 mount/unmount cycles).

---

## Minimal page

```ts
import { Stage, WorldView, CameraRig } from '../../render';
import { World } from '../../sim/world';

let stage: Stage | null = null;

export default () => ({
  mount(ctx) {
    const host = ctx.root.appendChild(document.createElement('div'));
    host.style.cssText = 'position:relative;height:70vh';          // the Stage fills its container
    stage = new Stage(host);                                          // sky, sea, lights, labels, loop
    const world = new World();
    const me = world.spawnAircraft({ side: 'blue', type: ctx.app.aircraft, controller: 'player', pos: { x: 0, y: 9000, z: 0 }, heading: 0, speed: 260 });
    const bandit = world.spawnAircraft({ side: 'red', type: 'su27', controller: 'ai', pos: { x: 0, y: 8000, z: -80000 }, heading: Math.PI, speed: 250 });

    const view = new WorldView(stage, world, { units: ctx.app.units, observer: me.id, radarVolumeOf: me.id, layers: { tracks: true } });
    const rig = new CameraRig(stage, { source: view });
    rig.frame([me.id, bandit.id]);                                     // tactical framing, keeps following

    let timeScale = 1;
    stage.onFrame(dt => { if (dt > 0) world.step(dt * timeScale); });   // sim first (priority 0)
    stage.onTap((x, y) => { const id = view.pickEntity(x, y); view.select(id); });
  },
  unmount() { stage?.dispose(); stage = null; },                        // frees everything below too
});
```

`stage.dispose()` disposes every kit object created on it (WorldView, ReplayView, CameraRig,
RadarVolume, Environment), all scene geometries/materials/textures, labels, observers, listeners, the
loop and the WebGL context. You can dispose a view or rig earlier on its own; double dispose is safe.

---

## Stage (`stage.ts`)

`new Stage(container, opts?)`. The Stage creates `div.r3-stage` inside `container` and fills it
(100 % × 100 %, `contain: strict`), so **the container must have a size**. Throws
`WebGLUnavailableError` (after writing a message into the container) when WebGL cannot start; check
first with `isWebGLAvailable()` if you want your own fallback.

| Option | Default | |
|---|---|---|
| `antialias` | `true` | MSAA |
| `maxDpr` | `2` | device pixel ratio cap |
| `toneMapping` | `'aces'` | `'aces' \| 'agx' \| 'none'` (symbology and sky are not tone mapped, they keep token colours) |
| `exposure` | `1` | |
| `fov` | `50` | vertical, degrees. Camera near 0.01 (10 m), far 2000 (2000 km), logarithmic depth buffer |
| `environment` | `true` | `false`, or `EnvironmentOptions` |
| `labels` | `true` | CSS2D label overlay |
| `autoPause` | `true` | while the container is scrolled out of view (IntersectionObserver): `true` pauses the **whole loop, including your sim step**; `'render'` keeps every `onFrame` subscriber running (sim, views, camera) and skips only the drawing, so a fight goes on while the user scrolls to the controls; `false` never pauses. **Sim pages whose fight must continue offscreen pass `autoPause: 'render'`.** |
| `autoStart` | `true` | `false` starts paused (e.g. `Stage.prefersReducedMotion()`) and renders one frame |
| `ariaLabel` | `'3D tactical view'` | on the canvas (`role="img"`) |

| Member | |
|---|---|
| `scene`, `camera` (PerspectiveCamera), `renderer`, `canvas`, `root` | three.js objects, the wrapper div |
| `labels: Scene` | root for `CSS2DObject`s, rendered by the label renderer only (positions in km units) |
| `palette: Palette`, `theme: Theme` | token colours as `THREE.Color` (linear) / raw strings, read once at construction |
| `env: Environment \| null` | |
| `shared` | uniforms shared by the kit's shaders (viewport, DPR, px scale, clock) |
| `width`, `height`, `dpr` | CSS px |
| `onFrame(fn(dt, t), { priority?, always? } \| priority) → off()` | `dt` real seconds (≤ 0.1), `t` running real time. Lower priority runs first: `FramePriority = { sim: 0, view: 100, camera: 200, late: 300, env: 400 }`. Step your sim at 0 (default) so views see this frame's state. |
| `onResize(fn(w, h)) → off()` | |
| `onTap(fn(clientX, clientY, e)) → off()` | pointer click without drag (< 5 px), so picking coexists with orbit drags |
| `isOffscreen` | true while scrolled out of view (only tracked when `autoPause` is on) |
| `pause()`, `resume()`, `paused`, `running`, `elapsed` | pause stops the RAF loop. While paused, `requestRender()` renders on demand and only runs subscribers registered with `always: true` (the kit's own), with `dt = 0`. |
| `requestRender()`, `renderOnce()` | |
| `pxPerUnit(distanceUnits)` | CSS px per km at that distance |
| `projectToClient(posUnits, outVec2) → boolean` | |
| `rayFromClient(x, y) → Raycaster` | |
| `clientToPlane(x, y, altitudeM = 0, out?) → Vector3 \| null` | sim metres where the pointer hits a horizontal plane (drag threats on a top-down map) |
| `track(obj)`, `untrack(obj)` | register anything with `dispose()` to be disposed with the Stage |
| `dispose()` | |
| `static prefersReducedMotion()` | |

The Stage also resizes when the device pixel ratio changes without a size change (window dragged to
another screen). WebGL context loss: the loop pauses and a status message shows ("3D view paused … Restoring…");
on restore it resizes and resumes by itself.

## Environment (`environment.ts`)

Created by the Stage (`stage.env`). Ultramarine zenith to pale horizon haze (`--sky-top`,
`--sky-horizon`), sun disc and glow, a desaturated sea (default) or muted land (`--earth`) at
altitude 0 with a faint 10 km grid (every 5th line a bit stronger), altitude-aware distance haze
(thin looking down from high, thick at the horizon), optional sparse cumulus layer. Lights for the
flat-shaded models (hemisphere + sun).

`EnvironmentOptions`: `surface: 'sea' | 'land'`, `grid = true`, `gridKm = 10`, `clouds: false |
true | { altitudeM = 2400, coverage = 0.32 }`, `sunAzimuthDeg = 140`, `sunElevationDeg = 48`,
`hazeKm = 130`. Runtime: `setSurface()`, `setGrid(on)`, `setClouds(opts | false)`, `sunDirection`.

---

## WorldView (`worldView.ts`)

`new WorldView(stage, world, opts?)` syncs a live `World` every frame. It reads the sim state and
never changes it.

Per aircraft: jet mesh (side colour, F-14 wing sweep follows Mach), Tacview-style visibility scale
(a jet is never shorter than `minJetPx` on screen; relative sizes are kept), faint side-coloured halo
when small, tag (callsign, type, altitude, speed in `units`), drop line with a foot ring, ground
shadow, recent-path trail, death: explosion, charred fall and fade, `SPLASH` tag.
Per missile: white mesh (fattened when boosted) with a coloured head dot, path line in side colour,
motor smoke while `motorLeft > 0` (AIM-54C reduced-smoke motor), motor plume, tag (name + `DL · ACT
12s` / `INERTIAL` / `ACTIVE` / `SARH` / `IR`, `HIT` / `MISS · NOTCHED`), datalink line shooter →
missile (dashed, flowing, `--datalink`) while `guidance === 'datalink'`, illumination line shooter →
target (flowing, side colour) while `'sarh'`, seeker cone (half-angle `seekerGimbalDeg`, length
`seekerRangeKm` trimmed to the target) while `'active'`, explosion on hit.
Countermeasures: chaff blooms (tens of metres, glint), flares (hot core + smoke streak).
STT locks draw as a dashed line shooter → target (layer `illumination`).

`WorldViewOptions` = `TacticalOptions` +
`observer?: EntityId` (whose radar/RWR feeds the radar layers; its side is "ours" for `truth`),
`radarVolumeOf?: EntityId`, `radarVolume?: RadarVolumeOptions`.

`TacticalOptions`: `units = 'metric'`, `layers?: Partial<Layers>`, `sizeMode: 'screen' | 'true'`
(default `'screen'`), `minJetPx = 40`, `minMissilePx = 13`, `trueScale = 1`,
`aircraftTrailSeconds = 45`, `missilePathLinger = 20`,
`label?: (ac, units) => { title, type?, sub, flag?, tone? }` (override tag text; `tone` colours the
whole tag: `'caution'` amber, `'warning'` red, `'ok'`, `'hi'` designation amber, `'dim'`, or `null` /
omitted for the side colour; e.g. what that bandit's RWR hears). `Tag.setTone(tone)` does the same
on your own tags.

`view.registerLabel(label, { priority?, offset?: { x, y }, maxMove? }) → unregister()` adds a page-owned
`Tag` or `Note` to the same screen-space layout as aircraft and missile tags. Set its text,
`visible` flag and `obj.position` normally; the position is in **render units**, like other CSS2D
labels. Lower priority wins; `LabelPriority` names the levels: `selected` 0, `aircraft` 1, `missile` 2,
`site` 2.5 (SAM site tags), `annotation` 3 (the default) and `coverage` 4 (radar-volume coverage notes). Use priority 1 for the
current lesson explanation or selected replay result; secondary markers can use 4. `offset` is a
preferred CSS-pixel offset, not a fixed position. `maxMove` caps how far (CSS px) the label may be
nudged before it hides instead, for text that only reads next to its anchor. `WorldView`,
`ReplayView` and any other `TacticalScene` satisfy the `LabelHost` interface (`registerLabel`).

Call `unregister()` before disposing the label. It is idempotent and restores the label's original
placement/visibility; ownership and disposal remain with the page. Entity `clear()`/world resets
retain registrations; disposing the view releases them. Registering the same label twice throws.

Layout measures the rendered text (including centered/left/above notes), tries nearby collision-free
positions and keeps them inside a 6 px viewport margin. It follows the camera each frame; text still
refreshes at about 8 Hz. Labels can move up to 100 px in narrow views or 160 px in wider views. If no
nearby space fits, lower-priority text is hidden for that frame and returns when space is available.
Each label's last offset is fed back, and a spot within 8 px of it wins unless another is more than
8 px closer to the anchor, so labels do not flip sides of a neighbour as the camera moves. The pure
pass is `layoutLabels(candidates, width, height)` in `tags.ts` (unit-tested).
Offscreen anchors stay offscreen. Hidden text does not hide its aircraft, trail or marker. Keep the
full explanation/result available outside the 3D view; exceptionally long labels may not fit at all.
Labels intentionally left unregistered (for example the radar-volume coverage overlay) remain
outside this layout. Do not register a label with two views simultaneously.

### Layers (toggle at runtime: `view.setLayer('tracks', true)`, `view.setLayers({...})`, read `view.layers`)

| Layer | Default | |
|---|---|---|
| `labels` | on | aircraft tags (and track labels) |
| `missileLabels` | on | |
| `dropLines` | on | |
| `shadows` | on | |
| `trails` | on | missile path lines |
| `smoke` | on | motor smoke |
| `aircraftTrails` | on | |
| `countermeasures` | on | |
| `datalink` | on | |
| `illumination` | on | SARH support lines + STT lock lines |
| `seekers` | on | active seeker cones |
| `effects` | on | explosions, plumes |
| `velocity` | off | 30 s velocity vectors |
| `truth` | on | off: jets not on the observer's side are hidden; only what the radar believes shows |
| `tracks` | off | observer's track files: ring at the estimate (dashed ring = coasting, amber = primary/locked, ◇ = designated, box = STT), velocity stick, `T1` label, dashed estimate → truth line (only when `truth` is on) |
| `bricks` | off | observer's RWS bricks (fade over 8 s) |
| `radarVolume` | off | set by `setRadarVolume()` |
| `rwrLines` | off | observer's RWR contacts: search dashed dim, lock amber, launch/missile red flowing |
| `samRings` | on | SAM threat rings (see below); the site marker, vehicle and tag always draw |
| `notch` | off | jets inside the observer radar's Doppler gate (`notchKts`, `notchNeedsLookDown`, via `inDopplerNotch`) get an amber diamond and a `NOTCH` tag flag |

### Methods (WorldView and ReplayView share the first block)

| | |
|---|---|
| `pickEntity(clientX, clientY, { kinds?: ('aircraft'\|'missile')[], slopPx = 10 }?) → id \| null` | screen-space nearest, forgiving (radius ≥ 12 px or half the jet's on-screen size) |
| `select(id \| null)`, `selection` | amber corner brackets + highlighted tag |
| `setHidden(id, hidden)` | hide one entity (the cockpit camera does this for the own jet) |
| `setUnits(u)`, `setSizeMode(m)` | |
| `positionOf(id, out) → boolean` | displayed position in **metres** (includes the post-kill fall) |
| `orientationOf(id, outQuat)`, `headingOf(id)`, `displayScaleOf(id)` | |
| `aircraftIds()`, `jetObject(id) → JetMesh`, `jetPixelSize(id)` | |
| `addExplosion(posM, t0, big = true)` | extra explosion at sim time `t0` |
| `syncNow()` | pull the state immediately: call after each `world.step()` when fast-forwarding before the first frame so trails fill |
| `clear()`, `dispose()` | |
| **WorldView only** | |
| `setWorld(world)` | swap to another World (e.g. reset); clears visuals |
| `setObserver(id \| null)`, `observer` | |
| `setRadarVolume(id \| null, opts?) → RadarVolume \| null`, `radarVolume` | turns the `radarVolume` layer on/off |
| `truePosition(id, out?)`, `sideOf(id)` | |

---

### SAM sites (`samSites.ts`)

`WorldView` draws every `world.samSites` entry and `ReplayView` every `RecordFrame.sams` entry, the way the
DCS F10 map shows a threat: a diamond marker and a small low-poly launcher/radar vehicle (boosted to an 18 px
floor), a ground ring at `SAMS[type].threatRingKm` (side colour; amber while the site tracks, red while it
guides a missile), a dashed minimum-range ring, and a faint altitude band (ceiling ring plus posts) up to
`maxAltM`. With `illumination` on, a dashed line runs from a tracking site to its target. The site tag
(`site` priority) reads `SA-11 SAM · TRACK · RING 35 km`. Rings are the not-verified values in
`src/data/sams.ts`. Sites on the other side hide when `truth` is off, like jets.

SAMs in flight use the missile pipeline (mesh, smoke, trail, tag, hit blast) through `samMissileLike(m, out?)`,
which fills `MissileLike.display` (`{ name, lengthM, guidedText, smoke }`): a SAM has no `MissileId`, so `type`
only picks a stand-in body mesh. Tags read `SITE TRACK` while guided and `BALLISTIC` once the site loses the
track. Pure helpers (unit-tested): `samTagText(site, units)`, `samShortName(type)`, `circlePoints(...)`.
Subclasses of `TacticalScene` feed sites through the protected `samSites()` hook; `view.samSitePosition(id)`
returns a site's position in render units.

## ReplayView (`replay.ts`)

Renders `RecordFrame[]` (every 0.25 s) at any time with interpolated positions/angles, trails up to
t (aircraft: last `aircraftTrailSeconds`; missiles: full path, smoke while the motor burned), kills
and hits as explosions, chaff/flares from `'cm'` events, STT lock lines from `sttTarget`.
`RecordFrame` includes types and sides; the roster adds callsigns, precise launch/death times and missile outcomes.

```ts
const replay = new ReplayView(stage, { frames: world.recording, world, units: ctx.app.units });  // roster + events from the world
const rig = new CameraRig(stage, { source: replay });
rig.frame([...world.aircraft.keys()], { follow: false });      // ids from the world (visuals appear on the first frame)
scrubber.oninput = () => replay.setTime(Number(scrubber.value));   // replay.start … replay.end
stage.onFrame(dt => { if (playing) replay.setTime(replay.currentTime + dt * speed); });
```

- `new ReplayView(stage, { frames, roster?, world?, events?, ...TacticalOptions })`: pass `world`
  (uses `rosterFromWorld(world)` and `world.events`) or your own `roster` (`{ aircraft: { [id]: {
  type, side, callsign, diedAt? } }, missiles: { [id]: { type, side, shooterId, targetId, launchedAt?,
  result? } } }`).
- `setTime(t)` (clamped to `start … end`), `currentTime`, `start`, `end`, `setData(frames, roster, events?)`.
- `setRadarObserver(id)` selects one aircraft’s recorded radar picture; `setRadarObserver(null)` returns
  to truth (the default). `observer`, `hasRadarRecording(id)` and `radarSampleTime` expose selection and
  availability. This is an exclusive picture selection, not the live WorldView radar-layer switches.
- Radar view draws only ownship plus recorded echo squares and estimated track rings/velocity sticks.
  Dashed rings mean coasting; designation and STT markers use the same past sample. Track labels never
  reveal the truth roster’s type, side or callsign. Other aircraft (including friendlies), missiles,
  countermeasures, explosions, lock lines and their trails are excluded. Camera entity lookups and picking
  likewise contain ownship only. Track tags join the shared declutter registry and are released on
  observer changes, data replacement, track loss and disposal.
- Sensor state is held at the latest recording sample at or before replay time; it never interpolates
  toward a later detection or estimate. Backward seeks recompute that floor sample. Missing legacy data
  draws no contacts rather than silently substituting truth; `radarSampleTime` is null in that case.
  Ownship/truth positions retain normal interpolation. This is the trainer’s sensor estimate, not a
  complete DCS cockpit replay: RWR, datalink and missile knowledge are not recorded.
- Other layers, selection and the `EntitySource` methods are the same as WorldView. In radar mode the
  `effects` layer is forced off; returning to truth restores its previous setting.
- Missile Lab tip: turn a `simulateShot()` result into two-entity `RecordFrame`s (shooter fixed or
  moving, missile from `missilePath`, target from `targetPath`, `t` from `trace`) plus a roster, and
  play it with a ReplayView. Mark pitbull/impact with a `SymbolLayer` point and a `Note`.

---

## RadarVolume (`radarVolume.ts`)

The scan volume of one radar: azimuth span (`azCenter ± azHalf`, relative to the nose) × bar
pattern (`bars`, spacing `barSpacingDeg`, edge ± half `beamWidthDeg`, around `elCenter` relative to
the horizon) × range. Stabilised to the horizon, rotates with heading only. Faint faces with range
rings, edge lines, bar separators, the current bar outlined (follows `beamEl`, so either bar-index
convention renders right) with a phosphor sweep trail behind the beam, the beam as a narrow additive
wedge plus centre ray (`--sym-hi` in STT, faces hidden), and altitude-coverage frames at chosen ranges
with a label `↑12.6 ↓3.8 km @50 km` / `↑41k ↓12k ft @27 nm`. Hidden when `mode === 'off'`.

```ts
const vol = new RadarVolume(stage, AIRCRAFT[type].radar, { units, coverageAt: ['cursor', 40000] });
stage.onFrame(() => vol.update(ac.radar, ac.pos, ac.heading));          // WorldView does this for you
```

Options: `range: 'scale' | 'detect' | metres` (default `'scale'` = `rangeScale`; `'detect'` =
head-on detection range), `coverageAt: (metres | 'cursor')[]` (default `['cursor']`), `units`,
`color` (default `--sym`), `showBeam = true`, `labels = true`, `opacity = 0.035`.
Methods: `update(state, posM, heading)`, `setSpec(spec)`, `setOptions(o)`, `visible`,
`rangeFor(state)`, `setLabelHost(host | null)`, `dispose()`. `object` is the root Group.
`setLabelHost(view)` joins the coverage labels to that view's shared label layout at
`LabelPriority.coverage` with an 80 px move limit: aircraft, missile and lesson tags keep their spot,
and a crowded coverage label moves a short way or hides until space is free. `WorldView` does this
for its own volume; a standalone volume has no layout until you call it.

Pure helpers (tested): `scanElevationLimits(elCenter, bars, barSpacing, beamWidth) → { hi, lo }`,
`altitudeCoverage(ownAltM, rangeM, elHi, elLo) → { top, bottom }` (flat earth, range × tan),
`barElevation(elCenter, bars, bar, spacing)` (bar 0 = top), `coverageText(top, bottom, rangeM, units)`,
`stepSyntheticScan(state, radarSpec, dt)` (animates a scan without the sim: hangar hero).

**Hangar hero:** a 20 m jet and a 100 km volume cannot share a frame. Use a stylised range:
`new RadarVolume(stage, spec, { range: 260, labels: false, coverageAt: [] })` next to a
`JetMesh` at true scale (`jet.scale.setScalar(0.001)`); see `?view=hero`.

---

## CameraRig (`cameras.ts`)

`new CameraRig(stage, { source?, mode = 'orbit', focus?, transition = 0.9, view?: { headingDeg = 20,
elevationDeg = 22, distance = 30000 }, interactive = true, autoOrbit = 0 })`. `source` is any
`EntitySource` (WorldView, ReplayView). Uses three's `OrbitControls` (`rig.controls`) on the canvas:
damping, distance 20 m … 1500 km, never below the surface. Mode and focus changes blend smoothly
(eased position + slerp).

- **`interactive: false`** attaches nothing to the canvas: no drag, no zoom, no wheel capture, and the
  canvas gets `touch-action: auto` so a phone scrolls the page through it (landing-page heroes). The page
  drives the camera with `setView` / `frame` / `focusOn`. Switch later with `setInteractive(on)`;
  read `isInteractive`.
- **`autoOrbit: degPerS`** slowly orbits the focus in orbit mode (negative = the other way; pauses while
  the user drags). `setAutoOrbit(degPerS)`, `0` = off. It advances with the Stage clock, so it stops
  when the Stage is paused (reduced motion). Hangar uses this noninteractive rig with a fixed
  focus ahead of the jet; resizing updates only its distance.

| Mode | |
|---|---|
| `'orbit'` (default) | tactical orbit around the focus; follows a moving entity keeping your orbit/pan offset |
| `'chase'` | behind/above the jet, heading-smoothed; drag to adjust the offset. `lookAt: threatId` padlocks: the camera rides the 3D threat → jet line (smoothed; a lofted missile high above or a shooter far below pulls the camera under / over the jet) and aims between the two sight lines, so the jet and the threat both stay in frame (defence drills) |
| `'top'` | straight down, north up; pan and zoom only; `distance` = height (default 90 km) |
| `'cockpit'` | from the jet's cockpit along its full attitude (own jet hidden); drag to look around, double-click to reset |

| Method | |
|---|---|
| `setMode(mode, { focus?, lookAt?, distance? (m), instant? })` | chase default distance 88 m |
| `focusOn(idOrPointM \| null, { distance?, instant? })` | works before the entity's first frame (distance applied when it resolves) |
| `frame(targets, { follow = true, padding = 1.25, headingDeg?, elevationDeg?, minRadius = 3000, fit = 'sphere', instant? })` | fit a group; with `follow` it tracks the group centre and zooms out as it spreads until the user zooms. `fit: 'viewport'` fits the group's real extent seen from that heading / elevation against both fields of view, so a long, flat group (shooter → target) fills a wide viewport instead of a bounding sphere against the narrow one |
| `setView({ headingDeg?, elevationDeg?, distance? }, instant?)` | heading = compass direction the camera looks toward |
| `setInteractive(on)`, `isInteractive`, `setAutoOrbit(degPerS)` | see above |
| `mode`, `focusId`, `setSource(src)`, `distanceTo(pointM)`, `dispose()` | |

Pure helpers (tested): `orbitBasis(headingDeg, elevationDeg, fwd, right, up)` (camera basis for an orbit
view) and `fitDistance(n, pointAt, fwd, right, up, tanH, tanV, pad, minDist)` (distance that fits points
offset from a centre inside the view).

---

## Models (`jets.ts`)

- `new JetMesh(id, side: 'blue' | 'red' | 'neutral', stage.palette)`: a Group built in **metres**
  (nose → −z). Put it in the scene with `jet.scale.setScalar(0.001)` for true size. `setSweep(deg)`
  (F-14; 20 spread … 68 swept), `setSide()`, `setMaterial(m)`, `lengthM`. Geometry and materials are
  shared: do not dispose them yourself (the Stage does).
- Silhouettes: Su-27/J-11A (twin fins on booms, long stinger, ogival LERX), Su-33 (+ canards), MiG-29S
  (canted fins on the nacelles, long LERX), F-15C (shoulder wing, box intakes, twin fins), F/A-18C
  (20° canted fins forward of the stabs, long LEX), F-16C (single fin, bubble canopy, chin intake,
  anhedral stabs), F-14B (swing wings, glove, beaver tail, wide nacelles), JF-17 (side intakes, single
  tall fin), M-2000C (tailless delta, shock cones). Materials per side: body (side colour lightened),
  fins (side colour), canopy tint, dark nozzles/intakes, red/green nav lights.
- `jet.setConfig({ gear?, flaps?, speedbrake? })`: configurable parts, each position 0..1 (clamped;
  missing or non-finite values keep the previous one). Every jet has landing gear (nose + two mains,
  strut and wheel, a door beside each bay; the nose leg swings forward, the mains aft) and a
  speedbrake; all but the M-2000C have trailing-edge flaps (up to 25-40°; F-16C and Flankers:
  flaperons). Speedbrakes: Hornet dorsal between the fins, Eagle and Flankers dorsal behind the
  canopy, Viper split petals beside the nozzle, MiG-29 upper and lower petals on the tail cone,
  F-14 upper and lower between the tails, JF-17 side plates on the rear fuselage, Mirage small
  upper and lower plates at each wing root. The M-2000C gets no flap part (DCS has no flap control
  for it: elevons and automatic slats). F-14 flaps sit on the outer wing at the 20° reference sweep
  and hide while `setSweep()` is above it. No Su-33 tail hook. Hinge positions are simplified, not
  measured. Simple low-poly plates in the shared materials, geometry cached per type like the swing
  wing. Default config is gear up, flaps up, speedbrake in, and parts at 0 are hidden, so BVR pages
  see the unchanged clean jet. Read back with `jet.config`, `jet.configParts` (which parts exist)
  and `jet.groundClearanceM` (model origin above the wheel contact line with the gear down, metres).
- `getJetModel(id)` (`model.parts` holds the part list), `JET_DIMENSIONS`, `jetMaterials(palette, side)`,
  `f14SweepForMach(mach)`.
- `createMissileMesh(missileId, palette)`: sized from `MISSILES[id].lengthM/diameterM` (AIM-54 is
  fat, R-27 has butterfly wings, R-77 short strakes + grid-like tail, IR missiles canards).
  `getMissileGeometry(id)`, `smokeDensity(id)`.

## Flight ops (`flightOps/`)

The airfield pattern and approach view (issue #19), in the runway frame of `src/sim/flightOps/types.ts`:
metres, origin at the landing threshold centreline, x east, y up, z south, landing toward −z.

- **Render scale.** The global 1 unit = 1 km stays (the Environment is built for it). Runway and
  overlay live in `scene.root`, a Group scaled by 0.001, so they are authored in metres; add
  page-specific objects there in metres too. The jet is true size in the chase and cockpit views and
  gets a screen-size floor (`boostPx`, default 56 px) in the side and tower views. The scene lowers
  the Stage camera near plane to 0.5 m (cockpit view) and restores it on dispose.
- `new FlightOpsScene(stage, aircraft: FlightOpsJetId, { camera?, side?, boostPx?, glideDeg?,
  aimPointM?, lengthM?, vTolDeg?, hTolDeg?, minHalfM? })`: switches the Environment to land without
  the grid, adds the runway, the approach overlay and a `JetMesh`.
  - `update(state: FlightOpsState)`: places the jet (`pos.y` = wheel height above the runway, 0 = on
    the runway gear down), applies heading / pitch / bank and `setConfig(gearPos, flapPos,
    speedbrakePos)`; swaps the jet if `state.aircraft` changed.
  - `setCamera('chase' | 'side' | 'tower' | 'lso' | 'cockpit' | 'deck' | 'wing' | 'receiver')`: chase = behind the jet on its heading, 9 m
    high and 7 m left, looking between the jet and the aim point while the runway is ahead (so the
    jet sits low right and the runway stays visible on final) and along the heading otherwise;
    side = abeam from the east looking west, framing the jet and the aim point so the glide path reads
    as a line (approach runs left to right); tower = fixed beside the runway past the aim point,
    looking at the jet; cockpit = eye in the jet, jet hidden. Camera runs at `FramePriority.camera`.
  - `setNavTarget({ x, z } | null, label?)`: steer-point marker on the ground in runway-frame metres:
    a 180 m ring with a cross, a 1200 m pillar (screen-space lines, readable from 40 km) and an
    optional label (`Note`) at its top; `null` hides it. Sizes are display choices.
  - Range: the Stage far plane (2000 km) and the Environment haze (130 km) already cover an RTB start
    40 km out at 4000 m; nothing to configure.
  - `setApproach({ glideDeg?, aimPointM?, ... })` (moves the painted aim blocks too),
    `setAircraft(id)`, `dispose()` (runway, overlay, frame subscription; the Stage stays yours).
  - `scene.overlay`, `scene.runway`, `scene.jet`, `scene.root` are public.
  - Carrier (#26): `setCarrier(shipId | null)` adds a `CarrierMesh` to `root`, hides the runway, switches the
    Environment to sea, and moves the overlay into `scene.landing` (a group at the ramp at deck height, turned
    to the landing heading) with the ship's glide angle, the hook aim point (`aimPointU`) and a 1.5 nm corridor
    (`CARRIER_CORRIDOR_M`). `update(state)` then places the ship from `state.ship`, drives its landing aid
    from `state.lso.ball` and moves `landing` with it: pass trail and gate points in that frame (x = v right of
    the axis, y = height above the deck, z = −u). `null` restores the airfield geometry (the last
    `setApproach` values). Side and chase frame the jet and the hook aim point along the landing heading.
  - Camera `'lso'`: eye on the LSO platform (`LSO_EYE`, landing frame u 18 m, v −24 m, 3 m above the deck,
    display choice) looking at the jet up the groove, no smoothing (the platform moves with the ship), jet
    screen-size floor 24 px. The field of view narrows with range to frame about 90 m around the jet (down to
    6°); other views restore the Stage FOV, and so does `dispose()`. `'tower'` at sea shows the LSO view and `'lso'` on the airfield shows the tower.
  - Deck launch (#27): on a ship start with `state.launch` the scene adds a `LaunchDeck` to the `CarrierMesh` and
    drives it each `update`. It remembers the ship-frame spot the jet was held on: the side view frames that spot
    and the jet along the ship's heading. Camera `'deck'` is the shooter's view: on the deck `DECK_EYE` ahead of
    and beside the held jet (ahead 22 m, outboard 17 m, 1.8 m up; display choice), looking at the jet, no
    smoothing, the field of view narrowing with range to about 45 m around the jet. Without a launch `'deck'`
    shows the chase view.
  - Tail hook: when `state.hookPos` is defined the scene hangs a simple arm under the jet's tail and swings it
    35° down by `hookPos` (hidden when stowed). Drawn by the scene, not a `JetMesh` part.
  - Air-to-air refuelling (#28): `setTanker(tankerId | null)` adds a `TankerMesh` to `root` (world metres), hides
    the runway and the approach overlay; `null` removes it. With `state.aar`, `update(state)` places the jet with
    its model origin on the sim reference (no ground-clearance offset), draws a probe rod on probe jets (out by
    `aar.probePos`, tip at the data's `contactPointM`), and drives the tanker; while connected the basket or boom
    nozzle rides on the drawn tip. Cameras `'wing'` (under the tanker's wing outboard of the hose pod, or beside the
    rear fuselage on a boom tanker, `WING_EYE`, looking at the receiver) and `'receiver'` (`RECEIVER_EYE`: 14 m
    behind the receiver's tail, 4.5 m up, in line with the probe tip, looking at the basket or boom nozzle); both
    ride with the tanker without smoothing and fall back to `'chase'` without a tanker. Chase looks between the jet
    and the tanker while the tanker is ahead. Display choices.
- `TankerMesh(shared, palette, tankerId)` (`flightOps/tanker.ts`, #28): low-poly IL-78M (high wing, T-tail, UPAZ
  pods under the outer wings and one on the rear fuselage), KC-135 (swept low wing, boom with ruddevators under the
  tail), KC-135 MPRS (hose pods, boom stowed) and KC-130 (straight high wing, props), local x right, y up, z aft.
  `airframe` banks with `aar.tankerBank`; `rig` (hose, basket, boom) stays in the sim's level tanker frame. The hose
  runs from the pod to the basket (`basketRest`, or the drawn tip when connected) as screen-space lines; on the
  IL-78M it carries the UPAZ colour bands painted by distance from the cone (caution / ok / warning tokens), so the
  band at the pod exit is the band the pilot reads. The boom follows `aar.boom` (elevation, azimuth, extension).
  `update(aar, tip?)`, `toWorld(v)`, `toFrame(p)`, `dispose()`. Pure helpers: `TANKER_LAYOUT`, `tankerLocal(v)`,
  `rollPoint(v, bankRad)`, `hosePoints(pod, basket, n, sagM)`, `hoseMarkAt(bands, fromConeM)`, `bandStripes(band)`.
  Drawing values; no hose or boom mechanics.
- `CarrierMesh(palette, shipId, targetWire = 3)`: low-poly ship in ship-local metres (origin at the ramp at
  sea level, x starboard, −z forward) from `SHIPS` / `SHIP_HULL`: hull extruded from `deckOutline(id)`, deck,
  island and mast, landing-area paint (caution edge lines, dashed centreline, ramp line, wires with the target
  wire in the ok token), the Kuznetsov ski-jump, and the landing aid on the port side abeam the wires: IFLOLS
  panel with green datum bars, the amber ball (red in the red low cells), red waveoff and green cut lights, or
  the Luna-3 colour light. `place({ x, z, heading })`, `setBall(ball | null)`, `dispose()`. Drawing values,
  not ship plans. Pure helpers: `deckOutline(id)` (ship frame a, c), `landingPaint(ship, targetWire)`
  (`DeckStrip[]` in the landing frame), `landingLocal(u, v, angledDeg)`, `shipLocal(a, c)`,
  `shipToLanding(a, c, angledDeg)`, `lensCell(ball)`. The Kuznetsov ski-jump follows the sim: the last `RAMP_M`
  (25 m) of the bow rise on `skiJumpProfile()` to `RAMP_DEG` (12°) at the lip, wide enough for every launch position.
- `LaunchDeck(palette, shipId)` (`flightOps/launchDeck.ts`, #27): deck-launch furniture in ship-local metres, a
  child of `CarrierMesh`. CVN: four catapult tracks at `STATION_C` (cats 1–2 on the bow, 3–4 on the waist), a
  shuttle under the nose of the jet on the active catapult (it rides the stroke), and a jet-blast deflector per
  catapult, hinged at its forward edge, raised behind the held jet. Kuznetsov: launch positions 1–3 (a bar across,
  1–3 tick marks, a dashed lead line to the ramp) and two deck stoppers in front of the main wheels that drop at the
  release. `update(launch | null, { a, c } | null, jetLengthM, t)`, `dispose()`. Pure helpers:
  `skiJumpHeight(into)`, `skiJumpProfile(n)`, `catTracks(id)`, `launchPositions(id)` (runs from the launch data),
  `jbdRaise(launch, t)` (0..1 over `JBD.raiseS` from the start, down after the stroke), `stoppersUp(launch)`.
  Drawing values; the motion comes from the sim.
- `ApproachOverlay(stage.shared, palette, opts)`: translucent glide corridor from the aim point back
  `lengthM` (default 4 nm) with rails and 1 nm frames, the dashed glide-path line, the extended
  centreline, the aim-point ring. Corridor half-angles `vTolDeg` / `hTolDeg` (defaults 0.7° / 1.5°)
  are display choices, not DCS numbers: pass the lesson's scoring tolerances.
  `setGates([{ id, pos, radiusM, state: 'pending' | 'ok' | 'miss', headingRad? }])` draws a ring
  across the flight direction plus a drop line (sym / ok / warning tokens).
  `pushTrail(pos, level: 0 | 1 | 2)` appends to the flown trail (ok / caution / warning; points closer
  than `minTrailSpacingM`, default 2 m, are skipped), `clearTrail()`, `setGeometry(opts)`,
  `setCorridorVisible(on)`. `glidePoint(d, glideDeg, aimPointM)` gives the glide-path point `d` m
  before the aim point.
- `RunwayMesh(palette, { lengthM?, widthM?, aimPointM? })`: asphalt (default `RUNWAY` 2500 x 45 m),
  an infield, and generic simplified paint (edge lines, threshold bars at both ends, centreline
  dashes, touchdown-zone bars, aiming-point blocks at the lesson's aim point); `setAimPoint(m)`.
  `runwayMarkings(L, W, aim)` returns the paint rectangles.
- Harness: `sandbox/flight-ops.html?cam=side|chase|tower|cockpit&ac=<any FighterId>&d=1400&alt=<m>&gear=1&flaps=1&brake=0&sweep=<deg>&nav=x,z&navlabel=WP1&fly=1`;
  `inspect=1` gives a close three-quarter view of the true-size jet to check the moving parts.

## BfmAids (`bfmAids.ts`, close-combat lessons)

`new BfmAids(stage, world, { me, bandit, layers?, pursuit? })` draws WVR teaching aids over a live World (next
to a WorldView). Reads the sim, never changes it; disposed with the Stage (or `dispose()`).

| Layer | Default | |
|---|---|---|
| `tracers` | on | a short fading streak per sim `tracer` event (bullet path, 1.4 s) |
| `liftVector` | on | arrow from the player's jet along `liftVector()` (drawn over the jet) |
| `turnCircles` | on | both jets' current turn circles (load factor + gravity), projected on the ground, side colours, centre cross |
| `planeOfMotion` | on | the bandit's 3D turn circle as a faint disc with a dashed rim |
| `pursuit` | on | line of sight player → bandit and the player's velocity vector, coloured by `pursuit()`: lead `--caution`, pure `--ok`, lag `--datalink`, null dim |
| `hits` | on | sparks at the target on `gun-hit` |

`setLayer(k, on)`, `setLayers({...})`, `layers`, `setWorld(world, { me, bandit }?)` (retry: clears tracers and
sparks), `tracerCount`. Pure helper: `turnCircle(ac) → { centre, radius, n, u } | null` (null when nearly
straight, radius over 25 km). Symbology only: no ballistics; tracers fly straight at the sim's bullet speed.

## Low-level pieces (for page-specific symbology)

- `LineBatch(stage.shared, { capacity?, depthTest?, additive?, renderOrder? })`: one draw call of
  screen-space thick lines. `reset()`, `seg(ax..bz, r,g,b,a, r2,g2,b2,a2, widthPx, dashPx, flowPxPerS,
  fill)`, `line(aUnits, bUnits, style)`, `polyline(points, style, closed?)`, `commit()`. Positions in
  km units (local space of the batch). Dashes are in screen px and can flow.
- `SymbolLayer(stage.shared, { capacity?, additive?, depthTest? })`: point symbols with crisp SDF
  shapes (`Shape.ring | ringDash | box | boxFill | diamond | dot | cross | brackets | triangle | glow |
  puff`). `reset()`, `put(x, y, z, shape, sizePx, color, alpha, worldSizeUnits?)`, `commit()`.
- `Tag`, `Note`: CSS2D labels (add to `stage.labels`).
- `RibbonGeometry` + `createRibbonMaterial` + `Trail`: time-stamped camera-facing ribbons.
- Custom `ShaderMaterial`s must support the logarithmic depth buffer: start shaders with
  `VERT_PRELUDE` / `FRAG_PRELUDE` and end `main()` with `VERT_END` / `FRAG_END` (built-in three
  materials need nothing).
- `ORDER` render-order bands, `toUnits`, `toMetres`, `mToUnits`, `orientationQuaternion(heading,
  pitch, roll)` (+roll = right wing down), `headingQuaternion`, `pxPerUnitAt`, `boostedScale`,
  `lerpAngle`, `readPalette()`, `sideColor(palette, side)`.

---

## Gotchas

- **Metres in, km in the scene.** Kit APIs take sim metres; your own scene objects are km units.
- **The container needs a height.** The Stage fills it; a 0-height container gives a 0-height canvas.
- **Order in the frame:** sim (0) → views sync (100) → camera (200) → views late pass: scale boost,
  labels, symbology (300) → environment (400) → render. Register your sim step at the default priority.
- **Pause vs time scale.** `stage.pause()` stops the loop (reduced motion); pausing the sim is your time
  scale. On-demand renders pass `dt = 0`; guard `world.step` with `if (dt > 0)`.
- **Offscreen.** With the default `autoPause: true` your `onFrame` sim step stops while the viewport is
  scrolled away (fine for labs; the scene simply waits). If the sim must keep running (a live fight,
  a timed drill), pass `autoPause: 'render'`: the loop keeps stepping and only the drawing is skipped.
- **Phones and the wheel.** An interactive CameraRig owns touch drags and the wheel over the canvas.
  For a decorative view inside a scrolling page use `interactive: false`.
- **Truth.** With `observer` set and `truth: false`, enemy jets disappear and only track markers show,
  the teaching view of "what your radar believes". Keep `truth` on when you want the dashed estimate →
  truth error lines.
- **Picking** is screen space; use `stage.onTap()` so orbit drags do not select.
- **Tags declutter** automatically, along with annotations added through `registerLabel`. Selected aircraft have first priority; crowded labels move nearby or hide until space is available. Text refreshes at ~8 Hz; layout follows the camera every frame.
- **Replay needs a roster**: `new ReplayView(stage, { frames: world.recording, world })` is the easy way.
- **Pre-rolling a sim** before the first frame: call `view.syncNow()` after each `world.step()` or
  trails start empty.
- **Performance** (M4 Max, DPR 2, 10 jets + 20 missiles + chaff, every layer): 120 fps, ~190 draw calls,
  kit JS ≈ 0.35 ms per frame, no per-frame allocations in the hot paths.

## Terrain (`terrain/`)

Reusable synthetic scenery for upcoming air-to-ground lessons. Import from `src/render/terrain`
(the top-level render barrel does not re-export it). It is a gameplay backdrop, not a geographic
map or a model of real sensor/weapon internals. No changes to `World` or existing pages are required.

```ts
import { Group } from 'three';
import { createHeightField, heightAt, TerrainMesh, TerrainProps } from './terrain';

const field = createHeightField({ seed: 17 });
field.flatten(0, 0, 220, heightAt(field, 0, 0)); // prepare all pads before rendering
const root = new Group();
root.scale.setScalar(0.001); // authored in metres; Stage's scene uses kilometres
const terrain = new TerrainMesh(field, stage.palette);
const props = new TerrainProps(field, stage.palette);
root.add(terrain, props);
stage.scene.add(root);
terrain.setFocus(0, 0);
props.setFocus(0, 0); // use the pod's ground aim point when looking at a distant target
// On unmount: terrain.dispose(); props.dispose(); root.removeFromParent();
```

**Height field (`heightmap.ts`, pure, no three.js).** Metres throughout, origin at map centre,
x east / y up / z south. Seeded layered value noise combines broad valleys and folded ridges.

- `createHeightField(opts?: HeightFieldOptions): HeightField` accepts `seed` (default 1),
  `extentM` (number for a square or `{ x, z }`, default 40000 × 40000), `segments` (cells per axis,
  default 512, integer 2–2048), and `maxReliefM` (default 600; generated heights stay within
  0…maxReliefM, but need not reach the maximum). Zero relief produces level ground.
- `field.heights: Float64Array` contains `(segments + 1)²` row-major nodes;
  index = `rowZ * (segments + 1) + columnX`. `cellXM`, `cellZM`, `extentM`, `seed`, `segments`,
  `maxReliefM` and `flattenedAreas` are readable. Treat heights and metadata as read-only.
- `field.flatten(x, z, radiusM, heightM): void` guarantees the requested height throughout the
  disc, with a smooth collar outside it. To preserve bilinear sampling, the flat region extends
  by one grid-cell diagonal and blends over `max(radiusM * 0.25, 2 * max(cellXM, cellZM))`.
  `flattenedAreas` records `{ x, z, radiusM, heightM, outerRadiusM }`; interpolation can extend
  the outer transition by a cell. Later overlapping calls take precedence. Flatten before
  creating meshes/props; existing render objects are snapshots and must be rebuilt after edits.
- `heightAt(field, x, z): number` bilinearly samples the grid; out-of-bounds positions clamp to
  the nearest edge. `normalAt(field, x, z): { x, y, z }` returns an upward unit normal using
  finite differences (one-sided at the edges). `slopeAt(field, x, z): number` returns radians.
- `lineOfSight(field, from: TerrainPoint, to: TerrainPoint, stepM?: number): boolean` checks
  terrain clearance across the entire segment. Every crossed cell and its quadratic interior
  minimum are checked; `stepM` optionally adds subdivisions and cannot skip a ridge. Both
  endpoints must be above ground (tolerance 1e-7 m); a ray touching terrain returns false.
  Out-of-bounds endpoints return false because there is no confirmed coverage. Coincident and
  vertical segments are supported. Props do not occlude this query. Non-finite coordinates,
  invalid dimensions and nonpositive explicit steps throw `RangeError`.

**Mesh (`terrainMesh.ts`).** `new TerrainMesh(field, palette, opts?: TerrainMeshOptions)` extends
`Group`. Both render classes build in metres: put them under a 0.001-scaled root, as in flight ops.

- `chunkCells` defaults to 64 (positive multiple of 4). Partial chunks cover non-divisible grids.
  Three LODs sample every 1, 2 or 4 grid nodes; `lodDistancesM` defaults to `[3000, 10000]`,
  measured from focus to the nearest edge of each chunk. `setFocus(x, z): void` switches LODs,
  building each needed geometry once and caching it. It does not own a loop or camera.
- `chunks: readonly TerrainChunk[]` exposes `xM`, `zM`, `widthM`, `depthM`, `mesh`, and
  `level` (0 = finest, 2 = coarsest) for diagnostics. Normals sampled from the common field
  keep shared edges lit consistently; perimeter skirts conceal gaps between different LODs.
- Vertex colours mix palette earth/ok for low ground, earth/smoke for higher ground, and
  smoke/dark on steep slopes. `detail` (default true) adds derivative-filtered procedural
  pigment variation at 95 m, 18 m and 2.5 m scales for close pod views; all pigments come from
  the palette. No texture downloads, texture allocation or custom lighting are needed.
- `dispose(): void` is idempotent, frees every cached geometry and the shared material, and
  detaches the group. The caller owns Stage, lighting, environment and frame subscriptions.

**Props (`props.ts`).** `new TerrainProps(field, palette, opts?: TerrainPropsOptions)` extends
`Group`. Deterministic three-tree clumps, simple roofed buildings, and short terrain-following
access roads use `InstancedMesh`, sharing five geometries and materials across spatial batches.
All values below are drawing choices, not DCS facts.

- `seed` defaults to the field seed. `density` defaults to 1: attempts 8 tree clumps plus
  1 building/road site per square km on average; `0` produces no props. Placement rejection
  reduces the final count. `maxSites` (default 20000) caps attempts even at high density.
- `maxSlopeRad` defaults to 0.2 radians. Positions/footprints on steeper slopes or outside the
  extent are rejected. `includeFlattened` defaults to false: flatten discs and collars remain
  clear, including prop footprints. True permits scatter there; it does not force placement.
- `chunkSizeM` defaults to 2500. `setFocus(x, z): void` shows batches whose nearest edge is
  within `viewDistanceM` (default 3000; `Infinity` disables distance culling). Match the terrain
  focus to the pod aim point. Built-in instance bounds also allow camera frustum culling.
- `counts` reports instantiated `tree`, `trunk`, `building`, `roof`, and `road` counts over the
  whole field, including hidden batches. `dispose(): void` releases instance resources and
  each shared geometry/material exactly once, and detaches the group.

**Limits and budget.** The default grid is about 78 m between height samples and 2.1 MB of
height data. Close-view texture variation is visual only. Mesh triangles approximate the
bilinear field; coarser distant LODs can differ in height and switch visibly. Skirts hide cracks,
not transitions. Small prop foundations and road strips are decorative approximations on that
surface; they are not terrain collision geometry. Props are culled by whole batches without
cross-fading. The finite 40 km map does not stream or wrap. For a small detailed target region,
use a smaller extent at the same grid resolution. Increase budgets deliberately for phones:
64 default chunks, lazy LOD caching, five shared prop geometries, bounded scatter, focus culling,
and no runtime regeneration are the default tradeoffs. Physical-device frame rates remain to be
measured by the consuming page, especially with a second pod viewport.

**Harness.** `/sandbox/terrain.html?seed=17&focus=0,0` provides free orbit, pan and dolly,
a flat target pad, an overview, a ground-detail view and a 23× optical zoom toggle. Optional
`view=close`, `zoom=23`, `density=<multiplier>` and `cockpit=us|ru` support screenshot checks.
The focus param is `x,z` in metres, clamped inside the map; panning updates terrain/prop focus.
The HUD reports chunk LOD counts, draw calls and triangles. It caps DPR at 1.5 and cleans up
controls, listeners, frame subscription, terrain, props and Stage on page hide or hot reload.

## Attack scene (`attack/`)

Ground-attack kit for the Su-25T pages. Import from `src/render/attack`. Game level only (AGENTS.md rule 1).

```ts
const field = createAttackField({ seed: 25, pads: [{ x: 0, z: 0, radiusM: 900 }] }); // flattened target area
world.terrain = terrainHook(field);          // AttackScene also installs it
const view = new WorldView(stage, world, { units: 'metric' });
const scene = new AttackScene(stage, world, view, { field, shooterId: me.id });
const tv = new ShkvalTv(stage, { hidden: () => scene.tvHidden() });
stage.onFrame(() => { if (sh.on) tv.render(me.pos, shkvalDir(me), shkvalFovDeg(sh.zoom).v); }, { priority: FramePriority.env + 50 });
itDisplay.draw(state, tv.image);
```

- `createAttackField(opts)`: `createHeightField` (seed 25, 44 km, 512 cells, 380 m relief by default) with each pad
  flattened at its own height. `terrainHook(field)` → `TerrainHook` for `world.terrain`: `heightAt`, and
  `lineOfSight` with end points lifted `LOS_LIFT_M` (2 m) above the ground, because the height-field query treats a
  ray touching the terrain as blocked while ground units sit on it; end points are clamped inside the map.
- `AttackScene(stage, world, view | null, { field, shooterId?, layers?, propDensity? })`: TerrainMesh and
  TerrainProps (focus follows the Shkval aim point), `GroundUnitLayer` (low-poly tank, APC, truck, bunker, building,
  SAM launcher, AAA; scale follows `sizeM`, charred when dead), A-G weapons in flight (missile, rocket and bomb
  bodies, Vikhr and rocket smoke, gun tracers, a glow at each head), impacts from `ag-impact` events
  (`view.addExplosion` plus a smoke column), and, for the shooter: the laser line jet → aim point while ЛД is on,
  the Shkval field-of-view cone and footprint, and the lock gimbal shell (±35°, +15..−85°, 5 km). Layers
  (`setLayer`): `laser`, `fov`, `gimbal` (off by default), `markers` (screen-size unit diamonds, lock brackets,
  stabilised point cross), `smoke`. `setWorld(world)` after a restart; `tvHidden()` lists what the TV pass hides
  (the overlay, the WorldView group with the own jet and tags, clouds). `dispose()` frees everything.
- `ShkvalTv(stage, { width = 320, height = 240, every = 2, hidden })`: a PerspectiveCamera at the jet along the
  sight line with the zoom's vertical field of view renders the Stage scene into a WebGLRenderTarget every
  `every`-th call, reads it back and writes a black-and-white picture (`tvLut`: sRGB transfer and a contrast
  stretch; `toGreyImage` flips GL rows) into `image` (a 2D canvas). The sky dome is moved to the TV camera for the
  pass and restored. Cost: one small extra render and a 300 KB read-back every other frame.

Pure helpers (tested in `attack.test.ts`): `createAttackField`, `terrainHook`, `tvLut`, `toGreyImage`, `unitModelScale`.
