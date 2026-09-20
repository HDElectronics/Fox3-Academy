# sim-ai: AI pilots and scenario builders

Files: `src/sim/ai.ts` (AI pilots, scripted drill targets), `src/sim/scenarios.ts` (ready-made setups for pages),
`src/sim/ai.test.ts`.

Pages normally use only **scenarios.ts** plus the `World` API. They reach into **ai.ts** only to reconfigure an AI
(`configureAi`), to read what it is doing (`aiStatus`), or to change a drill target's manoeuvre (`setManeuver`
in scenarios.ts is the friendlier wrapper).

---

## Quick start

```ts
import { World } from '../../sim/world';
import { duel, twsDrill, defenseDrill, radarLab } from '../../sim/scenarios';

const world = new World(seed);                                // one fresh World per scenario
const e = duel(world, app.aircraft, undefined, 'veteran');    // 1v1 at 100 km vs the default adversary
const me = world.get(e.playerId)!;                            // 'player', side blue, controller 'player'
world.on(ev => { if (ev.type === 'ai') log(ev.text); });      // "Bandit-1 locks you and fires an R-27ER from 21 nm"
// each frame: fly the player through me.cmd, then world.step(dt)
```

`world.step()` runs the AI automatically: `World.tick` calls `thinkAi()` for every live aircraft with
`controller: 'ai'`. Nothing else is needed.

---

## scenarios.ts

All builders expect a **fresh World** (ids are fixed). The player always starts at `x = 0, z = 0`, heading north
(`0` rad), side `'blue'`, `controller: 'player'`, callsign `'You'`, default loadout from `AIRCRAFT`. "Ahead" is `−z`.
Every builder takes `ScenarioCommon` options:

| option | default | meaning |
|---|---|---|
| `units` | jet's units | units in the AI event text (`'metric'` km, `'imperial'` nm) |
| `playerAlt`, `playerMach` | `cruiseFor(type)` | player start state |
| `playerCallsign` | `'You'` | label |
| `playerStores` | jet loadout | override the loadout |
| `playerRadarMode` | RWS | radar mode at spawn |

Fixed ids: `PLAYER_ID = 'player'`, `WINGMAN_ID = 'wingman'`, `banditId(n) = 'bandit' + n`, the drill shooter is
`'shooter'`, radar-lab targets are `'target1'…`. Enemy callsigns are `Bandit-1`, `Bandit-2`… in every scenario.

### Engagements (sortie)

```ts
duel(world, playerType, enemyType = defaultAdversary(playerType), skill = 'regular', opts?): Engagement     // 1v1
pair(world, playerType, enemyType?, skill?, opts?): Engagement                                               // 1v2
twoVTwo(world, playerType, enemyType?, skill?, opts?): Engagement                                            // 2v2 + AI wingman
```

```ts
interface Engagement {
  playerId: EntityId;
  wingmanId: EntityId | null;   // 'wingman' in twoVTwo
  friendIds: EntityId[];        // blue AI (the wingman), not the player
  enemyIds: EntityId[];         // ['bandit1'] or ['bandit1', 'bandit2']
  enemyType: AircraftId; skill: AiSkill; range: number;
}
```

`EngagementOptions` (plus `ScenarioCommon`):

| option | default | meaning |
|---|---|---|
| `range` | 100 000 m | start separation, head-on |
| `offsetDeg` | 0 | bandit group bearing off your nose (+ right) |
| `enemyAlt`, `enemyMach` | `cruiseFor(enemyType)` | bandit start state |
| `enemyStores` | loadout | override bandit loadout |
| `formation` | `'abreast'` | pair: 5 km line abreast, or `'trail'` (8 km) |
| `gci` | `true` | AI has a GCI/AWACS picture for steering (see AI below) |
| `holdFire` | `false` | AI flies the fight but never shoots |
| `evade` | `true` | AI defends against missiles |
| `wingmanType`, `wingmanSkill` | your jet, `'veteran'` | 2v2 wingman |

The wingman flies 3 km off your right wing. It stays in formation until its own sensors (or a GCI contact inside
70 km) find a bandit, then fights on its own and **sorts**: it prefers a bandit that you (your STT target or
primary designation) or other friends are not already targeting. The red pair sorts the same way.

### TWS drill

```ts
twsDrill(world, playerType, opts?: TwsDrillOptions): TwsDrill
interface TwsDrill { playerId; banditIds; enemyType; setManeuver(id, maneuver: ScriptManeuver): void }
```

Four **scripted** bandits in the original lesson's spread: 70–100 km, lateral ±22 km, altitude offsets
+0.6/−1.0/+2.0/−0.4 km from you, flying hot and parallel (heading south). They never shoot. Options:
`enemyType`, `range` (mean, default 80 km), `spread` (lateral multiplier), `maneuver` (default `'straight'`),
`banditMach`, `banditRadar` (default `'rws'`: they search, so your RWR shows them), `evade` (default `false`;
with `true` they notch the missile once its seeker goes active, which is how DCS AI reacts to a TWS Fox 3),
`skill`.

Notch toggle: `drill.setManeuver(id, 'beam')` (turns to put you at 3/9 o'clock: zero closure, into the notch),
back with `'hot'` (points at you) or `'straight'` (holds its current heading). Each change emits an `ai` event
("Bandit-2 turns to beam you: zero closing speed, into the notch").

### Defence drill

```ts
defenseDrill(world, playerType, threat = defaultThreatMissile(playerType), geometry: DefenseGeometry, opts?): DefenseDrill
```

A scripted shooter (`'shooter'`, callsign `Bandit-1`) carrying only `threat` finds you, sets up its radar the way its
jet does it, fires at `geometry.range`, and supports the missile correctly: cranks to its skill's angle inside the
gimbal, **holds STT to impact for SARH**, **holds the track until pitbull for ARH**, then pumps cold and leaves. It
never defends and never fires more than `opts.shots` (default 1).

| `DefenseGeometry` | default | meaning |
|---|---|---|
| `range` | required | launch range, m |
| `aspectDeg` | 0 | your aspect as the shooter sees you: 0 = you fly at it, 90 = beam, 180 = cold |
| `side` | `'right'` | the shooter sits off your right (or left) side for a non-zero aspect |
| `shooterAlt`, `shooterMach`, `playerAlt`, `playerMach` | cruise | start states |
| `mode` | `'auto'` | `'auto'` = the jet's real method; `'stt'` forces a lock (lock + launch warning); `'tws'` a silent TWS shot where the jet can |

`opts`: `shooterType` (default: the first opponent jet that carries `threat`, see `carriersOf`), `skill`
(default `'veteran'`), `shots`, plus `ScenarioCommon`.

```ts
interface DefenseDrill {
  playerId; shooterId; shooterType; threat;
  launchRange: number;          // requested; the actual one is in the 'launch' SimEvent (range)
  method: 'stt' | 'tws';        // STT: you get lock + launch warnings. TWS: silence until pitbull.
  missile(): Missile | null;    // the shooter's first missile once fired (alive or not)
}
```

The shooter spawns about 8 s of closure beyond `range` so it can find and track you, and fires when the range first
drops to `range` if the launch rules allow it (Rmax, ПР, lock). If you fly cold and the range never closes, it
fires 14 s after spawn at whatever range the rules allow. If `range` is beyond the missile's Rmax, the shot goes
when the range comes inside Rmax.

### Radar lab

```ts
radarLab(world, playerType, targets: RadarLabTarget[], opts?: RadarLabOptions): RadarLab
interface RadarLab { playerId; targetIds; setManeuver(id, maneuver): void }
```

| `RadarLabTarget` | default | meaning |
|---|---|---|
| `range` | required | **ground** range from you, m |
| `bearingDeg` | 0 | off your nose, + right |
| `alt` | required | m |
| `aspectDeg` | 0 | horizontal aspect: 0 = flying at you, 90 = beam, 180 = cold |
| `turn` | `'right'` | which side of hot it is turned |
| `speed` | Mach 0.85 | TAS m/s |
| `type` | your adversary | jet type (RCS matters for detection) |
| `maneuver` | `'straight'` | scripted flight |
| `radar` | `'off'` | silent by default |
| `callsign` | `Bandit-n` | |

`opts.playerAlt` defaults to 9 000 m here; `opts.playerHeading` defaults to 0. Targets are `holdFire`, never
defend, carry no missiles.

### Helpers

```ts
defaultAdversary(player: AircraftId): AircraftId   // f15c→su27, fa18c→mig29s, f16c→j11a, f14b→su27, jf17→mig29s,
                                                   // m2000c→mig29s, su27→f15c, su33→fa18c, j11a→f16c, mig29s→f16c
defaultThreatMissile(player): MissileId            // Western jets: 'r27er'; Russian/Chinese jets: 'aim120c'
carriersOf(missile, player?): AircraftId[]         // jets that carry it, opponents of `player` first
cruiseFor(type): { alt, mach, speed }              // ~0.6 × ceiling clamped to 7.5–10.5 km, cruise Mach + 0.05
blocOf(type): 'east' | 'west'
setManeuver(world, id, maneuver, extra?, announce = true)   // change a scripted aircraft's manoeuvre
releaseToAi(world, id, cfg?)                                // a scripted target becomes a full tactical AI
```

---

## ai.ts

### What the AI does

States (on `ac.ai.state`); every change emits `{ type: 'ai', ownerId, state, text, targetId?, missileId?, missile?, range? }`.
The optional fields are filled where known:

| call | `targetId` | `missileId` / `missile` | `range` (m) |
|---|---|---|---|
| commit / attack / re-attack / switch / merge | the contact it engages | attack: the missile it plans (`missile` only) | to the contact (not for an RWR-only bearing) |
| launch ("fires …", `support` or `merge`) | the missile's target | the missile it just fired | launch range |
| support ("cranks …") | the supported target | the missile it supports | – |
| pump after pitbull | the target | its active missile | – |
| defend | the shooter (the radar it notches, for SARH) | the missile it defends against, when known | to that missile (or to the emitter) |
| end of a defence (pump / recommit / rtb) | the shooter (recommit: the new target) | the defeated missile | recommit: to the target |

Match on these fields, not on the text.

| state | behaviour |
|---|---|
| `patrol` | holds its spawn heading/altitude/speed (a wingman flies formation), radar in RWS with a level/low/high elevation search pattern. Commits on the first contact inside `commitRange`. |
| `commit` | turns hot toward the chosen contact (lead pursuit), radar to TWS (RWS on the M-2000C) with the scan pointed at it; regular and better climb to ~0.6 × ceiling. Goes to `attack` inside ~1.3 × Rmax of its planned missile, `merge` inside 10 km. |
| `attack` | uses the jet's real launch method: **SARH and FC3 R-77 → STT** (it locks late, at launch range × skill lead, so the target's lock warning comes late; the radar can only lock inside 0.85 × its detection range), **ARH on multi-target jets → TWS designation, no lock**. Veteran and ace accelerate to ~M1.15 in afterburner. Fires when the range is inside its launch range and `world.launch()` agrees. Regular and better hold fire while the target beams (aspect 65–115°: it is in the notch) and wait `reshootS` after a shot at that target failed. |
| `support` | cranks the target to its crank angle (capped at gimbal − 8°), slows to ~M0.85, keeps STT (SARH, to impact; STT-fired ARH, to pitbull) or keeps the TWS track designated and in the scan (ARH, to pitbull). Veteran/ace may fire a second missile at the same target; multi-target TWS jets (not rookies) shoot a second target while supporting. It never locks another target while a missile still rides its radar. |
| `pump` | after pitbull (or after a defence) turns cold in afterburner, descends ~1 km, extends for `pumpS`, then recommits if it has missiles. |
| `defend` | see below. Overrides every other state. |
| `merge` | inside 10 km: lead pursuit in afterburner, IR missile when the seeker has the target inside 30° off the nose. |
| `rtb` | out of missiles (or out of its `shots`): turns cold and leaves. Still defends. |

**What it knows.** Only its own sensors: radar track files and RWS bricks (velocity from successive hits), its RWR
(a bearing to an enemy radar, enough to turn toward it), its eyes (enemy jets within `visualKm`, missiles within
`missileSpotKm` whose closest approach passes within 2.5 km), plus an optional **GCI picture** (`cfg.gci`: truth
positions refreshed every 10 s, used for steering and antenna pointing only; launches still need its own radar or
seeker). Contacts are remembered for `memoryS` and dead-reckoned for at most 12 s.

**Defence.** Triggers: an RWR `launch` (SARH, or an ARH fired from STT) or `missile` (active seeker) contact, or a
missile it can see. A **TWS Fox 3 is invisible until pitbull**, as DCS AI has behaved since 2021. After a skill-based
reaction delay:
- **SARH**: notch the **shooter's radar** (it is the illuminator): shooter at 3 or 9 o'clock, whichever needs the
  smaller turn, with a skill-based heading error; dive by `notchDescend`; M0.85, afterburner off.
- **ARH before pitbull, farther than `dragKm`**, or ARH when it is above the missile by more than 2 km and the
  missile is farther than 12 km (no ground behind it, so the notch will not work): **drag** cold in afterburner,
  descending. When the missile still closes inside 14 km, it switches to a notch.
- **ARH active / close**: notch **the missile** itself.
- **IR** (seen only): break to put it on the beam, flares in pairs every 0.8 s inside 7 km.
- **Chaff** only while the threat is 60–125° off the nose (the DCS AI rule is "chaff when the missile is 60° off
  the nose"; chaff helps only in the notch) and in the endgame (SARH inside 20 km; ARH active inside 15 km, or any
  radar missile inside 8 km): bursts of `chaffBurst` bundles every `chaffEvery` s, at most `chaffPerThreat` per
  missile.
- A warning that flickers off for less than 1.5 s does not end the defence (unless the missile is dead).
- When the threat is gone (dead, passing, or no longer warned and not seen): veteran/ace recommit at once
  ("resumes hot the instant a missile goes dumb"); rookie/regular extend cold for 0.6 × `pumpS` first. The event
  text says how it was defeated ("Bandit-2 defeated the AIM-120C: it went for the chaff").

**Skill** (`AI_SKILLS`, exported, read-only):

| | rookie | regular | veteran | ace |
|---|---|---|---|---|
| decisions | 5 Hz | ~7 Hz | 10 Hz | 10 Hz |
| reaction to a warning | 2.5–4.5 s | 1.5–2.8 s | 0.8–1.6 s | 0.4–0.9 s |
| notch heading error | ±16° | ±8° | ±4° | ±2° |
| launch range | 0.95 Rmax | 0.85 Rmax | 0.7 Rmax | Rne + 20 % of (Rmax − Rne) |
| STT lock at launch range × | 1.35 | 1.15 | 1.06 | 1.02 |
| crank | 30° | 42° | 50° | 55° (capped at gimbal − 8°) |
| chaff | 1 every 3 s | 2 every 2.2 s | 3 every 1.6 s | 3 every 1.2 s |
| chaff per missile | 5 | 8 | 10 | 12 |
| reshoot delay after a failed shot | 12 s | 10 s | 8 s | 6 s |
| waits for a beaming target to turn in | no | yes | yes | yes |
| sees jets / missiles | 6 / 5 km | 8 / 8 km | 10 / 12 km | 12 / 15 km |
| missiles in the air per target | 1 | 1 | 2 | 2 |
| pump | 30 s | 24 s | 18 s | 12 s |
| climbs/accelerates for the shot | no | climbs | climbs + M1.15 AB | climbs + M1.15 AB |

Launch ranges get ±5 % jitter per shot (from `world.rand()`); `launch.ts` still gates every shot (Rmax, Rmin, ПР at
0.85 Rmax on FC3 Russian jets, lock, designation, datalink slots, launch cone).

**Pressing after a miss.** Each earlier shot at the same (still alive) target that failed (notched, dragged,
decoyed, lock broken) brings the next launch range down by 20 % (`RESHOOT_CLOSER`), but never below the ace's
Rne + 20 % of the gap. A fixed `cfg.launchFraction` or `fireAtRange` is left alone. Without it, two regulars
trade 85 % Rmax shots that a drag or notch always beats, and the fight never ends.

**Realism sweep** (`tests/tune/ai-duels.test.ts`, runs with the suite in about a second): 10 matchups × regular
and ace, 100 km head-on with GCI, plus every matchup against a target that flies straight. It checks both sides
commit, first shots at 60–100 % Rmax (regular) or 30–100 % (ace), SARH shooters hold STT, ARH shooters crank and
pump, defenders notch or drag with chaff, no NaN / stuck state / missile past its battery, fights resolve (aces
inside 6 min, regulars inside 10), a straight-flying target dies inside 4 min, and a 2v2 runs clean. Typical
results: ace duels end in 2–4 min, regular duels in 4–9 min (regulars shoot long and notch well), AMRAAM jets
beat R-27ER / R-77 jets most of the time, the F-14 kills with the Phoenix from 90 km. Print the fights with
`DUELS=1 [VERBOSE=1] [MATCH=su27-f15c] [SEEDS=3] [DUEL_SECONDS=600] npx vitest run tests/tune/ai-duels.test.ts --disableConsoleIntercept`.

### API

```ts
thinkAi(world, ac, dt): void                                   // called by World.tick; do not call from pages
configureAi(world, id, patch: Partial<AiConfig>): void          // merge options (creates the brain)
aiConfig(ac): AiConfig | null                                   // copy of the current config
setScript(world, id, script: AiScript | null, announce = true)  // scripted flight, or null = tactical AI
aiStatus(ac): AiStatus | null                                   // read-only view for UI / coaching
AI_SKILLS: Record<AiSkill, AiSkillProfile>                      // the table above
DEFAULT_AI_CONFIG: AiConfig
```

`AiConfig`:

| field | default | meaning |
|---|---|---|
| `holdFire` | false | fly the fight but never launch |
| `evade` | true | react to missiles (false = "no reaction" target) |
| `gci` | false | simplified GCI picture (scenarios default it to true for sorties) |
| `commitRange` | 160 km | ignore contacts farther than this |
| `maxInFlightPerTarget` | null | override the skill value |
| `launchFraction` | null | override: launch at this × Rmax |
| `fireAtRange` | null | drill: launch as soon as range ≤ this (m) and the rules allow |
| `fireNoLaterThan` | null | drill: sim time after which it fires at any range the rules allow |
| `shots` | null | total missiles it may fire |
| `targetId` | null | engage only this aircraft |
| `launchMode` | `'auto'` | `'stt'` / `'tws'` force the radar-missile method |
| `leaderId`, `formationSide` | null, +1 | wingman: formation on this aircraft (3 km abeam, 600 m back) |
| `recommit` | true | come back hot after a pump |
| `units` | `'metric'` | units in the event text |
| `script` | null | `AiScript`: scripted flight (drill target) |
| `scriptRadar` | `'rws'` | radar mode while scripted (`'off'` = silent) |

`AiScript`: `{ maneuver: 'straight' | 'hot' | 'cold' | 'beam' | 'crank' | 'weave', refId?, side?, heading?,
altitude?, speed?, weaveDeg? (30), weavePeriod? (40 s) }`. `hot`/`cold`/`beam`/`crank` are flown continuously
against `refId` (default: the nearest enemy, truth; it is a script). `beam` keeps the reference at exactly 90°
(side = the smaller turn unless given). `crank` keeps it at 50°. A scripted aircraft stays in state `patrol`,
ignores enemies, and only defends if `evade` is true (then returns to its script).

`AiStatus`: `{ state, skill, since, targetId, threatMissileId, defendMode: 'notch' | 'drag' | 'break' | null,
script, shotsFired, lastText, lastLaunchBlock }`. `lastLaunchBlock` is the last `canLaunch` refusal reason, useful
for debugging a shooter that never fires.

### Event text

One sentence, pilot voice, callsigns, "you"/"your" for the player, ranges in `cfg.units`. Examples:

- `Bandit-1 commits on you on the GCI picture, 98 km`
- `Bandit-1 sets up an R-27ER shot on you, 61 km`
- `Bandit-1 locks you and fires an R-27ER from 38 km`
- `Bandit-2 fires an AIM-120C at Wingman from 31 nm in TWS: no lock, no launch warning`
- `Bandit-1's R-77 is active on you: it pumps cold`
- `Bandit-2 notches north against your AIM-120C, dropping chaff`
- `Bandit-2 notches west against your radar, dropping chaff, abandoning its own shot`
- `Bandit-1 turns cold to drag your AIM-120C, 34 km out`
- `Bandit-2 defeated the AIM-120C: it went for the chaff. It recommits on you`
- `Bandit-1 breaks against Wingman's R-73, dropping flares`
- `Bandit-1 is out of missiles and turns for home`

Launch texts come with `state: 'support'` (or `'merge'` for IR shots in the merge). A second shot while
supporting emits another `support` event with the same state.

---

## Gotchas

- **Fresh World per scenario.** Builders use fixed ids; calling two builders on one World collides.
- **`controller: 'script'` is not driven by anything.** Drill targets are `controller: 'ai'` with a script, so
  `World.tick` drives them. Change their flight with `setManeuver()`, not by writing `ac.cmd` (the script would
  overwrite it on the next decision).
- **The AI writes `ac.cmd` and `ac.selectedWeapon`** of its own aircraft and calls `world.setRadarMode / setScan /
  lock / unlock / designate / launch / chaff / flare` for itself. Do not drive an AI's radar from a page.
- **Decisions run at 5–10 Hz**, so a command can lag a tick or two; the flight model does the smoothing.
- **GCI is truth**, refreshed every 10 s. Set `gci: false` for "own sensors only" (it then patrols until its radar
  or RWR finds you).
- **Deterministic**: the AI uses `world.rand()` only. The same seed and the same player inputs give the same fight.
- **DCS simplifications to state in the UI**: DCS AI launch range is a mission-editor option; here it scales with
  skill. DCS does not document how skill changes AI launch range, reaction time or notch accuracy, so the values
  above are this trainer's choices, shaped by the documented DCS behaviour (crank, notch, look-down notch,
  chaff at 60° off the nose, no reaction to a TWS Fox 3 before pitbull, snapping back hot when a missile goes
  dumb).

## MiG-29S two-target launch

The AI can select the shared СНП2 mode when two fresh, firm radar tracks satisfy the documented pair limits.
It fires through `World.launchSnp2`, accounts for both stores and shot limits, and retains TWS support. A
forced STT configuration or a single-target drill does not use a pair. GCI positions alone never qualify.

Long regular fights are tracked in [ai-engagement-review.md](../research/ai-engagement-review.md); the
review did not reduce sourced notch gates or alter skill values to force a six-minute outcome.
