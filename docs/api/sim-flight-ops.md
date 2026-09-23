# Flight-ops sim (`src/sim/flightOps`)

Arcade model, demo pilot and grading for the airfield pattern and approach trainer (issue #19). Separate from
the BVR `World`. Contract: `src/sim/flightOps/types.ts`. Facts: `src/data/flightOps.ts` (`FLIGHT_OPS`,
`FLIGHT_OPS_CAVEATS`). Gameplay only (AGENTS.md rule 1): no aerodynamic or engine tables.

Runway frame (metres): origin at the landing threshold, x east, y up (wheel height), z south; landing
direction is −z; left-hand pattern with the downwind at x < 0.

## Model (`model.ts`)

```ts
createFlightOpsState(id, start: 'initial' | 'downwind' | 'final' | 'runway' | 'rtb' | 'takeoff', data?): FlightOpsState
stepFlightOps(s, input: FlightOpsInput, dt, data?): void   // mutates s; use FLIGHT_OPS_DT = 1/60
applyAction(s, action: FlightOpsAction, data?): void        // gear, flaps, speed brake, navModeCycle, navPointCycle
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
