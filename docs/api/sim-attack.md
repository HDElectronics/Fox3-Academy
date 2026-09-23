# Sim API: attack jets, Shkval, air-to-ground (`src/sim`)

The Su-25T slice of the sim: ground units, the terrain hook, the Shkval sight and arcade air-to-ground weapons.
Game level only (AGENTS.md rule 1). Rules come from the ED *DCS World Su-25T Flight Manual* (S1,
`docs/research/su25t.md`); every value S1 does not give is listed in `docs/api/data.md` ("Air-to-ground").

| File | What it does |
|---|---|
| `jet.ts` | `isFighterAc`, `fighterType`, `fighterSpec`: radar-only code narrows `Aircraft.type` (now `AircraftId`). |
| `ground.ts` | Terrain fallback (`groundHeight`, `lineOfSight`, `groundIntersect`), ground units, `damageGround`. |
| `attack.ts` | `createAttackState(loadoutId)`, `selectAgWeapon`, `cycleAgWeapon`. |
| `shkval.ts` | Sight state machine, lock rule, gimbal, laser, identification ranges. |
| `agWeapons.ts` | ПР check, release, arcade flight, Kh-58 passive detection, `predictImpact` (CCIP point). |

## Contract changes (`types.ts`, `world.ts`)

- `Aircraft.type: AircraftId`; `SpawnOptions.type: AircraftId` plus `agLoadout?` (a `SU25T_LOADOUTS` id).
  Attack jets get `radar.mode === 'off'` forever, empty `stores`, and `ag: AttackState`. `stepRadar`, `thinkAi`,
  `buildRadarPicture` (returns null) and RWR emitters skip them; `canLaunch` refuses. `RecordFrame.aircraft[].type`
  and the render `AircraftLike` / `ReplayAircraft` types widen to `AircraftId`.
- `world.terrain: TerrainHook | null` (`heightAt(x, z)`, `lineOfSight(a, b)`); null = flat at `groundAlt`.
  Adapter for the height-map terrain: `world.terrain = { heightAt: (x, z) => heightAt(field, x, z),
  lineOfSight: (a, b) => lineOfSight(field, a, b) }`. `world.groundHeight(x, z)` and `world.lineOfSight(a, b)` wrap it.
- `world.groundUnits: Map<EntityId, GroundUnit>`, `world.spawnGroundUnit(o)`. `GroundUnit.kind` is
  `'tank' | 'apc' | 'truck' | 'bunker' | 'building' | 'sam-site' | 'aaa'` (not an entity discriminator); `sizeM`
  defaults 10 m (vehicles), 20 m bunker, 60 m building; `samSiteId` links a unit to a SAM site (either dying kills both).
  Units with `speed > 0` drive along `heading` on the terrain.
- `world.agWeapons: Map<EntityId, AgWeapon>` (`kind: 'ag-weapon'`, `guided`, `lostWhy`, `timeToImpact`, `result`).
- Events: `shkval-lock`, `shkval-lost` (`why: gimbal | terrain | target-dead | off | unlocked`), `laser`
  (`why: pilot | limit | shkval-off`), `ag-launch`, `ag-impact` (`killed` ids), `ag-miss` (`AgMissReason`),
  `ground-kill` (ground units and SAM sites; `kill` stays aircraft-only).
- `RecordFrame.groundUnits`, `.agWeapons`, `.shkval` (aim point, locked unit, laser) when present.

## AttackState (`ac.ag`)

`master` (`'nav' | 'ag' | 'fixed'`), `stores` by `AgWeaponId` (cannon counts rounds), `stations` (counts go down),
`selected`, `station` (next pylon; alternates left / right), `pair`, `pod` (L-081), `arm` (passive detection and
locked emitter), `shkval`.

`ShkvalState`: `on`, `mode` `'КС' | 'АС'`, `az` / `el` relative to the heading and the horizon (pitch and roll are
ignored for the gimbal), held `slew {x, y}`, `groundStab` + `stabPoint`, `zoom` 1 | 8 | 23, `targetSizeM` 5..60,
`lockedUnitId`, `lastLost`, `laserOn`, `laserUsedS` (heat, s), `laserCoolS` (> 0: ЛД flashing, cannot switch on).

## Rules

- **Lock** (`shkvalLock`): the nearest live unit inside the target frame (frame and object overlap on the ground)
  whose size, capped at 60 m, is within 5 m of the set size, inside ±35° / +15..−85° and in line of sight.
  Failure reasons are pilot words ("Target size 20 m does not match: object about 10 m").
- **Locked**: the sight tracks the unit; outside the gimbal → `gimbal`, terrain → `terrain`, unit dead → `target-dead`.
- **Unlocked**: slew rate is half a field of view per second (trainer value), clamped to the IT-23M scales
  (±40°, +20..−90°). Ground-stabilised, the sight holds its ground point as the jet moves.
- **Laser**: needs the Shkval on. Heat rises while lasing and falls while off; at `LASER_LIMIT_S` (S1: 20 min) it
  trips and cools as long as it was on. The 1 minute continuous figure is recorded as a caveat, not modelled.
- **Identification** (`idRangeKm`, `canIdentify`): S1 house 15 km, tank 8–10 km, helicopter 6 km; other kinds borrow
  the nearest example (`source: 'simplified'`); identification needs 23x.
- **ПР** (`canAgLaunch` → `AgLaunchCheck { ok, pr, reason, weapon, targetId, range, band }`): master mode `ag`
  (fixed reticle: unguided only), rounds left, then per guidance: lock (+ laser for Vikhr, Kh-25ML, Kh-29L) and slant
  range in the band; Kh-58: pod, detection on [I], an emitter locked inside ±30° and still emitting. Unguided stores
  are always `ok`; `pr` lights when `predictImpact` is inside the band.
- **Flight**: guided weapons follow a speed-over-time curve with a turn-rate cap (Vikhr steers for a point on the
  Shkval line of sight; laser / TV weapons steer at the target with a simple lead). Hold-to-impact weapons go
  ballistic and miss with `lock-lost`, `laser-off`, `gimbal` or `terrain` when the rule breaks; the Kh-58 with
  `emitter-off` when the radar goes silent (not verified). Unguided stores fly with gravity only and a fixed
  Gaussian dispersion from `world.rand()`. Impacts damage every unit within a trainer kill radius.
- **Pairs**: `pair` fires two Vikhrs from alternate stations (S1: Vikhr can be fired in pairs). The cannon fires
  `GUN_BURST` (10) rounds per release.

## World delegations (pages talk only to World)

`setAgMaster`, `cycleAgWeapon`, `selectAgWeapon`, `setAgPair`, `shkvalPower`, `shkvalSlew(x, y)`,
`shkvalStabilise`, `shkvalPointAt(p)`, `shkvalZoom(±1)`, `shkvalTargetSize({ step } | { m })`, `shkvalLock`,
`shkvalUnlock`, `laser`, `armDetect`, `armLock(siteId?)`, `canAgLaunch(w?)`, `agLaunch`. For displays:
`shkvalAimPoint`, `shkvalRange`, `shkvalFovDeg`, `predictImpact`, `armEmitters` (module functions).

## Tests

`src/sim/shkval.test.ts` (lock rule, nearest, 60 m cap, gimbal and terrain loss, stabilisation, laser rule,
helpers) and `src/sim/agWeapons.test.ts` (Vikhr hit / laser-off miss / gimbal miss, pairs, ПР per weapon, TV
fire-and-forget, Kh-58 emitter rule, deterministic dispersion, CCIP bomb kill, cannon burst).
