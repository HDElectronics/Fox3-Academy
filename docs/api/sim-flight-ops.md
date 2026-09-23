# Flight-ops sim (`src/sim/flightOps`)

Arcade model, demo pilot and grading for the airfield pattern and approach trainer (issue #19). Separate from
the BVR `World`. Contract: `src/sim/flightOps/types.ts`. Facts: `src/data/flightOps.ts` (`FLIGHT_OPS`,
`FLIGHT_OPS_CAVEATS`). Gameplay only (AGENTS.md rule 1): no aerodynamic or engine tables.

Runway frame (metres): origin at the landing threshold, x east, y up (wheel height), z south; landing
direction is −z; left-hand pattern with the downwind at x < 0.

## Model (`model.ts`)

```ts
createFlightOpsState(id, start: 'initial' | 'downwind' | 'final' | 'runway', data?): FlightOpsState
stepFlightOps(s, input: FlightOpsInput, dt, data?): void   // mutates s; use FLIGHT_OPS_DT = 1/60
applyAction(s, action: FlightOpsAction, data?): void        // gear, flaps, speed brake
configWarnings(s, data): { overspeed: 'gear' | 'flaps' | null }
aoaCue(s, data): 'slow' | 'on' | 'fast'                     // above band = slow
loadFactor(s, data), aoaForLoad(s, data, n), approachSpeedMs(data), aimPointM(data), flapsFollowGear(data)
```

- Starts: `initial` 2 nm south on the centreline at the initial altitude and speed, clean; `downwind` abeam
  midfield, configured, 1.1 × approach speed; `final` 1.5 nm on the glide path, on speed; `runway` stopped
  at the threshold with takeoff flaps. Air starts are trimmed for 1 g.
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
- Overspeed never damages the jet; `configWarnings` reports gear (or landing flaps) above the gear limit.

## Demo pilot (`pilot.ts`)

```ts
demoPilot(s, data): FlightOpsInput & { actions: FlightOpsAction[] }
demoLeg(s): 'initial' | 'break' | 'downwind' | 'turn' | 'final' | 'rollout' | null
onSpeedTargetMs(data), finalTurnGeometry(data)
```

Flies the left-hand overhead from `initial` (or joins at `downwind` / `final`) to a stop: breaks 7 s past
the threshold at the break g (F-16 speed brake out), lowers gear and landing flaps below the gear limit,
tracks the abeam distance, flies a descending semicircle to a straight final (at least 0.75 nm) and holds
the glide path with the stick and the AoA band with the throttle. Leg memory is a `WeakMap` per state;
apply `actions` with `applyAction` before `stepFlightOps`. The F-15C's faster approach widens the final turn
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
