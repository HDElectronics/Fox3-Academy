# F-14 Tomcat, JF-17 Thunder and M-2000C: Air-to-Air Radar and Missiles in DCS

Scope: Heatblur F-14A/B (with notes on the new F-14B(U)), Deka JF-17 Thunder, and RAZBAM M-2000C, as modelled in DCS World, plus a short survey of other DCS aircraft that carry BVR radar missiles. Rule used throughout: **what DCS does wins**. Where the real aircraft differs, both are given.

## Summary (what a trainer designer must know)

- **F-14 AWG-9 has 7 radar modes, with the RIO running them.** PULSE SRCH, P-STT, PD SRCH, RWS, TWS AUTO, TWS MAN and PD-STT. Only **TWS** can guide AIM-54s at several targets at once: up to **6 Phoenix at 6 targets**, drawn from **24 tracks** (18 shown on the TID). The firing order is set by the WCS as **priority numbers 1-6** on the TID. Each trigger press fires one missile at priority 1, and the remaining numbers then move up by one. TWS is locked to **±20° 4-bar or ±40° 2-bar** so that every track is refreshed every 2 s.
- **How an AIM-54 guides in DCS depends on the radar mode at launch:**
  - **TWS:** mid-course guidance from the AWG-9, then an "active" command at about **16 s time-to-impact**. The distance depends on the TGTS switch: **SMALL 6 nm, NORM 10 nm, LARGE 13 nm**. The target's RWR sees nothing until the missile goes active.
  - **PD-STT:** **pure SARH all the way to impact**, never active. The target gets a launch warning at once.
  - **P-STT, any non-PD mode, the ACM/boresight modes, PH ACT, or any shot inside 10 nm:** **active off the rail** and no loft, so the missile has much less range.
- **The AIM-7 needs STT.** Normal guidance is CW from PD-STT or P-STT. The **SP PD** option (AIM-7F/M only) uses pulse-doppler illumination. Without STT, the WCS uses CW **flood/boresight** mode.
- **The JF-17 KLJ-7** has these modes: RWS, TWS, VS, SAM (ASM/NAM), STT, DTT, and ACM (VT/BS/HA). TWS holds **10 tracks** and can attack **2 targets** (HPT and SPT). The first TDC press **bugs** a track as the HPT, which is not a lock. The second press gives STT. An SD-10 fired from TWS gives the target **no launch warning** until the seeker goes active. After launch the HUD counter changes from TOF to **TOA** (time to activation).
- **The M-2000C RDI has no multi-target TWS.** Its "TWS" is **PSID (PID)**, which tracks **one** target while scanning a 1-bar pattern. **The Super 530D can be guided only from PSIC/STT (PIC).** If you pull the trigger while in PID, the radar first switches to PIC and then fires. The 530D is SARH all the way: hold the lock until impact. After a shot the radar enters **PSIC Super 530** for 50 s, and the missile battery lasts about 45 s.
- **The three RWRs show threat level in different ways, which is a common mistake for students:**
  - **F-14 ALR-67:** the outer ring is **critical**.
  - **JF-17 (RWR on the HSD):** the inner band is lethal (tracking you). Colour matters: **yellow = search**, **red = lock**, **flashing = launch**.
  - **M-2000C Serval (VCM):** the closer a symbol is to the centre, the more dangerous the threat.
- **Controls to get right:**
  - F-14: Jester menu **A**, then **LCtrl+1...8**. The pilot selects Phoenix with Weapon Selector SP/PH and presses the selector to toggle SP↔PH. ACM lock modes: PAL / VSL HI / VSL LO on the Target Designate switch, and PLM on its own button.
  - JF-17: TDC press (T5) bugs and then locks. **S2 LEFT** cycles modes, or swaps HPT and SPT once targets are bugged. S2 press unlocks. Weapon release is **RAlt+Space**.
  - M-2000C: **STT/TWS toggle** preselects PIC or PID. TDC depress locks. **Weapons System CMD depressed** unlocks. The MiCRoB trigger 2nd stage (**Space**) must be held for 2 s or more to fire the 530.
- **Status caveats:** RAZBAM modules (M-2000C, F-15E, AV-8B) were **removed from the ED store on 7 April 2025**. ED says they "remain operational", but RAZBAM is no longer developing them, so M-2000C behaviour is effectively frozen. The Eurofighter (TrueGrit, with Heatblur help) had **no release date** at the last public update (SITREP, March 2026).

## Facts

### F-14A/B (Heatblur): AN/AWG-9 radar

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| Crew split | Radar is operated by the RIO (human or Jester AI). The pilot has only the ACM lock modes (PLM, PAL, VSL) plus weapon select and trigger | yes | high | 1,6,8 |
| Mode list | PULSE SRCH, P STT, PD SRCH, RWS, TWS AUTO, TWS MAN, PD STT (DDD panel buttons). HRWS ("hot RWS") is entered by pressing RWS and PD STT within 2 s; it auto-locks the first target in the scan | yes | high | 4,5 |
| Mode drum labels | TWS MAN, TWS AUTO, RWS, MRL, A-G, VSL, OPTTRK, PLM, PULSE, PD, PAL | yes | high | 5 |
| Detection vs 5 m² | P-SRCH 60 nm (111 km). P-STT 50 nm (93 km). PD-SRCH 110 nm (204 km). RWS 90 nm (167 km). TWS 90 nm (167 km). PD-STT 90 nm (167 km) | yes (manual table) | med | 4 |
| PD SRCH | Longest range, but shows **no range**: the DDD plots closure against azimuth, and the TID shows **no tracks** | yes | high | 4 |
| RWS | Adds FM ranging. TID shows momentary tracks (each lasts at most 2 s, or until the antenna scans that spot again). Up to **48** tracks shown | yes | high | 4 |
| TWS track files | Up to **24** tracks, **18** shown on the TID at once | yes | high | 4,10 |
| TWS scan limits | Only **±20° × 4 bars** or **±40° × 2 bars**, because of the 2 s track refresh. Entering TWS forces ±20°/4-bar unless ±40°/2-bar is already set | yes | high | 4 |
| TWS AUTO vs MAN | In AUTO the WCS steers scan azimuth and elevation to keep the prioritised targets in the scan. The WCS forces **TWS AUTO at the first AIM-54 launch** | yes | high | 4,2 |
| Scan settings (RIO) | AZ SCAN ±10°, ±20°, ±40°, ±65°. EL BARS 1, 2, 4, 8, covering 2.3°, 3.6°, 6.3°, 11.5° respectively (bars overlap). Azimuth centre can be slewed ±65° | yes | high | 5 |
| DDD range buttons | 5, 10, 20, 50, 100, 200 nm (pulse modes and IFF) | yes | high | 5 |
| TID range | 25, 50, 100, 200, 400 nm (46, 93, 185, 370, 741 km) | yes | high | 5 |
| TID modes | GND STAB (north up), A/C STAB (heading up), ATTK (A/C STAB plus attack steering), TV | yes | high | 5 |
| Doppler notch (MLC) | Main-lobe-clutter filter is **266 kt wide**, ±133 kt around own groundspeed. MLC AUTO turns the filter off when the antenna looks more than **3° above the horizon**, so a target above you cannot notch | yes | high | 4 |
| Zero-doppler filter | Blind band **200 kt wide**. A target running away within ±100 kt of your groundspeed is invisible in PD modes; use pulse modes | yes | high | 4 |
| Vc (DDD closure) scale | X-4: 800 kt opening to 4,000 kt closing. NORM: 200 kt opening to 1,000 kt closing. VID: 50 kt opening to 250 kt closing | yes | high | 4 |
| TGTS switch | SMALL / NORM / LARGE. Sets the launch-zone computation **and** the Phoenix go-active distance: **6 / 10 / 13 nm** (11.1 / 18.5 / 24.1 km) | yes (AIM-54A; **AIM-54C ignores it in DCS**) | high | 2,5 |
| Pulse STT | Cannot be notched but suffers from ground clutter. **No missile datalink commands**, so it is limited to AIM-7 CW shots and AIM-54 **active** launches | yes | high | 4 |
| PD STT | Longest launch ranges for AIM-7 and AIM-54, but only one target | yes | high | 4 |
| Lock from TWS | Hook the track on the TID, then press PD STT or P STT. The WCS runs a supersearch on the hooked track (less reliable than a manual HCU lock) | yes | high | 4 |
| Manual lock (HCU) | Half-action shows the acquisition gates and starts a ±10° supersearch. Slew the gates, then full-action to lock | yes | high | 4 |
| ACM priority | PLM > VSL > PAL/MRL (a higher mode overrides a lower one). RIO exits with HCU half-action; PLM ends only when the pilot presses PLM again or the radar locks | yes | high | 6 |
| PLM | Antenna on the ADL (armament datum line). Locks the first target within **5 nm** (9.3 km). Ends in P-STT | yes | high | 6 |
| VSL HI / LO | Vertical scan 5° wide. HI covers **+15° to +55°**, LO covers **−15° to +25°**. Lock within **5 nm** | yes | high | 6 |
| PAL | ±20°, 8-bar scan. Locks the first target within **15 nm** (27.8 km) | yes | high | 6 |
| MRL (RIO) | One-bar supersearch out to 5 nm, steered with the HCU | yes | high | 6 |
| Track aging | Extrapolated-track X appears after **8 s** without an update. The track is deleted after **14 s** (or 2 min with TRACK HOLD) | yes | high | 5 |
| Launch-zone display | LAUNCH ZONE turns on automatically **60 s** before max range. The symbol blinks when optimum range is less than **8 s** away | yes | high | 5 |

### F-14: missiles

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| AIM-54 variants | AIM-54A Mk47, AIM-54A Mk60, AIM-54C Mk47. The 54C has a digital seeker and a smokeless motor | yes | high | 2 |
| Phoenix carriage | Up to 6: four on the fuselage and two on the glove pylons. The front fuselage Phoenix pallets are needed before the rear ones can be used (cooling) | yes | high | 2 |
| MSL PREP | Pilot ACM panel switch. Missile tuning and BIT take about **2 min**. The status windows turn white when a missile is ready | yes | high | 2,3 |
| Launch-to-eject | **3 s** from trigger to missile away (1 s in ACM active if within 15° of the ADL). Train students to hold still and not ripple-press | yes | high | 2 |
| AIM-54 range | At least **60 nm** (111 km) vs a fighter at high altitude in PD-STT, about **50 nm** (93 km) in TWS, about **10 nm** (18.5 km) if launched active | yes | med | 2 |
| AIM-54 in TWS (DCS) | Guided by the AWG-9 (silent to the target). At about **16 s time-to-impact** the WCS sends the active command, if the target is still in the scan. The TTI number **blinks** on the TID when that command has been sent. The missile lofts at long range | yes | high | 2 |
| AIM-54 in PD-STT (DCS) | **Pure SARH to impact, never goes active.** The target gets an immediate launch warning. Lofts at long range | yes | high | 2 |
| AIM-54 active off the rail (DCS) | Happens when any of these apply: P-STT or another non-PD mode, ACM or BRSIT, PH ACT set **before** launch, or target inside **10 nm**. Then there is **no loft** and range is short. Setting PH ACT after launch does nothing | yes | high | 2 |
| Real-world difference | Real TWS Phoenix = SARH/command guidance then ARH. Real PD-STT: the manual describes "SARH all the way". DCS matches this. The manual also documents auto-active inside 6 nm (rear hemisphere) or 10 nm (front hemisphere). DCS uses a flat 10 nm | real-world vs DCS | med | 2 |
| Max simultaneous Phoenix | **6** (TWS only) | yes | high | 2,4 |
| Launch order | WCS sets priority 1-6. After each launch the numbers shift down. The RIO can force a target in with **mandatory attack**, exclude one with **do not attack**, or make a hooked track priority 1 with **NEXT LAUNCH** | yes | high | 2,5 |
| After launch | The priority number changes to **TTI** (time to impact). The engaged track **brightens** until TTI + 15 s. A **breakaway X** appears on the VDI/DDD/TID 15 s after the last TTI | yes | high | 2 |
| Chaff resistance (datamine) | `ccm_k0` is **1.0 for AIM-54A** vs **0.2 for AIM-54C** (lower means more resistant). The 54C is much harder to decoy | yes | med | 17 |
| AIM-7 variants | AIM-7E (at least 16 nm / 30 km), AIM-7F and AIM-7M (at least 38 nm / 70 km). SARH only | yes | high | 3 |
| AIM-7 guidance | Normal mode needs **STT**. CW illumination is the default. **SP PD** (MSL OPTIONS) uses PD illumination (7F/7M only). **BRSIT**, or no STT, gives CW **flood**: the missile homes on the strongest return in the flood beam. Losing the lock also drops to flood | yes | high | 3 |
| AIM-7 from TWS | Not possible. There is no TWS Sparrow shot | yes | high | 3,4 |

### F-14: RWR (AN/ALR-67 on F-14A late and F-14B; ALR-45/50 on early A)

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| Display layout | The same round scope at both seats. **Outer ring = critical** (tracking or engaging you; flashes when engaging). Middle ring = lethal. Inner ring = non-lethal. Centre status circle: upper-left shows the display type (N, I, A, U, F), upper-right shows L (limit), lower half shows O (offset), B (BIT fail) or T (thermal) | yes | high | 7 |
| Heatblur choice | Real ALR-67 band order changed over time. Heatblur models an early version with **critical outermost**. This is the **opposite of the DCS F/A-18C** convention | yes | high | 7 |
| Tones | Short single tone: new emitter or band change. Slow warble: critical. Fast warble: actively engaging. Special **4-tone descending**: a new threat able to launch **silently** (TWS-capable aircraft, for example 14, 15, 16, 17, 18, 29, 30, 34, M2) | yes | high | 7 |
| Warning lights | SAM, AAA, AI (both seats), CW (RIO only). Steady = in the critical band. Flashing = engagement | yes | high | 7 |
| Symbol examples | 14 = F-14. 15 = F-15C/E. 16 = F-16C. 17 = JF-17. 18 = F/A-18C. 21 = MiG-21bis. 23 = MiG-23. 29 = Su-27/33, MiG-29, J-11A. 30 = Su-30. 31 = MiG-31. M2 = Mirage 2000C/-5 | yes | high | 7 |

### JF-17 Thunder (Deka): KLJ-7 radar

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| Modes | A/A: **RWS, TWS, VS, SAM (sub-modes ASM, NAM), STT, DTT, ACM (VT, BS, HA)**. Also A/G MAP and GMTI, and SEA1/SEA2 | yes | high | 11 |
| Default A/A mode | **TWS** is the default when MMS (Master Mode Switch) is set to INTC | yes | high | 11 |
| TWS capacity | **10 track files**. "Track 10 targets and attack 2 at the same time" (DCS store page). Datamine: `TWS_max_targets = 10` | yes | high | 11,13,16 |
| RWS | Up to 10 trackfiles. Azimuth 10/30/60° (Chuck) with 1/2/4 bars | yes | med | 11,14 |
| TWS scan options | Chuck: **25° × 3 bars** or **60° × 2 bars**. FlyAndWire: ±10°/4 bars, ±25°/3 bars, ±60°/2 bars | yes | med | 11,14 |
| Range scales | **10 / 20 / 40 / 80 nm** (18.5 / 37 / 74 / 148 km) | yes | high | 11 |
| PRF | HI / MED / AUTO selectable | yes | med | 11 |
| VS | High-PRF, velocity against azimuth, **no range**. Best against nose-aspect targets. Speed scale 12 = 1,200 kt, 24 = 2,400 kt | yes | high | 11 |
| SAM | Bugging a contact in RWS enters SAM. **ASM** sets scan automatically: **>20 nm → 30°/2 bars; <20 nm → 15°/4 bars**. **NAM** leaves scan manual. S2 LEFT toggles ASM↔NAM | yes | high | 11 |
| DTT | Bug a second track in TWS (or SAM) to get HPT + SPT. The HUD shows only the HPT TD box. **S2 LEFT swaps HPT↔SPT** | yes | high | 11,15 |
| STT | TDC press a second time on the HPT. Other trackfiles are dropped, and the target's RWR gets a lock warning | yes | high | 11,15 |
| ACM modes | Auto-lock within **10 nm** (18.5 km), then STT. **VT**: 10° × 50° vertical (S2 AFT). **BS**: 4° cone (S2 FWD). **HA**: whole HUD area (S2 RIGHT). Enter with S1 FWD; exit with MMS to INTC | yes | high | 11 |
| Datamine sensor (5 m²) | Look-up: head-on 89 km (48 nm), tail 46 km (25 nm). Look-down: head-on 76 km (41 nm), tail 35 km (19 nm). Gimbal ±60° azimuth, ±30° elevation. Minimum radial velocity 27.8 m/s (54 kt). Maximum measuring distance 175 km | unsure (the table drives the AI/generic sensor; the module may use its own model) | med | 16 |
| Undocumented sub-mode | "VSTTWS": a VS-derived track mode that makes it easy to lock jamming targets at about 50 nm (community finding, Jan 2025) | yes (undocumented) | low | 15 |

### JF-17: missiles

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| SD-10(A) guidance | Active radar, inertial plus datalink mid-course. The datamine uses the **same guidance scheme as the AIM-120** (`aa_missile_amraam2`). Seeker `sens_far_dist = 30 km` (same value as AIM-120C). Lofts (`loft_active = 1`) | yes | high (scheme) / med (meaning) | 16 |
| SD-10 AI max range | `Range_max = 70 km` (37.8 nm). This is the AI launch table, not the player's DLZ | yes (AI) | med | 16 |
| SD-10 carriage | Up to 4 (two twin racks) | yes | med | 11 |
| SD-10 cues | HUD TD box with arrows: ">" left of the box = inside max range. "^" below = inside the NEZ. "v" above = beyond the NEZ. "<" right = at minimum range. ASE circle plus steering dot, then **SHOOT** cue (inside the NEZ). After launch **TOF changes to TOA**. At TOA 0 the missile goes active (pitbull) | yes | high | 11 |
| SD-10 from TWS | Launches at the **HPT**. **No RWR lock or launch warning** for the target until the seeker goes active. The next shot goes at the new HPT (swap with S2 LEFT or re-bug) | yes | high (warning) / med (swap flow) | 11 |
| SD-10 maddog | With no lock, a large dashed seeker-FOV circle appears on the HUD. The missile takes the first target it sees within about **10 nm** | yes | med | 11 |
| SD-10 pitbull distance | Not published. Shown only as a TOA countdown. Estimate: similar to the AIM-120 (roughly 10 nm / 16-20 km from the target) | unsure | low | 11,16 |
| PL-5EII | IR dogfight missile. Select with S8. Warm-up ("PL5 ON"). T2 press to uncage. Seeker circle on the HUD. High tone = lock. S3 to release. Datamine AI `Range_max = 16 km` (8.6 nm) | yes | med | 11,16 |

### M-2000C (RAZBAM): RDI radar and missiles

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| Radar | Thomson-CSF **RDI** (Radar Doppler à Impulsions). Max detection **80 nm** (148 km). About **65 nm** (120 km) vs a 5 m² target in HFR. Gimbal ±60° azimuth, ±55° elevation. Beam 3° | yes (guide figures) | med | 12 |
| Main modes | **RECH** (bar search, the RWS equivalent). **PSID/PID** ("TWS"). **PSIC/PIC** (STT). **PSIC Super 530** (after a shot). **PSIC Super 530 Pointé** (antenna fixed on the boresight, manual illumination). Also SHB, DEC, persistence (rémanence) | yes | high | 12 |
| Is there TWS? | Only **PSID**: a single locked target is tracked while a **1-bar** scan continues and up to 16 other contacts are shown. **It is not multi-target and cannot guide the Super 530D** | yes | high | 12 |
| Scan | Azimuth **60 / 30 / 15** (the guide's figures, likely ±). Bars **1 / 2 / 4** (overlap: 2-bar covers 5°, 4-bar covers 10°). PID forces 1 bar | yes | high | 12 |
| PRF | **HFR** (high PRF, processed contacts, lockable). **BFR** (low PRF, raw video, needs RRAS/auto-acq to lock). **ENT** (interleaved) | yes | high | 12 |
| Contacts in RECH | 64 (4-bar or 2-bar). 40 (1-bar). 20 (1-bar with persistence). Contacts are not tracked and refresh each scan | yes | high | 12 |
| PSIC memory | On losing the target the radar coasts for **5 s**, then goes back to RECH. In PSIC Super 530 it tries to reacquire for **8 s**, then keeps illuminating along the extrapolated path. PSIC Super 530 lasts **50 s** after the last shot | yes | high | 12 |
| Close-combat modes | Auto-lock within **10 nm**, all into PSIC. **Boresight**: 3° cone. **VTH/HUD (SVI)**: spiral, about 20° cone. **Vertical**: two vertical lines from −10° to +50°. **Horizontal**: 2-bar/30° pattern, **BAH** (HFR) or **BA2** (MFR2), slewable. **RRAS**: boresight-size pattern slaved to the TDC | yes | high | 12 |
| Jamming | Noise jamming is effective only until about **20-25 nm** (burn-through) | yes | med | 12 |
| Super 530D | SARH. **Needs PSIC for the whole flight.** Range about **10 nm** (18.5 km) at sea level and **23 nm** (42.6 km) at 40,000 ft. Warm-up "P" blinks for about 30 s after start. PPA salvo modes: **TOT** (2 missiles, 2 s apart while the trigger is held) or **PAR** (1 per press). **AUT** (fires only at good Pk) vs manual | yes | high | 12 |
| 530D datamine | Scheme `aa_missile_semi_active`. Seeker `op_time 47 s` (matches the "battery about 45 s" in the guide). **Loft on by default** for shots beyond **18.52 km (10 nm)**. AI `Range_max 40 km` | yes | med | 18 |
| Magic II | IR, **0.25-8 nm** (500 m-15 km) per the guide. Seeker search patterns: Vertical Wide or Narrow (**MAG**) and Horizontal Wide or Narrow (**MAV**). Can be slaved to the radar and back ("Magic Slave") | yes | high | 12 |
| Loadout rule | Super 530D cannot be mixed with A/G weapons | yes | high | 12 |
| Module status | Removed from the ED store on **7 April 2025**. ED says it remains operational. No further RAZBAM development | yes | high | 19 |

### Other DCS aircraft with BVR radar missiles (multi-target capability)

| Aircraft | Radar / BVR missile | Multi-target? | Confidence | Source # |
|---|---|---|---|---|
| F-4E Phantom II (Heatblur, 2024) | AN/APQ-120 (pulse radar with no PD search) / AIM-7E, E-2, F, M | **No.** Single STT with CW illumination. No TWS | med | 16 (APQ-120 sensor file), general knowledge |
| Mirage F1 (Aerges) | Cyrano IV / R.530 EM (SARH). Datamine also lists Super 530F | **No.** STT only | med | 16 (file list), general knowledge |
| MiG-21bis (Magnitude 3) | RP-22 Sapfir-21 / R-3R (SARH) | **No.** STT only, one SARH missile guided at a time | med | general knowledge |
| F-15E Strike Eagle (RAZBAM) | AN/APG-70 (RWS, TWS, STT) / AIM-120B/C, AIM-7M | **Yes.** AIM-120s fired from TWS at several targets. AIM-7 needs STT | med | 20 |
| Eurofighter Typhoon (TrueGrit, with Heatblur help) | CAPTOR / AIM-120, Meteor planned | Not released. Radar and weapons "coming online", no date (March 2026) | med | 21 |

## Display & symbology

### F-14 TID (Tactical Information Display, RIO)
- **Form:** a large **round** CRT with **green monochrome** symbology on black; hooked items are drawn brighter (DCS green; med confidence). Own aircraft sits near the bottom in A/C STAB and ATTK. It moves in GND STAB (north up). The pilot's HSD can repeat the TID.
- **Readouts around the edge:** buffer register, data readouts (a hooked track cycles **AL** altitude, **MC** magnetic course, **RA** range, **BR** bearing), computer-run digits, antenna elevation, scan altitude limits, navigation status (**IN** / **AH** / **MV**), closing rate (**+** closing, **−** opening), selected weapon (**G**, **SW**, **SP n**, **PH n**, where n = missiles ready).
- **Buttons under the TID:** RID DISABLE, ALT NUM, SYM ELEM, DATA LINK, JAM STROBE, NON-ATTK, VEL VECTOR, LAUNCH ZONE (they light green). Mode knob: GND STAB, A/C STAB, ATTK, TV. Range knob: 25, 50, 100, 200, 400.
- **Track symbols** (center dot plus a half-shape; drawn from the Heatblur manual images):
  - **Own-radar tracks** (shape **above** the dot): unknown = half-box **⊓**, hostile = chevron **∧**, friendly = half-circle **∩**.
  - **Datalink tracks** (the same shapes **below** the dot): unknown **⊔**, hostile **∨**, friendly **∪**.
  - Angle-only (jammer) track: an open chevron **<** beside the dot. With altitude-difference ranging it becomes a rounded **"◁"**.
  - Own aircraft: a circle with a cross inside, plus a heading line.
  - TWS steering centroid: a small **X**.
- **Modifiers:**
  - Mandatory attack: horizontal bar through the dot.
  - Do-not-attack: vertical bar.
  - Multiple targets: bar on the left.
  - Extrapolated track: small X over the dot.
  - Datalink challenge: small V.
  - Datalink pointer: brightened circle.
- **Numbers:**
  - **Altitude digit to the LEFT** of a track, in tens of thousands of feet: 0 = below 5,000 ft, 1 = 5,000-14,999 ft, 4 = 35,000-45,000 ft.
  - **Phoenix firing-order digit (1-6) to the RIGHT.** After launch it is replaced by **TTI seconds**, which **blink** once the active command has been sent.
- **Vectors and lines:**
  - Velocity vector from the dot: 1,800 kt = 1.5 inch.
  - Launch-zone vectors replace it, with ticks for **TUMR, TUOR, TUIR** (time until minimum, optimum, and in-range/max range).
  - Scan limits: two dashed lines from own aircraft, where each dash plus gap = 20 nm. They merge into one strobe in STT.
  - Jam strobe: a line from own aircraft to the display edge.
  - Attack mode adds an artificial horizon, a **steering dot** and an **ASE circle** (allowable steering error). A big **breakaway X** appears at minimum range.
- **DDD (RIO, rectangular):** in PD search it plots closure rate against azimuth, with the AGC trace at the bottom. In pulse modes it plots range against azimuth. Lamps: **ANT TRK, RDROT, JAT**. TGTS, MLC and Vc switches.
- **Pilot HUD/VDI:** target designator diamond, TCS reticle, and a range scale with Rmin/Rmax on the right side of the HUD. In TWS the steering cue goes to track 1 or the centroid.

### JF-17 radar page (colour MFCD, centre display is the radar)
- **Layout:** B-scope with **green** symbology on black.
- **Top row:** the mode label ("RWS", "TWS", "VS", "SAM"/"ASM"/"NAM", "STT", "DTT"). "STBY" is **crossed out** when the radar is ON. There are "IFF" and "CNTL" OSB labels.
- **Left side:** azimuth width, bar count, PRF (HI/MED).
- **Right side:** the range-scale number (for example **40**) with increase/decrease arrows, and the antenna elevation caret. A "**\***" asterisk marks the SOI display.
- **Contacts:** TWS tracks are small symbols with a **heading vector** and an **altitude number** beneath.
  - **HPT** (the bugged target) gets a **circle**, which looks white in screenshots (unsure).
  - **SPT** has no circle.
  - The **TDC** acquisition cursor shows the upper and lower altitude coverage (for example 11 / 9 = 11,000 / 9,000 ft).
- **Weapon range scale:** a vertical scale on the right showing **Weapon Max Range**, the **No Escape Zone (green bar)** and **Weapon Min Range**.
- **Readouts:**
  - Bottom-left: distance and bearing from the TDC to the HPT (for example "18.4 307.2°").
  - Bottom-right: HPT data block — distance "25.2NM", time to impact "0:40", closure "+627 KTS", aspect "14R".
- **VS page:** the vertical axis is speed. The TDC shows closure ×10 kt at top-left, and the upper and lower altitudes at right.
- **HSD:** when on a datalink it shows the radar scan cone (**EVP**) and the SD-10 max-range cone.
- **RWR (overlay on the HSD page, green page):**
  - Rings: **inner ring = lethal** (tracking), **outer ring = non-lethal** (search).
  - Symbol colour: **yellow** = search, **red** = lock (with "Tracking!" voice), **flashing** = missile launched.
  - Symbol shapes:
    - Air threat: a **rectangle**. Main air threat: a rectangle with a vertical line through it.
    - Surface threat: a **circle**. Main surface threat: a circle with ticks.
    - AAA: a circle with a diagonal.
    - Ship: a hull glyph.
    - A **line under** a symbol = jammed emitter.
  - Labels inside the symbol, for example "M2K" and "M29", "SA8".
  - MAWS adds missile symbols: a number = active missile type (for example 120); "M" = other missile. Above/below markers relative to own altitude. Only bearing is shown, and detection is most reliable inside **5 km**.
  - HUD shows **"MSL LCH"** on a detected launch.

### M-2000C VTB (Visualisation Tête Basse, head-down radar display)
- **Form:** a **green monochrome** CRT. PPI or B-scope display modes.
- **Top:** range in nm, azimuth scan arc, PRF label **HFR / BFR / ENT** at top-right, and radar emission channel digits.
- **Bottom:** bar count (1/2/4), selected waypoint number, own altitude and speed, heading scale. The **PID / PIC** preselection label sits at bottom-right.
- **Contact symbol:** a **"V" = closing**, an inverted **"Λ" = opening**. One or two small horizontal bars on the symbol show **which bar** detected it. A number beside it = closing speed in **Mach** (for example 0.1). The same aircraft can appear twice because the bars overlap.
- **TDC ("alidade"):** a **"+"** with two numbers: the top and bottom altitude of the beam at the cursor range, in thousands of feet (for example 34 / −22).
- **PSIC (STT) data block:**
  - Target Mach (for example 0.7), heading, closure in kt (for example 951), altitude (200 = 20,000 ft), aspect.
  - **NCTR** type label (for example "MIG-21", or asterisks if unknown).
  - **H** = locked / **V** = not locked.
  - IFF: **"A"** (Ami) = friendly reply.
- **HUD (VTH):**
  - Radar lock target box and an **interception director circle** (fly it onto the box). A **doubled circle** means you are inside the least-restrictive firing domain.
  - Range scale: two top marks = long limits (the thick one = without defensive manoeuvre), bottom mark = short limit.
  - **"TIR"** (fire) cue appears inside the most restrictive domain.
  - Missile time of flight, which becomes time to impact after launch.
  - 530 status letters **G** (left) and **D** (right); they flash if the missile is not ready.
- **Serval RWR (VCM display):**
  - Round threat display with own aircraft at the centre and the nose at the top. **The nearer the centre, the more dangerous** (high-threat zone inside, low-threat zone outside). Distance from the centre is lethality, not range.
  - Capacity: **8 radar threats + 2 D2M missile-launch warnings** at once.
  - Status lights: **V** (Sabre ELINT record), **BR** (jamming), **DA** (RWR OK), **D2M** (launch detector; blinking = not cooled or missing), **LL** (dispensers).
  - Corner indicators: **"+"** (display OK), **PCM** (countermeasure priority), **M** (hostile within 10 nm via TAF link).
  - Symbol library: shown on the kneeboard page "Menaces VCM" (RShift+K, then [ and ]).

## Controls

### F-14 (pilot seat; names as in the Chuck's Guide control map, which follows the DCS bind names)
| Action | DCS function / key |
|---|---|
| Jester menu | **Toggle Menu = A** (1st press: context menu; 2nd: main menu; 3rd: close). Items with **LCtrl+1 ... LCtrl+8**. Optional head-look selection (hold A for more than 0.5 s) |
| Weapon select | **Weapon Selector UP / DOWN** (positions: GUN, SW, SP/PH), **Weapon Selector Press** (toggles SP↔PH) |
| Fire A/A missile | **Trigger (Second Detent)**. Trigger (First Detent) = gun camera. Default key not verified (see Uncertain) |
| ACM lock modes | **Target Designate UP / VSL HI**, **Target Designate DOWN / VSL LO**, **Target Designate Forward / PAL**, **PLM Button** (throttle) |
| Missile prep and mode | ACM panel: **MSL PREP** ON, **MSL MODE** NORM/BRSIT, Master Arm ON |
| RIO (human) | HCU: half-action / full-action trigger, **HCU MRL**, Radar Elevation Up/Down, Radar Azimuth Left/Right, Radar Elevation Bars Increase/Decrease, Radar Azimuth Scan Narrower/Wider. Armament panel: **MSL OPTIONS** (SP PD / NORM / PH ACT), **Missile Speed Gate** (only NOSE QTR is meaningful in DCS), **NEXT LAUNCH**, **A/A Launch** button |
| F-14B(U) only (src 9) | **Jester context key (default V)**. Hold and release on a HUD TD box or a PTID TWS track to make Jester hook it. Look in a direction to make him scan there. Look at a visual target to make him try to track it in TWS |

**Jester (F-14A/B) radar functions reachable from the menu:** the context menu when airborne in A/A opens **"Beyond Visual Range – Radar"**. Other sub-menus are **"Within Visual Range Radar"**, **"RIO Datalink"**, and **"Countermeasures/Radar Warning Receiver"**. From these you can:
- set the radar mode (RWS / TWS / PD / pulse);
- set scan range (TID scale), scan elevation and azimuth;
- set target aspect (nose / beam / tail) and target size (small / normal / large);
- lock a target: the closest, one at a specific azimuth and range, or pick from the TWS list;
- switch to ground-stabilised display ("GROUND STABILIZE RADAR").

Exact petal wording varies by menu page; see Uncertain.

### JF-17 (HOTAS labels as in Deka/Chuck: T = throttle, S = stick)
| Action | Control |
|---|---|
| Master mode | **T1 MMS**: UP/FWD = INTC (A/A), MIDDLE = NAV, AFT = AG |
| Radar on | Radar STBY/ON OSB on the MFCD ("STBY" crossed out = on) |
| Make radar the SOI | **S1 Sensor Selection AFT** (radar display gets the "\*") |
| Slew / bug / lock | **T5 TDC** slew. **TDC PRESS (ENTER)**: 1st press = bug HPT, 2nd press = STT |
| Mode and HPT control | **S2 Sensor Control**: FWD/AFT = range scale up/down (search modes). **LEFT = cycle RWS/TWS/VS**, or HPT↔SPT once bugged, or ASM↔NAM in SAM. RIGHT = azimuth width. **PRESS = unlock / MFCD refresh** |
| ACM | **S1 FWD** = ACM. Then S2 **AFT = VT**, **FWD = BS**, **RIGHT = HA** |
| Antenna elevation | **T6** axis/switch |
| Weapon select | **S8 Missile Type Selection**. **S5 Missile Step** |
| Fire | **S3 Weapon Release = RAlt+Space** |
| PL-5 uncage | **T2 press** |
| IFF interrogate | **T4 press** |

### M-2000C (DCS command names; default keys from Chuck's M-2000C guide, 2024)
| Action | DCS command | Default key |
|---|---|---|
| Fire (2nd stage) | MiCRoB / Trigger 1st/2nd Stage | **Space** (hold at least 2 s for the 530) |
| Unlock | Weapons System CMD Depressed | none |
| Close-combat modes | Weapons System CMD FWD (vertical/horizontal toggle; with the 530 in PSIC Super 530 it selects Pointé) / AFT (boresight) | none |
| PIC/PID preselect | STT/TWS Toggle | none |
| TDC | TDC UP/DOWN/LEFT/RIGHT, TDC DEPRESS (LOCK TARGET) | **; . , /** (up, down, left, right); depress unbound |
| Antenna elevation | Radar Antenna UP / DOWN / CENTER | none |
| Magic quick select / gun | CNM switch: MAGIC SELECT (right), AA Gun SELECT (left) = **C**, PCA Select (centre) | – |
| Magic unlock / search mode | NAV Update / Magic Unlock | none |
| Magic ↔ radar slave | Magic Slave / AG Designate / INS Position Update | none |
| IFF | Nosewheel steering / IFF Interrogate | **S** |
| Countermeasures | Decoy Program release **Delete**, Decoy PANIC **Insert**, Jammer toggle **E** | – |
| Weapon panel | PCA: 530 button / MAG button. PPA: missile select G (left) / I (auto) / R (right), TOT/PAR, AUT | clickable |

## Procedures

### F-14 with Jester (pilot)
1. Before the fight, set the ACM panel **MSL PREP ON** (wait about 2 min for white status windows) and **Master Arm ON**.
2. On the stick, **Weapon Selector to SP/PH**, then press the selector until the TID or HUD shows **PH**.
3. **Search.** Press **A** and choose "Beyond Visual Range – Radar". Set the TID/scan range (for example 100 nm), the elevation or altitude band, and the mode: TWS for Phoenix, RWS/PD for pure search.
4. **Build tracks.** Stay in **TWS**. Keep targets within ±20° or ±40° and roughly in the elevation band. Jester (or the WCS) assigns priority numbers **1-6**.
5. **Designate (optional).** Ask Jester to lock a specific contact to get STT (for AIM-7, or a single Phoenix in PD-STT). The human-RIO path is NEXT LAUNCH or mandatory attack.
6. **Launch in TWS.** Fly the HUD/VDI steering to the centroid. Inside the launch zone, press **Trigger (2nd detent)**, keep it pressed, and wait about 3 s for the missile to leave. Press again for the next target. Up to 6.
7. **Support the missiles.** Keep the targets inside the TWS scan (±20° or ±40°) until the TTI numbers **blink**, which means the active command has been sent (about 16 s TTI, or 6/10/13 nm). Only then crank or turn cold.
8. **PD-STT shot:** support to impact. It is SARH and never goes active. **P-STT, PH ACT or <10 nm:** active off the rail. Fire and forget, but short range.
9. **AIM-7:** needs STT (PD-STT or P-STT). Hold the lock to impact. If the lock is lost, the WCS goes to flood mode: keep the target on the nose.
10. **Defend.**
    - Read the ALR-67: **outer ring = critical**.
    - A special 4-tone alert = a TWS-capable shooter has appeared; fast warble = you are being engaged.
    - Beam or notch the threat's doppler radar: put your track about 90° to the threat, low with ground behind you. Chaff in the beam.
    - Remember that an AIM-54A is more chaff-susceptible than a 54C (datamine).

### F-14 human RIO (TWS Phoenix, "six-shooter")
1. Liquid cooling ON. DDD: **TGTS** as required, **MSL OPTIONS NORM** (or PH ACT for active off the rail), **Missile Speed Gate NOSE QTR**.
2. **TWS AUTO**. Set AZ/EL (±40°/2-bar or ±20°/4-bar). Set TID to ATTK or A/C STAB, and the range.
3. Shape the firing order: hook a track, then CAP **mandatory attack** / **do not attack**, or **NEXT LAUNCH** for priority 1.
4. Launch with the pilot trigger or the RIO **A/A Launch** button, one press per missile.
5. Watch the TTI numbers. Blinking = active command sent. A track brightens until TTI + 15 s. The breakaway X means the engagement is complete.

### JF-17 (SD-10)
1. **MMS → INTC** (TWS by default). Radar **ON**. Make sure the radar MFCD is the SOI (\*). Set range (for example 40 nm), azimuth, PRF (HI for long range) and bars.
2. **Build tracks** in TWS (up to 10), or use RWS/VS for detection and SAM for one bugged target.
3. **Designate.** Slew the **TDC** over a track and press it once to make it the **HPT** (circle). This is not a lock. Bug a second track for **DTT** (it becomes the SPT). **S2 LEFT** swaps HPT and SPT.
4. **Select the SD-10** with S8. Wait for the warm-up "SD10 ON". Master arm.
5. **Launch.** Put the target in the **ASE circle** with the steering dot centred. When **SHOOT** appears (inside the NEZ), press **S3 (RAlt+Space)**.
   - From **TWS/DTT**: silent shot. Swap to the SPT with S2 LEFT and fire again for the second target.
   - From **STT** (TDC second press): best guidance, but the target gets a lock warning.
6. **Support.** Keep the track (stay within the scan) until **TOA** reaches **0**. At 0 the missile goes active (pitbull). Crank to keep the target near the edge of your gimbal limits while you close more slowly.
7. **Maddog:** with no lock the missile takes the first target within about 10 nm inside the dashed HUD circle.
8. **Defend.** On the HSD RWR, a **red** symbol that moves into the **inner** ring is a lock, and **flashing** is a launch; "MSL LCH" shows on the HUD. Check MAWS for the missile bearing. Beam, chaff, then drag.
9. **PL-5EII (WVR):** select with S8 and let it warm up. Uncage with **T2**, wait for the high tone, then **S3**. Or use ACM VT/BS/HA to get a radar lock that slaves the seeker.

### M-2000C (Super 530D)
1. CNM switch to **centre** (PCA). PPA: check that the 530 "P" is steady (warm; blinks for about 30 s after start). Choose side (G / I / R), **TOT** or **PAR**, and **AUT** or manual.
2. **Master Arm ARME**. PCA **530** button ("S" = selected, "P" = ready). Radar **EM** (emission). PRF **HFR**. Bars and azimuth as required.
3. **Search** in RECH. Watch for **V** (closing) contacts. Use the TDC altitude numbers to set the antenna elevation.
4. **Preselect PIC** with the STT/TWS Toggle (VTB shows **PIC**). Slew the TDC onto the contact and **depress** it. The radar goes to **PSIC**: target box on the HUD and a data block on the VTB. (PID gives a single-target track-while-scan for situational awareness only.)
5. **IFF:** press **S** (SECT or CONT).
6. **Launch.** Fly the interception director circle onto the box. Doubled circle = long limit; **TIR** = shoot. **Hold Space for at least 2 s.** There is a deliberate delay. From PID the radar switches to PIC first.
7. **Support to impact.** The radar stays in **PSIC Super 530** for 50 s. Keep the target within the gimbal limits (±60°) and do not let it notch. If the lock drops, the radar coasts for 8 s, then illuminates along the extrapolated path. Use **Pointé** (Weapons System CMD FWD) to illuminate manually through the boresight. The missile battery lasts about 45 s.
8. **Unlock** with Weapons System CMD **depressed**.
9. **Magic II (WVR):** CNM **right** selects Magic. Choose the seeker pattern (MAG for vertical, MAV for horizontal; Magic Unlock toggles wide or narrow). Growl tone, then Space. Or use **Magic Slave** to put the seeker on the radar target.
10. **Defend.** On the Serval, symbols nearer the **centre** = more lethal. D2M launch warnings appear on the display. Use the Sabre jammer (E) and chaff (Delete, Insert for panic), and beam.

## Uncertain / conflicting

- **F-14 Jester menu exact wording.** The Heatblur manual confirms the menu structure: A, then LCtrl+1-8, the context menu "Beyond Visual Range – Radar", and lock options by "closest target" or "specific azimuth/range". Petal labels are drawn as images and could not be read.
  - Petal labels likely seen in-game, low confidence: "Scan Range 25/50/100/200/400", "Scan Elevation", "Scan Azimuth Left/Center/Right", "Radar Mode: RWS / TWS / PD Search / Pulse Search", "Lock Target"/"Lock Ahead"/"Unlock", "Bandit Aspect Nose/Beam/Tail", "Target Size Large/Normal/Small". A community list gives the same set.
  - The F-14B(U) adds the context key **V**.
- **F-14 trigger default key.** The bind names are verified, but the keyboard default could not be confirmed. Candidate: **Space** for Trigger 2nd detent and RAlt+Space for weapon release (pickle); medium to low confidence.
- **AIM-54 go-active point in TWS.** Heatblur's DCS section says "about 16 s to impact". It also says the distance follows TGTS (6/10/13 nm) and that the **AIM-54C ignores the TGTS switch** in DCS. Treat it as "active command at roughly 10 nm / 16 s TTI with TGTS NORM".
- **The manual's real-world text vs the DCS text.** The real system auto-activates inside 6 nm (rear hemisphere) or 10 nm (front hemisphere). DCS uses a flat **10 nm**.
- **AWG-9 detection ranges** (110/90/60 nm vs 5 m²) are manual guidance values. Actual in-game detection varies with RCS, aspect and look-down.
- **TID colour.** Described here as green monochrome; the manual does not state a colour. Verify against a screenshot before drawing.
- **KLJ-7 TWS and RWS scan options conflict.**
  - TWS: Chuck (2026) lists 25°/3-bar and 60°/2-bar. FlyAndWire (2024) lists ±10°/4, ±25°/3, ±60°/2.
  - RWS azimuth: 10/30/60 (Chuck) vs ±15-60 (FlyAndWire).
  - Chuck's display legend also lists 10/25/30/60 azimuth. Use the Chuck set, but allow ±10°/4-bar.
- **SD-10 pitbull distance** is not published. The datamine seeker range (30 km) equals the AIM-120C's. Estimate the active point at about 10 nm (about 16-20 km) to target; low confidence. The in-cockpit TOA countdown is the authoritative cue.
- **Whether the JF-17 can datalink-support two SD-10s at once** (HPT + SPT after DTT) is implied by the store page ("attack 2 targets") but not spelled out. Medium confidence.
- **Colours on the JF-17 radar page.** The general symbology is green; the HPT circle and TDC look white in screenshots (unsure). The RWR colours yellow and red are verified.
- **KLJ-7 datamine detection distances** come from the generic sensor database, used by AI and possibly as the module's baseline. The Deka player radar may differ.
- **M-2000C azimuth** "60/30/15" is probably ± (the guide gives the gimbal as 60°). Treat it as ±60/±30/±15; medium confidence. RDI range figures come from Chuck's guide rather than a RAZBAM spec sheet.
- **RAZBAM future.** The modules are "operational" per ED (2025) but have no active developer. RAZBAM said the planned Vulkan renderer update could break them. In May 2026 RAZBAM made a proposal to ED; unresolved.
- **The F-14B(U)** (PTID, VDIG-R, context key) is documented in the Heatblur manual. The release date and whether its AWG-9/Phoenix logic differs from the F-14B were not verified.
- **Other aircraft one-liners** (F-4E, F1, MiG-21) come from general knowledge plus the datamine file list, not from fetched manuals. Medium confidence.

## Sources

1. Heatblur F-14 manual (online): https://f14.manuals.heatblur.se/ (source repo: https://github.com/Heatblur-Simulations/f-14-manual, accessed Sept 2026)
2. Heatblur F-14 manual, AIM-54 page: https://github.com/Heatblur-Simulations/f-14-manual/blob/master/src/f14ab/stores/air_to_air/aim_54.md
3. Heatblur F-14 manual, AIM-7 page: https://github.com/Heatblur-Simulations/f-14-manual/blob/master/src/f14ab/stores/air_to_air/aim_7.md
4. Heatblur F-14 manual, Radar General Operation: https://github.com/Heatblur-Simulations/f-14-manual/blob/master/src/f14ab/systems/radar/general_operation.md
5. Heatblur F-14 manual, Radar Interface (DDD, TID, symbology): https://github.com/Heatblur-Simulations/f-14-manual/blob/master/src/f14ab/systems/radar/interface.md (symbol images: https://github.com/Heatblur-Simulations/f-14-manual/tree/master/src/img)
6. Heatblur F-14 manual, ACM Modes: https://github.com/Heatblur-Simulations/f-14-manual/blob/master/src/f14ab/systems/radar/acm_modes.md
7. Heatblur F-14 manual, AN/ALR-67: https://github.com/Heatblur-Simulations/f-14-manual/blob/master/src/f14ab/systems/defensive_systems/rwr/alr_67.md
8. Heatblur F-14 manual, Jester (A/B): https://github.com/Heatblur-Simulations/f-14-manual/blob/master/src/f14ab/jester_iceman/overview.md ; variants: https://github.com/Heatblur-Simulations/f-14-manual/blob/master/src/intro/variants.md
9. Heatblur F-14 manual, Jester for F-14B(U) (context key): https://f14.manuals.heatblur.se/f14bu/jester_iceman/overview.html
10. Chuck's Guides, DCS F-14B Tomcat (last updated 19/08/2023): https://assets.chucksguides.com/pdf/DCS%20F-14B%20Tomcat%20Guide.pdf
11. Chuck's Guides, DCS JF-17 Thunder (last updated 10/04/2026): https://assets.chucksguides.com/pdf/DCS%20JF-17%20Thunder%20Guide.pdf
12. Chuck's Guides, DCS Mirage 2000C (last updated 14/08/2024): https://assets.chucksguides.com/pdf/DCS%20Mirage%202000C%20Guide.pdf
13. DCS store page, JF-17 Thunder: https://www.digitalcombatsimulator.com/en/shop/modules/thunder/
14. FlyAndWire, "JF-17: KLJ-7 Air-to-Air Search Modes – A/A Radar I" (23 Oct 2024): https://flyandwire.com/2024/10/23/jf-17-klj-7-air-to-air-search-modes-a-a-radar-i/
15. FlyAndWire, "JF-17: Air-to-Air Targeting & Tracking – A/A Radar II" (2 Nov 2024): https://flyandwire.com/2024/11/02/jf-17-air-to-air-targeting-tracking-a-a-radar-ii/ and "VSTTWS" (22 Jan 2025): https://flyandwire.com/2025/01/22/jf-17-issues-iv-vsttws-the-phantom-radar-mode/
16. DCS Lua datamine (Quaggles, pushed 26 Aug 2026), SD-10: https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/rockets/SD-10.lua, PL-5EII: https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/rockets/PL-5EII.lua, KLJ-7 sensor: https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/db/Sensors/Sensor/KLJ-7.lua, APQ-120 sensor: https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/db/Sensors/Sensor/ANAPQ-120.lua
17. DCS Lua datamine, AIM-54A Mk47 / AIM-54C Mk47: https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/rockets/AIM_54A_Mk47.lua and https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/rockets/AIM_54C_Mk47.lua
18. DCS Lua datamine, Super 530D (M-2000C) and Magic II: https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/rockets/Matra%20Super%20530D.lua and https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/rockets/MMagicII.lua
19. FSElite, "RAZBAM Modules Removed from Eagle Dynamics Store" (8 Apr 2025): https://fselite.net/content/razbam-modules-removed-from-eagle-dynamics-store/
20. Stormbirds, "Learn the DCS: F-15E Strike Eagle's APG-70 radar" (24 Jan 2023): https://stormbirds.blog/2023/01/24/learn-the-dcs-f-15e-strike-eagles-apg-70-radar/
21. DCS SITREP #11 2026, Eurofighter progress (video): https://www.youtube.com/watch?v=M1Mw3_dfs2s ; FSElite DCS news (Eurofighter update): https://fselite.net/content/dcs-world-news-syria-map-eurofighter-typhoon-and-voice-chat-updates/
