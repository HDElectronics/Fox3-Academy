# BVR Mechanics in DCS World: Notch, Chaff, RWR, Datalink, Kinematics, Tactics, AI

Research date: 2026-09-19. The current DCS release at that date is 2.9.29.27468 (02.09.2026). DCS behaviour changes between patches, so dated changelog entries are given where a behaviour changed.
Conventions: 1 nm = 1.852 km. "Lua" means the game's own definition files, read through the Quaggles datamine.

## Summary (what a trainer designer must know)

- **The notch is a Doppler-filter problem, and DCS models it differently for each kind of sensor.** The AI radar Lua files give a fixed "minimum radial velocity" gate:
  - 27.8 m/s (54 kt) for the APG-63/68/71/73 and KLJ-7.
  - 41.7 m/s (81 kt) for the MiG-29's N-019.
  - 58.3 m/s (113 kt) for the Su-27's N-001.

  Radars in the player modules are written in C++, so their gates are not published. The one documented exception is the Heatblur F-14 AWG-9: its clutter filter is ±133 kt wide and switches itself off in AUTO when the antenna points more than 3° above the horizon. Active missile seekers (AIM-120 since 2021, AIM-7 family too) use a ground-clutter model: a notch works only when the ground is inside the seeker beam behind you. In look-up with no ground behind you, a notch is much harder or does not work.
- **Beam window.** How far off the exact beam you can be and still sit inside a gate is `asin(gate / your ground speed)`. At 450 kt ground speed that gives ±6.9° for a 54 kt gate, ±10.4° for 81 kt, and ±17.2° for the F-14's 133 kt. "Put the threat at 3 or 9 o'clock" has to be accurate to within a few degrees.
- **Chaff only helps inside the notch.** Chaff almost stops in the air, so Doppler seekers reject it the same way they reject slow-moving targets. It works when your own Doppler also looks like ground or chaff, which means beaming. Each missile's susceptibility is set by `ccm_k0`: 0 means immune and 1 is the default. Lua values:
  - AIM-120C 0.1, AIM-120B 0.2, R-77 0.2, SD-10/PL-12 0.11.
  - AIM-7MH 0.5 and R-27R/ER 0.5. SARH missiles are the easiest to chaff.
- **RWR rules:**
  - A search radar is shown as a symbol with no lock.
  - STT gives a lock warning.
  - A SARH launch, or a Fox 3 fired from STT, gives a launch warning when the missile leaves the rail.
  - **A Fox 3 fired from TWS gives no lock and no launch warning until its own seeker goes active.** In the F-15C, a TEWS "M" symbol then appears.
  - The AIM-120C goes active about 16 km (8.6 nm) from the target (Lua `D_max`). A hot target therefore gets roughly 15–25 s of warning, and a cold target roughly 30–40 s. These times are my own derivation, not published figures.
- **After the shooter loses track or dies.** An AIM-120 keeps flying on its own inertial guidance towards the last computed intercept point. It then turns its seeker on and takes whatever it finds in its 15° field of view. A SARH missile (AIM-7, R-27R/ER) needs continuous illumination, so if the lock drops it goes dumb and ignores chaff.
- **Kinematics.** Shoot high, fast and at hot targets:
  - Climbing about 20,000 ft roughly doubles maximum launch range (FC3 manual).
  - Shots from behind (low aspect) reach only a third to a half as far as head-on shots.
  - The DLZ labels differ by aircraft. F-15C: Rpi, Rtr and Rmin. F/A-18C: RAERO, RMAX, RNE and RMIN. F-16C: RAERO (40° loft), ROPT (20° loft), RPI, RTR and RMIN.
  - Rtr and RNE mean the same thing: the target cannot escape even if it turns and runs.
- **Crank after launch** to about 50° off, just inside the radar gimbal limit. The limit is ±60° for the APG-63/68/73, N-019 and N-001. The F/A-18 steering dot flashes within 15° of the azimuth limit. Cranking cuts closure while you support the missile to active range. Then pump or go cold before you reach the enemy's range. On defence, the order is: beam or notch (low, chaff), then drag (cold) if kinematics allow.
- **DCS AI:**
  - AI launch range is set in the Mission Editor option "Missile attack" (MAX_RANGE, NEZ_RANGE, HALF_WAY_RMAX_NEZ, TARGET_THREAT_EST, RANDOM_RANGE).
  - Since 2.7.14 (May 2022), the AI's crank, notch, low-slice and chaff behaviour scales with its skill level. It drops chaff when the missile is 60° off its nose.
  - Since June 2021 the AI does not react to a TWS-launched Fox 3 until the seeker goes active.
  - In June 2026 (2.9.27) AI evasion was changed to respond to aircraft and radar threats and to missiles it could plausibly detect. Of the missiles themselves, it reacts only to ARH missiles.
- **Common DCS mistakes:**
  - Locking STT too early, which gives the target a lock warning.
  - Losing TWS tracks by manoeuvring past the gimbal limit or scan volume.
  - Taking maximum-range shots at cold or beaming targets.
  - Breaking lock while a SARH missile is in flight.
  - Beaming at high altitude against a look-up missile, where the notch does not work.
  - Dropping chaff while flying straight at the missile.

## Facts

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| Notch gate, AI radars (Lua) | `velocity_limits.radial_velocity_min` = 27.78 m/s (100 km/h, 54 kt) for AN/APG-63, APG-68, APG-71, APG-73 and KLJ-7 | yes (AI radars; FC3 probably uses the same sensor DB, not confirmed) | high (value), med (how it is applied) | 1, 2 |
| Notch gate, AI radars, Russian | N-019/N-019M (MiG-29): 41.67 m/s (150 km/h, 81 kt). N-001 (Su-27): radial 58.33 m/s (210 km/h, 113 kt), relative 41.67 m/s (81 kt) | yes (AI) | high (value) | 2 |
| Two Lua gate fields | `radial_velocity_min` probably means target radial speed relative to the ground/clutter (the beam notch). `relative_radial_velocity_min` probably means speed relative to the radar (the tail-chase "same speed" gate). A 2021 bug report read it as "±54 kt of my true speed". | yes | low (meaning) | 2, 22 |
| Player-module radars | Coded in C++, not in Lua, so they are not readable. Community testers note that the Lua value is for AI only and that player radars vary with look-up/down, range and PRF. | yes | med | 22 |
| F-14 AWG-9 main-lobe clutter (MLC) filter | Main-lobe clutter is 266 kt wide, centred on own ground speed (±133 kt). This is why the radar "can be notched". | yes (Heatblur) | high | 20 |
| F-14 MLC switch | AUTO turns the MLC filter off when the antenna looks more than 3° above the horizon, so there is no notch in look-up. OUT turns it off manually, but in look-down the display fills with ground returns. | yes | high | 20 |
| F-14 zero-Doppler filter | A second blind zone 200 kt wide: a chased target within ±100 kt of own ground speed is invisible (tail-chase notch) | yes | high | 20 |
| F-14 TWS capacity | 24 track files, 18 shown on the TID, 2 s track refresh | yes | high | 20 |
| F-16C look-down notch at altitude | A 2022 bug report complained that a high-altitude target notches the F-16 radar too easily in look-down. ED tagged it "correct as-is". | yes | med | 23 |
| Beam window (derived) | Half-width = asin(gate / target ground speed). At 350 / 450 / 550 kt: 54 kt gate gives ±8.9 / 6.9 / 5.6°; 81 kt gives ±13.4 / 10.4 / 8.5°; 113 kt gives ±18.8 / 14.5 / 11.9°; 133 kt gives ±22.3 / 17.2 / 14.0° | yes (derived) | med | 1, 2, 20 |
| Missile seeker notch model | Since DCS 2.7.1 (OB 2021, stable 11.06.2021): AIM-120 has a ground clutter model. "Missile notching now depends on target/clutter signals ratio, range of blind velocities depends on geometry of intersection of seeker beam and ground." The same model was applied to the whole AIM-7 family. | yes | high | 6 |
| Notch in look-up vs look-down (missiles) | You need ground in the seeker beam behind you: be below the missile and preferably low. Testers in 2021: "notch width ~100 kt ±15 in look-down, look-up a lot less". Another tester said you must be under about 20 kt. The two disagree. | yes | med (principle), low (width) | 6, 21 |
| AMRAAM notch inside pitbull range | 2.7.14 (27.05.2022): "AMRAAMs were too easy to notch when performing a notching maneuver inside of pitbull range – solved. Improved range gate modeling". The notch is now harder once the missile is active and close. | yes | high | 7 |
| AIM-120 guidance updates | 2.9.1 (29.11.2023): third-order tracking filter, more resistant to ECM blinking. 2.9.9 (30.10.2024): constant lead-angle guidance. 2.9.10 (04.12.2024): barrel-roll defeat "mostly fixed". 2.9.11 (24.12.2024): more agility against high-G rolls. 2.9.14 (19.03.2025): 30° conical fuze pattern ("wagon wheel") and late fuze arming 150 m from the target. | yes | high | 13, 14, 12 |
| AIM-7 / R-27 seeker rework | 2.9.27.25183.5 (23.06.2026): AIM-7M/MH moved to the new SARH seeker (R-27-level modelling), gimbal model and English Bias. R-27R/ER and AIM-7M/MH got real-time glint noise that can cause misses, and R-27R/ER got angle gating that depends on time to hit. | yes | high | 9 |
| SARH notch target | Notch the **launching radar**, the illuminator. If its lock breaks, the missile loses guidance. 2021 changelog: "R-27R, R-27ER will not go for the chaff if radar lock is lost." | yes | high | 6, 30 |
| Chaff factor `ccm_k0` | Mod/ED Lua comment: "Counter Countermeasures Probability Factor. Value = 0 – missile has absolutely resistance to countermeasures. Default = 1 (medium probability)". Lower is harder to decoy. | yes | med (comment copied from an ED-style template) | 31 |
| `ccm_k0`, radar missiles (Lua) | AIM-120C 0.1. AIM-120B 0.2. R-77 0.2. SD-10 0.11. PL-12 0.11. AIM-54C Mk47 0.2. MICA-EM 0.2. AIM-7MH 0.5 (seeker; the "sensor" block is 0.2). R-27R/ER 0.5. Super 530D 0.5. | yes | high (values) | 3, 4, 5 |
| `ccm_k0`, IR missiles (Lua) | AIM-9X 0.2. AIM-9M 0.5. AIM-9L/P5/JULI 0.75. AIM-9P/J/E 2. R-73 0.5. R-60 1. R-27T/ET 0.5. MICA-IR 0.2. Magic II 2. | yes | high (values) | 5 |
| Chaff logic | 2.7.1 (2021): "AIM-120. Chaff bug – changed chaff/slow moving targets filtering logic". Chaff behaves like a slow target and is filtered unless your own Doppler is also near clutter (you are in the notch). FC3 manual: in look-up, the beaming fighter's closure equals "any deployed chaff". | yes | med | 6, 17 |
| How chaff is rolled | Each bundle presumably gets a probability check that scales with `ccm_k0` and the notch or Doppler state. The exact formula is not public. | yes | low | 31, 6 |
| Flares vs IR missiles | Flares are rolled against the IR missile's `ccm_k0`. Community practice: come out of afterburner and dispense in bursts. The formula is not public. | yes | low-med | 5, 30 |
| RWR contents (FC3) | "Each system can detect the unique radar emissions, detect continuous wave (locked warning) illumination, and missile command data link signals (launch warning)." | yes | high | 17 |
| RWR priority (FC3) | 1) ARH missile or command-guidance (launch) signal; 2) lock (STT); 3) threat type; 4) signal strength | yes | high | 17 |
| Launch audio repeat (FC3) | "If a missile launch is detected, an audio launch warning will be heard. It will repeat itself every 15 seconds until the threat is gone." | yes | high | 17 |
| TWS Fox 3: no warning | FC3 manual: "a TWS launch with AIM-120 will not provide the enemy aircraft with a radar lock and launch indication… the first warning… is when the active radar seeker… goes active." | yes | high | 17 |
| STT Fox 3 | Implied by the manual text above: an STT launch does give lock and launch indications. The missile uses the command datalink, which the RWR treats as a launch. | yes | med | 17 |
| SARH (Fox 1) | Needs STT or flood. Lock warning, then launch warning at launch, continuous until impact or until the lock breaks. The AIM-7 cannot be fired in F-15C TWS. | yes | high | 17 |
| Maddog | A launch with no lock (VISUAL/BORE): the AIM-120 seeker comes on about 2 s after launch (F-15C VISUAL). 2.7.1 fixed "missing/improper RWR indication if missile launched in visual mode (maddog launch)". | yes | high | 17, 6 |
| Active-missile symbol (F-15C TEWS) | An ARH missile shows as an "M" in the inner ring and is always the primary threat. A flashing lower semicircle means a missile is guiding on you. | yes | high | 17 |
| RWR coverage | F-16 ALR-56M: 360° in azimuth, ±45° in elevation. A steep bank or pitch can put the threat in the blind spot and lose lock/launch warnings. | yes | high | 18 |
| AIM-120 active range | Lua `D_max`: AIM-120C 16 km (8.6 nm). AIM-120B 14 km (7.6 nm). R-77 15 km (8.1 nm). AIM-54C 14 km. MICA 8 km. The community figure is "about 8 nm". | yes | med (`D_max` read as active distance) | 3, 5, 25 |
| Warning time from a TWS Fox 3 (derived) | 16 km ÷ closure: hot, about 1,000 m/s, gives about 16 s. Beam, about 700 m/s, about 23 s. Cold, about 450 m/s, about 36 s. | yes (derived) | low-med | 3 |
| AIM-120 guidance phases (DCS F-16 guide) | Inertial ("target's last known position, course, and velocity"), command guidance by datalink from the radar, active radar homing, home-on-jam | yes | high | 18 |
| Datalink support | The aircraft sends updates "as long as the FCR maintains a track". The F-16C can guide 6 AIM-120s at once from TWS, SAM, DT SAM, DTT or STT. | yes | high | 18 |
| AMRAAM INS/datalink | 2.7.7 (2021): "AIM-120 AMRAAM has received a separate INS unit with datalink support". If track is lost, the missile flies to the last calculated intercept point. | yes | med | 24 |
| Extrapolated tracks | 2.8.7 (02.08.2023): fixed "Extrapolated radar trackfiles continue to update the AIM-120 with the true position of the target". A memory or extrapolated track no longer feeds the missile the target's true position. | yes | high | 15 |
| After seeker activation | Older forum note (2014): "the moment the missile activates its seeker… it will ignore the datalink" | yes | low (old) | 25 |
| AIM-120C seeker (Lua) | Field of view 0.26 rad (15°). Gimbal ±60°. Maximum line-of-sight rate 30°/s. Home-on-jam enabled. Proximity fuze radius 15 m, arming delay 1.6 s. Life time 90 s. | yes | high | 3 |
| AIM-120C motor and loft (Lua) | Single motor 6.5 s (impulse 234 s). Mach_max 4. `loft = 1`, `loft_sin 0.5` (30° climb), `loft_off_range 15000` (probably no loft inside 15 km), `loft_factor 4.5`. `Range_max` 61 km (32.9 nm); AIM-120B 57 km. | yes | high (values), med (loft semantics) | 3 |
| AIM-7MH (Lua) | Boost 3.7 s, then sustain 10.8 s. Mach_max 3.2. Fuze radius 12 m. Loft pitch +30° with `loft_min_dist` 6.5 km / `loft_max_dist` 20 km. `Range_max` 50 km. 2021: "AIM-7F/M loft disabled by default (F-15C)". | yes | high (values), low (loft rules) | 4, 6 |
| R-77 / R-27 (Lua) | R-77: `Range_max` 50 km, `D_max` 15 km. R-27R 35 km, R-27ER 60 km (`Range_max`). | yes | high (values) | 5 |
| Altitude effect | "If the flight altitude is increased by 20,000 feet, the maximum launch range is about doubled." Against a target at a different altitude, maximum launch range is about the maximum for the average of the two altitudes. | yes (FC3 manual) | med | 17 |
| Aspect effect | Rear-hemisphere launch ranges are "two to three times less" than high-aspect ones. A head-on shot fired at 50 km flies only about 30–35 km. | yes | med | 17 |
| R-27ER example (FC3) | Forward hemisphere at 10,000 m: 66 km (35.6 nm). Forward hemisphere at 1,000 m: 28 km (15.1 nm). Rear hemisphere at 1,000 m: 10 km (5.4 nm). | yes | med | 17 |
| Missile control floor | Below about 800–1,000 km/h (430–540 kt) a missile becomes "almost uncontrollable". | yes (FC3 text) | med | 17 |
| F-15C DLZ | Rpi: maximum range, current steering, target not manoeuvring. Rtr (turn and run): maximum range against a target that turns and runs at launch. Rmin: fuzing and tracking limit. A flashing star means a valid shot. | yes | high | 17 |
| F/A-18C DLZ | RMIN, RNE (target stays in range "even if the target turns instantaneously 180° aspect"), RMAX (target not manoeuvring), RAERO (diamond; the missile can still pull 5 g). SHOOT is steady inside RMAX and flashes inside RNE. | yes | high | 19 |
| F-16C DLZ | RAERO assumes a 40° loft. ROPT assumes a 20° loft. RPI: target not manoeuvring. RTR: target makes an immediate high-G turn away and accelerates. RMIN. The "maneuver zone" is RTR down to RMIN. | yes | high | 18 |
| F-16C poles | Pre-launch "M" pole: target range when the seeker goes active. "F" pole: target range at intercept. After launch: A (time to active) and T (time to termination) for the MOI (missile of interest). | yes | high | 18 |
| Radar gimbal | Az ±60° on the AI APG-63/68/71/73, N-019 and N-001. Elevation ±30° (N-019M ±40°). The F-16 guide shows the crank "until radar is at gimbal limits (±60°)". | yes | high | 1, 2, 18 |
| F/A-18 gimbal cue | The steering dot flashes within 15° of the radar azimuth limit and within 5° of the elevation limit. | yes | high | 19 |
| Brevity (DCS community list) | HUSKY: an active missile has reached HPRF and needs no support. PITBULL: it has reached MPRF and needs no support. MADDOG: an active shot with no lock. CHAMPAGNE: three groups, two abreast in front and one trailing. FLANK is 30–60° off; BEAM is perpendicular. | real-world only (terminology; DCS models only active vs not) | high | 32 |
| AI missile-attack option | MAX_RANGE (0), NEZ_RANGE (1), HALF_WAY_RMAX_NEZ (2), TARGET_THREAT_EST (3), RANDOM_RANGE (4), since DCS 1.5 | yes | high | 27 |
| AI BVR tactics (2.7.14, May 2022) | Tactics depend on skill level. The AI uses altitude and speed for launch kinematics, cranks and slows to increase F-pole, uses lead/pure/lag intercepts, low-slice cranks, look-down notches and reversal/extension. "Use chaff when the missile is 60 degrees off the nose". A timer on notch evasion to defeat radar memory mode. | yes | high | 7 |
| AI vs TWS Fox 3 | 2.7.1 (2021): "In the case when an active missile is launched in the TWS mode, AI aircraft will begin evasive maneuver only after the missile seeker is turned active." | yes | high | 6 |
| AI group defence | 2.9.7.58923 (09.08.2024): AI groups react to radar illumination, and every aircraft inside the lock cone defends, not only the locked one | yes | high | 16 |
| AI without RWR | 2.9.13.6818 (19.02.2025): "Aircraft without RWR will be able to detect incoming missiles only visually at close distance, not BVR." | yes | high | 10 |
| AI vs Fox 3 bug | 2.9.20.15010 (17.09.2025): fixed "AI aircraft evasive maneuvers logic is not working with active missiles" | yes | high | 11 |
| AI evasion target | 2.9.27.24969 (12.06.2026): "AI planes will perform a distant evasive maneuver against a hostile aircraft or ground radar, not against a missile they shouldn't be able to see (except ARH missiles)." | yes | high | 8 |
| AI notching skill | Community (Jan 2025): the AI is "way too good" at notching, and it resumes hot the instant a missile goes dumb | yes | med | 28 |
| Real world vs DCS: notch | In reality the radar coasts through the notch on range and angle and keeps tracking. DCS drops the contact. (Community reading of the F-16 manual; ED did not change it.) | real-world only | med | 23 |
| Real world: HPRF vs MPRF active | The real AIM-120 goes active in two steps (HPRF, then MPRF), hence HUSKY and PITBULL. DCS models a single activation. | real-world only | med | 25, 32 |

## Display & symbology (BVR-relevant cues)

**F-15C HUD (FC3), STT with AIM-120:**
- The DLZ scale is on the right: Rmin at the bottom, then Rtr, then Rpi, with a target-range caret beside it.
- ASE circle with a steering dot.
- A five-pointed star flashes under the target box when the shot is valid.
- Bottom right: "R" range and the aspect readout (e.g. `H`, `T`, `L 12`, `R 12`).
- Bottom left: weapon and count, own Mach, target Mach.
- Before launch: time to intercept, prefixed `M`.
- After launch the bottom left flashes `T <sec to active> <sec to intercept>`. When the missile goes active the `T` becomes `M` and only the time to intercept remains.

**F-15C VSD:**
- Plan view, with range scale 10/20/40/80/160 nm in the top right.
- Hostile contacts are rectangles and friendly ones are circles.
- Elevation coverage numbers at the left.
- `G`/`T` speeds at the bottom.
- Bar and PRF readout (`HI`/`MED`/interleaved) at the bottom left.
- In TWS the PDT is a star and SDTs are hollow rectangles.

**F-15C TEWS (RWR):**
- `^` hat over an airborne radar symbol.
- Upper semicircle means a new threat.
- Diamond means the primary threat.
- Flashing circle means a launch.
- `M` means an ARH missile.
- A flashing lower semicircle means a missile is guiding on you.
- The launch audio repeats every 15 s.

**F/A-18C HUD, AIM-120:**
- NIRD circle (the ASE circle is fixed in size and the dot's rate of movement changes instead). Around the circle: RMIN, RNE, RMAX ticks and the RAERO diamond on the outside.
- Target aspect pointer and steering dot.
- `SHOOT` above the TD box: steady inside RMAX, flashing inside RNE.
- The TD box becomes a diamond for a hostile target and is hashed when the radar is in MEM (extrapolating).
- Timer: `ACT nn` before the missile goes active, then `TTG nn`.
- On the radar: a fly-out pyramid on the azimuth steering line, with seconds to active, then `A` after activation.

**F-16C HUD/FCR DLZ:**
- Range scale marked RAERO, ROPT, RPI, RTR and RMIN, with the target range cue and closure in knots.
- Pre-launch M-pole or F-pole in nm.
- Time readout `A nn` (to active) or `T nn` (to termination).
- After launch the same readouts appear for the MOI.
- The ASEC grows and shrinks with range.

**Palette for a stylised version:**
- HUD symbology in green, monochrome.
- F-15C VSD: green-on-black raster.
- F-16 and F/A-18 MFDs/DDIs: green on black (the F-16 FCR is monochrome green).
- F-16 RWR azimuth indicator: green symbols. F-15C TEWS: green.
- The Russian SPO-15 (Beryoza) uses coloured lamps (red for threat and lock). Its exact Cyrillic lamp labels are **not verified here**.

## Controls (default DCS names/keys)

**FC3 (F-15C and other Flaming Cliffs aircraft), from the F-15C manual:**

| Action | Key |
|---|---|
| Radar on/off | `I` |
| LRS / BVR search | `2` |
| Vertical scan (ACM) | `3` |
| Boresight | `4` |
| Visual / Flood (Sparrow) / AIM-9 seeker cage | `6` |
| TWS | `RAlt+I` |
| Cycle PRF (HI/MED/interleaved) | `RShift+I` |
| Scan width ±60° / ±30° | `RCtrl+-` |
| Antenna elevation | `RShift+;` / `RShift+.` |
| Move TDC | `;` `,` `.` `/` |
| Designate or lock (twice in TWS = STT) | `Enter` |
| Select weapon | `D` |
| ECM on/off | `E` |
| Chaff | `Insert` |
| Flare | `Delete` |
| Fire | `Space` (standard FC3 binding, not re-checked in this manual) |
| Unlock | `Backspace` (FC3 standard, not re-checked) |

**F/A-18C (HOTAS function names; check the exact wording in the Controls menu):**
- Sensor Control Switch (SCS) towards the radar display: RWS to TWS. Pressing it again cycles or returns.
- TDC and TDC Depress: lock or designate.
- Undesignate/NWS: step targets in TWS, or drop the lock back to search.
- Weapon Select switch: fwd = AIM-7, left = AIM-9, aft = AIM-120.
- Weapon Release (trigger).
- Countermeasure Dispense switch on the throttle.
- RWS (Range While Search) option on DDI pushbutton 5 in STT returns to RWS.

**F-16C (HOTAS names):**
- TMS Up: bug or lock (STT).
- TMS Right (hold): TWS.
- TMS Down: step back or unlock.
- DMS: display focus.
- Dogfight/MRM override switch to MRM: AMRAAM.
- CMS Fwd/Aft/Left/Right: countermeasures. CMS Aft = consent to automatic programs; CMS Fwd = manual program. **Verify these in the Controls menu.**

## Procedures

**A. Search and build tracks (all aircraft):**
1. Radar on. Use the widest azimuth. Point the elevation so the scan covers the expected altitude band at the expected range. The F-15C guide suggests covering 0–40,000 ft at 40 nm.
2. Stay in RWS/LRS with interleaved PRF until you get contacts. HI PRF sees hot targets far out. MED PRF sees low-closure targets.
3. Switch to TWS (F-15C `RAlt+I`; F/A-18 SCS towards the radar; F-16 TMS Right) once groups are inside about 40 nm. Keep manoeuvres gentle: TWS predicts each track between scans, and hard turns or leaving the scan volume drop tracks.
4. Check the picture (azimuth, range, champagne and so on), altitude and aspect. Decide who targets which contact.

**B. Designate and shoot (Fox 3):**
1. Designate the priority target in TWS: F-15C PDT, F/A-18 L&S, F-16 bugged target. Do **not** go STT unless you have to. STT gives the target a lock warning, and a launch warning when you fire.
2. Close to between Rpi/RMAX/ROPT and Rtr/RNE, depending on target aspect. Against a hot, non-manoeuvring target a shot near Rpi/ROPT is reasonable. Against a cold or manoeuvring target, wait for Rtr/RNE.
3. Before launch, climb and accelerate (supersonic if possible) and pitch 20–40° up for a loft (F-16 ROPT/RAERO). The AIM-120 also lofts itself when fired from range.
4. Fire, make the call ("Fox 3"), and note the time to active (F-15C `T`, F/A-18 `ACT`, F-16 `A`).

**C. Support the missile:**
1. Crank to about 50° off the target. Stay just inside the ±60° gimbal limit; on the F/A-18 the dot flashes at 45°+.
2. Hold the track until the missile goes active (the timer rolls to `M`, `TTG` or `A`).
3. If the track is lost, the AIM-120 continues inertially to the last intercept point and goes active on its own, with a lower chance of a hit.
4. For SARH (AIM-7, R-27R/ER), keep STT and illumination until impact. Do not turn beyond the gimbal limit, and do not let the target notch you.
5. After the missile goes active: pump (turn cold) or drag, or press the attack if the timeline allows.

**D. Defend against a radar missile:**
1. Read the RWR: search, then lock, then launch, or a sudden `M`/active symbol with no prior lock (a TWS Fox 3).
2. **SARH or STT launch:** turn to put the **shooter** on the beam (3/9 o'clock) and descend so you are below it. Hold within a few degrees of the beam, dispense chaff in bursts while in the notch, and turn off afterburner. Once the lock breaks, a SARH missile goes dumb.
3. **Active missile (spike without prior warning):** put the **missile's** bearing on the beam. It usually comes from the shooter's direction and high if lofted. Dive to put ground behind you and chaff in the notch.
4. **If there is enough range and time:** drag. Turn cold and run at full afterburner, descending into thicker air, so the missile runs out of energy. Look back towards the RWR to check.
5. **Beam at low altitude against a look-up shot?** The notch against an active seeker depends on ground in its beam, so if you are above the missile, drag rather than notch.
6. Recommit when the missile is defeated (timing it, or it goes stupid), but assume the enemy has more missiles in the air.

**E. 2-ship basics (DCS community practice):**
- **Grinder:** the two aircraft alternate shots and pumps so that one is always hot with a radar on the target.
- **Bracket:** the pair splits to opposite sides so a notch against one is a hot aspect for the other.
- **Sort:** each aircraft targets a different contact (in TWS the PDT, and SDTs in order).
- **Timelines:** skate, short skate or banzai, chosen against the threat's range; see the next list.

**F. Defend in time (timeline) rules:**
- Know the threat's Rmax and your own.
- Shoot first. Crank until your missile goes active.
- Turn cold before the enemy's missile can reach you at its maximum range.
- **Skate:** shoot, then leave before the threat's range.
- **Banzai:** shoot and press to the merge.
- **Short skate:** somewhere in between.
- MAR (minimum abort range) and DOR (desired out range) are real-world timeline terms. Tactics communities teach them; DCS itself does not.

**G. Suggested learning progression and drills.** This is my synthesis of how DCS training squadrons and published training missions are organised. It is not one published syllabus. Confidence: med.
1. **Sensor literacy:**
   - Radar modes, scan volume and elevation arithmetic.
   - RWR states: search, lock, launch, and the active `M`.
   - Drill: identify which of several AI aircraft is locking you, from the RWR alone.
2. **Single-target STT shot against a non-manoeuvring AI (MISSILE_ATTACK = MAX_RANGE, AI reaction = No reaction):**
   - Learn the DLZ cues: Rpi/RMAX, Rtr/RNE, Rmin.
   - Drill: shoot at Rpi, Rtr and 50% Rtr at high and low altitude and see which shots hit. This teaches the altitude/speed/aspect rule.
3. **TWS shots and crank:**
   - Drill: shoot in TWS, crank to 50°, and keep the track until the missile goes active.
   - Failure condition: a dropped track.
4. **Notch drills against SARH (R-27R/ER, AIM-7), with the AI shooting from above:**
   - Beam within ±5° and descend.
   - Chaff in the notch.
   - Measure "lock broken: yes/no".
5. **Notch and drag drills against a Fox 3:**
   - Against a TWS shot, react to the active spike.
   - Compare notching a lofted missile while low with notching a look-up shot while high.
   - Drag at maximum afterburner in a descent.
6. **Kinematic defence and timelines:**
   - Shoot, crank, pump at a set range (skate), then recommit.
   - Work out the threat's maximum range from its type.
7. **Offence against a defending AI (skill Veteran/Ace, reaction = Evade fire):**
   - Shoot at Rtr/RNE.
   - Get used to AI notches, and when to reshoot as the AI comes out of its notch.
8. **2-ship: sort, grinder, bracket.**
   - Communications: picture labels (azimuth, range, champagne), plus "Fox 3", "pitbull", "defending", "cold".
9. **Multiplayer (PvP) practice or squadron events.**

## Uncertain / conflicting

- **What the Lua velocity gates mean exactly** (`radial_velocity_min` vs `relative_radial_velocity_min`) and whether the AI/FC3 radars apply them in look-up as well as look-down. Candidates: (a) ground-referenced radial speed of the target, applied only when the ground is behind it; (b) applied regardless of geometry. Confidence low.
- **Notch width of player-module radars** (F/A-18, F-16, JF-17, M-2000C, MiG-29A). The code is not public. A 2022 thread on the F-16 was tagged "correct as-is" for easy look-down notches. For the MiG-29A (2026), the real manual says the radar tracks through the notch in look-up (antenna more than 5° up), above 2,500 m and inside 10–15 km; ED has not confirmed whether it is modelled. Confidence low.
- **Missile notch width after 2022.** 2021 testers disagree: about 100 kt ±15 kt versus under 20 kt. ED's May 2022 fix made AMRAAMs harder to notch inside pitbull range. Treat it as "near zero radial speed, ground behind you, plus chaff". Confidence low on the number.
- **Exact chaff roll formula.** Chaff is believed to be a per-bundle probability involving `ccm_k0`, notch state and perhaps seeker range. The formula is not public.
- **STT Fox 3 launch warning.** It is inferred from the FC3 manual wording ("unlike STT, a TWS launch will not provide … launch indication"). How long the shooter's launch warning lasts after the missile goes active is unverified. Probable answer: it lasts while the shooter holds STT, and the missile's own `M`/active symbol then takes over.
- **Is `D_max` the pitbull distance?** It matches the community "about 8 nm" and the 14/15/16 km pattern, but ED does not document it. `D_max` is 70 km on PL-12/SD-10 (new scheme), so the field clearly has other meanings there.
- **Whether AI launch range depends on skill.** The MISSILE_ATTACK option sets the range. The 2022 changelog says the tactics depend on skill, but how skill changes launch range is not documented.
- **Whether AI still "sees" TWS Fox 3 launches.** Per 2021 and June 2026 changes, it should not react before the seeker goes active. Community reports of instant AI awareness predate the 2026 change.
- **HOTAS/keyboard defaults for the F/A-18 and F-16 countermeasure switches**, and the Cyrillic SPO-15 lamp labels. These were not verified in this pass.
- **AIM-7 loft rules in DCS.** The Lua has `loft_active_by_default = 1` (6.5–20 km), while a 2021 changelog says "AIM-7F/M loft disabled by default (F-15C)". It probably depends on the aircraft (the F/A-18 has a LOFT option).

## Sources

1. DCS Lua datamine, AN/APG-63 sensor: https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/db/Sensors/Sensor/ANAPG-63.lua
2. DCS Lua datamine, sensors folder (ANAPG-68/71/73, N-019, N-019M, N-001, KLJ-7): https://github.com/Quaggles/dcs-lua-datamine/tree/master/_G/db/Sensors/Sensor
3. DCS Lua datamine, AIM-120C: https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/weapons_table/weapons/missiles/AIM_120C.lua
4. DCS Lua datamine, AIM-7MH: https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/weapons_table/weapons/missiles/AIM-7MH.lua
5. DCS Lua datamine, rockets (P_77, P_27P/PE/T/TE, AIM_120, AIM_54C_Mk47, AIM_9*, P_73, P_60, MICA, SD-10, PL-12): https://github.com/Quaggles/dcs-lua-datamine/tree/master/_G/rockets
6. DCS 2.7.1.6430 Open Beta changelog (2021): https://www.digitalcombatsimulator.com/en/news/changelog/openbeta/2.7.1.6430/ (stable 2.7.1.7139, 11.06.2021: https://www.digitalcombatsimulator.com/en/news/changelog/release/2.7.1.7139/)
7. DCS 2.7.14.24228 changelog (27.05.2022): https://www.digitalcombatsimulator.com/en/news/changelog/release/2.7.14.24228/
8. DCS 2.9.27.24969 changelog (12.06.2026): https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.27.24969/
9. DCS 2.9.27.25183.5 changelog (23.06.2026): https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.27.25183.5/
10. DCS 2.9.13.6818 changelog (19.02.2025): https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.13.6818/
11. DCS 2.9.20.15010 changelog (17.09.2025): https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.20.15010/
12. DCS 2.9.14.8222 changelog (19.03.2025): https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.14.8222/
13. DCS 2.9.1.48335 changelog (29.11.2023): https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.1.48335/
14. DCS 2.9.9.2280 (30.10.2024), 2.9.10.3948 (04.12.2024), 2.9.11.4686 (24.12.2024) changelogs: https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.9.2280/ ; https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.10.3948/ ; https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.11.4686/
15. DCS 2.8.7.42718 changelog (02.08.2023): https://www.digitalcombatsimulator.com/en/news/changelog/release/2.8.7.42718/
16. FlyAndWire, "NEW Patch: AI Group Improvements – DCS 2.9.7.58923" (2024-08-10): https://flyandwire.com/2024/08/10/new-patch-ai-group-improvements-dcs-2-9-7-58923/
17. DCS F-15C Flaming Cliffs Flight Manual (ED/Belsimtek): https://www.digitalcombatsimulator.com/upload/iblock/1ad/F-15C%20DCS%20Flaming%20Cliffs%20Flight%20Manual%20EN.pdf
18. DCS F-16C Viper Early Access Guide (ED): https://www.digitalcombatsimulator.com/upload/iblock/e78/33zl8132hi71d3tv0194vvkzpzl3mrr6/DCS%20F-16C%20Early%20Access%20Guide%20EN.pdf
19. DCS F/A-18C Early Access Guide (ED): https://www.digitalcombatsimulator.com/upload/iblock/ea9/lxf69u2uk1fhqq7ndb55z9egzabe8hdg/DCS%20FA-18C%20Early%20Access%20Guide%20EN.pdf
20. Heatblur F-14 manual, AN/AWG-9 General Operation: https://f14.manuals.heatblur.se/f14ab/systems/radar/general_operation.html
21. ED Forums, "Active Missile Look Down Notch Width Seems Excessive" (Sep 2021): https://forum.dcs.world/topic/283107-active-missile-look-down-notch-width-seems-excessive/
22. ED Forums, "Radar detect target inside Notch BUG" (Dec 2021 – Jan 2022): https://forum.dcs.world/topic/288302-radar-detect-target-inside-notch-bug/
23. ED Forums, "Look Down Clutter Notch Question" (F-16, Jul 2022, tagged correct as-is): https://forum.dcs.world/topic/305634-look-down-clutter-notch-question/
24. ED Forums, "How is AIM-120 guided by the datalink in DCS?" (Dec 2021): https://forum.dcs.world/topic/289429-how-is-aim-120-guided-by-the-datalink-in-dcs/
25. ED Forums, "Can you program your pitbull range for the AIM-120?" (2014): https://forum.dcs.world/topic/101273-can-you-program-your-quotpitbullquot-range-for-the-aim-120/
26. ED Forums, MiG-29A radar notch/COOP threads (2026): https://forum.dcs.world/topic/391724-radar-radial-speed-limit-in-lock/ ; https://forum.dcs.world/topic/385253-radar-problem-with-coop-on/
27. Hoggit wiki, AI option Missile Attack: https://wiki.hoggitworld.com/view/DCS_option_missileAttack
28. FlyAndWire, "DCS: A needed (and simple?) A/A AI improvement" (2025-01-10): https://flyandwire.com/2025/01/10/dcs-a-needed-and-simple-a-a-ai-improvement-thoughts/
29. FlyAndWire, "Introduction to the RIO seat: Antenna Elevation, MLC, Countering Notching, TWS" (2019): https://flyandwire.com/2019/05/24/introduction-to-the-rio-seat-antenna-elevation-mlc-countering-notching-tws/
30. Ktulu2 et al., "DCS BVR Strategy Guide" (community, c. 2017–2018, older patch era): https://s3.amazonaws.com/hoggitworld-manuals/DCS+BVR+STRATEGY+GUIDE-FINAL.pdf
31. Community JAS-39 mod Lua with the ED-style `ccm_k0` comment: https://github.com/whisky-actual/Community-JAS-39-C/blob/master/Mods/aircraft/JAS39/Weapons/Loadouts/jas39_aim-9m.lua
32. Hoggit wiki, Brevity List: https://wiki.hoggitworld.com/view/Brevity_List
33. DCS user-file training resources (not opened here because of a Cloudflare block): v57th FW BVR Basics Manual https://www.digitalcombatsimulator.com/en/files/3308886/ ; BVR Training Missions Level 01 https://www.digitalcombatsimulator.com/en/files/3331147/ ; F-15C Training Missions https://files.digitalcombatsimulator.com/en/files/3313014/
