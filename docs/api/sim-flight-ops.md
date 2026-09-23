# Flight-ops sim (`src/sim/flightOps`)

Arcade model, demo pilot and grading for the airfield pattern and approach trainer (issue #19). Separate from
the BVR `World`. Contract: `src/sim/flightOps/types.ts`. Facts: `src/data/flightOps.ts` (`FLIGHT_OPS`,
`FLIGHT_OPS_CAVEATS`). Gameplay only (AGENTS.md rule 1): no aerodynamic or engine tables.

Runway frame (metres): origin at the landing threshold, x east, y up (wheel height), z south; landing
direction is −z; left-hand pattern with the downwind at x < 0.

## Model (`model.ts`)

```ts
createFlightOpsState(id, start: 'initial' | 'downwind' | 'final' | 'runway' | 'rtb' | 'takeoff' | 'caseI' | 'carrierGroove', data?): FlightOpsState
stepFlightOps(s, input: FlightOpsInput, dt, data?): void   // mutates s; use FLIGHT_OPS_DT = 1/60
applyAction(s, action: FlightOpsAction, data?): void        // gear, flaps, speed brake, navModeCycle, navPointCycle, hookToggle, callBall
configWarnings(s, data): { overspeed: 'gear' | 'flaps' | null }
aoaCue(s, data): 'slow' | 'on' | 'fast'                     // above band = slow
loadFactor(s, data), aoaForLoad(s, data, n), approachSpeedMs(data), aimPointM(data), flapsFollowGear(data)
hasNavStart(data), RTB_START                                 // 'rtb' needs data.nav
noFlapControl(data), hasFlapSelector(data), takeoffFlapIndex(data), rotateAtKt(data)
ROTATE_RATE_DEG = 5, ROTATE_MIN_VR = 0.8, LIFTOFF_MARGIN_KT = 5, LATE_LIFTOFF_KT = 25, TAKEOFF_START_M = 100
```

- Starts: `initial` 2 nm south on the centreline at the initial altitude and speed, clean; `downwind` abeam
  midfield, configured, 1.1 × approach speed; `final` 1.5 nm on the glide path, on speed; `runway` stopped
  at the threshold with takeoff flaps; `rtb` (jets with `nav` only, else it throws) 12 km west and 38 km
  south of the threshold at 3500 m and 300 kt, clean, heading for the steer point, in return mode (ВЗВ) or,
  without a return mode (F-15C), in route mode (NAV) on the IAF. Air starts are trimmed for 1 g. Only `rtb`
  sets `s.nav`; `stepFlightOps` then calls `updateNav` every step.
- Stick pitch commands AoA rate; neutral stick holds AoA (throttle then moves the glide path). Stick roll
  commands roll rate to ±75° bank; neutral holds bank. On the ground, roll input is nosewheel steering.
- Lift rule: n = (aoa / onSpeed) · (v / vApproach)² · (0.8 + 0.2 · landing-flap fraction), G limit 7.5.
  At the approach speed, 1 g, landing flaps, the AoA reads exactly on speed.
- Speed: thrust (idle → MIL, afterburner bonus) minus drag (base, gear, flaps, speed brake, induced ∝ n²)
  minus g·sin γ. Gear 6 s, flaps 4 s full travel, speed brake 2 s, throttle lag 0.8 s.
- Touchdown at y ≤ 0 records `s.touchdown`. Crash reasons: "Gear up at touchdown", "Hard landing"
  (sink > 4.5 m/s), "Short of the runway", "Off the runway" (also leaving the runway on rollout). Otherwise
  `rollout` with wheel braking at low throttle, then `stopped`. Liftoff: above 0.95 × approach speed with
  back stick.
- F-16C: no flap selector; flaps follow the gear and the flap actions do nothing.
- M-2000C (`noFlapControl`): no flap control at all. Flap actions do nothing, `flapIndex` stays 0 in every
  start, `configWarnings` never reports flaps, and the arcade high-lift effect follows the gear position.
- Overspeed never damages the jet; `configWarnings` reports gear (or landing flaps) above the gear limit.

## Nav (`nav.ts`)

```ts
updateNav(s, data): void                       // recompute s.nav (no-op without nav); called by stepFlightOps
initNav(s, data, mode, point?), cycleNavMode(s, data), cycleNavPoint(s, data)   // applyAction uses the last two
navRoute(navData): NavPoint[]                  // WP1 (−18 km, 30 km, 3000 m), IAF = glide-slope intercept point
NAV_AUTO_SWITCH_M = 3000, NAV_CALL_MIN_S = 4, NAV_CALL_OFF_DEG = 0.5, NAV_CALL_ON_DEG = 0.25,
NAV_CALL_MIN_RANGE_M = 500, NAV_CALLS, INTERCEPT_NAME
```

- Modes cycle in `nav.modes` order and wrap: МРШ → ВЗВ → ПОС (Russian FC3), NAV → ILSN (F-15C).
- route: steers to the selected waypoint at its altitude; `navPointCycle` steps WP1 → IAF (no-op in the
  other modes: one airfield). return: steers to the intercept point (x 0, z `interceptPointM`) at
  `interceptAltM`; with `autoLandingSwitch` it becomes landing mode inside 3 km (call "Landing mode").
- landing: target is the aim point; `glideDevDeg` / `locDevDeg` equal `approachGeometry`'s glide and lineup
  errors (+ high / right); `steerHeading` intercepts the centreline (up to about 29°); `commandAltM` is the
  glide-path height. Deviations are null outside landing mode and on the ground.
- Tower calls (`nav.call`): "Above glide path" beyond +0.5°, "Below glide path" beyond −0.5°, "On glide
  path" back inside ±0.25°; between the thresholds the last band holds. At most one call per 4 s, none inside
  500 m of the aim point. Call timing lives in a WeakMap; the selected waypoint is read from `target.name`.

## Demo pilot (`pilot.ts`)

```ts
demoPilot(s, data): FlightOpsInput & { actions: FlightOpsAction[] }
demoLeg(s): 'nav' | 'approach' | 'initial' | 'break' | 'downwind' | 'turn' | 'final' | 'rollout' | null
onSpeedTargetMs(data), finalTurnGeometry(data)
```

Flies the left-hand overhead from `initial` (or joins at `downwind` / `final`) to a stop: breaks 7 s past
the threshold at the break g (F-16 speed brake out), lowers gear and landing flaps below the gear limit,
tracks the abeam distance, flies a descending semicircle to a straight final (at least 0.75 nm) and holds
the glide path with the stick and the AoA band with the throttle. Leg memory is a `WeakMap` per state;
apply `actions` with `applyAction` before `stepFlightOps`.
From `rtb`: `nav` leg follows `steerHeading` and `commandAltM` at the gear limit − 30 kt (speed brake when
fast), selects the next mode itself within 3 km of the IAF where the cockpit does not switch; `approach`
leg (landing mode) levels below the glide path and rides it down, configures inside 9 km, and hands over to
the `final` leg inside 3.5 km when configured and lined up. The F-15C's faster approach widens the final turn
so it never needs more than 45° of bank (about 1.37 nm abeam).

## Grading (`evaluate.ts`)

```ts
approachGeometry(s, data): ApproachGeometry   // rangeM + before aim point, glideErrDeg + high, lineupErrDeg + right
touchdownZone(data): { zNear, zFar }          // TOUCHDOWN_ZONE_FT = 350 ft short … 1000 ft past the aim point
new ApproachEvaluator(data); ev.update(s) each step; ev.score(): ApproachScore
```

Lineup is measured from the far end of the runway (localizer view). The scored final is the last 1 nm with
the gear down, down to 0.1 nm. Gates appear as they are reached: initial (±100 ft, ±20 kt), break (peak g
±0.75, started past the threshold), downwind (±50 ft) and abeam (±0.2 nm, configured) checked abeam the aim
point, ninety (gear down, AoA in band), groove (≥ 60 % on speed, glide RMS ≤ 0.7°, lineup RMS ≤ 1°, graded
at touchdown), touchdown (in the zone, no crash). Total = 56 × passed-gate fraction + glide (14) + lineup (10)
+ on-speed fraction (10) + zone (10); a crash scores 0. The verdict is a short pilot-vocabulary line.

## Takeoff (#24)

Start `takeoff`: `TAKEOFF_START_M` (100 m) past the threshold on the centreline, heading north, stopped,
gear down, takeoff flaps (`takeoffFlapIndex`: the data `flapIndex`; F-16C flaps with the gear; M-2000C 0),
throttle idle, phase `ready`, `s.takeoff = { maxPitchOnGroundDeg: 0, tailStrike: false }`.

- `ready`: `input.brakes` holds the jet at any power. Without brakes the roll starts once the thrust beats the
  wheel braking (throttle above 0.3); that step records `takeoff.brakeReleaseT` and enters `roll`. A roll that
  stops (abort) returns to `ready`.
- `roll`: arcade acceleration from throttle and afterburner at 0.6 of the air thrust (about 25 s to rotation
  in MIL, 13 s in afterburner), rolling friction, brakes or idle brake; roll input is nosewheel steering.
  Leaving the runway is the "Off the runway" crash.
- Rotation: above `ROTATE_MIN_VR` × Vr, back stick raises the nose at up to 5°/s (neutral holds, push lowers);
  below it the nose stays down. The first nose rise records `rotateT` / `rotateKt`. Pitch on the ground is
  capped at `tailStrikeDeg`; reaching it sets `tailStrike` (recorded, not a crash). `maxPitchOnGroundDeg`
  tracks the peak.
- Liftoff: pitch at or above the band's low edge, speed at least Vr + 5 kt, and the attitude gives 1 g (the
  cockpit AoA for 1.02 g is within 0.5° of the pitch); or late and shallow at Vr + 25 kt with 3° or more.
  Records `liftoffT`, `liftoffKt`, `liftoffPitchDeg`; phase `air` with the AoA for 1.02 g and the attitude
  kept (the nose comes up only on a late liftoff).
- `gearToggle` up after liftoff records `gearUpT` / `gearUpKt` (first time only). `configWarnings` is
  unchanged (pattern gear limit). Landing behaviour is unchanged; `input.brakes` also brakes the rollout.

Demo pilot legs `takeoff` (ground) and `climbout` (air after a takeoff start): holds the brakes until the
throttle is at 95 % (afterburner per data), releases, tracks the centreline, pulls at `rotateAtKt`
(Vr − early pull) toward the middle of the pitch band, holds that attitude, raises the gear above 30 ft with a
positive climb, raises the flaps (to AUTO on the Hornet) once the gear is up and above Vr + 30 kt, keeps below
the gear and flap limits while they travel, then climbs at 300 kt to `CLIMB_ALT_FT` (1500 ft) and levels.
All ten jets pass every gate without a tail strike.

```ts
new TakeoffEvaluator(data); ev.update(s) each step; ev.score(): TakeoffScore
TAKEOFF_CLIMB_FT = 1000, ROTATE_TOL_KT = 5
```

Gates in order, each appearing when flown: brakeRelease (throttle 90 %+ when the roll starts), rotate (nose
comes up within ±5 kt of Vr − early pull, or of Vr), liftoff (pitch at liftoff inside the band, no tail
strike), gearUp (commanded in a climb at or below `gearUpMaxKt`; fails as soon as the jet passes the limit
gear down, or at 1000 ft with the gear down), climb (1000 ft above the field, climbing, gear up, Vr + 20 kt
or more, no overspeed warning). Total = 20 per passed gate, set at the climb gate; a crash scores 0. Verdict:
"Good takeoff." / "Fair takeoff: …" / "Poor takeoff: …" with faults such as "power not set before brake
release", "early rotation", "tail strike", "over-rotated", "under-rotated", "gear up late".

## Carrier Case I (#26): `carrier.ts`, `lso.ts`

Starts (jets with `carrier` data: fa18c, f14b on the CVN; su33 on the Kuznetsov; `hasCarrierStart(data)`, else
`createFlightOpsState` throws):
- `caseI`: 3 nm astern, 150 m starboard, at the carrier initial altitude and speed on the BRC, clean, hook up.
- `carrierGroove`: ¾ nm astern on the glide path and the landing centreline (crab for the ship's drift), gear,
  landing flaps and hook down, on the approach speed.

Both set `s.ship` (ramp at the origin, BRC north, `speedMs` from `SHIPS[id].speedKt`), `hookDown`/`hookPos`
and `s.lso`. `pos` is then a world frame (x east, y above the sea, z south); `s.ship.x/z` is the ramp (stern on
the ship centreline) and moves on the BRC every step.

```ts
shipFrame(s): { a, c, h }            // a ahead of the ramp, c to starboard, h above the deck
landingFrame(s): { u, v, h }         // u along the angled axis from the ramp, v right of it
landingToWorld(s, u, v), shipToWorld(s, a, c)   // for the render: wires, landing-area corners, hull
carrierGeometry(s): CarrierGeometry  // rangeM to the ramp, glideErrDeg / lineupErrDeg (+ high / right),
                                     // closureMs, glideSinkMs, headingErr, inGroove
landingHeading(s), crabHeading(s), wireU(ship, i), wireAt(ship, u), aimPointU(ship), targetWire(ship)
moveShip(s, dt), carrierContact(s, prevU), stepCarrierDeck(s, dt)   // called by stepFlightOps
CARRIER_HARD_MS = 6, ARREST_DECEL = 25, HOOK_TIME_S = 1.5, HOOK_DOWN_POS = 0.95, TARGET_WIRE = 3,
CASE_I_START, GROOVE_START_NM = 0.75, GROOVE_MAX_NM = 1.25
```

- Geometry: the landing area runs from the ramp along heading − `angledDeckDeg`, `landingAreaLengthM` ×
  `landingAreaWidthM`, at `deckHeightM`. Wire i at `firstWireFromRampM + (i − 1) · wireSpacingM`. The glide
  path meets the deck half a spacing before wire 3 (`aimPointU`). Glide error is measured from that point,
  lineup from the far end of the landing area. Hull outline for drawing: `SHIP_HULL` (src/data/ships.ts).
- Actions: `hookToggle` (air only; hook travels in 1.5 s), `callBall` (sets `lso.ballCalled`).
- Deck contact on the landing area records `touchdown` and `trap` once: gear up → "Gear up at touchdown";
  sink beyond 6 m/s → "Hard landing"; hook down (`hookPos` ≥ 0.95) catches the first wire at or ahead of the
  touchdown point, else a bolter (`trap.wire` null, `bolter` true). `trap.powerAtTouchdown` = throttle
  (+0.5 in afterburner). Trap: phase `rollout`, `s.speed` becomes the deck-relative speed and decays at
  25 m/s², then `stopped`; the jet rides with the ship. Bolter: phase stays `air`, held on the deck until it
  flies off. Crossing the ramp below deck height → "Ramp strike"; below deck height over the hull off the
  landing area → "Off the landing area"; y ≤ 0 → "In the water". Later deck contacts after a bolter only hold
  the jet on the deck (one trap record per pass).

LSO and ball (`updateLso(s, data, dt)`, run by `stepFlightOps`):
- `s.lso.ball` (null outside the groove: astern within 1.25 nm, within 30° of the axis and 10° of lineup,
  gear handle down or ball called): `cell` = round(glide error / 0.3°) clamped ±5 (`BALL_CELL_DEG`,
  `IFLOLS_RED_CELL` = −4 and below are the red low cells); `luna` (Kuznetsov) green within ±0.5°, yellow high,
  red low; `waveoffLights` after an LSO waveoff; `cutLights` for 1 s with "Roger ball" and "Power" (IFLOLS).
- Calls (`LSO_CALLS`, CVN only; the Kuznetsov gives none): "Roger ball" answers the ball call. Once the ball
  is called or inside the jet's ball range: "Power" beyond 1.5° low, "You're high" beyond 2.5° high (wording
  not verified), "Right for lineup" left of centreline beyond 1.7°, "Come left" right beyond 1.7°. Inside
  0.35 nm (`WAVEOFF_RANGE_NM`), 2.7° low, 4.9° high, 2.9° lineup or gear not down → "Wave off" (once,
  `lso.waveoff`). After the ball call and outside 150 m: pitch rate above 5°/s "Easy with the nose", bank
  above 20° "Easy with your wings", throttle change above 30 %/s "Easy with it". A call fires when its metric
  passes the threshold, re-arms below 0.8 × threshold, repeats after 4 s while beyond; at most one call every
  2 s. "Bolter, bolter, bolter" on a bolter. `ballInRange(s, data)` tells the page when to prompt the call.

Demo pilot (`carrierPilot` inside `demoPilot`, legs initial → break → downwind → turn → final → rollout, or
`bolter`): breaks 2000 m ahead of the ramp with a turn as wide as the abeam distance (at most the jet's break
g), hook down in the break, gear and landing flaps below the carrier limit, holds the abeam distance at 600 ft,
rolls into a constant-bank 180 (`carrierTurn(s, data)`: radius, bank, roll-in point for wings level at the
groove distance) with a lead-in onto the centreline, calls the ball, flies the glide path to the deck without
a flare and sets touchdown power 6 m above the deck. After a bolter or waveoff: MIL and climb ahead. Traps
wire 3 in all three jets.

Grading (`new CarrierEvaluator(data)`, `update(s)`, `score(): CarrierScore`):
- Gates: initial (passing the ramp on the BRC: ±100 ft, ±20 kt), break (ahead of the ramp and within 4 nm;
  published interval as a note), downwind (±50 ft) and abeam (published band ±0.1 nm, gear, flaps, hook down)
  passing the ramp southbound, ninety (heading 90° off BRC: band ±50 ft, gear down, on speed), groove (wings
  level to touchdown within the band ±2 s on Case I passes; ball called 0.15 nm early to 0.25 nm late of the
  ball range), touchdown (wire caught, throttle ≥ 0.85 and no afterburner for the Tomcat).
- Comments (`grooveComments`, `commentText`, `commentWords`): segment means by range to the ramp, X > 0.45 nm,
  IM 0.2–0.45, IC 0.05–0.2, AR inside 0.05. H, LO, LUL, LUR from the LSO thresholds (a little = 0.4 ×), F / SLO
  from AoA in half-band widths (1, 2, 3), NERD / TMRD from the sink against the glide-path sink (< 0.5, > 1.6).
  "(LO)IC" a little, "LOIC", "_LO_IC" a lot.
- Grade (`carrierGrade`): crash C; LSO waveoff WO; own waveoff OWO (leaving the groove or passing the landing
  area without touching); bolter B. Traps: penalties 1 (a little), 3 (normal; 4 in close or at the ramp),
  6 (a lot), +2 no ball call, +2 power not set; a lot in close or at the ramp is C. 0 on wire 3 → _OK_, ≤ 3 OK,
  ≤ 6 (OK), else ---. total = 0.75 × grade base (_OK_ 100, OK 90, (OK) 75, --- 55, B 40, OWO 40, WO 30, C 10)
  + 25 × passed-gate fraction; a crash scores 0. Verdict: "OK pass, 3 wire: a little low in close."

## Deck launch (#27): `launch.ts`

Contract additions (`types.ts`): `FlightOpsJetData.launch?: FlightOpsLaunchData` (kind `'catapult' | 'skiJump'`,
ship, ordered `steps: LaunchStep[]` with `Sourced` keys or null, power `'MIL' | 'AB'`, Hornet `abFromLb` and
`trimByWeightLb`, trainer `weights`, `stations`, ski-jump `runM` and `shortRunMaxWeight`, catapult
`clearingTurn`, Su-33 `avoid.fodScreens`, `after`, `cue`); `LaunchStepId`, `LaunchOptions { station?, heavy? }`,
`LaunchOutcome` (`'good' | 'sequence error' | 'cold cat' | 'short run'`), `LaunchState` on
`FlightOpsState.launch`, actions `nwsHi`, `launchBar`, `hookUp`, `trimUp`, `trimDown`, `wipeOut`, `salute`,
`specialAB`, `fodScreens`, gates `sequence`, `shot`, `handsOff`, `cleanUp`, `clearingTurn` and `LaunchScore`.

Starts (`createFlightOpsState(id, 'catapult' | 'skiJump', data, { station, heavy })`; throws when the jet has
no launch of that kind or the station is not offered): `catapult` puts the fa18c or f14b on catapult 1 or 2
of the CVN, `skiJump` the su33 on Kuznetsov position 1 (90 m) or 3 (180 m). Stopped on the deck (`s.speed` is
the ship speed: no wind), gear down, takeoff flaps, idle, phase `ready`, `s.ship` as for the carrier starts,
`s.launch.stage = 'hold'`. Hornet trim starts at 12° (`TRIM_START_DEG`), `trimWantDeg` from the weight table.

```ts
placeLaunchStart(s, data, opts), applyLaunchAction(s, action, data)   // via createFlightOpsState / applyAction
stepLaunchDeck(s, input, dt, data), stepLaunchAir(s, input, data)     // called by stepFlightOps
launchStrip(s, data): { id, label, state: 'done' | 'next' | 'pending', t? }[]   // the sequence strip
trimForWeight(launch, weight), launchPowerNeed(launch, weight), powerMet(s, need)
catEndSpeedMs(data), minRampSpeedMs(data), hasLaunchStart(data), launchData(data), orderFaults(launch, done)
SHOOTER_DELAY_S = 2, STROKE_S = 2.5, CAT_END_OVER_VA_KT = 15, SETTLE_S = 3, HANDS_ON = 0.1,
COLD_CAT_FACTOR = 0.85, SETTLE_N = 0.3, STOPPER_S = 3, RUN_ACC = 15, RAMP_M = 25, RAMP_DEG = 12,
MIN_RAMP_VA = 0.85, STATION_C (metres to starboard per station)
```

Arcade rules (AGENTS.md rule 1; not catapult or ramp performance):
- Steps are recorded in `launch.stepsDone` with times. Action steps come from their action; `trim` when the
  trim reaches the weight's value; `power` when the throttle is at MIL (≥ 0.95) or the afterburner is lit where
  the data asks for it (Hornet from 49000 lb, Su-33 always). `hookUp` with the launch bar up is refused. A
  salute with any earlier step missing (trim and power checked live) is refused: the shooter holds and
  `errors` gets "Salute refused, the shooter holds: …". Refusals, out-of-order steps (`orderFaults`, checked at
  the end of the stroke), wrong trim, FOD screens, stoppers released without special afterburner and a heavy
  jet on a short ski-jump position are all `errors`.
- Catapult: accepted salute → `shot`; 2 s later the cat fires (`stroke`, phase `roll`): constant acceleration
  for 2.5 s to the approach speed + 15 kt, from a shuttle placed so the stroke ends 3 m short of the bow.
  Power below the need at the shot = `cold cat` (end speed × 0.85). At the end the jet flies 1 m above the deck
  with the AoA for 1.1 g (1.0 g trimmed low, 1.3 g trimmed high), `settle` for 3 s, then `free`. Stick beyond
  0.1 from the shot to the end of the settle sets `handsOn` (catapult jets).
- Ski-jump: the stoppers hold until the afterburner has been lit 3 s (`release`), then the run accelerates at
  15 m/s² × normal / actual weight (× 0.9 without special afterburner, × 0.88 with FOD screens, × 0.6 out of
  afterburner). The last 25 m rise to a 12° ramp; at the bow the jet leaves at 12° with the AoA for 1 g.
  Ramp speed below 0.85 × approach speed = `short run`.
- Cold cat and short run: the AoA is capped at 0.3 g for the rest of the flight: the jet settles into the sea
  ("In the water").
- `outcome` at the end of the stroke: `cold cat` / `short run`, else `sequence error` with any error, else
  `good`; hands on during the settle turns `good` into `sequence error`.

Demo pilot (`demoPilot`, legs `launch` → `climbout`): one step every 0.8 s in the data order (trim in 1°
clicks), power at the power step, salute 1 s after the power is set; hands off through the stroke and settle;
then gear up with a positive climb, flaps to the after-launch setting above Vr + 20 kt, a 20° clearing turn to
the published side (right from catapults 1–2), and a climb to 1500 ft. Clean launches: fa18c normal and heavy
(19°, afterburner), f14b, su33 from position 1 and heavy from position 3.

Grading (`new LaunchEvaluator(data)`, `update(s)`, `score(s): LaunchScore`): sequence (no errors) and shot (no
cold cat; ramp speed at or above the minimum) at the end of the stroke; handsOff (catapult) at the end of the
settle; cleanUp (gear up and flaps at `after.flapLabel` below the takeoff gear limit); clearingTurn (catapult:
10° toward the published side within 30 s; the wrong way or no turn fails); climb (1000 ft above the sea,
climbing, gear up) ends the grade. Total = 100 × passed / expected gates; a crash scores 0 ("Crashed: cold cat,
in the water.").
