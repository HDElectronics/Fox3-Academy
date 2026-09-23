# Data API (`src/data`)

Static facts about the ten jets, seventeen missiles and six RWRs, as DCS World models them. Every value comes
from `docs/research/*.md`. Where research was uncertain, the value is the most defensible pick and the reason is
recorded in code (`AIRCRAFT_CAVEATS`, `RWR_CAVEATS`, missile `notes`, bind/step `note`) and in the last section
of this page. Types are in `src/data/types.ts` (shared contract).

```ts
import {
  AIRCRAFT, AIRCRAFT_ORDER, FIGHTER_ORDER, ATTACK_ORDER, AIRCRAFT_CAVEATS, isFighter, // aircraft.ts
  MISSILES, MISSILE_REF_NOTE, FLARE_SUSCEPTIBILITY,    // missiles.ts
  RWRS, RWR_CAVEATS, rwrSymbol,                        // rwr.ts
  SAMS, SAM_ORDER, SAM_CAVEATS, samForClass, samRwrSymbol, // sams.ts
  PROCEDURES, procedureFor,                            // procedures.ts
  SOURCES, SOURCE_ID, SOURCE_TOPICS, sourcesFor,       // sources.ts
} from '../../data';
```

## Exports

| Export | Type | What it is |
|---|---|---|
| `AIRCRAFT` | `JetTable` | Every jet. Indexed by a `FighterId` it is an `AircraftSpec` (radar rules, loadout, missiles); by any `AircraftId` it is the `JetSpec` union (narrow on `role` before reading `radar`). |
| `FIGHTER_ORDER` | `FighterId[]` | The fighters in display order (Russian FC3, F-15C, full-fidelity). Every BVR page, table and test iterates this. |
| `ATTACK_ORDER` | `AttackId[]` | Attack jets (no air-to-air radar), shown only on air-to-ground routes. |
| `AIRCRAFT_ORDER` | `AircraftId[]` | Every jet: fighters, then attack jets. Picker and 3D models only. |
| `isFighter(id)` | `id is FighterId` | Role guard for code that holds any `AircraftId`. |
| `AIRCRAFT_CAVEATS` | `Record<AircraftId, string[]>` | "Simplified here" sentences: every aircraft value research could not confirm. Show the relevant ones in Hangar/Reference/lab callouts. |
| `MISSILES` | `Record<MissileId, MissileSpec>` | Seeker, midcourse, loft, pitbull, seeker range/gimbal, mass, size, burn, Mach/g, reference ranges, chaff factor, guidance rule, DCS notes. |
| `MISSILE_REF_NOTE` | `string` | Caption to show next to `ref` ranges (they are ED's launch table, not flight results). |
| `FLARE_SUSCEPTIBILITY` | `Record<MissileId, number>` | 0..1 flare factor for IR seekers (radar missiles 0). Deprecated derived compatibility map; read `MISSILES[id].flareSusceptibility`. |
| `RWRS` | `Record<RwrId, RwrSpec>` | Symbols for every emitter, cues (look and sound) for search/lock/launch/missile, teach points. |
| `rwrSymbol(rwr, emitter)` | `string` | Symbol lookup; falls back to the RWR's `unknown` symbol. SPO-15 returns the type lamp letter (`''` = no lamp). |
| `RWR_CAVEATS` | `Record<RwrId, string[]>` | Unconfirmed RWR details. |
| `SAMS` | `Record<SamId, SamSpec>` | SA-10 / SA-11 / SA-15 sites: RWR class (`sam-long/medium/short`), threat-ring radius, min range, engagement altitude band, the `track-to-impact` guidance rule, defeat advice, uncertain values. |
| `SAM_ORDER` | `SamId[]` | Long, medium, short. |
| `samForClass(cls)` / `samRwrSymbol(rwr, sam)` | `SamId` / `string` | The site that represents an RWR class; its symbol on a given RWR (reads `RWRS`). |
| `SAM_CAVEATS` | `string[]` | Global SAM simplifications plus every site's `uncertain` line. |
| `PROCEDURES` | `Record<AircraftId, AircraftProcedures>` | Binds and step-by-step procedures. |
| `procedureFor(ac, id)` | `Procedure \| undefined` | e.g. `procedureFor('su27', 'tws-multi')` is `undefined`. |
| `AG_WEAPONS` / `AG_WEAPON_ORDER` | `Record<AgWeaponId, AgWeaponSpec>` / `AgWeaponId[]` | Su-25T air-to-ground stores: HUD label (9А4172, 25МЛ, 29Л, 29Т, 500Кр, С8, С13, АБ, ВПУ, 58), kind, guidance (`beam-riding`, `laser`, `tv`, `ballistic`, `anti-radiation`), needs lock / laser / emitter, hold-to-impact, pairable, gameplay `rangeKm` band (`rangeVerified: false` on all), pilot rule. |
| `SU25T_LOADOUTS` / `SU25T_GUN_ROUNDS` | `AgLoadout[]` / `number` | Trainer loadouts by station (`vikhr`, `laser`, `tv`, `unguided`, `sead`); 200 cannon rounds per S1. |
| `AG_CAVEATS` | `string[]` | Every unverified air-to-ground value (range bands, simplified laser heat/recovery, gun, stations, Shkval FOV and slew stops). |
| `SOURCES` | `Source[]` | 111 deduplicated research sources, ids 1..n. |
| `SOURCE_ID` | `Record<SourceKey, number>` | Stable key → id (e.g. `SOURCE_ID.edF15cManual`). |
| `SOURCE_TOPICS` / `sourcesFor(topic)` | `Record<SourceTopic, number[]>` / `Source[]` | Topic = any `AircraftId`, `MissileId`, `RwrId`, or `'notch' 'chaff' 'rwr-logic' 'datalink' 'kinematics' 'ai' 'tactics' 'binds-fc3' 'fc3-tws' 'sam'`. |
| `GUNS` / `gunSpecFor(type)` | `Record<GunJetId, GunSpec>` / `GunSpec \| null` | `src/data/wvr.ts`. Per fighter: gun, calibre, rounds, rate (HI/LO), sight kinds `{ noLock, lock, other? }` (`GunSightKind`), max range, funnel near/far, default wingspan (metres), select / fire / span keys, JF-17 burst limiter. `Sourced` values with `verified` flags. |
| `TURN_PERF` / `turnPerfFor(type)` / `sustainedG(tp, mach, altFt)` | `Record<GunJetId, TurnPerf>` | Sustained g at full afterburner vs Mach at 5000 ft and 20000 ft. Trainer estimate, not verified. Used by the BFM flight mode. |
| `GunJetId` / `GUN_JET_IDS` | union / list | The ten fighters with gun and turn data. Deliberately not `AircraftId`: a new jet opts in by adding itself. |
| `WVR_CAVEATS` | `string[]` | Every simplified or unverified gun / turn value, in pilot words. |

### Roles: fighters and attack jets

`AircraftId = FighterId | AttackId`. `FighterId` is the ten air-to-air jets; `AttackId` holds jets without an
air-to-air radar (the Su-25T). `JetSpec = AircraftSpec | AttackSpec` is discriminated on `role`
(`'fighter' | 'attack'`): `AircraftSpec` keeps its name and every field (radar, display, loadout, missiles) and
gains `role: 'fighter'`; `AttackSpec` has `radar: null` and a `weapons` label list. BVR-only maps and the sim key
on `FighterId` (`src/sim/types.ts` aircraft `type`, radar rules, DLZ, scenarios `ADVERSARY`, radar-lab notes,
RWR emitter symbols, flight ops). The sim's aircraft `type` is `AircraftId` since the A-G slice; radar-only sim code
narrows it with `src/sim/jet.ts` (see `docs/api/sim-attack.md`). `BindGroup` gains `'targeting'` for optical sight keys (Su-25T Shkval);
Su-25T procedures are `'shkval-lock'`, `'laser-shot'`, `'tv-shot'`, `'sead'` instead of the BVR set. Maps every jet needs (`AIRCRAFT_CAVEATS`, `PROCEDURES`, `JET_DIMENSIONS`,
source topics) key on `AircraftId`. `RwrSymbol.emitter` uses `FighterId`: an attack jet with no radar is never an
RWR emitter.

## Conventions

**Units.** km, degrees, seconds, knots, as the type comments say. Western range scales are exact nm
conversions (`10 nm = 18.52 km`); format them back with `app/format.ts`.

**Detection (`radar.detectKm`).** DCS AI sensor-table (datamine) values for every radar that has one (N-001,
N-019M, APG-63, APG-73, APG-68, KLJ-7). Reference target 3–5 m². Heatblur's AWG-9 and Razbam's RDI have no table
in research, so their manual/guide figures are used (they read higher; see caveats). `lookDownFactor` is the
datamine tail-aspect look-down ratio, applied by the sim to every aspect (simplified: the tables keep head-on
range unchanged in look-down).

**RCS (`rcsM2`).** Relative frontal RCS. The reference fighter is 5 m² (DCS F-15C unit value). Suggested scaling:
`range × (rcsM2 / 5) ** 0.25`. Only the F-15C value is from DCS; the rest are relative estimates in DCS's 3–6 m²
fighter band.

**Scan timing.** Frame time = `bars × 2 × azHalf / scanRateDegPerS` (as `radar.ts` computes). Scan rates are set
so documented frame times come out right: FC3 jets 5 s, Viper A6/4B 8 s and A3/2B 2 s, AWG-9 TWS 2 s.

| Jet | Radar | Head-on / tail km | Notch kt | Look-down only | Default frame | TWS |
|---|---|---|---|---|---|---|
| Su-27 / Su-33 / J-11A | N001 / N001K / N001VE (all DCS `N-001`) | 68.4 / 38 | 113 | no | 5.0 s | 10 tracks, 1 target, auto-STT 0.85 Rmax |
| MiG-29S | N019M | 60 / 30 | 81 | no | 5.0 s | 10 tracks, 2 targets (СНП2), auto-STT 0.85 |
| F-15C | AN/APG-63(V)1 | 88.4 / 44 | 54 | no | 5.0 s | 16 tracks, 4 targets, ±30° |
| F/A-18C | AN/APG-73 | 76 / 46 | 54 | yes | 9.3 s | 10 tracks, 10 targets, ≤ 2.7 s frame |
| F-16C | AN/APG-68(V)5 | 68.4 / 54 | 71 | yes | 8.0 s | 10 tracks, 6 targets |
| F-14B | AN/AWG-9 | 167 / 83 | 133 | yes | 6.5 s | 24 tracks, 6 targets, ≤ 2 s frame |
| JF-17 | KLJ-7 | 89 / 46 | 54 | yes | 8.0 s | 10 tracks, 2 targets, ≤ 4 s frame |
| M-2000C | RDI | 120 / 55 | 54 | yes | 8.0 s | none (`tws: null`) |

**TWS limits.** `maxFrameTimeS`, `maxAzHalfWidthDeg` and `maxBars` are all upper bounds; a scan change in TWS
is allowed only if it passes all three. They reproduce DCS's allowed patterns: Hornet 2B ±40°, 4B ±20°, 6B ±10°;
F-14 ±20°/4B and ±40°/2B; JF-17 ±60°/2B, ±25°/3B, ±10°/4B; F-15C and FC3 Russian jets ±30°.

**FC3 Russian scan.** `azHalfWidthOptionsDeg: [30]`: the scan is always 60° wide and the pilot moves its centre
between `azCenterOptionsDeg: [-30, 0, 30]` (three positions). In СНП it centres on the tracked target.

**Mode labels.** As the cockpit shows them: `ОБЗ ДВБ / СНП ДВБ / АТК ДВБ` on the Russian HUD, `LRS / TWS / STT`
on the F-15C, `PD STT` and `PD SRCH` on the F-14, `RECH / PSIC` on the M-2000C. `acm` labels are generic
(`БВБ`, `AACQ`, `ACM`, `PAL`).

**`sttArhLaunchWarning`.** `false` everywhere except the F-14B: DCS most likely shows only a lock until pitbull for
an ARH fired from STT. The F-14B is `true` because a Phoenix fired from PD-STT is SARH to impact in DCS and gives an
immediate launch warning.

**`notchNeedsLookDown`.** `false` on FC3 jets (their AI-table gate is a flat radial-speed filter), `true` on
full-fidelity radars (documented for the AWG-9; ED's Viper look-down notch; physics).

**Missiles.** `ref` = ED's launch table (ModelData[50..55], shooter and target at 900 km/h ≈ M0.85, 10 km head-on,
10 km target running, 1 km head-on). `maxMach` is the Lua `Mach_max` field (a legacy/AI value; new-API missiles are
really drag-limited). `chaffSusceptibility` is the Lua `ccm_k0` clamped to 0..1 (0 = immune). `midcourse` is
`'none'` for SARH (the R-27's inertial + radio-correction midcourse is in its notes: the pilot rule is the same).
`guidanceRule` is shared by every jet that carries the missile; a clause that applies to one jet only names it
(AIM-7M: "…; inside 10 nm the F-15C can FLOOD instead…"), so pages drop clauses that name another jet
(hangar `guidanceRuleFor`). Jet-specific handling is also in `notes` as its own line ("F-15C only: …",
"F-14: …"), which is the safer place to read it from.

**Binds.** `group` is explicitly `radar`, `weapons` or `defence`. `keyboard` contains the documented default
key string, or `null` when absent or unverified. Consumers must not derive either from prose.

FC3 jets: `keys` is the keyboard default (`'RAlt + I'`) and `note` holds the controls-menu name in
quotes. Full-fidelity jets: `keys` is the HOTAS or cockpit function as DCS names it (`'Sensor Control Switch -
Right'`); `note` contains caveats only. Branch on `AIRCRAFT[id].module` for presentation.
Procedure steps carry both `keys` (keyboard) and `hotas` (function) where they apply. In key strings, a spaced
`' / '` separates alternatives (`'= / -'`), `', '` separates a sequence (`'2, I'`), and a bare `/` or `,` is the
key itself (`'; , . /'` = the four cursor keys, `'RShift + , / RShift + /'` = left or right).

**Procedure ids.** Every jet: `search`, `stt-shot`, `support`, `defend`. `tws-multi` only where the jet can engage
several targets (MiG-29S СНП2, F-15C, F/A-18C, F-16C, F-14B, JF-17). Extras: `tws-designate` (Su-27, Su-33,
J-11A, MiG-29S: single-target СНП with auto-lock) and `dt-sam` (F-16C).

## Usage

```ts
const spec = AIRCRAFT[app.aircraft];
const tws = spec.radar.tws;                              // null on the M-2000C
if (tws?.autoSttAtRmaxFraction) coach(`СНП locks by itself at ${tws.autoSttAtRmaxFraction * 100} % of Rmax.`);
const shot = procedureFor(app.aircraft, 'tws-multi') ?? procedureFor(app.aircraft, 'stt-shot');
const er = MISSILES.r27er;                               // er.ref.highHeadOnKm === 59
const letter = rwrSymbol(spec.rwr, 'f15c');              // 'П' on the SPO-15, '15' on the TEWS
const cites = sourcesFor(app.aircraft).map(s => s.title);
callouts.push(...AIRCRAFT_CAVEATS[app.aircraft]);        // "simplified here" notes
```

## Gotchas

- `ALR-67` is shared by the F/A-18C and the F-14B. The F-14 differences (JF-17 shows as `17`, warble tones, the
  four-tone "silent shooter" alert) are in its `teach` list; `symbols` follow ED's Hornet list (`JF`).
- On the ALR-56C and ALR-67 the SA-15 is `15`, same as the F-15; the airborne hat tells them apart. This is taught.
- SPO-15 `unknown` is `''` (no type lamp lights). Every airborne radar, and an active missile seeker, is `П`.
- `maxSimultaneousTargets: 2` on the MiG-29S means СНП2 (two R-77s, targets within 8°, under 3 g), while
  `launchFromTws` stays `false`: its single-target СНП still converts to STT before launch.
- The F-16C's `azHalfWidthOptionsDeg` includes 25 and `barOptions` includes 3: those exist only in TWS with a bugged
  target (A2/3B bug scan). Do not offer them in RWS.
- `pitbullKm` for AIM-120B/C and SD-10 is not published by ED; see the uncertain list.
- `rangeScalesKm` for the Russian jets are unverified; `radar.ts` picks the first scale ≥ 80 km as default.

## Notable facts (from research)

- FC3 Russian СНП designates one track and auto-locks it (STT) at 85 % of the selected missile's Rmax: every
  Flanker radar shot leaves from STT. Confirmed in ED's 2014, 2018 and 2021 manuals.
- The MiG-29S is the only FC3 jet with a two-target mode (СНП2); the J-11A fires R-77s from STT only and may switch
  targets once the missile is within ~15 km.
- F-15C TWS: PDT + 3 SDTs, AIM-120s ripple in designation order and cycle back to the PDT; TWS window ±30° since
  DCS 1.2.7; AIM-7 needs STT or FLOOD (12°, 10 nm).
- A Fox 3 fired from TWS gives the target no lock and no launch warning until its seeker goes active (FC3 manual,
  ED tester 2022). AI does not react to it before then (since 2.7.1).
- F-16C guides six AIM-120s at six targets; tracks drop after 13 s. F-14 guides six Phoenix; how an AIM-54 guides
  depends on the radar mode at launch.
- Chaff factors (Lua `ccm_k0`): AIM-120C 0.1, SD-10 0.11, AIM-120B / R-77 / AIM-54C 0.2, R-27R/ER 0.5,
  AIM-54A 1.0. SARH missiles and the 54A are the easiest to chaff.
- Notch gates (AI tables): N-001 113 kt, N-019 81 kt, APG-63/68/73 and KLJ-7 54 kt; AWG-9 clutter filter ±133 kt
  and off in look-up. Beam window = asin(gate / ground speed): ±6.9° at 450 kt for a 54 kt gate.
- ALR-67 (Hornet, F-14): outer ring = critical. ALR-56M (Viper) and Serval: nearer the centre = more lethal.
  ALR-56C (F-15C, DCS): nearer the centre = stronger signal.

## Uncertain values (all of them)

### Cockpit explorer

`COCKPIT_CAVEATS` exports the global limits and each `uncertain` catalogue entry. Current F-16 uncertainties:
ENG FIRE press behavior, MISSILE LAUNCH press behavior, current IFF DED implementation, manual canopy handcrank,
anti-G test, throttle cutoff release, and utility-light interaction. The guide's ejection shortcut does not
specify its repetition sequence. Keyboard defaults beyond explicitly sourced entries are not asserted.
KY-58 internal selectors, exhaustive HOTAS context tables and software page trees are outside mapped coverage.

### Aircraft
- **Su-25T** (`AIRCRAFT_CAVEATS.su25t`): perf and RCS are rough gameplay numbers; chaff load not in the manual
  (shown as 0); the manual documents separate laser limits of about 1 min continuous with cooling (printed
  p. 57) and 20 min total per flight (printed p. 32), with current-game enforcement not verified; gun conflict (30 mm
  twin-barrel with 200 rounds in the manual vs GSh-30 with 150); no guided air-to-ground launch ranges in the
  manual. Target-size presets are documented in the manual (printed pp. 56–57); current-game behavior is
  not verified. See
  `docs/research/su25t.md`.
- **Russian FC3 detection** (68.4/38 km N-001, 60/30 km N-019M): AI sensor tables; whether the player radars read
  them is not confirmed. ED's Su-33 manual gives the real N001K ≥ 100 km head-on vs 3 m².
- **Russian FC3 bars/beam/scan speed**: bars are not selectable and the count is undocumented; 4 × 2.5° assumed,
  48°/s so a frame takes 5 s (datamine `scan_period`).
- **Russian FC3 range scales** 10/25/50/100/200 km: candidates, not verified.
- **Early lock above 85 % Rmax**: Su-27 manual says Enter forces it; MiG-29/Su-33 manuals say it will not happen.
- **FC3 notch in look-up** (`notchNeedsLookDown: false` for all FC3 jets): the flat AI-table gate is applied at any
  geometry here; DCS behaviour not confirmed.
- **Russian acm label `БВБ`**: candidates were ВЕРТ, ОПТ, ШЛЕМ, Ф0 or БВБ; not verified.
- **MiG-29S gimbal**: datamine STT ±67° az, −45/+50° el; 60° / 50° used.
- **J-11A jammer**: none in the datamine; not checked in game. **Su-33 station counts** inferred from launcher lists.
- **R-77 from STT launch warning** (`sttArhLaunchWarning: false` for J-11A/MiG-29S): not verified.
- **F-15C detection**: AI table 88.4 km; players report ~120 km vs an Su-27. **Bars** 4 × 2.5° assumed.
  **maxTracks 16** is the LRS figure. **STT AIM-120 warning**: lock only until pitbull (2020 forum) vs the 2014
  manual's launch indication. **LRS legend** on the VSD undocumented.
- **F/A-18C**: detection from the AI table; no documented cap on simultaneous AIM-120s (10 = trackfile limit);
  beam width 3° and scan speed 60°/s estimated; `maxFrameTimeS 2.7` derived; notch 54 kt is the AI gate;
  elevation gimbal 60° assumed; CMs 60/60 not in research.
- **F-16C**: detection from the AI table; notch 71 kt = MTR LO (HI 110 kt), default not verified; bar spacing 2.2°
  and beam 3.2° estimated; VSR, SAM and DT SAM/DTT folded into RWS/STT/TWS; CMs 60/60 not in research.
  HUD ASC/ASEC geometry is not fully modelled; the unsupported SHOOT text label has been removed.
- **F-14B**: detection 167 km (90 nm vs 5 m²) from the Heatblur manual; tail 83 km and look-down 0.8 estimated;
  scan 80°/s derived from the 2 s refresh; elevation gimbal 60° assumed; explicit TWS patterns are enforced;
  CMs 60/60 not in research. TID vectors/blinking remain simplified; classic F-14 has no IN RNG text cue.
- **JF-17**: detection from the KLJ-7 table (5 m²); TWS scan options conflict between Chuck and FlyAndWire;
  two simultaneous SD-10s implied by the store page (medium); scan speed, bar spacing, beam estimated;
  elevation gimbal 60° (AI table scan volume is ±30°); CMs 36/32 not in research. Units set to imperial
  because the cockpit shows nm, kt and thousands of feet.
- **M-2000C**: detection 120 km (~65 nm vs 5 m²) from Chuck's guide; tail 55 km and look-down 0.8 estimated;
  azimuth 60/30/15 read as ± half-widths; range scales 10/20/40/80 nm, notch 54 kt and scan speed estimated;
  PSID not modelled; CMs 112/16 not in research.
- **All jets**: `perf` numbers are rough public figures; `rcsM2` relative estimates except the F-15C.

### Missiles
- **Pitbull**: AIM-120C 16 km and AIM-120B 14 km read from Lua `D_max` (research disagrees whether that field is the
  active distance; community says ~8 nm, some ED posts 10 nm). SD-10 16 km estimated. R-77 15 km is the manual's
  switch-away range. AIM-54 18.5 km = TGTS NORM (54A) / Lua `active_radar_lock_dist` (54C).
- **AIM-54 seeker range** 25 km: not in research; set to cover TGTS LARGE (13 nm).
- **AIM-54 ranges, burn, mass**: ED stub values; Heatblur runs its own model. Mk47 vs Mk60 not distinguished.
- **AIM-7M chaff** 0.6: Lua has 0.2 (sensor) and 1.0 (seeker); which drives chaff is unclear.
- **Super 530D chaff** 0.1 from the new-API Lua; the legacy entry (cited in bvr-mechanics) says 0.5.
- **SD-10 loft**: Lua has loft data but AI shots fly flat; player behaviour unverified (`lofts: true`).
- **R-77 after an early unlock**: not verified; the trainer flies it on to the last estimate.
- **R-27T length** 3.7 m (ED) vs ~3.8 m (public).
- **maxMach** is the Lua `Mach_max` field (e.g. R-27R 4.5 > R-27ER 4.0): legacy/AI data, not flight results.

### RWR
- SPO-15: number of power-ring lamps and separate primary/secondary type rows not confirmed; `unknown` → no lamp.
- ALR-56C: `JF` and `M2` postdate the 2014 table; `U` for unknown is not in the FC3 manual.
- ALR-67: airborne modifier shape from ED graphics only; Chuck's guide disagrees on ring order (ED and Heatblur
  used). The Hornet guide confirms a steady SAM lock lamp but not launch flashing; the shared renderer follows
  Heatblur's ALR-67 flashing engagement cue and labels that approximation. Codes `10`, `11` and `15` are
  corroborated by the official Hornet appendix. CW is driven by the trainer's generic launch state, not verified
  per emitter.
- ALR-56M: codes assumed equal to the Hornet list; tones not documented.
- JF-17: only `M2K`, `M29`, `SA8` confirmed; ARH seeker on the RWR shown as `M` (not documented).
- Serval: symbol library not researched (ED-style codes stand in); tones and lock/launch look not documented.

### Air-to-ground (Su-25T)

Research: `docs/research/su25t.md` (ED Su-25T Flight Manual, S1). Mirrored in `AG_CAVEATS`.
- Every guided-weapon launch band is a community value, **not verified** (S1 gives none): Vikhr 0.8–10 km,
  Kh-25ML 3–10, Kh-29L 3–10, Kh-29T 3–12, KAB-500Kr 1–8, Kh-58 10–70. Rocket, bomb and gun bands only gate the
  trainer ПР cue (S-8 0.8–4, S-13 1–5, FAB-250 0–5, gun 0.3–2 km).
- Laser: S1 documents about 1 min continuous with cooling (printed p. 57) and 20 min total per flight
  (printed p. 32). The recoverable 20-minute heat threshold and recovery while off are a **simplified,
  not verified** trainer model; neither separate manual limit is enforced by this model.
- Cannon: S1 "200 round magazine" used; GSh-30 with 150 rounds elsewhere. Not verified.
- Station numbers except the L-081 on station 6; the S-13 HUD label (С13) follows the S1 rocket pattern.
- Shkval field of view below 23x is scaled from S1's 23x figure; target-size step 5 m and minimum 5 m.
  Using the IT-23M scales as slew stops, and releasing stabilisation when clamping prevents holding a ground
  point or the sight leaves the ground, are simplified trainer rules, **not verified**.
- Ground-unit default sizes other than armour 10 m and buildings 60 m (S1); hit points are trainer values.

### SAM sites

Research: `docs/research/sam-threats.md`. No ring was checked in the Mission Editor (the ED ring chart thread
refused access), so every `threatRingKm` is **not verified**: SA-10 120 km, SA-11 35 km, SA-15 12 km, all from the
Airgoons game-data reference. SA-10: older references show a smaller ring. SA-15 ceiling 6000 m vs 26000 ft on
dcsworld.pro. The single `track-to-impact` guidance rule simplifies DCS's mix of command and semi-active
guidance (SA-10 terminal phase not verified). Missile speed, turn, lock-to-launch delay, notch gate and chaff
chance in `src/sim/sam.ts` are arcade tuning, not measured in game.

### Procedures and binds
- FC3 `Backspace` unlock: medium confidence (mod copies of the FC3 bindings).
- FC3 launch key: Russian manuals say Space (hold ≥ 1 s); the F-15C manual gives RAlt + Space ("Weapon Release"),
  with Space reported to also launch (unverified).
- F/A-18C: RADAR knob and range/azimuth pushbutton names not in research; mode selection via TDC on PB5 follows
  ED's guide (bvr-mechanics mentions SCS toward the radar for RWS → TWS; not used).
- F-16C: FCR power is now described in the cockpit catalogue; its keyboard default remains unverified.
  CMS, EXP and program-5 button have no verified default keys.
- F-14B: trigger default key not verified (candidate Space); Jester petal wording not verified; pilot
  countermeasure control is DLC Toggle / Countermeasure Dispense; classic default keyboard binding remains unverified.
- JF-17: controls-menu wording for T1/S1/S2 not in research; TDC slew and countermeasure keys not in research.
  Deka documents T2 aft for countermeasures and TWS on entry to INTC (NAV uses RWS); the English manual
  used is machine-translated, so exact wording remains caveated.
- M-2000C: radar emission switch, range/azimuth/bar controls not in research; most binds have no default key.

### Flight ops

`src/data/flightOps.ts` (`FLIGHT_OPS`, `FLIGHT_OPS_CAVEATS`); every `Sourced` value with `verified: false`:
- Keys: gear `G`, flaps `F`, speed brake `B` are common DCS defaults, not verified per module. Hook keys: see Carrier.
- F/A-18C: approach speed 140 kt; gear and FULL-flap limit 250 kt (the guide's carrier section says 150 KIAS).
- F-16C: approach speed 150 kt; abeam 1.2 nm, gear limit 300 kt and aim point 500 ft are not in Chuck's guide.
  The on-speed value is 11° with the 11–14° green band as the guide gives it; no flap selector (flaps follow gear).
- F-15C: approach 180 kt (the quick start flies about 150 kt at the outer beacon); the whole overhead pattern
  (350 kt / 800 ft initial, 3.5 g break, 600 ft downwind, 1.2 nm abeam, 250 kt gear limit) and the 500 ft aim
  point are Hornet stand-ins.
- F-14B: on speed 15 units and the 800 ft, 300–350 KIAS break are sourced (carrier break); the ±1 unit band,
  135 kt approach, 250 kt gear limit, 3° glide, aim point and the rest of the field pattern are not.
- JF-17: about 10° (E-bracket) sourced; band 9–11°, 150 kt, 250 kt gear limit, pattern and flap labels are not.
- M-2000C: about 14° and gear below 230 kt sourced; band 13–15°, 145 kt, pattern and flap labels are not.
- Su-27, J-11A, Su-33, MiG-29S: on speed 10° (band 9–11°), approach 146 / 146 / 130 / 140 kt, 250 kt gear
  limit, 3° glide, aim point, pattern and the UP / TAKEOFF / LANDING flap labels are all gameplay values.
  The Su-33 manual's history quotes 240 km/h (Su-33) and 270 km/h (Su-27) approaches: background only.
  Su-33 indexer colours (yellow fast, green on, red slow) come from the ISM-1 description.
- Nav (FC3 jets): mode key `1` is sourced (ru-fc3.md, f15c-fc3.md). Not verified: `LCtrl+~` point cycle, the
  automatic ВЗВ → ПОС switch, the 12 km / 600 m intercept point, the lesson waypoints and the tower call wording.
- Touchdown zone (350 ft short to 1000 ft past the aim point) is a trainer choice, not a DCS number.
- Takeoff (`takeoff` on every jet). Sourced: F-16C Vr table (128 kt at 20000 lb to 198 kt at 44000 lb; the
  148 kt Vr is that table at the trainer's 27000 lb), 10 kt early pull in MIL (15 in afterburner), 8–12°,
  gear up before 300 kt; Hornet 6–8° and HALF flaps; JF-17 about 140 kt, pull at 120 kt, gear up at 30 ft and
  below 300 kt; M-2000C full afterburner, 13° tail strike, gear up before 260 kt; F-15C `W` wheel brakes.
  Not verified: Vr for the Hornet (145), F-15C (150; the detailed section pulls at 100 kt and holds 10°),
  F-14B (145), M-2000C (150), Su-27 / J-11A (140), Su-33 and MiG-29S (135); pitch bands for the F-15C, F-14B,
  JF-17, M-2000C (10–12.5°) and Russian jets; every other tail-strike attitude (12–15°); gear-up limits for
  the Hornet, F-15C, F-14B (250) and Russian jets (270); MIL or afterburner choice except F-16C and M-2000C;
  brake key `W` for every jet but the F-15C; `PgUp` throttle key for the FC3 jets. The whole F-14B takeoff
  (Heatblur's takeoff page is a work in progress).
- Carrier (#26; `carrier` on fa18c, f14b, su33; `SHIPS`, `SHIP_HULL`, `SHIP_CAVEATS` in `src/data/ships.ts`).
  Sourced: Hornet hook `H`, 350 KIAS initial, gear and FULL flaps below 150 KIAS; Supercarrier 800 ft initial
  3 nm astern, break interval 15–20 s and before 4 nm, 600 ft downwind 1¼–1½ nm abeam, ball at ¾ nm, max power
  at touchdown, CVN four wires; Tomcat 800 ft 300–350 KIAS break, 15–17 s interval, 90 at 450–500 ft, ball at
  about 0.6 nm, 15–18 s groove, MIL at touchdown; Su-33 hook `LAlt+G`, Kuznetsov four wires 12 m apart, Luna-3
  colours. Not verified: glide slope 3.5° (Hornet guide; the Supercarrier LSO section says 3.6°, the Kuznetsov
  uses the same value); ship speed 15 kt (no wind: wind over the deck = ship speed); angled deck 9° (CVN) and
  7° (Kuznetsov); CVN wire spacing 12 m; first wire 55 m / 50 m from the ramp; landing-area sizes, deck
  heights and hull dimensions (drawing values); ball-call key `Y` for every jet (DCS uses the radio menu);
  Tomcat hook key `H`, gear/flap limit 250 kt; Hornet 90 at 450–500 ft (Tomcat value) and groove 18–24 s
  (trainer band); the whole Su-33 Case I pattern (Hornet / Supercarrier stand-ins), its touchdown power and any
  Kuznetsov LSO calls or grades (`lso: false`, the trainer grades the pass itself). Trainer rules, not DCS
  numbers: ball cell 0.3°, Luna-3 green band ±0.5°, waveoff range 0.35 nm, call hysteresis and intervals, the
  "You're high" wording, grade comment bands, penalties and totals, the 6 m/s deck sink limit.
- Launch (#27; `launch` on fa18c, f14b catapult and su33 ski-jump). Sourced: Hornet NWS HI `S`, hook up `U`,
  T/O trim 16° below 44000 lb, 17° at 45000–48000 lb, 19° at 49000 lb and above with afterburner, MIL, wipe
  out, salute and hands off, gear up and flaps AUTO after the stroke; clearing turn right from catapults 1–2,
  left from 3–4; Tomcat hook up `U` and salute `LShift+U` (Heatblur lesson text only); Su-33 positions 1–2 a
  90 m run and 3 a 180 m run (heavy), deck stoppers during the run-up, full then special afterburner
  `LShift+E` (10-minute limit), FOD screens `LAlt+I` cost 12 % thrust. Not verified: the Hornet salute key
  (`LCtrl+LShift+LAlt+S` or the radio menu, against `LShift+U` in the Heatblur lesson), the launch bar `L` and
  wipe-out `K` trainer keys, Tomcat MIL without afterburner and hands off, the stopper release (the trainer
  lets go 3 s after full afterburner), the 29000 kg short-run limit, the trainer launch weights (Hornet 42000 /
  50000 lb, Tomcat 60000 / 70000 lb, Su-33 26000 / 32000 kg), the gaps in the Hornet trim table (put in the 17°
  band). Trainer rules, not DCS numbers: shooter delay 2 s, stroke 2.5 s to the approach speed + 15 kt, cold
  cat × 0.85, settle 3 s, ski-jump run 15 m/s², 12° ramp over 25 m, minimum ramp speed 0.85 × approach speed,
  catapult and position offsets across the deck.
- Refuelling (#28; `aar` on every jet but the su27, j11a and mig29s; `TANKERS`, `TANKER_CAVEATS`,
  `UPAZ_BANDS` in `src/data/tankers.ts`). Sourced: Su-33 probe `LCtrl+R`, refuelling lights `LAlt+R`, the
  "Tanker – Intent to refuel" call, 2000–9000 m and 500–570 km/h IAS, close from 10 m and hold 3–6 m below the
  pod, IL-78M UPAZ hose bands (yellow 3–13 m, yellow+green 13–16, green 16–22, green+red 22–24, red 24–26 cone
  to pod); F-16C AIR REFUEL door open or closed below 400 kt / M0.85, below 400 kt / M0.95 while open;
  M-2000C and JF-17 2–3 kt closure on the basket. Not verified: the Su-33 `RCtrl+R` listing (refuelling mode and
  probe retract); the F-16C and F-15C door keys, the Hornet and Tomcat probe keys (all the trainer key
  `LCtrl+R`); the call key `\` (DCS radio menu) and the call wording for the other jets and every tanker reply;
  fixed probes on the JF-17 and M-2000C; closure targets for the Su-33, Hornet, Tomcat (2–3 kt) and the boom jets
  (0.5–2 kt); contact-point positions (drawing values); tanker choice per jet (KC-135 MPRS default for probe jets,
  KC-130 offered); the J-11A probe (a Deka plan only) and MiG-29S refuelling (no `aar`). Trainer values: tanker
  speeds (IL-78M 290 kt, KC-135 300, MPRS 270, KC-130 230), altitudes, 30 nm racetrack legs and 20° turns,
  pod positions, the 26 m trail and 4.5 m droop (Western hoses reuse the UPAZ distances, no coloured bands), the
  hose envelope, 5 kt bounce limit, KC-135 boom pivot, 30° / 12 m nominal and 20–40°, ±15°, 9–15 m limits,
  3 kt boom closure limit, fuel rates (15 kg/s, 50 / 30 / 25 lb/s). KC-135 director lights are not modelled.

### Guns and BFM

`src/data/wvr.ts` (`GUNS`, `TURN_PERF`, `WVR_CAVEATS`); research in `docs/research/wvr-guns-bfm.md`. Not verified:
- Every `TURN_PERF` number (trainer estimate, shared shape scaled per jet).
- Su-33 and J-11A gun data (Su-27 manual text applied). FC3 funnel near end 200 m.
- F-15C rate of fire (6000) and gun range (4000 ft); F/A-18C 4000 ft max range (the guide gives the rule, 1.5 s
  TOF or minimum impact velocity, not a number); JF-17 range 4000 ft, 3000 rpm and the 0.2 s limiter; M-2000C
  2 × 1200 rpm.
- F-16C: all gun numbers (funnel 600 / 3000 ft, 33 ft wingspan, 510 rounds, 6000 rpm); the ED guide was not reached.
- Default wingspan 13 m for F-15C, F-14B, JF-17, M-2000C (no manual value).
- Trigger keys: F-16C, F-14B, JF-17, M-2000C `Space` is a trainer key; F-14B, JF-17, M-2000C gun select has no single key.

### Close-range acquisition and IR shot

`src/data/acm.ts` (`ACM`, `acmFor(type)`, `ACM_CAVEATS`): per fighter, the ACM modes (`AcmModeSpec`: scan area as a
cone or az × el box in degrees, lock range, lock rule `auto` / `enter`, dwell, sensor radar / IRST / seeker, key, HUD
cue) and the IR shot (`IrShotSpec`: missile, uncage rule and key, seeker field of view, launch limit, ready cue,
tones, fire key). Research: `ru-fc3.md`, `f15c-fc3.md`, `hornet-viper.md`, `tomcat-thunder-mirage.md`. Not verified:
- FC3 lock range 10 km and the HELMET 45° acquisition limit; VS lock rule (FC3 manual automatic, Su-27 manual Enter held).
- HELMET look follows the drill bandit independently of acquisition and lock eligibility; its ring and X stay at
  the HUD edge when off screen (trainer aids). ACM lock retention to 60° / 1.5 × acquisition range is simplified.
- Hornet GACQ is guns-only. Selecting it selects guns; selecting IR from GACQ switches to BST and clears the
  old lock and seeker. BST as the fallback is a trainer choice.
- Pattern sizes the notes do not give: F-15C BORE cone, Hornet VACQ width and WACQ centre, F-16C BORE cone, F-14 PLM
  cone and PAL elevation, JF-17 VT lower edge and HA size, M-2000C vertical width.
  The entire VACQ, VT and Mirage vertical `area` is marked `verified: false` because it includes these trainer
  dimensions; each area's note preserves the sourced dimensions.
- Every seeker field of view except Fi0 2°, every launch limit except the R-73 45°, every seeker tone description,
  the F-15C and F-14 uncage rule; the 0.5 s dwell (gameplay).
- Keys: F-14B mode controls, M-2000C Weapons System CMD, F-14B uncage and fire have no verified default.
  F-15C `Space` also launching missiles is unverified; its documented Weapon Release is `RAlt+Space`.
  Viper WPN REL is also documented as `RAlt+Space` (hold). Both release entries are verified against the notes.
  The Merge page labels `Space` to fire and `C` to uncage separately as trainer controls; actionable coaching
  uses `C`, while the reference retains the DCS controls (F-15C `6`, JF-17 `T2`).

## Requests (to the architect)

- Consider `notes?: string[]` on `RadarSpec` / `RwrSpec` so caveats can live on the spec instead of the side maps.

## Structured capability metadata

- `RadarSpec.singleTargetTws` describes the M-2000C PSID capability (`maxTracks: 1`, `bars: 1`,
  `launchFromTws: false`, `modelled: false`), sourced from `tomcat-thunder-mirage.md`. It does not add PSID to
  the shared simulation: `tws` remains null and `modes` lists implemented modes.
- `RadarSpec.tws.capConfidence` is `documented` for researched target caps and `unpublished` for the Hornet,
  whose ten-track limit remains a trainer stand-in. Do not present the latter as a DCS target cap.
- `MissileSpec.pitbullApprox` is true for every current ARH activation distance. These remain approximate,
  including manual/community readings; `pitbullKm` is absent and `pitbullApprox` false for SARH/IR missiles.
- `MissileSpec.flareSusceptibility` stores the existing 0..1 DCS gameplay factor: AIM-9X 0.2; AIM-9M,
  R-73, R-27T/ET and PL-5EII 0.5; Magic II 1 (source 2.0 clamped); radar missiles 0. This is metadata, not a
  retuning of the simulation. The old map is derived from these values.

## Radar contract additions

- `RadarSpec.twsPatterns`: optional tuples `[azHalfDeg, bars]`; enforced together when entering or changing TWS.
- `detectKm.referenceRcsM2`: source table reference; N-019M uses 3 m². Legacy unspecified tables use 5 m².
- `detectKm.lookDownHeadOnFactor`: optional head-on factor; the existing `lookDownFactor` applies tail-on.
- `RadarSpec.bvrStartMode`: initial radar mode for air-to-air scenarios, not generic aircraft spawning.
  JF-17 uses TWS in INTC; explicit scenario overrides take precedence.

The web-verification evidence and remaining current-game checks are in
[verification-status.md](../research/verification-status.md). No current DCS build was run for that review.

## Cockpit explorer contracts

`src/data/cockpit/types.ts` defines a separate, read-only teaching catalogue. `CockpitPanel` identifies a
cockpit region and its individually addressable controls. `CockpitControl` contains a stable ID, label,
kind, purpose, operation, observable effect, optional positions, binding evidence and source references.
A source page is a one-based page in the official aircraft guide.

`dcsStatus` describes the cited manual: `documented`, `not-implemented` or `uncertain`. It is not a live-build
verification or a simulated system state. Omit unverified keyboard defaults. A control can have a documented
warning meaning and an uncertain press action; keep that distinction in its notes. Panel diagrams are
original schematics and do not establish exact physical geometry.

`cockpitFor(aircraft)` returns the mapped `CockpitDefinition`, or `null` for an unsupported aircraft. Never
silently show another aircraft's cockpit. `F16_COCKPIT` composes the independently sourced front, left, right
and pedal inventories. `COCKPIT_CAVEATS` is the corresponding uncertainty export. Selecting controls is an
informational action; these records do not mutate `World` or implement aircraft systems.
