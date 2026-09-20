# Air-to-air missiles in DCS World: gameplay facts for a trainer (launch zones, pitbull, seeker type, defences)

> Scope: pilot-facing gameplay facts only (what the DCS DLZ shows, how each missile behaves for the player, how to defend). Engineering internals were intentionally left out; the app models missiles as game mechanics tuned to these numbers.

Research date: 2026-09-19. The datamine snapshot is DCS **2.9.29.27278** (Quaggles datamine, commit of 2026-08-26). All "DCS" numbers below come from the game's own Lua unless marked otherwise. Unit conventions: 1 nm = 1.852 km, 1 rad = 57.3°.

## Summary (what a trainer designer must know)

2. **Every missile carries ED's own launch-zone reference table** in `ModelData[50..55]`: head-on and tail-chase ranges at 5 km, 10 km and 1 km altitude, with shooter and target both at 900 km/h (about M0.85 at 10 km). That is almost exactly the requested reference geometry. These values drive the FC3/AI DLZ. They are **not** a guarantee of what the 6-DOF missile can actually reach (see the range table).
3. **Reference ranges (DCS table, 10 km head-on / 10 km tail / 1 km head-on):** AIM-120C 75/21.5/25 km; AIM-120B 65/19.5/21.5; SD-10 80/25/25; R-77 45/18/17.7; R-27ER 59/27/25.5; R-27ET 58/25.5/24; R-27R 35/12/16; R-27T 31/11/14; AIM-7M/MH 38/12/19; Super 530D 46/18/19; AIM-54 (all) 120/46/44; AIM-9M, AIM-9X and PL-5EII 27/10/10.5; R-73 27/12/11; Magic II 16/6/7.5.
4. **Seeker type drives the defence you teach.** SARH (R-27R/ER, AIM-7M/MH, Super 530D, AIM-54 in PD-STT) needs the shooter's radar lock for the whole flight, so killing the lock (notch, or beam plus chaff against the *shooter's* radar) defeats it. ARH (AIM-120, R-77, SD-10, AIM-54 in TWS or active) is datalink or inertial until the seeker goes active, then autonomous, so after pitbull the defence is beam or notch *the missile* plus chaff, then kinematics. IR (R-27T/ET, R-73, AIM-9M/X, PL-5EII, Magic II) gives no RWR launch warning. The defence is flares plus kinematics, and the IR-CCM factor `ccm_k0` matters.
5. **Burn times are short. Energy, not fuel, decides range.** In DCS: AIM-120C 6.5 s single burn; AIM-120B 2.1 s boost + 5.0 s sustain; R-27ER/ET 2.5 s + 5.5 s; R-27R/T 6 s; AIM-7M/MH 3.7 s + 10.8 s; SD-10 6 s + 4 s; Super 530D 2 s + 8.5 s; R-77 5.1 s; R-73 5.5 s; AIM-9M 5.2 s; AIM-9X 5.0 s; PL-5EII 6 s; Magic II 1.88 s; AIM-54 legacy stub 27 s.
6. **Loft is per missile.** AIM-120B/C lofts about 30° when launched beyond about 25 km and stops lofting inside 15 km. SD-10 has loft data (30 km off-range) but AI shooters were observed not lofting it. AIM-7MH lofts by default and AIM-7M does not. Super 530D lofts beyond 18.5 km (10 nm). AIM-54 lofts at range but not inside about 10 nm (or about 21 nm per community tests). **R-77 and the R-27 family do not loft.** Since 2.9.20, manual pitch-up "loft" of the R-27 is corrected by its autopilot.
7. **Battery and guidance time limit long shots.** R-27R/ER autopilot `op_time` is 60 s, AIM-7 75 s, AIM-120B 80 s, AIM-120C 100 s, SD-10 100 s, Super 530D 45 s, R-77 70 s, AIM-54 about 200 s. After that time the missile is dead even if it still has speed.
8. **Pitbull rules.** AIM-54 in TWS goes active per the DDD TGTS switch (SMALL 6 nm, NORM 10 nm, LARGE 13 nm, about 16 s to impact). In PD-STT it stays SARH to impact. Inside 10 nm, or with PH ACT, it comes off the rail active. AIM-120 activation is computed by the launching jet: the F-16 HUD shows "A nn" (seconds to active) and then "T nn" (time to impact), and the F/A-18C shows "nn ACT". The exact AIM-120, R-77 and SD-10 activation distance is not published in the Lua (see Uncertain).
9. **Notching and chaff in DCS.** Doppler seekers and radars lose targets whose closing velocity is near zero, especially in look-down against ground clutter. Chaff works mainly when the target is in or near the notch. Since 2.9.20 the R-27 SARH seeker also has a "multitarget" gate, so a group of targets or chaff inside the range and velocity gate forms one apparent target.

## Facts

### A. Reference DLZ table from the DCS Lua (ModelData[50..55])

Layout confirmed from ED-style commented copies: [47] dR/dV shooter, [48] dR/dV target, [49] altitude derivative, then head-on (180°) and tail (0°) pairs at H = 5000 m, 10000 m and 1000 m, with V = 900 km/h, then [56] Rmin rear offset and [57..58] "guaranteed range" (NEZ) fraction. (a) = 10 km head-on, (b) = 10 km tail/fleeing target, (c) = 1 km head-on.

| Missile | (a) 10 km head-on | (b) 10 km tail | (c) 1 km head-on | 5 km head-on / tail | D_min (min range) | Range_max (legacy) | DCS-modelled? | Conf. | Src |
|---|---|---|---|---|---|---|---|---|---|
| R-27R | 35 km / 18.9 nm | 12 km / 6.5 nm | 16 km / 8.6 nm | 21 / 7.2 km | 1.5 km | 35 km | yes | high | 1,2,3 |
| R-27ER | 59 km / 31.9 nm | 27 km / 14.6 nm | 25.5 km / 13.8 nm | 35 / 15 km | 1.5 km | 60 km | yes | high | 1,2,3 |
| R-27T | 31 km / 16.7 nm | 11 km / 5.9 nm | 14 km / 7.6 nm | 19 / 6.4 km | 1.5 km | 25 km | yes | high | 1,2,3 |
| R-27ET | 58 km / 31.3 nm | 25.5 km / 13.8 nm | 24 km / 13.0 nm | 33 / 14.5 km | 1.5 km | 54 km | yes | high | 1,2,3 |
| R-77 | 45 km / 24.3 nm | 18 km / 9.7 nm | 17.7 km / 9.6 nm | 25 / 10 km | 0.7 km | 50 km | yes | high | 1,3 |
| R-73 | 27 km / 14.6 nm | 12 km / 6.5 nm | 11 km / 5.9 nm | 15 / 6 km | 0.3 km | 12 km | yes | high | 1,3 |
| AIM-120B | 65 km / 35.1 nm | 19.5 km / 10.5 nm | 21.5 km / 11.6 nm | 33 / 10 km | 0.7 km | 57 km | yes | high | 1,3 |
| AIM-120C(-5) | 75 km / 40.5 nm | 21.5 km / 11.6 nm | 25 km / 13.5 nm | 35 / 12 km | 0.7 km | 61 km | yes | high | 1,2,3 |
| AIM-7M | 38 km / 20.5 nm | 12 km / 6.5 nm | 19 km / 10.3 nm | 27 / 7 km | 1.5 km | 50 km | yes | high | 1,3 |
| AIM-7MH | 38 km / 20.5 nm | 12 km / 6.5 nm | 19 km / 10.3 nm | 27 / 7 km | 1.5 km | 50 km | yes | high | 1,3 |
| AIM-9M | 27 km / 14.6 nm | 10 km / 5.4 nm | 10.5 km / 5.7 nm | 15.5 / 5.5 km | 0.3 km | 14 km | yes (kinematic only; IR lock range is the real limit) | high | 1,3 |
| AIM-9X | 27 km / 14.6 nm | 10 km / 5.4 nm | 10.5 km / 5.7 nm | 15.5 / 5.5 km | 0.2 km | 14 km | yes | high | 1,3 |
| AIM-54A-Mk47 / A-Mk60 / C-Mk47 | 120 km / 64.8 nm | 46 km / 24.8 nm | 44 km / 23.8 nm | 72 / 28 km | 0.7 km | 180 km | yes for the ED stub. The HB F-14 computes its own DLZ | med | 1,5 |
| SD-10 | 80 km / 43.2 nm | 25 km / 13.5 nm | 25 km / 13.5 nm | 37 / 14 km | 1.0 km | 70 km | yes | high | 1,3 |
| PL-5EII | 27 km / 14.6 nm | 10 km / 5.4 nm | 10.5 km / 5.7 nm | 15.5 / 5.5 km | 0.3 km | 16 km | yes | high | 1,3 |
| Super 530D | 46 km / 24.8 nm | 18 km / 9.7 nm | 19 km / 10.3 nm | 28 / 9.6 km | 2.5 km (new API) / 1.5 km (legacy) | 40 km | yes | high | 1,3 |
| Magic II | 16 km / 8.6 nm | 6 km / 3.2 nm | 7.5 km / 4.0 nm | 10 / 3.3 km | 0.5 km | 10 km | yes | high | 1,3 |

Other DLZ coefficients (dR/dV shooter, dR/dV target): AIM-120C 21/−23; AIM-120B 21/−25; SD-10 21/−23; R-27ER/ET 21/−28; R-27R/T 14/−19; AIM-7 14/−21; R-77 12/−18; Super 530D 17/−18; IR short-range 9/−13; Magic II 6/−8; AIM-54 50/−45. NEZ ("guaranteed") fraction at 1 km: 0.4 (AIM-120, AIM-7, SD-10, AIM-54) to 0.55 (AIM-9, R-73).

### B. Community and manual range data (actual flight, not table)

| Topic | Fact / value | DCS-modelled? | Conf. | Src |
|---|---|---|---|---|
| ARH employment (AI shooters, dead-ahead, all hit) | 10,000 ft, M0.9 vs M0.8: 14 nm (R-77 11 nm). 25,000 ft, M1.0 vs M0.8: 23 nm (R-77 19 nm). 35,000 ft, M1.2 vs M0.9: 30 nm (R-77 about 26 nm) | yes (community test, Dec 2024) | med | 10 |
| 10,000 ft, 14 nm, target cranking 60° | 3 of 6 ARH types failed (AIM-54C Mk60 and AIM-120B missed by about 0.05 nm) | yes (community) | med | 10 |
| Manual loft | AIM-120C-5 "almost doubles effective range". SD-10 at 35k with 15° pitch gains about 10 nm. AIM-54 "easily employed at 70 nm" | yes (community) | med | 9 |
| R-77 | Does not loft; AI does not shoot it beyond about 26 nm at 35k; weakest against manoeuvring targets | yes (community) | med | 9,10 |
| R-27ER (ED Su-27 manual) | Max forward hemisphere 66 km at 10 km altitude, 28 km at 1 km; rear hemisphere 10 km at 1 km | manual text (the Lua table says 59 / 25.5 / 9.6 km) | med | 6 |
| FC3 lock and launch authorization | Auto STT lock at 85% of computed Rmax; "ПР" appears at ≤85% Rmax | yes | high | 6 |
| R-27 after 2.9.20 | Manual loft gives no benefit (autopilot corrects pitch). LAR indication "more accurate". Kinematics about the same as the 2023 R-27ER | yes (from 2025-09-17) | high | 7,8 |
| Low altitude | "Near ground level… launch range is more than halved"; rear hemisphere is 2 to 3 times shorter than head-on | yes (ED manual) | high | 6 |

### E. Midcourse, pitbull and activation rules

| Missile / platform | Rule | DCS-modelled? | Conf. | Src |
|---|---|---|---|---|
| SARH (R-27R/ER, AIM-7M/MH, Super 530D) | Shooter must hold STT (continuous illumination) until impact. If the lock is lost briefly and regained quickly the missile continues. R-27R/ER fly inertial with radio correction midcourse (with realistic INS/datalink errors since 2.9.20). An R-27 RF missile cannot be launched above 120° bank (INS roll limit) | yes | high | 6,7,8 |
| R-27R/ER new seeker (2.9.20+) | "Multitarget" tracking: returns from several targets, or chaff, in the gate merge into one apparent target, which can pull the missile between targets or steal the velocity gate | yes (2025-09-17) | high | 7 |
| AIM-54, F-14 TWS | SARH/command guidance, then the AWG-9 sends the go-active command about 16 s to impact. Distance set by DDD TGTS switch: SMALL 6 nm, NORM 10 nm, LARGE 13 nm (switch position read at launch). AIM-54C is not affected by the switch. TTI numbers blink when active is commanded. Target RWR is silent until active | yes | high | 5 |
| AIM-54, F-14 PD-STT | Pure SARH to impact; target RWR shows launch immediately; lofts at range | yes | high | 5 |
| AIM-54: PH ACT, ACM, BRSIT, non-PD track, or target within 10 nm (forward) / 6 nm (rear) | Active off the rail; no loft; about 10 nm max against a fighter. PH ACT must be set before launch | yes | high | 5 |
| AIM-120 (F-16C) | HUD shows "A nn" (seconds to active) after launch, then "T nn" (seconds to impact) | yes | med | 11,12 |
| AIM-120 (F/A-18C) | HUD "nn ACT" = pre- or post-launch time to active | yes | med | 13 |
| AIM-120 with no track / lock lost | Flies to last extrapolated point on INS, then goes active and takes the first target its seeker finds. With no lock at launch (boresight, "maddog") it is active from launch | yes | med | 12, community |
| ARH generic (ED manual) | "Once the missile is within 10 to 20 km of the target, the onboard radar seeker activates" | ED text (generic) | med | 6 |
| IR missiles | Lock before launch. R-27T/ET must have the seeker locked before launch. No RWR warning | yes | high | 6 |

### F. Notching and countermeasures (how DCS treats each seeker type)

| Topic | Fact | DCS-modelled? | Conf. | Src |
|---|---|---|---|---|
| Doppler notch | Radars and PD seekers reject contacts whose closing velocity is near zero relative to the radar, especially in look-down against clutter. Beaming the *missile* (ARH after pitbull) or the *shooter's radar* (SARH, or ARH before pitbull when datalink-guided) breaks track | yes | med | 10, general |
| Chaff | Chaff is most effective when the target is in or near the notch. Head-on or straight-away chaff is largely rejected by Doppler gating. FlyAndWire calls DCS notching "absurd" (very effective) | yes | med | 9,10 |
| Defeated ARH | In community tests, notched ARH missiles "did not attempt to reacquire" the target | yes (community) | med | 10 |
| IR | Flares against `ccm_k0`: AIM-9X 0.2 (hard), most others 0.5. Seeker sensitivity range is 20–25 km against a hot target; the real lock range is shorter at low aspect or without afterburner | yes | med | 1 |
| HOJ | `hoj = 1` on AIM-120B/C, R-77, R-27R/ER, AIM-7, AIM-54, SD-10 and Super 530D: they home on jamming. AIM-54 does this automatically | yes | high | 1,5 |

## Display & symbology

**FC3 Su-27 / J-11A / MiG-29 HUD (ED manual):**
- The mode label sits bottom-left: "ОБЗ" (SCAN), "СНП ДВБ" (TWS BVR), "АТК ДВБ" (STT BVR).
- The selected weapon sits bottom-right under the elevation scale, for example "27ЭР" = R-27ER. Other labels are likely "27Р", "27Т", "27ЭТ", "73" and "77" (low confidence).
- The left side carries a vertical **range scale** with three thick inward-facing ticks. From the top: **Rmax** (non-manoeuvring target), **Rtr** (manoeuvring target, the "no-escape" range) and **Rmin**. An arrow shows the current range.
- **"ПР"** (launch authorized) appears inside the zone.
- The attack symbol flashes at 2 Hz after launch.
- PRF labels: "ППС" (Hi PRF, forward hemisphere), "ЗПС" (Med PRF, rear hemisphere), "АВТ" (interleaved/auto).
- Aspect indicator; a round dot shows antenna position.
- The HDD shows the selected weapon's DLZ (src 6).

**F-16C HUD (DCS):** a DLZ range scale on the right with a target caret. After launch, an "A nn" countdown is shown under it, which switches to "T nn" (src 11,12). Exact Rmax1/Rmax2/Rtr/Rmin tick shapes were not verified here.

**F/A-18C HUD:** a DLZ plus a "nn ACT" time-to-active cue (src 13). The Rmax/Rne/Rmin/Raero tick details were not verified here.

**F-14 TID:** track priority numbers 1–6 become TTI after launch, and blink when the active command is sent. Tracks under attack stay bright until TTI + 15 s. The breakaway X shows on VDI, DDD and TID 15 s after the last TTI (src 5).

**Suggested colours for a stylised trainer:** HUD green (#3f3 on dark). The F-14 TID is monochrome green/amber. These are not from a source.

## Controls

**FC3 (Su-27/J-11A/MiG-29/F-15C), keyboard defaults from the ED manual (src 6):**

| Action | Key |
|---|---|
| Radar on/off | [I] |
| BVR mode | [2] |
| TWS | [RAlt-I] |
| PRF (ППС/ЗПС/АВТ) | [RShift-I] |
| HUD/HDD range scale | [+] / [-] |
| TDC slew | [;] [,] [.] [/] |
| Lock (STT) | [Enter] |
| Cycle weapon | [D] |
| Gun | [C] |
| Fire | [Space] (hold ≥1 s) |
| Launch-authorization override | [LAlt-W] |
| Manual range entry | [RCtrl-+] / [RCtrl--] |
| Azimuth zone | [RShift-,] / [RShift-/] |
| Scan elevation | [RShift-;] / [RShift-.] |
| HMS mode | [5] |

**F-14 (HB):**
- Pilot: weapon selector SP/PH, where depressing toggles SP↔PH. Trigger fires. MSL PREP switch on the ACM panel (AIM-54 prep takes about 2 min). ACM cover.
- RIO: MSL OPTIONS switch (PH ACT must be set before launch), DDD TGTS switch SMALL/NORM/LARGE, CAP NEXT LAUNCH / do-not-attack (src 5).

**F/A-18C and F-16C HOTAS (function names, medium confidence, not verified in this pass):**
- Hornet: Weapon Select switch has Fwd = Sparrow, Left = AMRAAM, Depress = Sidewinder. A/A missiles fire on the trigger.
- Viper: Dogfight switch aft = MISSILE OVERRIDE (AIM-120). MSL STEP (on the NWS/A-R DISC button) steps missile type. A/A missiles fire with Weapon Release (pickle).

## Procedures

**FC3 R-27R/ER (SARH) (src 6):**
1. Select [2] BVR, radar on [I], set range scale with [+]/[-], and select PRF (ППС for a head-on target).
2. Slew the azimuth and elevation zone onto the target (GCI/AWACS range and altitude help).
3. Wait up to about 6 s for detection. In TWS, the TDC snaps to the contact.
4. Lock with [Enter]. If you are beyond 85% of Rmax, the lock is deferred until 85%.
5. When "ПР" appears (prefer inside Rtr against a manoeuvring target), hold [Space] for at least 1 s.
6. Keep STT until impact. The shooter's RWR shows CW illumination as a launch, so the target knows.
7. If the lock drops, re-lock quickly and the missile continues.

**FC3 R-27T/ET and R-73 (IR):**
1. Cue with IRST or radar.
2. Get the seeker lock (tone).
3. Fire.
4. Leave. No support is needed.

**FC3 R-77:**
1. Lock STT and fire.
2. Hold the lock to support midcourse.
3. Once the seeker is active you may break lock. The ED manual gives the activation band as generic 10–20 km.

**F-14 AIM-54 TWS:**
1. Set MSL PREP about 2 min before.
2. Set TGTS (NORM = 10 nm).
3. In TWS AUTO, check the firing order 1–6.
4. Press the trigger once per missile and wait for each to clear.
5. Keep the targets in the scan zone until the TTI numbers blink (active command sent), then you may turn away.
6. For shots under 10 nm, or with PH ACT, the missile is active off the rail (src 5).

**AIM-120 (F-16C/F-18C):**
1. Bug or lock the target.
2. Fire inside the DLZ.
3. Crank to about 50–60° while holding the track and watching "A nn" or "nn ACT".
4. At pitbull (A → T), you may drop the track and defend or turn cold.

**Defending (generic, DCS):**
1. On a launch warning, turn to put the threat at 3 or 9 o'clock (beam).
2. Descend to get look-down clutter.
3. Drop chaff in the beam for radar missiles.
4. Against SARH, beam the shooter's radar. Against ARH before pitbull, beam the shooter (datalink). Against ARH after pitbull, beam the missile.
5. If the missile still tracks, go cold and drag it to kinematic defeat. Its energy is gone after 6–15 s of burn plus coast.

## Uncertain / conflicting

- **AIM-120B/C, R-77 and SD-10 activation distance** is not in the Lua. Candidates:
  - about 10 nm (18.5 km) for the C, which ED forums commonly report;
  - about 8 nm (Steam posts);
  - the ED Su-27 manual's generic 10–20 km;
  - `sensor.sens_far_dist` = 30 km. This is probably the seeker's maximum detection range against a reference RCS, not the activation range.

  `D_max` (14/16/15 km) is "max launch range at low altitude" in ED's legacy comments, **not** pitbull, so SD-10's D_max of 70 km is consistent with that reading. Confidence low.
- **The AIM-54 Mk47 vs Mk60 difference** is not visible in the ED stub (the two entries are identical). The Heatblur FM is closed. Community tests say both burn about 27–30 s, with Mk47 slightly longer (src 10). Confidence low for thrust numbers.
- **AIM-7M `sensor` vs `seeker` tables.** Which one is the RF seeker used for chaff logic is unclear. The 7MH has `seeker` ccm_k0 0.5 vs 1.0 on the 7M, so the MH is probably more chaff-resistant.
- **Real lengths** come from ED manual text or public data, not the Lua. The R-27T is 3.7 m (ED) vs about 3.8 m (public).
- **Whether the SD-10 actually lofts when a player shoots it.** The Lua has loft data, but AI shots were observed flat (src 9).
- **Hornet/Viper DLZ tick naming and shapes**, and exact keyboard defaults for the F-16 and F-18, were not verified in this pass.
- **Notch gate width** (radial-velocity threshold) in DCS is not published. Community estimates vary. Build the trainer with a tunable parameter.

## Sources

1. Quaggles DCS Lua datamine, build 2.9.29.27278 (2026-08-26): https://github.com/Quaggles/dcs-lua-datamine. Files used: `_G/weapons_table/weapons/missiles/{AIM_120,AIM_120C,AIM_7,AIM-7MH,P_27P,P_27PE,P_27T,P_27TE,SD-10,Matra Super 530D}.lua` and `_G/rockets/{P_77,P_73,AIM_9,AIM_9X,AIM_54A_Mk47,AIM_54A_Mk60,AIM_54C_Mk47,PL-5EII,MMagicII,Super_530D}.lua`. The AIM-7 gimbal changed in commit afc4b4a38a (2.9.27, 2026-06-23). R-27 new-API entries first appear at 2.9.20 (2025-09-17).
2. Raw example: https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/weapons_table/weapons/missiles/AIM_120C.lua
3. ModelData index comments (ED-style, community mod): https://github.com/whisky-actual/Community-JAS-39-C/blob/Master/Mods/aircraft/JAS39/Weapons/Loadouts/jas39_aim-120c5.lua
4. Legacy parameter meanings (Fi_start, Fi_excort, D_max…), commented: https://github.com/Auranis/HighDigitSAMs/blob/main/Mods/tech/HighDigitSAMs/Database/Weapon/9M82.lua
5. Heatblur F-14 manual, AIM-54: https://f14.manuals.heatblur.se/ (source: https://github.com/Heatblur-Simulations/f-14-manual/blob/master/src/f14ab/stores/air_to_air/aim_54.md)
6. ED DCS Su-27 Flight Manual (EN): https://cdn.akamai.steamstatic.com/steam/apps/250310/manuals/DCS_Su-27_Flight_Manual_EN.pdf
7. DCS 2.9.20.15010 changelog (R-27 overhaul): https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.20.15010/
8. FlyAndWire, "A Look at the New R-27 Missile Family" (2025-09-24): https://flyandwire.com/2025/09/24/a-look-at-the-new-r-27-missile-family/
9. FlyAndWire, "Active Radar Homing Missiles I" (2024-11-18): https://flyandwire.com/2024/11/18/active-radar-homing-missiles-i-first-launch-opportunity-ranges/
10. FlyAndWire, "Active Radar Homing Missiles II" (2024-12-08): https://flyandwire.com/2024/12/08/active-radar-homing-missiles-ii-performance-comparison/
11. ED Forums, "Aim-120 / Time to Active" (F-16C): https://forum.dcs.world/topic/223446-aim-120-time-to-active/ (known only from a search summary; the forum blocks fetches)
12. Steam discussion, F-16 AIM-120 pitbull indication: https://steamcommunity.com/app/223750/discussions/0/2965020518357150156/
13. Stormbirds, F/A-18C AIM-120 features (2018): https://stormbirds.blog/2018/08/13/new-dcs-f-a-18c-update-details-ew-aim-120-and-aim-9x-features/
14. Community missile-sim extractor notes (for field semantics): https://github.com/NikNam3/sourcedcs/blob/main/tools/missile_simulation/public/js/weapon-extract.js
