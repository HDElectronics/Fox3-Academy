# sim-physics — flight, missiles, countermeasures, launch zones

Owner: sim-physics. Files: `src/sim/flight.ts`, `missile.ts`, `missileModel.ts`, `countermeasures.ts`,
`dlz.ts`, `dlzTables.ts` (generated), tests in `src/sim/physics.test.ts` and `tests/tune/*.test.ts`.

Everything here is a **game mechanic tuned to what DCS players see**, not a weapon model (see
ARCHITECTURE.md "Scope"). Missiles are a speed-over-time curve, a turn-rate cap, steer-to-intercept and
rule-based seeker states with dice rolls, fitted to ED's launch table (`data/missiles.ts` `ref`).
When a page shows these numbers, say they are the game's launch-zone values, simplified.

## Public API

### Flight (`flight.ts`)

```ts
stepAircraft(world, ac, dt)   // World calls it every tick for every live jet
availableG(ac): number        // load factor the jet can pull right now (lift-limited below corner speed)
liftVector(ac, out?): Vector3 // unit lift direction ("canopy up") now: BFM lift vector, else from path + roll
sustainedGAt(ac, mach, altM)  // sustained g at full afterburner from data TURN_PERF (not verified)
MIN_ALT_AGL                   // 150: jets never go below world.groundAlt + 150 m
```

Every jet (player, AI, script) flies through `ac.cmd`:

| `cmd` field | Effect |
|---|---|
| `heading` | Banks toward it the short way (roll rate 150°/s); turn rate from the load factor. |
| `maxG` | Caps the pull. Also capped by `perf.maxG`, and by lift below corner speed (`perf.cornerKts`, as EAS): high and slow jets turn poorly. |
| `altitude` | Altitude hold. Climb angle ≤ 18° (military) / 25° (afterburner), less when slow; dives up to 45° (dive to the notch). Clamped to `groundAlt + 150 m` .. `perf.ceilingFt`. |
| `speed` | Autothrottle (idle + speed brake down to −1.5 m/s²). |
| `afterburner` | Allows max thrust. Without it the jet tops out around Mach 0.95–1.05 at altitude. |
| `bfm` | Optional BFM mode (below). Set = heading / altitude / speed / afterburner are ignored. `null` or absent = autopilot. |
| `trigger` | Optional. Gun trigger held (the gun model lands separately; `ac.gun` holds rounds). |

**BFM mode** (`cmd.bfm = { bank, g, throttle, speedbrake? }`, contract added for issue #11): a 3D point-mass
manoeuvre, still arcade.
- `bank` (rad): lift-vector roll angle around the flight path from straight up, + right; π = lift vector on the
  ground. Rolls at 150°/s. Within ~1.8° of the vertical the bank is undefined and the jet holds its roll. Over the
  top of a loop the angle reads π, so a loop is `bank: |ac.roll| > π/2 ? π : 0` with `g: 'max'`.
- `g`: number or `'max'`; capped by `cmd.maxG`, `perf.maxG` and the lift limit below corner speed, never below 0.
- `throttle`: `'idle' | 'mil' | 'ab'`; `speedbrake` adds 60 % parasitic drag.
- No climb or dive clamp (loops, yo-yos, split-S). Floor `groundAlt + 150 m` and the ceiling still apply.
- Energy: induced drag is set each tick so that full afterburner gives zero specific excess power exactly at the
  jet's sustained g (`data/wvr.ts` `TURN_PERF`, trainer estimate). Above it the jet bleeds, below it accelerates.
- `ac.roll` = the flown lift-vector bank; `pitch` and `heading` follow the velocity. Clearing `bfm` hands the jet
  back to the autopilot, which eases the path angle back into its climb/dive limits.
- The autopilot's energy model is unchanged (BFM-only drag setting), so AI, DLZ and tuning results are not affected.

Energy feel: hard turns bleed speed (a max-g 180° at 5 km loses about 100 m/s at military power), climbs
trade speed for height, thin air lets the jet go faster. Each jet's drag is set so that with afterburner it
tops out at `perf.maxMach` at 11 km. At sea level jets top out at about M1.0–1.2.
Outputs: `pos`, `vel`, `heading`, `pitch` (= flight-path angle), `roll` (visual bank; beyond ±90° when
pulling down inverted), `g`. No allocations per tick.

### Missiles (`missile.ts`)

```ts
createMissile(world, shooter, type, targetId, opts?): Missile  // World.launch() calls it; opts.loft = false: no loft
stepMissile(world, m, dt)                                // World calls it every tick
missileSpeed(m): { speed, mach }                         // display helper
notchState(world, m): NotchState | null                  // read-only seeker notch view for displays
```

`notchState` (null for IR missiles, dead missiles, or nothing to track) reports the seeker's Doppler notch
against the aircraft it tracks (or lost in the notch): `targetId`, `gateMps` (this geometry's gate),
`radialMps`, `lookDown`, `inNotch`, `depth` (0..1, what chaff scales with), `heldS` / `holdS` (time in
the gate so far / time that breaks the seeker) and `lost` (the seeker has lost it in the notch). Displays
(Defense page Doppler gauge) read it instead of mirroring `missileModel` numbers.
Defense consumes `notchState(world, missile)` directly for the seeker gate, depth and hold timer.
Its drill metrics still accumulate total time in a useful gate, but do not mirror the seeker's private
timer or the SARH grace constant. The displayed signed radial direction is a gauge presentation aid.

Guidance support comes from `world.supportOverride?.(m) ?? radar.guidanceSupport(world, shooter, m.targetId)`.

**Guidance states** (`m.guidance`):

| State | Rule (as DCS plays it) |
|---|---|
| `sarh` | Homes only while the shooter illuminates (`sup.illuminating`, i.e. holds STT and tracks). While the shooter's STT is in memory (notch, gimbal, range: `stt.lostFor > 0`, not yet broken) it flies on its memory of the target and loses nothing. Once there is no lock at all, a relock within 1.5 s saves the shot ("relock quickly and the missile continues"); after that it goes `ballistic` for good and emits `seeker-lost` `lost-guidance`. A ballistic missile never chases chaff. |
| `datalink` | ARH midcourse: `aimPos`/`aimVel` follow `sup.estimate` (the shooter's track). |
| `inertial` | ARH midcourse with no updates: flies to the extrapolated aim point. Emits `datalink-lost` once (why: `shooter lost the track` / `shooter destroyed`). Goes back to `datalink` if support returns. |
| `active` | Pitbull: within `pitbullKm` (data) of the aim point it turns its seeker on (event `pitbull`). It takes the aircraft closest to the aim point inside a 10° cone (any jet except the shooter, friendlies included, as in DCS), or chaff if nothing else is visible there. Nothing found: it keeps searching until it passes the aim point, then misses `no-acquisition`. Launched inside pitbull distance, or with no target (maddog): active off the rail. |
| `ir` | Homes on its locked target. A boresight shot with no target takes the first jet in its cone. |
| `ballistic` | No guidance; gravity bends it down. |

**Phoenix launch modes:** `createMissile` captures `launchRadarMode` and `phoenixLaunchMode`
on the missile. For AIM-54A/C, TWS uses datalink then active; PD-STT uses `sarh` to impact and
produces the shooter's launch warning while its lock is held. P-STT, PH ACT, or a target inside
10 nm launches active without loft. These are DCS gameplay rules from
[`tomcat-thunder-mirage.md`](../research/tomcat-thunder-mirage.md), not a detailed sensor model.
`RadarState.phoenixLaunchMode` selects P-STT only while the radar is actually in STT, or PH ACT
in any supported launch mode; otherwise the actual radar mode determines PD-STT versus TWS.
The standalone Lab may pass `opts.phoenixLaunchMode` explicitly. Changing the shooter's selection
after launch never changes a missile already in flight. TGTS selection and separate pulse-radar
detection behavior remain simplified (NORM active distance).

**Defences:**
- **Notch.** Active and semi-active seekers lose the target after it has sat in the Doppler gate for 0.6 s. The test is `math.inDopplerNotch` from the missile position; the gate is ~25–32 m/s per missile in look-down, ×0.4 in look-up, and narrower inside 8 km. The missile then flies to the extrapolated memory point. It can re-acquire if the target leaves the gate while still in its cone, else it misses `notched`.
- **Chaff.** A bundle inside a 6° cone and within 700 m of the tracked (or notched) target, while the missile is inside 12 km, gets one roll: `chaffSusceptibility × 0.35 × notch depth`. Depth is 1 at zero radial speed, 0.5 at the gate edge and 0 at twice the gate, so head-on chaff does nothing. If the roll succeeds the seeker locks the chaff, `seeker-lost` `chaff`, and the missile misses `chaff`.
- **Flares vs IR.** Each flare near the target, with the missile inside 5 km, rolls `0.5·ccm/(ccm+0.5)` (×0.6 with afterburner on), where ccm is the Lua ccm_k0: AIM-9X 0.2, most 0.5, Magic II 1.
- **Energy.** The missile gives up below its minimum speed (`kinematic`), after its battery time (`timeout`), or when a target it chases keeps opening for 2 s after burnout (`kinematic`).

**Hit:** swept closest approach ≤ 15 m (any jet except the shooter, after 0.6 s arming). The missile calls
`world.kill(target, shooterId)`, sets `result = {kind:'hit'}`, and emits `hit`.

**Miss reasons:** `kinematic`, `timeout`, `ground`, `target-dead`, `notched`, `chaff`, `flare`,
`lost-guidance`, `no-acquisition`, `overshoot` (tracked to the end but out-turned / passed). The reason is
the defence that beat the seeker when there was one. A missile that ends sets `alive = false` and stays in
`world.missiles`.

**Display fields**, updated every step: `timeToActive` (ARH before pitbull, else null), `timeToImpact`
(null when ballistic), `closestApproach` (to the intended target), `lofting`, `motorLeft`, `mass`,
`seekerOn` (aircraft id, chaff/flare id, or null), and `aimPos`/`aimVel` (datalink estimate, inertial
extrapolation, or what the seeker tracks).

### Tuning constants (`missileModel.ts`)

```ts
missileModel(id): MissileModel     // memoised per missile type; fields documented in the file
decayFactor(model, alt): number    // K in dv/dt = -K·v²
REF_SPEED (250 m/s), REF_HIGH_ALT, REF_MID_ALT, REF_LOW_ALT, CHAFF_SCALE, LOFT_FLAT_SHARE
midHeadOnKm(id)                    // ED's 5 km head-on value (research table; not in data)
calibrate(spec, corr, batteryS, lofting, midKm)   // the fit (pure)
TUNED, setTuneOverride(id, corr)   // tuner output / hook
```

### Countermeasures (`countermeasures.ts`)

```ts
dropChaff(world, ac): boolean   // false if empty or within DISPENSE_INTERVAL_S (0.12 s) of the last one
dropFlare(world, ac): boolean
stepCountermeasures(world, dt)
CHAFF_LIFE_S (5), FLARE_LIFE_S (4), DISPENSE_INTERVAL_S
```

Chaff leaves at the jet's speed and slows almost to a stop within about a second (time constant 0.3 s),
then sinks at 3 m/s. That is why it decoys only a jet in the notch. Flares slow down, fall (up to 45 m/s)
and burn out after 4 s.

### Launch zones (`dlz.ts`)

```ts
dlzFor(shooterPos, shooterVel, targetPos, targetVel, missile): Dlz   // FAST: table lookup, call every frame
simulateShot(setup: ShotSetup): ShotResult                          // one 60 Hz flight, ~5–20 ms
findRange(base, 'rmax' | 'rne', { dt?, tol?, guess? }): { range, tof } // exact Rmax / Rne by bisection
shotHits(setup, dt?): { hit, tof, reason }                           // quick hit/miss, no trace
DLZ_GRID, gridTargetAlt(shooterAlt, offset)                          // generator grid
```

`Dlz` returned by `dlzFor`: `rmax` (target keeps flying as it is), `rne` (target turns cold at launch
and runs with afterburner), `rmin` (gameplay minimum: Lua `D_min`, up to 1.6× against a cold target),
plus `rpi = rmax` and `rtr = rne` for F-15C-style labels. The lookup:
1. Interpolates the tables (shooter altitude 0.5–15 km, shooter Mach 0.5–1.5, aspect 0–180°, target
   altitude offset ±6 km; IR missiles on a coarser grid).
2. Corrects for target speed (range ± Δv·cos(aspect)·time of flight).
3. Takes off up to 30% when the shooter's nose is off the target (a crank shot is shorter).
4. Rescales if `data/missiles.ts` `ref` changed after the tables were generated.

Assumes the shooter supports the missile to the end.

`ShotSetup`: `missile, shooterAlt, shooterMach, targetAlt, targetMach, range, aspectDeg (0 hot..180 cold),
maneuver ('none' | 'turn-cold' | 'beam' | 'crank' | 'notch-chaff'), reactAfter?` (s), plus optional
`shooterType?` (default first missile carrier; the Lab supplies the selected carrier),
`seed?` (chaff/flare dice and the pilot's beam error), `targetType?` (default `dlzTargetType(missile)`)
and `loft?` (`false` flies the shot without the loft, a what-if that leaves the model untouched; no need
for `setTuneOverride`). `support?: 'perfect' | 'radar'` defaults to perfect support for existing
comparisons. `phoenixLaunchMode?: 'tws' | 'pd-stt' | 'p-stt' | 'ph-act'` defaults to TWS for
standalone Phoenix shots.

```ts
platformsFor(missile): { shooter, target }   // the jets the DLZ tables were flown with
dlzTargetType(missile): AircraftId           // = platformsFor(missile).target: F-15C for Russian/Chinese missiles, Su-27 for the rest
```

The scripted target flies each manoeuvre after `reactAfter`:
- `turn-cold`: runs directly away from the shooter with afterburner.
- `beam`: puts the missile at 3/9 o'clock.
- `crank`: puts the shooter 55° off the nose.
- `notch-chaff`: beams the missile, dives 4 km, and drops one chaff a second (flares against IR missiles) once the missile is inside 15 km.

A pilot is never exactly on the beam: the seed adds a heading error of up to ±6° (±5° in the crank).
The shooter points its nose at the target at launch (as the DLZ assumes), then flies straight.
With default `support: 'perfect'`, lock and datalink remain perfect. With `support: 'radar'`, the
shot starts from an acquired track and steps the same radar used in a World. A target may break
support through the radar notch, range or gimbal limits. Against a semi-active shot, `beam` and
`notch-chaff` then beam the shooter; active and IR shots continue to beam the missile.

`simulateShot` requires IR acquisition using `irAcquisitionRange` and the actual launch aspect.
A shot beyond that simplified acquisition limit returns `reason: 'no-ir-lock'`, zero flight time,
empty paths/trace/events, no pitbull and no missile launch. Radar support unable to acquire at the
initial geometry returns the same empty result with `reason: 'no-radar-lock'`.
The Lab shows a NO LAUNCH explanation instead of creating an empty replay.
`shotHits`, `findRange` and the offline DLZ tables intentionally remain kinematic reach calculations:
they do not gate IR acquisition. `shotHits`/`findRange` accept the support and Phoenix options,
while the Lab's range marks and Compute exactly use their default perfect-support/TWS assumptions.

`ShotResult`: `hit, reason, timeOfFlight, trace[]` (every 0.25 s: `t, range, missileAlt, missileMach,
targetAlt, guidance`), `missilePath, targetPath, shooterPath` (Vector3 at the same samples),
`impactMach` (null on a miss), `missDistance`, `pitbull` (`{t, pos}` or null), `events` (the shot's
SimEvents: launch, pitbull, seeker-lost, datalink-lost, cm, hit/miss, kill; t = seconds from launch).

### Usage

```ts
// Missile Lab: fly one shot and plot it
const r = simulateShot({ missile: 'aim120c', shooterAlt: 10000, shooterMach: 0.9, targetAlt: 9000,
  targetMach: 0.85, range: 60000, aspectDeg: 0, maneuver: 'turn-cold', reactAfter: 8 });
r.trace.forEach(s => plot(s.t, s.missileMach));

// "compute exactly": each findRange is ~10–40 flights (50–400 ms); run it in a setTimeout slice
const { range: rmax } = findRange({ missile: 'r27er', shooterAlt: 8000, shooterMach: 0.9, targetAlt: 8000,
  targetMach: 0.9, aspectDeg: 0 }, 'rmax');

// Radar display / launch rules: every frame
const dlz = dlzFor(me.pos, me.vel, bandit.pos, bandit.vel, 'r27er');
```

## Achieved vs reference ranges

Reference geometry (ED's launch table, research section A): shooter and target both at 900 km/h
(250 m/s TAS), same altitude. **ref** = `data/missiles.ts` `ref` (10 km and 1 km) or ED's 5 km value
(research table, `midHeadOnKm`); **sim** = Rmax found by flying the full model at 60 Hz (`findRange`);
**DLZ** = what `dlzFor` returns at the same geometry. Worst error on the three data references: **4.7 %**.

| Missile | 10 km head-on ref / sim / DLZ | 10 km fleeing ref / sim / DLZ | 1 km head-on ref / sim / DLZ | 5 km head-on ref / sim | Rne 10 km hot (sim) | peak Mach | flight time |
|---|---|---|---|---|---|---|---|
| R-27R | 35 / 35.0 (+0%) / 34.8 | 12 / 12.0 (+0%) / 12.0 | 16 / 16.0 (+0%) / 16.0 | 21 / 21.0 (-0%) | 16.2 | 3.8 | 60 s |
| R-27ER | 59 / 56.8 (-4%) / 56.6 | 27 / 27.0 (+0%) / 26.8 | 25.5 / 25.5 (+0%) / 25.3 | 35 / 34.9 (-0%) | 28.8 | 4.4 | 60 s |
| R-27T | 31 / 30.9 (-0%) / 30.9 | 11 / 11.0 (+0%) / 10.9 | 14 / 13.9 (-0%) / 13.9 | 19 / 19.0 (-0%) | 15.0 | 2.7 | 40 s |
| R-27ET | 58 / 55.3 (-5%) / 55.2 | 25.5 / 25.5 (+0%) / 25.2 | 24 / 24.0 (+0%) / 24.0 | 33 / 33.0 (-0%) | 27.4 | 4.4 | 60 s |
| R-77 | 45 / 44.8 (-0%) / 44.8 | 18 / 18.0 (+0%) / 17.9 | 17.7 / 17.7 (+0%) / 17.6 | 25 / 24.9 (-0%) | 20.5 | 3.4 | 54 s |
| R-73 | 27 / 26.9 (-0%) / 26.9 | 12 / 11.9 (-0%) / 11.9 | 11 / 11.0 (+0%) / 10.9 | 15 / 15.0 (-0%) | 16.5 | 2.4 | 30 s |
| AIM-120B | 65 / 64.7 (-0%) / 64.9 | 19.5 / 19.4 (-0%) / 19.4 | 21.5 / 21.5 (+0%) / 21.4 | 33 / 33.4 (+1%) | 22.2 | 4.0 | 80 s |
| AIM-120C | 75 / 75.0 (+0%) / 74.4 | 21.5 / 21.5 (-0%) / 21.5 | 25 / 25.0 (+0%) / 24.9 | 35 / 34.6 (-1%) | 22.6 | 3.6 | 100 s |
| AIM-7M | 38 / 37.8 (-0%) / 37.9 | 12 / 12.0 (+0%) / 12.0 | 19 / 19.0 (+0%) / 19.0 | 27 / 26.9 (-0%) | 15.8 | 2.7 | 75 s |
| AIM-9M | 27 / 26.9 (-0%) / 26.8 | 10 / 10.0 (+0%) / 9.9 | 10.5 / 10.5 (+0%) / 10.4 | 15.5 / 15.5 (+0%) | 14.8 | 2.3 | 34 s |
| AIM-9X | 27 / 27.0 (+0%) / 26.8 | 10 / 10.0 (+0%) / 9.9 | 10.5 / 10.5 (-0%) / 10.4 | 15.5 / 15.5 (-0%) | 14.8 | 2.3 | 34 s |
| AIM-54A | 120 / 120.0 (+0%) / 119.2 | 46 / 45.8 (-0%) / 45.5 | 44 / 44.0 (+0%) / 43.8 | 72 / 73.3 (+2%) | 36.5 | 3.4 | 200 s |
| AIM-54C | 120 / 120.0 (+0%) / 119.2 | 46 / 45.8 (-0%) / 45.5 | 44 / 44.0 (+0%) / 43.8 | 72 / 73.3 (+2%) | 36.5 | 3.4 | 200 s |
| SD-10 | 80 / 80.0 (+0%) / 79.4 | 25 / 25.0 (+0%) / 24.9 | 25 / 25.0 (+0%) / 24.9 | 37 / 37.6 (+2%) | 26.4 | 4.2 | 100 s |
| PL-5EII | 27 / 27.0 (+0%) / 26.8 | 10 / 10.0 (+0%) / 9.9 | 10.5 / 10.5 (-0%) / 10.4 | 15.5 / 15.5 (+0%) | 14.8 | 2.3 | 34 s |
| Super 530D | 46 / 43.8 (-5%) / 43.8 | 18 / 18.0 (+0%) / 18.0 | 19 / 18.9 (-0%) / 18.9 | 28 / 29.4 (+5%) | 23.1 | 4.8 | 45 s |
| Magic II | 16 / 15.9 (-0%) / 15.6 | 6 / 6.0 (+0%) / 5.7 | 7.5 / 7.5 (-0%) / 7.3 | 10 / 10.0 (-0%) | 10.9 | 1.9 | 20 s |

Notes:
- **R-27ER / R-27ET / Super 530D, 10 km head-on (−4 to −5 %).** With a flight-time limit T, head-on
  minus tail range can be at most 2 × target speed × T. ED's table implies 64 s (R-27ER/ET) and 56 s
  (530D), but the DCS batteries are 60 s and 45 s. The battery was kept.
- **Magic II** needed about 12 % more boost than data `maxMach` suggests to reach its tail reference.
- **Rne** (target starting hot, turning cold at launch with afterburner) is not in ED's table. It comes
  out a little above the fleeing-target Rmax, because the target has to turn first. The Phoenix is the
  exception: its long flight lets a Flanker on afterburner run away.

Defensive outcomes, `simulateShot` at 30 km, 10 km altitude, target reacts after 3 s, 12 seeds (seeds
change the pilot's beam error and the chaff dice). Perfect shooter support throughout:

| Missile (30 km, 10 km alt, 12 seeds) | none | crank | beam | notch-chaff | turn-cold |
|---|---|---|---|---|---|
| aim120c | 12/12 hit | 12/12 hit | 8/12 hit (notched 4) | 1/12 hit (chaff 6, notched 2, overshoot 3) | 0/12 hit (kinematic 12) |
| r77 | 12/12 hit | 12/12 hit | 6/12 hit (notched 6) | 0/12 hit (chaff 7, kinematic 4, notched 1) | 0/12 hit (kinematic 12) |
| r27er | 12/12 hit | 12/12 hit | 10/12 hit (notched 2) | 0/12 hit (chaff 10, overshoot 1, timeout 1) | 12/12 hit |
| aim54c | 12/12 hit | 12/12 hit | 11/12 hit (notched 1) | 5/12 hit (chaff 6, notched 1) | 12/12 hit |
| sd10 | 12/12 hit | 12/12 hit | 11/12 hit (notched 1) | 7/12 hit (chaff 4, notched 1) | 0/12 hit (kinematic 12) |

That is the DCS lesson the model is built to teach:
- Straight or cranking targets die.
- A beam alone works sometimes.
- Beam + dive + chaff beats most shots, SARH missiles most easily.
- Turning cold beats a missile only when it runs out of energy (AMRAAM, R-77 and SD-10 at 30 km, but not the long-burning R-27ER or Phoenix).

## Tuning workflow (offline, TUNE=1 only)

```
TUNE=1 FIT=1 npx vitest run tests/tune/model-fit.test.ts        # refit TUNED in missileModel.ts (~10 s)
TUNE=1 npx vitest run tests/tune/dlz-tables.test.ts             # regenerate dlzTables.ts (~2–3 min)
TUNE=1 npx vitest run tests/tune/ranges-report.test.ts --disableConsoleIntercept   # print the table above
```

Run them in that order after changing `missileModel.ts`, `missile.ts` kinematics, or `data/missiles.ts`
(`burnS`, `maxMach`, `maxG`, `ref`, `lofts`). `MISSILES=aim120c,r77` limits a run to some missiles.
Without a re-run, the model still follows new `ref` values through `calibrate()`, and `dlzFor` rescales
the old tables. Both are approximations.

## Known gaps / simplifications

- **A fit, not physics.** Each missile's speed curve is fitted to ED's table:
  - boost from data `maxMach` (×0.85 peak at 10 km, corrected where needed);
  - decay K(σ)·v² through three altitude points;
  - a give-up speed (170–340 m/s) or a shortened flight time.

  So some parameters look odd: a short-range IR missile "gives up" at about Mach 1 or ends after 20–34 s. Ranges between and beyond the reference points (other speeds, 15 km+, big altitude gaps) are the model's extrapolation, not ED data.
- **ED's table is the target, not DCS's 6-DOF missiles.** Research notes the in-game missile may fly
  farther or shorter than the table. Community tests (research B) were not fitted.
- **Loft** is a generic climb–cruise–dive:
  - its strength per missile is a tuning factor (AMRAAM capped at the base shape, Phoenix and SD-10 small);
  - low-altitude launches loft much less (to keep ED's 1 km numbers);
  - the steep rise of AMRAAM range between 5 and 7.5 km is partly the loft switching in;
  - SD-10 lofts here because data says `lofts: true` (research: AI shots were seen flat).
- **Notch / chaff / flares** use gameplay picks. ED does not publish these formulas.
  - Notch gate 25–32 m/s in look-down, ×0.4 in look-up, halved inside 8 km, 0.6 s hold. The missile sees ground clutter whenever the target is 50 m or more below it (`math.isLookDown`).
  - Chaff: `chaffSusceptibility × 0.35 × depth` per bundle, inside 12 km.
  - Flares: from ccm_k0, inside 5 km.
- **Not modelled:** home-on-jam and ECM, the R-27 multi-target gate and glint (2.9.20+), seeker gimbal
  rates, HPRF/MPRF steps, a probability of kill (inside 15 m always kills), fuel, AIM-54 TGTS switch
  (Phoenix uses NORM), separate P-STT radar detection, ED's `D_max`-style per-launch pitbull logic.
- **Radar support is optional in `simulateShot`.** Perfect support remains the default for repeatable
  reach comparisons. The Lab's Radar model option lets a semi-active shot lose the shooter's lock.
- **dlzFor:**
  - it is an interpolation of 800-cell tables (IR: 90 cells, coarse), with first-order corrections for target speed and nose-off angle;
  - inputs outside the grid are clamped (above 15 km altitude, Mach 0.5–1.5, offsets beyond ±6 km);
  - a few low-and-slow IR cells, and some low R-27R/AIM-7 climbing shots, are empty (genuine no-shot geometry in the model), where Rmax falls back to Rmin.
- **Flight model:**
  - BFM sustained-turn tables are trainer estimates (not verified); the autopilot does not use them;
  - every jet has the same thrust-to-weight (≈1), climb-angle limits and roll rate; jets differ only by `perf` (maxMach, maxG, corner speed, ceiling);
  - no fuel, no stall or departure (speed floor 60 m/s), no AoA (pitch = flight-path angle);
  - acceleration to top speed is on the quick side (M0.9 → M1.5 at 11 km in 40–70 s).
- **Private state.** A missile's private state lives in a module WeakMap. A cloned or deserialised
  `Missile` restarts its seeker memory (grace timer, notch timer, rolled decoys). Use `notchState()` to
  read the notch part from a page.
- **Stale data.** If `data/missiles.ts` changes, `calibrate()` follows the new `ref` values automatically. The fitted
  correction factors and the DLZ tables do not (dlzFor rescales by the ref ratio). Re-run the tuner
  and generator for exact numbers.
