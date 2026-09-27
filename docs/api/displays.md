# displays API: cockpit radar formats, RWRs, DLZ bar, missile timeline, RWR audio

Files: `src/ui/displays/**` (import from `src/ui/displays`), tests in `src/ui/displays/displays.test.ts`.
Harnesses: `sandbox/displays.html` (every format and RWR on a scripted scenario) and
`sandbox/displays-live.html` (real `World` + `buildRadarPicture`, as pages use it).

All displays are canvas 2D, crisp at `devicePixelRatio` (capped at 3), resize-aware (ResizeObserver; they
redraw themselves on resize and when the mono font finishes loading), coloured only from `readTheme()` tokens,
text in `--font-mono` (B612 Mono, Cyrillic falls back to IBM Plex Mono), with a phosphor glow (shadowBlur).
A frame costs 0.2 to 1.3 ms at DPR 2 (measured with a forced GPU flush), so a radar plus an RWR fit easily in
a 60 fps loop. They draw only what they are given: `targetId` on bricks/tracks is used for picking, never shown.

## Quick start (in a page)

```ts
import { RadarDisplay, RwrDisplay, DlzBar, MissileTimeline, RwrAudio } from '../../ui/displays';
import { screenBezel } from '../../ui';                     // ui-kit bezel (see docs/api/ui-kit.md)
import { buildRadarPicture } from '../../sim/picture';

const spec = ctx.app.spec;
const radarCv = document.createElement('canvas');           // size it with CSS: the bezel stretches it
const rwrCv = document.createElement('canvas');
const radarBezel = screenBezel({ label: 'VSD', aspect: '1', content: radarCv });
const rwrBezel = screenBezel({ label: 'TEWS', aspect: '1', content: rwrCv });

const radar = new RadarDisplay(radarCv, { format: spec.display, units: ctx.app.units });
const rwr = new RwrDisplay(rwrCv, { rwr: spec.rwr });
radarCv.addEventListener('click', e => {                     // click a brick/track to designate
  const id = radar.pick(e.clientX, e.clientY, e.pointerType === 'touch' ? 10 : 0);
  if (id) world.designate(me.id, id);
});

stage.onFrame(() => {                                        // every frame, after world.step()
  radar.draw(buildRadarPicture(world, me.id, { units: ctx.app.units }), { ownHeading: me.heading });
  rwr.draw(me.rwr, world.t);
});

// unmount():
radar.dispose(); rwr.dispose();
```

## RadarDisplay

```ts
new RadarDisplay(canvas: HTMLCanvasElement, options: RadarDisplayOptions)
```

| option | default | meaning |
|---|---|---|
| `format` | required | `'ru-hud' \| 'f15-vsd' \| 'mfd' \| 'tid' \| 'vtb'` (use `AIRCRAFT[id].display`) |
| `units` | `picture.units` | `'metric'` (km, km/h, altitudes in km) or `'imperial'` (nm, kt, kft) |
| `aircraft` | `picture.aircraftType` | wording variant: on `'mfd'` Hornet (`fa18c`) / Viper (`f16c`) / JF-17 (`jf17`); on `'ru-hud'` Su-27 family vs MiG-29S (diamond lock mark, 8° strobe, СНП2) |
| `nonFriendly` | `'unknown'` | how non-friendly tracks are identified on HAFU / TID symbols: `'unknown'` (bracket ⊓) or `'hostile'` (caret ∧, red on colour MFDs). Own-sensor pictures have no hostile ID, so `'unknown'` is the honest default |
| `tidStab` | `'aircraft'` | F-14 TID: `'aircraft'` (heading up, own aircraft low) or `'ground'` (north up; needs `ownHeading`) |
| `manualCursor` | `false` | Trainer aid: keep the freely slewed Russian cursor visible after designation; pages must label this departure from DCS cursor snap. |
| `glow` | `1` | glow multiplier, `0` = off |
| `color` | Viper / JF-17 yes, Hornet no | colour-coded symbology on MFDs (Hornet DATA > COLOR) |

| method | |
|---|---|
| `draw(picture: RadarPicture \| null, extra?: { ownHeading?: number })` | Draw one frame. `null` = no picture (empty glass); `picture.mode === 'off'` = standby legend. `ownHeading` (rad, true) enables TID ground stabilisation, target heading readouts (VSD, Viper, VTB) and the VTB heading tape. |
| `pick(clientX, clientY, slopPx = 0) → EntityId \| null` | Target under a pointer: locked target first, then tracks, then bricks. Use ~10 px slop for touch. |
| `pickDetail(clientX, clientY, slopPx?) → { targetId, kind: 'track' \| 'brick' \| 'stt' \| 'strobe' } \| null` | Same, with what was hit. `'strobe'` is a jam strobe (lowest priority): lock it with `world.lockJammer`, not `lock`. |
| `pickables() → { targetId, kind, x, y }[]` | Everything pickable in the last frame, left to right (keyboard cycling of designations). |
| `toRadar(clientX, clientY) → { az, range } \| null` | Radar coordinates under a pointer (rad rel nose, m); null outside the plot. For cursor slewing / scan centring. |
| `toScreen(az, range) → { x, y } \| null` | Canvas CSS px of a radar point (for HTML overlays). |
| `setOptions(partial)` | Change any option and redraw. |
| `refreshTheme()` | Re-read tokens (skin change without a remount) and redraw. |
| `redraw()` | Redraw the last frame. |
| `dispose()` | Disconnect the ResizeObserver and font listener. Call in `unmount()`. |
| `lastDrawMs` | Cost of the last `draw()` (command recording only). |

What each format draws (research files in `docs/research/`):

- **`ru-hud`** (Su-27 / Su-33 / J-11A / MiG-29S ИЛС, `ru-fc3.md`): range scale on the left with the scale value,
  three thick Rmax / Rtr (= `dlz.rne`) / Rmin ticks and the range arrow with closure; contacts as rows of two dots
  (IFF friendly adds a row); radar cursor as two bars that snap onto the designated track (MiG-29 strobe 8° wide);
  STT mark circle (Su) / diamond (MiG) with aspect line, flashing at 2 Hz once a missile is on its way;
  MiG-29S СНП2: primary diamond, secondary cross, `СНП2` label, `Ц1 Ц2` with ПР; ±60° elevation scale with the
  scan's coverage bar and the target altitude beside it; azimuth-coverage bar with the beam caret and the cursor
  range; `ИЗЛ`, mode (`СНП ДВБ`, adds `ДВБ` if the label lacks it), weapon `27ЭР` and count, `cueLabel` (ПР).
- **`f15-vsd`** (`f15c-fc3.md`): 4×4 grid, range number top right, PDT data top left (TAS, aspect in tens from
  the tail + L/R, heading if `ownHeading`), elevation scale with coverage circles and the altitudes at the TDC
  range and a `<` antenna caret, target altitude `29-9` beside the scale, azimuth scale with scan-limit circles
  and a `V` beam caret, bricks, tentative tracks (thin hollow), firm tracks (filled brick + altitude + aspect
  stick), SDTs (hollow + designation order), PDT / STT (star with long vector, flashes when the shot is valid),
  friendly (IFF) circles for tracks and bricks, TDC bars, ASE circle (dashed TWS, solid STT) with steering dot and angle-off bar, DLZ on the
  right (Rmax triangle, Rpi and Rtr (or Rne) bars, Rmin, caret with closure), mode + bar, `G` speed, stores code
  `A4C`, range to PDT, counter `T tta tti` / `M tti` (AMRAAM) or `nn SEC` (SARH/IR).
  Shoot cue: `cueLabel` `'*'` draws a flashing star, `'▲'` a triangle (the F-15C has no SHOOT text).
- **`mfd`** (`hornet-viper.md`, JF-17 in `tomcat-thunder-mirage.md`): OSB legends round the edge (mode, azimuth,
  bars, range with arrows; Hornet SIL / DATA / RAID / NCTR / MENU…, Viper CRM / NORM / OVRD / CNTL / A6 / 4B / FCR,
  JF-17 crossed STBY / IFF / CNTL / ±az / RDR / SOI `*`). Hornet: B-sweep line, horizon + velocity vector,
  elevation caret, HAFU trackfiles (bracket / caret / hemisphere, threat rank inside, L&S star with Mach left and
  altitude right, DT2 diamond, further designations `D3`…), fly-out pyramid on the steering line with seconds to
  active then `A`, `xx ACT` → `xx TTG`, SHOOT steady inside Rmax and flashing inside Rne, DLZ RMAX / RNE (thick) /
  RMIN. Viper: T-scales, scan-limit lines, cursor with blue upper / white lower altitude, search squares, "tank"
  tracks rotated to the target's track, bug circle, secondaries dashed with their order, AMRAAM tail (flashes when
  active) and X in the last 8 s, TOI line (aspect, track, speed, closure), RPI triangle / RTR–RMIN box, `A nn` /
  `T nn` for the missile of interest, `4 MRM`. JF-17: HPT circle, SPT `2`, NEZ as a green bar, HPT block
  (range, closure, aspect), `TOA nn` then `TTI nn`. The cursor is hidden in STT.
- **`tid`** (F-14): round CRT; own aircraft circle + cross + heading line; track = dot + half-shape (⊓ unknown,
  ∧ hostile, ∩ friendly), velocity vector (1,800 kt ≈ 0.36 R), altitude digit left, Phoenix order digit 1–6 right
  (replaced by TTI, which blinks once the missile is active), track label below, X over extrapolated tracks,
  locked = circle; scan limits as dashed lines (dash + gap = 20 nm), one strobe in STT; beam caret on the rim;
  corner legends (stab mode, range, radar mode, `PH 4`); hooked-track readout (`RA AL Vc`) and missiles line.
- **`vtb`** (M-2000C): `V` closing / `Λ` opening, closing Mach beside firm tracks, TDC `+` with beam top / bottom
  altitude, scan arc with beam tick, PSIC data block (Mach, heading, closure, altitude in hundreds of ft,
  aspect, `H` locked / `V` memory), DLZ as the HUD shows it (thin Rmax, thick Rne, Rmin), bars, own altitude and
  speed, mode, heading tape (with `ownHeading`), `T nn` for the Super 530D (amber and flashing if the lock is gone).

Every format: bricks fade with `fade`, coasting tracks blink, designation order, locked target, scan limits and
beam caret, missile counters from the picture's `timeToActive` / `timeToImpact`.

### Jamming (`picture.strobes`, `picture.stt.hoj`; `docs/research/ecm-datalink-iff.md`, `data/ecm.ts` `JAM_CUE`)

A strobe and a jam lock have a bearing only. The displays draw no range, altitude, aspect or closure for them
(`rangedStt(pic)` in `radar/common.ts` is the STT with a real range; `jamLock(pic)` the angle-only lock). Strobes
fade with `fade`, sit behind contacts, are skipped outside the gimbal on B-scopes, and register `'strobe'` hits
along their length (or on the top marker); the jam lock registers an `'stt'` hit. `ownJamming` is not drawn: the
own-jammer cues in `OWN_JAMMER` are cockpit lights or panels, not radar symbols.

| format | strobe | jam lock | verified |
|---|---|---|---|
| `f15-vsd` | column of hollow rectangles along the azimuth, full range height | solid line through the rectangles, `HOJ` above | yes (ED F-15C p. 70) |
| `ru-hud` | column of dot-row marks flashing at 4 Hz in a pseudo-random pattern (keyed on `picture.t`), `АП` top right | steady line, lock circle (Su) / diamond (MiG) at its top, no range arrow, `АП` | Su-27 yes; Su-33 / J-11A / MiG-29S by family |
| `mfd` Hornet | AOJ dugout (small U) at the top of the B-scope | dugout + line, `AOJ` | strobe yes (ED Hornet p. 157); lock label by the guide's wording |
| `mfd` Viper | pair of chevrons in `caution` (yellow) at the top of the FCR | chevrons + line, `HOJ` | strobe yes (ED Viper pp. 392–393); lock not verified |
| `mfd` JF-17 | generic line along the bearing | line, `HOJ` | not verified |
| `tid` | line from own aircraft to the rim with `<` at 50 nm (just inside the rim on smaller scales) | bright strobe, `JAT` beside the `<`; replaces the STT line | yes (Heatblur F-14 manual) |
| `vtb` | dashed line along the bearing | solid bright line, no label, no PSIC block | not verified |

### IFF (`track.friendly`, `track.iff`, `brick.friendly`; `docs/research/ecm-datalink-iff.md` §3, `data/iff.ts` `IFF`)

`friendly` is what the jet's own IFF says (automatic on the F-15C and FC3 jets, after an interrogation elsewhere),
never truth: an unidentified friend (`friendly: false`) draws as an ordinary contact. `iff.reply` is `'friend'` or
`'no-reply'`; a missing reply never draws as hostile except where the jet itself does so (JF-17). Tested in
`radar/iff.test.ts`.

| format | friendly reply | no reply | bricks | verified |
|---|---|---|---|---|
| `f15-vsd` | circle instead of the rectangle (a locked friend keeps the circle, brightened, with the STT ring) | rectangle (unknown drawn as hostile) | circle / rectangle | yes (ED F-15C p. 66) |
| `ru-hud` | second row of dots above the return | two dots | same rule | Su-27 yes (pp. 51–52); Su-33 / J-11A / MiG-29S by family |
| `mfd` Hornet | green (`ok`, colour on) hemisphere on the HAFU | unknown bracket (hostile needs two factors) | raw hits carry no ID | ID rules yes (pp. 209–210) |
| `mfd` Viper | `ok` circle with `4`, up-left of the return, only while `iff.age` ≤ 2 s, fading from 1.4 s (`viperIffAlpha`); the track symbol does not change | nothing | the `4` mark on a brick the picture calls friendly | yes (pp. 433–435) |
| `mfd` JF-17 | symbol in `ok` + thin `ok` ring | symbol in `warning` (red) + ring | `ok` for a friend | community (Chuck's) |
| `tid` | friendly symbol ∩ | unknown ⊓ | ∩ / ⊓ | ∩ is the TID symbol; the DDD two bars are not drawn |
| `vtb` | `A` in the STT data block; beside the `V` outside STT | nothing | no cue | community (Chuck's) |

### Datalink (`picture.datalink`, `track.dl`; `docs/research/ecm-datalink-iff.md` §2, `data/datalink.ts` `DATALINK`)

`picture.datalink` holds only what this jet's network gives (empty on the F-15C and M-2000C). An entry whose target
own radar holds as a track is not drawn twice: the track carries the datalink ID in `dl` and draws it on its own
symbol (`dlOnly(pic)` in `radar/common.ts`). Entries fade with age toward the 20 s coast (`dlAlpha`, gone after
`DL_COAST_S`). Datalink entries register no hit: they cannot be picked or locked, a launch needs own radar.
Tested in `radar/datalink.test.ts`.

| format | own track with `dl` | datalink-only entry | verified |
|---|---|---|---|
| `mfd` Hornet | HAFU bottom half = datalink ID (hemisphere friendly, bracket unknown, caret hostile; `ok` / `caution` / `hostile` on the colour skin). Top half hostile only with two factors: no IFF reply and `dl === 'hostile'` (`hafuTop`) | HAFU with only the bottom half; PPLI member = basic PPLI circle; in RWS only entries correlated to a radar return | yes (ED Hornet guide pp. 200–210) |
| `mfd` Viper | symbol red (`hostile`, colour on) when the datalink calls it hostile | PPLI blue (`datalink`, trainer: every member counts as own flight), donor track green (`ok`) circle, AWACS track small open diamond, red when hostile; no donor callsign drawn | FCR + 20 s coast yes (pp. 452–475); colours community; shapes not verified |
| `mfd` JF-17 | unchanged | circle `ok` friendly, open triangle red (`hostile`) unknown or hostile, a box around it when own radar does not see it (`correlated` false) | community (Chuck's; the guide places it on the HSD) |
| `ru-hud` | unchanged (filled contact = own radar) | AWACS track own radar does not see = open triangle | Su-27 yes (pp. 57–58, on the HDD; the trainer draws it on the HUD picture); other FC3 jets by family |
| `tid` | datalink half-shape below the dot: unknown ⊔, hostile ∨, friendly ∪ | dot with only the lower half, velocity vector, altitude digit | yes (Heatblur F-14 manual, Link 4) |
| `f15-vsd`, `vtb` | nothing | nothing (no datalink picture in DCS) | yes / community |

## RwrDisplay

```ts
new RwrDisplay(canvas, { rwr: RwrId, glow?: number = 1, newThreatS?: number = 2.5, highlight?: EntityId | null })
rwr.draw(contacts: readonly RwrContact[], t: number)   // t = sim time (new-threat marks, history age)
rwr.pickContact(clientX, clientY, slopPx?) → EntityId | null
rwr.setHighlight(emitterId | null)                    // amber dashed ring on that contact (quiz reveal)
rwr.spec → RwrSpec; setOptions({ rwr?, glow?, newThreatS?, highlight? }); refreshTheme(); redraw(); dispose()
```

Symbols and lamp letters are read from `RWRS[rwr].symbols` (never hard-coded); contacts are ranked with
`rwrPriority()` as the FC3 manual documents it: 1) active missile / launch, 2) lock (STT), 3) emitter type
(airborne > long-range SAM > medium > short > EW (`'unknown'`) > AWACS, `rwrTypeRank()`), 4) signal
strength. `highlight` is a trainer overlay, not cockpit symbology: on the SPO-15 every lamp the contact
lights gets the ring. `emitterType` may be any `RwrSymbol['emitter']` (`'awacs'`, `'sam-long'`,
`'sam-medium'`, `'sam-short'`, `'unknown'`): cast until `RwrContact` is widened.

- **`spo15`** lamp panel: 8 forward direction lamps (10/30/50/90°, a threat between two angles lights both),
  2 rear lamps with triangles, small green lamps for secondary threats, signal-strength column (15 lamps) along
  the silhouette, В / Н elevation half-lamps (both = within ±15°), red lamp under the silhouette (steady lock,
  flashing launch or active missile), type row П З Х Н F С (primary yellow, others green; `''` lights none).
- **Scopes** (`alr56c`, `alr67`, `alr56m`, `jf17rwr`, `serval`): ring position = lethality / priority, never range:
  ALR-56C by signal strength (DCS), locks and launches in the inner ring, `M` in a diamond; ALR-67 critical band
  outermost (lock / launch / missile), lethal band for search, status circle; ALR-56M search outside, lock just
  outside the white inner circle with a box, launch / missile inside with a flashing circle; JF-17 yellow search in
  the outer ring, red lock / launch in the inner ring, rectangles for air threats and circles for known surface
  threats (four outward ticks on the main threat), MAWS missile
  number (`77`, `120`) with above / below mark; Serval nearer the centre = more dangerous. Airborne hat on
  aircraft and AWACS only (`isAirborne()`: SAMs, `'unknown'` and missiles have none, so `15` with a hat is an
  F-15 and without one an SA-15; never on the JF-17). ALR-56C: EW and AWACS never sit in the inner ring.
  Non-JF scopes use the priority diamond and new-threat upper semicircle; JF-17 uses its four-tick main-threat
  frame. Launch flashing plus the per-RWR marks and corner lamps include
  (ALR-67 `AI` / `CW` / `SAM`, ALR-56M `LAUNCH` / `ACT/PWR`, JF-17 `MSL LCH`, Serval `DA` / `D2M`). ALR-67
  AI is limited to airborne locks/launches; SAM is steady for a surface lock and flashes for a surface launch
  (Hornet launch flashing is a shared Heatblur-backed approximation). CW follows the trainer's generic launch
  state and is not verified per emitter. Overlapping symbols
  are spread along their ring (like ALR-67 OFFSET), so the band keeps its meaning.

## RwrAudio (optional, off by default)

```ts
const audio = new RwrAudio({ rwr: spec.rwr, volume: 0.2 });   // no AudioContext yet
button.onclick = () => audio.enabled ? audio.stop() : audio.start();   // start() only from a user gesture
stage.onFrame(() => audio.update(me.rwr, world.t));
// unmount: audio.dispose()
```

Search: a chirp on each new paint (lastSeen jumps) or new threat (SPO-15 low tone). Lock: continuous tone
(SPO-15 steady high tone, Western pulsed). Launch / active missile: warble (SPO-15 intermittent high tone).
`RwrAudio.supported`, `setRwr(id)`, `setVolume(v)`. Tones are stylised; research does not give frequencies.

## DlzBar

```ts
const bar = new DlzBar(canvas, { units, orientation: 'horizontal' | 'vertical', labels?: { rmax?, rne?, rmin?, rtr?, rpi? } });
bar.draw(picture.dlz, { closure, shoot: picture.shootCue, cue: picture.cueLabel });   // null dlz = empty scale
```

Hatched Rmin zone, solid no-escape zone (Rmin–Rne), outlined Rne–Rmax, legends (default `RMAX RNE RMIN RTR RPI`;
Rtr / Rpi are drawn only when distinct from Rne / Rmax), caret at `targetRange`, range + closure readout,
flashing cue (`'*'` and `'▲'` draw the F-15C star / triangle). Horizontal wants ~60–80 px of height.

## MissileTimeline

```ts
const tl = new MissileTimeline(canvas, { minHorizonS: 30, maxRows?, emptyText? });
tl.draw(picture.missilesInFlight, world.t);
```

One row per missile on a shared "seconds from now" axis: label `M1 > T2`, guidance tag (`DL`, `INS` in amber,
`ACT`, `SARH`, `IR`), dashed supported phase to the `A nn` pitbull tick, solid active phase to `T nn` (flashes in
the last 5 s); SARH rows are amber dashed (hold the lock).

## It23mDisplay (Su-25T IT-23M)

```ts
const tv = new It23mDisplay(canvas);                 // 4:3 canvas
tv.draw(state: It23mState | null, image);             // image: ShkvalTv.image (or null: symbology only)
tv.pickOffset(clientX, clientY) → { fx, fy }          // tap offset from the centre, fractions of width / height
```

`It23mState`: `on`, `mode` (`'КС' | 'АС'`), `zoom`, `targetSizeM`, `azDeg` / `elDeg` (sight line), `pitchDeg`,
`radarAltM`, `laserOn`, `laserCooling` (ЛД flashes), `rangeM` (slant range, shown while lasing), `tofS`, `pr`,
`fovHDeg`, `groundStab`. Draws the picture, then S1's items: azimuth scale −40..+40° on top, elevation scale
+20..−90° on the left with the pitch mark, КС / АС with the radar altitude upper right, zoom and target size upper
left, the sight cross with the target frame (corners in КС, a box in АС, sized by `targetFramePx`), ЛД, slant range
in km, ПР above it and the time of flight lower right. Off: dark glass with "Shkval off [O]". Pure helpers
(tested): `azToX`, `elToY`, `targetFramePx(sizeM, rangeM, fovHDeg, widthPx)`, `fmtSlantKm`, `IT23M_AZ`, `IT23M_EL`.

## Su25tHud (Su-25T HUD, air-to-ground)

```ts
const hud = new Su25tHud(canvas);                    // square canvas
hud.draw(state: Su25tHudState | null, world?: CanvasImageSource | null);   // world: ForwardView.image, seen through the glass
// GunSightDisplay.draw(pic, acm, world?) does the same in its HUD format (not the overlay).
```

`Su25tHudState`: `master`, `modeLabel` (`hudModeLabel(master, shkvalOn)`: ОПТ-ЗЕМЛЯ, ЗЕМЛЯ), `weaponLabel`
(`AG_WEAPONS[w].hudLabel`), `rounds`, `pitchDeg`, `headingDeg`, `speedKmh`, `altM`, `range` (`{ cur, min, max }` m,
from `canAgLaunch`), `pr`, `laserCursor` and `ccip` (degrees from the boresight, `hudAngles(from, heading, pitch,
point)`, the CCIP point from `predictImpact`), `reticle` (`'in' | 'out' | null`, guided stores), `stations`
(`{ station, label, count, selected }`). Draws the horizon and pitch marks, the datum, speed / altitude / heading,
the circular laser cursor with the launch-zone reticle (dashed out of range), the CCIP pipper with the fall line,
mode and store labels, ПР, the range scale (band, maximum, caret with the current range) and station boxes.
Layout is simplified; `HUD_FOV_DEG` (26) scales the angles. Pure helpers (tested): `hudAngles`, `hudModeLabel`,
`rangeScaleKm`.
Optional: `ccrp` (`{ errDeg, inCircle, ttrS, held }` from `ccrpSolution`) draws the director circle at the keel
(solid inside the tolerance) and turns the range scale into a 0–10 s time-to-release scale whose arrow shows in
the last `CCRP_SCALE_S` seconds; `arm` (`{ emitters: { xDeg, yDeg, code, locked }[], cursor }`) draws Kh-58
emitter diamonds with the type code below, a circle for the locked emitter and the slewed square. The page passes
`modeLabel: 'ПРГ'` in Kh-58 detection (S1).

The CCRP director radius uses `CCRP_TOL_DEG` with the same pixels-per-degree scale as its offset
(`ccrpDirectorGeometry`), so keel containment matches the simulation tolerance. Kh-58 drawing and
strike cursor picking share `projectArmHudPoint`, including the ±8.5° elevation clamp.

## Also exported

`rwrPriority`, `rwrTypeRank(contact)`, `isAirborne(contact)`, `rwrSymbolFor(spec, contact)`, `scopeRadius(rwrId, contact, rank)`, `spoLamps(bearing)`,
`aspectSide(az, relHeading)`, `aspectTens(aspectDeg, side)`, type `Units`.

## Gotchas

- **Size the canvas with CSS** (`width: 100%; aspect-ratio: 1` or a bezel with `aspect`). The displays draw into
  the largest centred square; a canvas without a CSS size stays at its 300×150 default (pinned, it will not grow).
- Radar formats and scopes look best square; the SPO-15 panel too. DlzBar and MissileTimeline are strips.
- Blinking (coast, launch, SHOOT, 2 Hz lock mark) uses real time, so it continues while the sim is paused.
- Tentative tracks (`firm: false`) are drawn as raw hits; firm tracks get sticks / vectors.
- The TID in `'ground'` mode without `ownHeading` falls back to heading-up (the legend still says GND STAB).
- `cueLabel` comes from `picture.ts`: `'ПР'`, `'*'`, `'▲'`, `'SHOOT'`, `'TIR'`, or an empty string. Viper and
  classic Tomcat return empty: their geometric launch cues must not be replaced with invented cockpit text.
  Trainer launch availability may be shown separately; the F-15C star / triangle are symbols.
- `pick()` returns the locked target first even if a brick is closer; use `pickDetail()` to know what was hit.
- Headless screenshots: Chrome clamps the window to ≥ 500 px; `sandbox/displays.html?w=390` constrains the
  column to a real 390 px.

## Simplified here (say so in the UI where it matters)

- ИЛС missile counter (`А12 34`) is a trainer addition: ED documents no time-to-impact on the FC3 HUD, only the
  2 Hz flashing lock mark. Contacts always show two dots (fighter RCS); no PRF labels (the sim has no PRF).
- F-15C VSD shows the HUD's post-launch `T tta tti` / `M tti` counter (in DCS it is HUD-only); no NCTR print,
  no bearing to the PDT (the picture has no own heading unless you pass `ownHeading`).
- Hornet threat rank is by range; Hornet / Viper / JF-17 OSB legends are placed plausibly, not verified per button.
- F-14 TID has no launch-zone vectors; the steering centroid is not drawn. The DDD `JET`
  strobe is not drawn (no DDD format).
- Jam symbols: exact shape and size of the Hornet dugout and Viper chevrons are stylised; the Su-27 strobe's
  flashing pattern is a trainer choice; JF-17 and M-2000C strobes and every lock cue marked "not verified"
  above are generic.
- IFF: the F-14 two bars (above and below the return) are a DDD cue and there is no DDD format; tried on the TID
  they crossed the velocity vector and read as a cross, so the TID shows its ∩ friendly symbol only. The JF-17 ring
  around an interrogated contact is a trainer aid (the display's base symbology is green in the US skin, so the
  green friend colour alone does not read). The M-2000C `A` beside a non-locked track and the Viper mark offset and
  fade timing are trainer choices; DCS says only "may be offset" and "shown for 2 s".
- Datalink: the FC3 AWACS triangles belong to the HDD, drawn here on the HUD picture. Viper colours (blue own flight,
  green donors) are community; the trainer has no flights, so PPLI members are blue and donor tracks green, and the
  Viper AWACS diamond is a stand-in (ED draws the sovereignty shapes as images). JF-17 datalink symbols are community
  and appear on its radar page here (the guide puts them on the HSD). No Hornet own-flight letters or C2 / donor
  PPLI dots; no Viper donor callsign or lock lines.
- M-2000C VTB contacts show one detection-bar tick (the picture does not say which bar painted them).
- Scope RWR placement uses the per-RWR rules above; symbol glyphs for the Serval are ED-style codes (per data).
- SPO-15 signal strength is a column of 15 lamps (the lamp count is not confirmed by research).

## Visual checks

```
scripts/shot.sh '/sandbox/displays.html?t=28' .shots/displays-us-1440.png 1440 2100 5000
scripts/shot.sh '/sandbox/displays.html?t=28&skin=ru' .shots/displays-ru-1440.png 1440 2150 6000
scripts/shot.sh '/sandbox/displays.html?t=28&only=f15c&w=390' .shots/displays-f15c-390.png 500 600 3000
scripts/shot.sh '/sandbox/displays-live.html?jet=fa18c&t=78' .shots/displays-live-fa18c.png 1440 900 3000
```

`?only=` takes `su27 mig29s f15c fa18c f16c jf17 f14b f14g m2000c rwr-<id> helpers` (comma list), `?pause=1`,
`?perf=1` logs draw cost, `&sams=1` adds SA-15 / SA-10 / AWACS emitters, `&hl=s1` highlights one emitter,
`&jam=strobe` adds two jam strobes, `&jam=lock` an angle-only jam lock plus a strobe, `&iff=1` a friend with an IFF
reply (a new reply every 4 s, so the Viper mark comes and goes), a no-reply track, a friendly and a plain brick, `&dl=1` the datalink picture the jet's network gives (AWACS, one stale
AWACS track, donor and PPLI entries, a datalink ID on the first own track or a correlated brick). Clicking a track in the
sandbox toggles its designation (pick demo); clicking a strobe reports `strobe j1`.

```
scripts/shot.sh '/sandbox/displays.html?only=su27,mig29s,f15c,fa18c,f16c,jf17,f14b,f14g,m2000c&jam=lock&pause=1' .shots/jam-lock.png 1440 1500 4000
scripts/shot.sh '/sandbox/displays.html?only=su27,mig29s,f15c,fa18c,f16c,jf17,f14b,f14g,m2000c&iff=1&t=29&pause=1' .shots/iff-us.png 1440 1500 5000
scripts/shot.sh '/sandbox/displays.html?dl=1&pause=1&only=fa18c,f16c,jf17,f14b,f15c,m2000c' .shots/dl-us.png 1440 1500 4000
```

## ACM cues and the IR tone (issue #11)

`GunSightDisplay.draw(pic, acm?)` also draws close-combat cues from `buildAcmPicture(world, me, acmState)`
(`acmCues.ts`): the mode's own cue (two vertical lines, BORE circle, Hornet dashed circle, F-16 10×60 reference
line, F-16 BORE cross, FC3 HELMET ring on the target direction flashing at 2 Hz for ПР with an X above it outside
the seeker gimbal, Fi0 fixed cross), the scan area dim and dashed as a trainer aid, the lock box, the Western seeker
circle (on the target when slaved or tracking), the mode and sensor label, a GROWL / TONE caption and the FC3 ПР.
HELMET uses `helmetLookId` independently of candidate/lock eligibility, so an 80° look still shows the X after
the lock drops. The ring/X are clamped inside the HUD when off screen, explicitly a trainer aid.
`IrToneAudio` (`irToneAudio.ts`) follows the `RwrAudio` pattern: no AudioContext before `start()` from a user
gesture, `setTone('none' | 'growl' | 'lock')` every frame, `setMuted`, `stop`, `dispose` in unmount (closes the
context). Tests: `irToneAudio.test.ts` (fake AudioContext).
Merge wraps this in `pages/merge/audio.ts`: `visibilitychange` (hidden) and `pagehide` dispose the graph;
returning to the page does not restart it. A later visible-page gesture creates fresh audio. Unmount closes
audio and removes all lifecycle listeners. Tests: `pages/merge/audio.test.ts` (fake AudioContext and events).

## GunSightDisplay (HUD gun sights, issue #11)

```ts
import { GunSightDisplay, buildGunSight, sightStyleFor } from '../../ui/displays';

const hud = new GunSightDisplay(canvas, { fovDeg: 26 });                       // trainer HUD in a bezel
const over = new GunSightDisplay(overlayCv, { overlay: true, fovDeg: stage.camera.fov }); // over the cockpit camera
let shoot = false;
stage.onFrame(() => {
  const pic = buildGunSight(me, bandit, { locked, pick, prevShoot: shoot });  // null: no gun data
  shoot = pic?.shoot ?? false;
  hud.draw(pic); over.draw(pic);
});
```

`sightStyleFor(type, locked, pick?) → { kind, name, verified, note } | null` maps data `GUNS[id].sight`
(`noLock` / `lock`, JF-17 `other`) to the sight the HUD shows; `noLockOptions(type)` lists the no-lock choices
(JF-17: SS, SSLC). `buildGunSight(me, target, { locked, pick?, prevShoot? })` returns a `GunSightPicture`:
funnel / tracer points, pipper, F-14 diamond, range marks (sim `sightPoint`, HUD angles from the gun line, + right,
+ up toward the canopy), target angles (`hudAngles`), lock range, range-arc full scale, `inRange`, `inSolution`
(the sim's hit rule), Hornet `shoot` (predicted miss < 20 ft, off above 30 ft), rounds, firing.

| Jet | No lock | Lock |
|---|---|---|
| Su-27, Su-33, J-11A, MiG-29S | Gun funnel sized for the Target Size span (20 m), 200–1200 m | LCOS pipper, 0–1200 m range scale, crosshair inside 1200 m |
| F-15C | LCOS: gun cross and pipper | Gun reticle with range arc |
| F/A-18C | Funnel with 1000 / 2000 ft cues (40 ft span) | Director reticle, range arc, SHOOT |
| F-16C | EEGS Level II funnel (not verified ranges) | EEGS Level V: dim funnel and pipper with range arc |
| F-14B | RTGS pipper at 1000 ft, diamond at 2000 ft | RTGS track: pipper at target range to 4000 ft |
| JF-17 | SS bullet line (or SSLC: line and LCOS pipper) | LCOS |
| M-2000C | CCLT tracer line to 1000 m, wingspan marks 300 / 600 m | same, with a distance-meter tick inside 1200 m |

Options: `fovDeg` (vertical field the canvas spans; match `stage.camera.fov` for the overlay), `overlay`
(transparent, no target bar; boresight at the centre), `boreY` (fraction of the height, HUD default 0.32), `glow`.
Text: sight name top left, `RDS n` bottom right, lock range bottom left (jet units), `IN RNG` (trainer cue) or
`SHOOT`, `GUN` while firing, else `SIMPLIFIED`. The funnel and pipper geometry is the sim's lead approximation
(own turn rate × time of flight), not any jet's sight law. Tests: `gunSight.test.ts`.
