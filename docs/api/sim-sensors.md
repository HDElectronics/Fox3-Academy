# sim-sensors API: radar, RWR, launch rules, radar picture

Files: `src/sim/radar.ts`, `src/sim/rwr.ts`, `src/sim/launch.ts`, `src/sim/picture.ts`, tests in
`src/sim/sensors.test.ts`. Everything is driven by `World.step()`. Pages normally use the `World` methods
(`setRadarMode`, `setScan`, `designate`, `lock`, `unlock`, `canLaunch`, `launch`) plus `buildRadarPicture()` and
`ac.rwr`. The extra exports below are for labs and kits that need more detail (why a target is not seen, the
per-jet rules, the scan geometry).

Facts come from `docs/research/*.md` and `src/data/aircraft.ts`. Where this module simplifies DCS, the
"Simplified here" list at the end says so; show those notes in the UI.

## Quick start

```ts
import { World } from '../../sim/world';
import { buildRadarPicture } from '../../sim/picture';
import { explainDetection, cycleDesignation } from '../../sim/radar';

const world = new World();
const me = world.spawnAircraft({ side: 'blue', type: 'f15c', controller: 'player', pos: { x: 0, y: 9000, z: 0 }, heading: 0, speed: 260 });
const bandit = world.spawnAircraft({ side: 'red', type: 'su27', controller: 'ai', pos: { x: 0, y: 8000, z: -70000 }, heading: Math.PI, speed: 250 });

world.setRadarMode(me.id, 'tws');                 // scan is clamped to the jet's TWS limits
world.step(dt);                                   // every frame
const pic = buildRadarPicture(world, me.id, { units: app.units });   // draw this
world.designate(me.id, bandit.id);                // TWS: becomes the PDT (primary)
const chk = world.canLaunch(me.id);               // { ok, reason, targetId, missile, range, dlz }
if (chk.ok) world.launch(me.id);                  // silent TWS AIM-120 shot
bandit.rwr;                                       // what the bandit's RWR shows: [{ state: 'search', ... }]
explainDetection(world, me, bandit).reasons;      // ["In the notch: 12 kt radial speed, gate 54 kt"]
```

## Recorded sensor state

`World.recording` samples each aircraft's `radarContacts` every 0.25 s alongside its existing radar mode,
designation order and STT target. `RecordedRadarContacts` stores echo positions/times and track estimated
positions/velocities, labels, last-hit time, firm/coasting flags. Arrays and position tuples are copied;
later scans cannot change old frames. Target IDs are association keys, not permission to look up truth.
The field is optional so old recordings and synthetic Missile Lab frames remain compatible. An empty
contact list means no contacts; an absent field means no sensor recording. Replays must use the latest
sample at or before the requested time, never interpolate toward a future sensor update.

## radar.ts

### Stepping and state

| Export | What it does |
|---|---|
| `createRadarState(spec)` | Initial `RadarState` (called by `World.spawnAircraft`): RWS, widest azimuth ≤ gimbal, 4 bars if offered. |
| `stepRadar(world, ac, dt)` | One tick: moves the antenna, detects, updates bricks/tracks, STT, ACM, TWS extras. Called by World. |
| `frameTimeFor(spec, azHalf, bars)` | `bars × 2·azHalf / scanRate` (s). `RadarState.frameTime` is kept equal to it in search modes. |
| `barElevation(spec, st, bar)` | Bar elevation, rad rel horizon: `elCenter + (bar − (bars−1)/2)·barSpacing`. Bar 0 is the lowest. |
| `barBand(spec, st, bar)` | `[lo, hi]` elevation band a bar covers. Bands touch, never overlap (one look per frame). Outer bars reach half a beam width. |
| `scanElevationLimits(spec, st)` | `{ top, bottom }` of the whole pattern (rad). Use for altitude coverage and the 3D scan volume. |
| `revisitTime(st)` | Longest gap between two looks at one spot: frameTime, or 2 × frameTime with an odd bar count (sweep direction alternates). |
| `brickLife(st)` | How long an RWS brick stays: `revisitTime + 1 s`. |

Scan model: the beam sweeps `azCenter ± azHalf` at `spec.scanRateDegPerS`, reverses at each edge and steps to the
next bar (`bar = (bar + 1) % bars`). It is horizon-stabilised (pitch and roll do not tilt the pattern).
`beamAz`, `beamEl`, `bar`, `sweepDir` are live.

### Detection

| Export | What it does |
|---|---|
| `detectionRange(world, observer, target)` | m. `detectKm` interpolated head-on → tail by `(1 − cos aspect)/2`, with look-down applied to each endpoint (`lookDownHeadOnFactor` or the fallback `lookDownFactor` for hot, `lookDownFactor` for cold), × `(target.rcsM2 / referenceRcsM2)^0.25` (reference defaults to 5). N-001 retains 68.4 km hot and reduces cold to 26.6 km; N-019M uses its 3 m² reference. |
| `isNotched(world, observer, target)` | `math.inDopplerNotch` with `notchKts` and `notchNeedsLookDown`. |
| `explainDetection(world, observer, target, opts?)` | `{ az, el, range, inGimbal, inAzimuth, inBars, detectRange, lookDown, radialSpeed, notchGate, notched, detectable, reasons[] }`. `reasons` are pilot sentences ("Outside the bars: target 4.1° above the scan"). `opts.units` ('metric' default, or 'imperial') sets the distance unit in the sentences (km / nm); notch speeds stay in kt. For the Radar Lab and the TWS lesson. |
| `paintRange(emitter)` | m an RWR hears this radar: `PAINT_RANGE_FACTOR (1.75) × detectKm.headOn`. |
| `lastPainted(emitter, targetId)` | Last time (s) the beam painted that aircraft, or null. |

A target is detected when, during the tick, the beam crosses its azimuth while it sits in that bar's band,
it is within `detectionRange`, not notched, and passes a probability roll that falls linearly from 1 at 80 % of
detection range to 0 at 100 % (`world.rand()`). Painting (for RWRs) happens on every beam crossing within
`paintRange`, notch or not: notching hides you from the radar, not from your RWR.

### Modes

- **RWS**: each hit replaces that target's brick (`RadarBrick`, measured position with small noise). Bricks age
  out after `brickLife`. No tracks.
- **TWS**: a hit creates a track file (`T1`, `T2`… lowest free number) as tentative (`firm: false`, velocity 0),
  a second hit at least half a frame later makes it firm with a velocity; later hits run an alpha-beta filter.
  Between hits `pos` is extrapolated. A track whose predicted position is looked at (well inside a bar) without
  a hit, or that is older than `1.25 × revisit + 0.5 s`, is `coasting`. It is dropped after `max(3 × frameTime, 2 × revisit, 6 s)`.
  Past `tws.maxTracks`, extra hits show as bricks. Entering TWS clears RWS bricks; leaving it clears tracks.
  Explicit `radar.twsPatterns` lists are authoritative on the Hornet, F-14 and JF-17: unsupported combinations snap to a listed pair, prioritising the changed width or bar count. Otherwise the scan is clamped to `tws.maxAzHalfWidthDeg`, `tws.maxBars` and `tws.maxFrameTimeS` (on entry most jets
  keep azimuth and drop bars; the F-14 keeps bars and narrows azimuth: ±20° 4-bar unless ±40° 2-bar was set).
  With a primary designation, the scan centres on it (az and el) unless `setScan({ autoCenter: false })`.
- **STT**: the beam stays on the target. Degraded when outside the gimbal, beyond detection range, or notched;
  `stt.lostFor` then grows and the track coasts. Past the jet's memory (`radarRules(type).sttMemoryS`: 3 s,
  F-16 2 s, M-2000C 5 s) the lock breaks: `lock` event `what: 'broken'`, `why: 'notched' | 'gimbal limit' |
  'out of range' | 'target destroyed'`, and the radar returns to the search mode it came from. In TWS the lost
  target stays designated (coasting) so it can be relocked; FC3 Russian auto-lock relocks it once the track is fresh.
  Entering STT drops every other track (DCS: STT shows only the locked target) and sets `designated = [target]`.
- **ACM**: auto-locks the nearest target within `ACM_RANGE_M` (10 nm) in a strip ±5° in azimuth and −10°..+50°
  above the nose line (boresight + vertical scan), if `canLock` allows. Unlock leaves ACM for the last BVR mode;
  a broken ACM lock goes back to ACM.
- **VS** (Hornet, F-14 PD SRCH, JF-17): RWS that only shows closing targets (> 30 m/s). Bricks carry a range,
  but the real VS has none: displays should plot closure (`brick.closure`) against azimuth.
- **off**: emits nothing, paints nothing.

| Export | Behaviour |
|---|---|
| `setRadarMode(world, ac, mode, targetId?)` | false if the jet lacks the mode. `'stt'` locks `targetId` (or the STT/primary/nearest contact). STT → TWS keeps the locked target designated on jets with `unlockKeepsDesignation`; FC3 Russian jets clear it. RWS ↔ TWS clears and rebuilds. |
| `designate(world, ac, targetId)` | RWS/VS: lock (STT). TWS: see the per-jet table. STT/ACM/off: no-op. **Designating an already designated track goes STT on F-15C, FC3 Russian and JF-17** (Enter twice); Hornet/F-16/F-14 promote it to primary first. |
| `undesignate(world, ac, targetId)` | Remove one designation (F-15C "Unlock TWS Target"). |
| `cycleDesignation(world, ac)` | Next primary: rotates the list (Hornet swaps L&S/DT2), or with one designation steps to the next firm hostile track by range (Hornet Undesignate, F-16 TMS Right, JF-17 S2 Left). |
| `canLock(world, ac, targetId)` | `{ ok, reason }`: radar on, has STT, target alive, inside gimbal, range ≤ `LOCK_RANGE_FACTOR (0.85) × detectionRange`, not notched. |
| `lockTarget(world, ac, targetId)` | STT if `canLock`. Emits `lock` `locked` (and `unlocked` for a previous STT target). |
| `unlock(world, ac)` | STT → previous search mode (ACM lock → last BVR mode). TWS → drops all designations (F-15C Return To Search/NDTWS); FC3 Russian also drops those tracks. ACM → last BVR mode. |
| `setScan(world, ac, change)` | `ScanChange { azHalf?, bars?, azCenter?, elCenter?, rangeScale?, cursor?, autoCenter? }`. azHalf/bars/rangeScale snap to the jet's options; TWS limits apply (changing only bars shrinks azimuth to fit the frame limit, otherwise bars shrink). FC3 Russian azCenter snaps to −30° / 0 / +30° (three scan positions). Centres clamp so the pattern stays inside the gimbal. |
| `setCursor(world, ac, { az, range })` | Moves only the display cursor (clamped to ±gimbal and the longest range scale). No TWS limits, no scan recompute: call it on every pointer move. `setScan({ cursor })` does the same plus the rest. |
| `hasTrack(ac, targetId)`, `trackOf(st, targetId)` | Track lookup. |
| `guidanceSupport(world, shooter, targetId)` | For missile.ts. `datalink`: STT on the target, or TWS (jets with `launchFromTws`) with a firm track inside the simultaneous-target limit (designated only on F-15C/JF-17). `illuminating`: STT on the target with `lostFor = 0`. `estimate`: the radar's track (clone) when datalink is true. A coasting track (missed revisit, STT memory) keeps sending its **extrapolation**, never the truth (DCS 2.8.7); support ends when the track is dropped, the lock breaks or the radar changes mode. |
| `supportedTargets(world, ac)` | Set of targets whose pre-pitbull ARH missiles get TWS datalink now (firm tracks, ≤ `tws.maxSimultaneousTargets`, designated first). |
| `radarRules(type)` | Per-jet `RadarRules` (below). |

### Per-jet rules (`radarRules(type)`)

| Jet | designations | designate again | list full | auto | launch order | support needs designation | unlock keeps | STT memory |
|---|---|---|---|---|---|---|---|---|
| Su-27, Su-33, J-11A | 1 (replace) | STT | replace | FC3 auto-STT at 85 % Rmax | primary | yes (TWS launch not allowed anyway) | no | 3 s |
| MiG-29S | 1 in СНП; 2 in explicit СНП2 | STT | replace last | Ц2 automatic within 8°; auto-STT only outside СНП2 | primary | yes | no | 3 s |
| F-15C | 4 (PDT + 3 SDT) | STT | ignore | none | ripple PDT → SDTs → PDT | yes | yes | 3 s |
| F/A-18C | 2 (L&S, DT2) | promote (swap), L&S again = STT | replace DT2 | L&S = closest hostile | primary (L&S) | no (any firm trackfile, ≤ 10) | yes | 3 s |
| F-16C | 6 | promote, bug again = STT | ignore | bug scan ±25° 3-bar | primary (bug) | no (≤ 6) | yes | 2 s |
| F-14B | 6 | promote, primary again = STT | replace last | WCS fills 1–6 by range | ripple 1 → 6 | no (≤ 6) | yes | 3 s |
| JF-17 | 2 (HPT, SPT) | STT | replace SPT | none | primary (HPT) | yes | yes | 3 s |
| M-2000C | no TWS | – | – | – | – | – | – | 5 s |

Also on `RadarRules`: `azPositionsDeg` (FC3 Russian scan-centre positions −30 / 0 / +30°, null elsewhere: use it
for the three-position scan buttons instead of hard-coding them), `bugScan`, `twsEntryKeep`, `redesignate`,
`whenFull`, `autoDesignate`, `launchOrder`, `supportNeedsDesignation`, `unlockKeepsDesignation`, `sttMemoryS`.

### Events emitted

- `track` `{ ownerId, targetId, what: 'new' | 'firm' | 'dropped' }`: every track change, including tracks dropped
  by a mode change or by going STT.
- `lock` `{ ownerId, targetId, what: 'locked' | 'unlocked' | 'broken', why? }`.

### Tunables (exported constants)

`REF_RCS_M2 = 5`, `PAINT_RANGE_FACTOR = 1.75`, `LOCK_RANGE_FACTOR = 0.85`, `DETECT_FALLOFF = 0.2`,
`ACM_RANGE_M = 18 520`, `ACM_AZ_HALF = 5°`, `ACM_EL_MIN = −10°`, `ACM_EL_MAX = 50°` (radians in code).

## rwr.ts

`updateRwr(world, dt)` (called by World) rebuilds `ac.rwr: RwrContact[]` for every live aircraft each tick,
sorted most dangerous first (`[0]` is the primary threat):

| state | when | emitter / bearing |
|---|---|---|
| `search` | its beam painted us within `searchHoldTime(emitter) = 1.2 × frameTime + 0.5 s`. RWS and TWS look the same. | the radar aircraft |
| `lock` | it holds us in STT and its beam painted us in the last 0.3 s | the radar aircraft |
| `launch` | a SARH missile of that emitter is guided on us (`guidance === 'sarh'`, lock held), or an ARH missile was fired at us **from STT** by a jet with `sttArhLaunchWarning`, while still pre-pitbull and the lock is held. `missileType` is set. A TWS Fox 3 never gives a launch warning. | the radar aircraft |
| `missile` | an ARH missile with `guidance === 'active'` and `seekerOn` = us; held 1.5 s after the seeker leaves us (chaff hop) so it does not flicker | the missile (`emitterType: 'missile'`, `missileType`) |

`strength` 0..1: search 0.15–0.7, lock 0.5–0.9, launch 0.8–1 (closer = stronger, scaled on `paintRange`),
missile 0.85–1 inside 20 km. `bearing`/`elevation` are relative to the receiver's nose/horizon. `firstSeen` is
kept while the contact persists; `lastSeen` is the last paint for search. An `rwr` event
`{ ownerId, emitterId, state }` fires when a contact appears or escalates (search < lock < launch < missile).
Also exported: `rwrRank(state)`, `searchHoldTime(emitter)`.

## launch.ts

`canLaunch(world, ac, targetId?, missile?) → LaunchCheck` (what `World.canLaunch/launch` use). On failure it still
returns `targetId`, `range` and `dlz` when it got that far. When the **lock is the only thing missing** (a Fox 1
or an FC3 missile on a TWS / СНП track before the auto-lock, or an STT in memory) it also returns `range` and
`dlz` computed from the firm track, so displays can draw the launch zone with the shoot cue off. Rules, in order:

1. Weapon: explicit or `ac.selectedWeapon`, carried by the jet, rounds left.
2. Target: explicit, else `launchTarget()`: STT target; else in TWS a designated target (F-15C/F-14 ripple:
   the designated target with the fewest missiles in the air, in designation order; others: the primary);
   else for IR the nearest hostile inside the seeker cone and IR range. Friendly targets are refused.
3. SARH: STT on the target, not in memory. ARH: STT, or TWS on jets with `tws.launchFromTws` with the target
   designated, firm, not coasting, and a free datalink slot. FC3 Russian R-77: STT only except explicit MiG-29S СНП2.
4. Launch cone: target within `launchConeDeg(missile)` of the nose (data `seekerGimbalDeg`).
5. IR: target within `irAcquisitionRange(missile, aspect)` (seeker range × 0.5 head-on … 1.0 from the tail).
6. Range: `dlzFor()` rmin ≤ range ≤ rmax, computed on the radar's estimate (truth for IR).
7. FC3 Russian (`autoSttAtRmaxFraction` set): no ПР, no launch, beyond that fraction of Rmax.

Reasons are pilot words, units in the jet's default (km for Russian jets, nm for Western):
"Select a missile", "No AIM-7M left", "R-27ER needs a lock (STT)", "R-77 needs a lock (STT) in the J-11A",
"Designate a track first", "Designate T2 first", "T2 is not firm yet: wait for a second hit", "T2 is coasting: no
fresh track", "Datalink full: 4 targets already supported", "Lock in memory: target not tracked",
"T1 64° off the nose: AIM-120C limit 60°", "No IR lock at 12 km: seeker sees this aspect at 10 km",
"Out of range: 42.0 nm, Rmax 35.1 nm", "Too close: 0.6 nm, Rmin 0.4 nm", "No ПР yet: 52 km, ПР at 44 km (85% Rmax)",
"T1 is friendly (IFF)", "Radar is off".

Also exported: `launchTarget(world, ac, missile?)`, `launchConeDeg(missile)`, `irAcquisitionRange(missile, aspect)`.

## picture.ts

`buildRadarPicture(world, ownerId, opts?: { units? }) → RadarPicture | null` (null if the aircraft is missing or dead).

- `modeLabel` from `spec.radar.modeLabels` ('ОБЗ ДВБ', 'LRS', 'PD STT', 'RECH'…).
- `scan`, `gimbalAz`, `cursor` copied from the radar. `altCoverage` = own altitude + cursor range × sin(top/bottom
  of the bar pattern).
- `bricks` (RWS/VS, and TWS hits that got no track file): measured az/range where they were painted, `age`,
  `fade` = 1 − age / brickLife. Not recomputed as you move (like a real B-scope).
- `tracks`: from track estimates relative to you now. Tentative tracks (`firm: false`) have speed/aspect/closure
  0: draw them as bricks. `designation` 'primary' / 'secondary', `designationIndex`, `locked`, `friendly` (IFF),
  and this jet's missiles on that track.
- `stt`: the locked target with `lost: lostFor > 0` (memory).
- `dlz` + `targetRange`: selected weapon vs the locked / primary designated target (or the IR target). Also
  present when only the lock is missing (Fox 1 or FC3 СНП before the auto-lock, STT in memory), with `shootCue` false.
- `shootCue`: `canLaunch` ok; for JF-17 and M-2000C only inside Rne. `launchBlockedReason` says why not.
- `cueLabel` (`cueLabelFor(type, missile)`): 'ПР' (FC3 Russian), '*' (F-15C star, AIM-120/AIM-9) or '▲'
  (F-15C AIM-7 triangle; the F-15C has no SHOOT text), 'SHOOT' (Hornet, JF-17), 'TIR' (M-2000C),
  or empty (Viper and classic Tomcat use geometric cues, not SHOOT / IN RNG text).
- `missilesInFlight`: this jet's live missiles, labelled M1, M2… in launch order, with the target's track label
  ('--' when the radar no longer tracks it), guidance and missile.ts's time-to-active/impact.

## Gotchas

- **Designate twice = STT** on F-15C, FC3 Russian and JF-17 (as in DCS). To remove a designation call
  `undesignate()`; to step targets call `cycleDesignation()`.
- **TWS auto-centring** overrides `azCenter`/`elCenter` from `setScan` while a primary exists. Pass
  `autoCenter: false` for manual scan centring. The F-16 bug scan also changes `azHalf`/`bars` while bugged.
- **FC3 Russian auto-lock**: in СНП with a designated firm track and a selected weapon, the radar goes STT by
  itself at 85 % Rmax. Deselect the weapon (`ac.selectedWeapon = null`) to stop it in a lesson.
- Lock range is 85 % of detection range: a faint brick near max range cannot be locked yet (`canLock().reason`).
- Tracks and bricks carry `targetId` (truth) for picking only; positions are measurements/estimates.
- Internal per-radar state (filter anchors, paint times) lives in a WeakMap keyed by the `RadarState` object:
  do not replace `ac.radar` with a copy.
- The radar uses `world.rand()` (deterministic per seed); calling it from a page changes later detections.

## Simplified here (say so in the UI)

- Detection is a range test with a linear probability edge, not a signal-to-noise model; no PRF (ППС/ЗПС/АВТ,
  HI/MED/INTL) effects, no ECM or burn-through, no terrain masking, no IFF delay.
- The notch is the ground-referenced radial-speed gate from the data (`notchKts`), with no tail-chase
  (zero-Doppler) gate and no range/angle coasting through the notch.
- The scan is horizon-stabilised and ignores bank; RWRs have no elevation blind zones.
- SAM/DTT (F-16, JF-17 in RWS) are simplified to a straight lock; F-14 pulse acquisition and PAL/PLM/VSL are not modelled. СНП2 checks the scenario `jamming` flag; this does not simulate ECM or burn-through.
- STT memory is 3 s where research gives no number.
- ACM is one generic 10 nm strip for all jets.
- VS bricks carry a range the real mode does not have.
- FC3 Russian launch override (LAlt + W) does not exist: no launch before ПР.

## MiG-29S СНП2

`setSnp2(world, ac, enabled)` explicitly selects СНП2 for the MiG-29S. `RadarState.snp2` is false initially
and clears on leaving TWS or acquiring STT. A radar tick automatically selects the nearest eligible second
track within 8° of the designated lead. `snp2Eligibility` checks two live hostile, fresh firm tracks inside
scan coverage, at no more than 3 g, neither with `Aircraft.jamming` set. A pair that stops qualifying drops
to single-target СНП, where normal automatic STT can resume. The jamming flag is a scenario input only.

`canLaunchSnp2(world, ac)` returns `{ ok, reason, targetIds, sepDeg, range, prRange }`; it additionally requires
two selected R-77 rounds, both launch cones and minimum ranges, the lead inside 85% Rmax and Ц2 inside Rmax.
`launchSnp2(world, ac)` validates the entire pair before consuming rounds and returns both missiles or `[]`.
`World.launch` dispatches an explicit СНП2 shot to this atomic pair operation; ordinary СНП cannot fire R-77
from TWS. Shared `guidanceSupport` and `supportedTargets` enforce the pair's radar constraints, so pages need
no missile creation or support override. Existing missiles may still receive a coasting track’s extrapolation; a new pair launch requires fresh tracks. Pair geometry always uses radar track estimates.

`pickSnp2Second(world, ac, lead)` and `snp2SeparationDeg(ac, a, b)` support lesson presentation without
duplicating these rules. Limits follow `docs/research/ru-fc3.md` and the cited FC3 MiG-29 manual; the reported
community solution time is unverified and remains omitted.

`World` exposes `setSnp2`, `canLaunchSnp2`, and `launchSnp2` wrappers. `World.launch` in active СНП2 mode
launches the validated pair atomically and returns its first missile for compatibility; callers that need
both IDs should use `launchSnp2`. `Aircraft.jamming` defaults to false at spawn and is a scenario constraint.
