# F-15C in DCS Flaming Cliffs 3 (AN/APG-63, TWS, VSD, AIM-120/AIM-7, AN/ALR-56C TEWS), with F-15E (Razbam) A/A differences

Scope: this covers how the **FC3 (low-fidelity, keyboard-driven) F-15C** is modelled in DCS World. Where the real F-15C differs, the real-world behaviour is noted and labelled. When the two conflict, the trainer should follow DCS. The main manual is the ED/Belsimtek F-15C FC3 Flight Manual (2014). FC3 avionics have changed little since then. Changes made after 2014 are dated in the table.

## Summary (what a trainer designer must know)

- **The DCS F-15C radar has five modes:** LRS search (key `2`), TWS (`RAlt+I` toggles RWS/TWS), STT, AACQ modes (Vertical Scan `3`, Boresight `4`, Auto Guns via cannon `C`) and FLOOD (`6` with AIM-7 selected). **FC3 has no Velocity Search and no Super Search.** Those exist on the real jet and on the Razbam F-15E. PRF cycles **HI / MED / interleaved** with `RShift+I`. Range scales are **10/20/40/80/160 nm**. Search azimuth is **±60° or ±30°** (`RCtrl+=` / `RCtrl+-`).
- **In DCS, TWS limits azimuth to 60° total (±30°).** You can slew that window across the ±60° field, and the radar tries to centre it on the PDT. This restriction has applied since DCS 1.2.7 (2014). Before that, FC2 allowed ±60° in TWS.
- **Designating targets in TWS:** the first `Enter` on a contact makes it the **PDT** (star symbol). Each further `Enter` on another contact adds an **SDT** (hollow brick), **up to 4 designated targets** in total. **Pressing `Enter` again on the PDT or on any SDT commands STT on that target.** `Backspace` ("Radar – Return To Search/NDTWS") drops the designations. "Unlock TWS Target" removes a single designation and has no default key. You cannot re-order or cycle the designations. The only way is to undesignate and designate again.
- **AIM-120 ripple in TWS:** the 1st missile goes to the PDT and later missiles go to the SDTs in the order you designated them. After the last SDT the sequence **cycles back to the PDT**. The time-to-intercept readouts refer to the PDT. **The AIM-7 cannot be fired in TWS.** It needs STT, or FLOOD within 10 nm.
- **What the target's RWR sees:** a TWS AIM-120 shot gives **no lock and no launch warning**. The target's first cue is the missile going active ("M" symbol plus launch alarm). An STT lock gives a **lock** warning. For an AIM-120 fired from STT, DCS RWRs have historically shown only the lock until pitbull (ED forum, 2020). This conflicts with the 2014 manual, which implies a launch indication. An AIM-7 needs continuous STT, so the target stays locked for the whole time of flight.
- **HUD and VSD labels are single letters, not "A/T/TOF" as on the Hornet or Viper.**
  - VSD pre-launch time-to-intercept reads like `M26SEC`. The letter prefix gives the missile: **M** = AIM-120, **T** = AIM-7, **S** = AIM-9.
  - HUD post-launch (AIM-120), lower left, flashing: `T <time-to-active> <time-to-intercept>` while the missile is on datalink. It becomes `M <time-to-intercept>` once the seeker is active.
  - HUD stores readout: `A4C` means four AIM-120C (`A2B` for the B model). `M4M` means four AIM-7M.
- **The DLZ uses FC3 terms: Raero triangle (top), Rpi, Rtr, Rmin.** There is no Rne and no "SHOOT" text. The shoot cue is a **flashing star (AIM-120)** or **flashing triangle (AIM-7)** under the HUD target box. It appears when the target is in range and the steering dot is inside the ASE circle. The manual's advice is to shoot inside **Rtr**.
- **How the DCS TEWS positions threats:** distance from the centre means **signal strength**, not lethality. Stronger emitters sit nearer the centre, and EW/AWACS radars never appear in the inner ring. The display holds up to **16** threats with a **7 s** history.
  - **Marks:** `^` "hat" for airborne; upper semicircle for a new threat; diamond for the primary threat; flashing circle for a launch.
  - **Active ARH missile:** shown as **`M` in a diamond** in the inner ring, with a flashing lower semicircle.
- **Datamine sensor table for "AN/APG-63":** detection **88.4 km (47.7 nm) head-on** and **44 km (23.8 nm) tail-on** in both look-up and look-down. Also: max measuring distance 265 km (143 nm), `TWS_max_targets = 4`, notch threshold radial velocity 27.8 m/s (100 km/h, 54 kt). This table drives AI radars, and the reference RCS is not documented. Player reports from 2022 show roughly **65 nm on an Su-27** at 34,000 ft.
- **The F-15E (Razbam, APG-70) is much deeper:** RWS, VCTR/VS, RGH, TWS sub-patterns (2TWS 2-bar/60°, 4TWS 4-bar/30°, 3HDT, 2HDT, narrow 6-bar/15°), up to **10 track files plus 20 observation files**, Super Search, Boresight, Long-Range Boresight (40 nm), VTS (+5 to +55°) and Guns (15 nm). It is HOTAS-driven, with colour MPD/MPCD pages. Do not reuse F-15E logic for the FC3 F-15C.

## Facts

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| Radar | AN/APG-63(V)1 pulse-Doppler, X-band; radar power `I` | yes | high | 1, 2 |
| Modes present in FC3 | LRS (key `2`), TWS (`RAlt+I`), STT (lock), Vertical Scan (`3`), Boresight (`4`), Auto Guns (on cannon select `C`), FLOOD (`6` with AIM-7), VISUAL (`6` with AIM-120), HOJ (lock on ECM strobe) | yes | high | 1, 7, 8 |
| Modes NOT in FC3 | No Velocity Search, no Super Search, no SRS, no selectable bar count. Real F-15C has VS, SS, etc. | real-world only | med | 1, 7 (absent from manual and keybinds) |
| LRS = "RWS" | FC3 calls the main search mode "LRS". The key command is named "Radar RWS/TWS Mode Select", so LRS is effectively RWS | yes | high | 1, 8 |
| Range scales | 10 / 20 / 40 / 80 / 160 nm (18.5 / 37 / 74 / 148 / 296 km). Change with `=` / `-`, or by bumping the TDC against the top or bottom of the VSD | yes | high | 1, 8 |
| Azimuth (search) | ±60° (default) or ±30°, set with `RCtrl+=` / `RCtrl+-` | yes | high | 1, 8 |
| Azimuth (TWS) | 60° total (±30°) scan window, slewable across ±60° (`RShift+,` / `RShift+/`). Auto-centres on PDT. Limit introduced in DCS 1.2.7 (Feb 2014); FC2 allowed ±60° | yes | high | 11, 12, 1 |
| Elevation | Antenna tilt ±60° (`RShift+;` up / `RShift+.` down). Each bar is 2.5°. VSD left scale shows upper and lower coverage altitudes (kft) at the TDC range | yes | high | 1 |
| Bars | Not pilot-selectable in FC3. Current bar number is shown with the PRF at lower-left of the VSD. Number of bars not documented | yes (fixed) | low | 1 |
| PRF | HI (long range vs hot targets), MED (low-closure/tail), interleaved (alternates HI/MED; default). Cycle with `RShift+I` | yes | high | 1, 8 |
| Datamine sensor "AN/APG-63" | detection_distance: upper hemisphere head-on 88,400 m / tail 44,000 m; lower hemisphere head-on 88,400 m / tail 44,200 m (≈47.7 nm / 23.8 nm) | yes (AI table) | high (value) / low (applies to player?) | 2 |
| Datamine sensor misc | max_measuring_distance 265 km (143 nm); scan_volume az ±60°, el ±30°; track_volume az ±60°, el ±60°; scan_period 5 s; lock_on_distance_coeff 0.85; TWS_max_targets 4 | yes (AI table) | high (value) | 2 |
| Notch threshold | radial_velocity_min = relative_radial_velocity_min = 27.78 m/s (100 km/h, 54 kt). Targets whose closure/opening relative to the ground clutter is below this are filtered | yes (AI table; player radar similar in behaviour) | med | 2, 1 |
| Player detection observations | 2022 ED forum player report: Su-27 ~65 nm (120 km), MiG-31 ~75 nm, Tu-160 ~85 nm, Tu-95 >140 nm (targets ~30–39 kft) | yes (observed) | low-med | 17 |
| LRS contacts | Up to 16 targets "tracked". Auto IFF: friendly = circle, hostile/unknown = filled rectangle (brick). No altitude or heading shown in LRS | yes | med | 1 |
| STT | All energy on one target. Data shown: target heading, TAS, aspect, altitude, range, closure, NCTR print. Target gets RWR lock warning | yes | high | 1 |
| Lock from LRS | TDC on contact, `Enter` goes straight to STT | yes | high | 1 |
| TWS designations | 1st `Enter` = PDT (star). Next `Enter`s on other contacts = SDTs (hollow bricks). Up to 4 designated in total (PDT + 3 SDT) | yes | high | 1, 14, 2 |
| TWS to STT | `Enter` a second time on the PDT or an SDT commands STT on that target | yes | high | 1 |
| TWS launch order | 1st AIM-120 goes to PDT, then SDTs in designation order. After the 4th, the order cycles back to PDT. Time-to-intercept cues refer to the PDT | yes | high | 1, 14, 13 |
| Re-ordering targets | Not possible ("not possible in this implementation", 2018). Workaround: "Unlock TWS Target" on one, then designate again | yes | high | 13 |
| Multiple missiles at one target | Allowed (e.g., two AIM-120 on a single soft-locked target) | yes | med | 13 |
| AIM-120 carriage | Up to 8 × AIM-120B/C (8 stations); AIM-7 E/F/M/MH on 4 fuselage stations; AIM-9 L/M/P/P5 | yes | high | 3 |
| Max AIM-120 in flight | No hard limit found. Datalink support is split across at most 4 designated tracks | yes | med | 1, 14 |
| TWS track reliability | Long refresh time. Hard manoeuvres can break the track prediction ("less reliable than LRS and even more so than STT") | yes | high | 1 |
| Missiles when support is lost | If a target's track is dropped (you STT another target, press Backspace, drop to LRS, or the track is lost), its AIM-120 loses midcourse updates. It flies to the last extrapolated position and goes active there, so Pk drops. Not documented F-15C-specifically | yes (general DCS ARH behaviour) | low-med | 1, 19 |
| AIM-7 support | SARH: needs STT on the target for the full time of flight. Breaking lock means the missile loses guidance. Cannot launch in TWS | yes | high | 1 |
| FLOOD | 12° CW cone, max 10 nm (18.5 km). AIM-7M guides on the largest RCS / closest target in the cone. Target must stay in the reticle. No DLZ on VSD | yes | high | 1 |
| VISUAL (AIM-120) | `6` with AIM-120: no radar lock; seeker switches on 2 s after launch. Target within 10 nm and inside the dashed seeker circle. Attacks the closest target (equal range: larger RCS) | yes | high | 1 |
| Vertical Scan | Lock range 10 nm. Manual gives two values: 7.5° wide × –2°…+50°, and 2.5° wide × –2°…+55°. Two vertical HUD lines. Locks first target, then STT | yes | med | 1 |
| Boresight | Narrow cone on the HUD boresight reticle, lock ≤10 nm, then STT | yes | high | 1 |
| Auto Guns | Scan 60° wide (±30°) × 20° tall around the gun reticle, lock ≤10 nm, then STT | yes | high | 1 |
| HOJ | Noise jammer strobe = vertical row of hollow rectangles at the jammer azimuth. `Enter` on it gives HOJ (solid line through the strobe). AIM-120 and AIM-7M can be launched with no range data, flying pure pursuit (low Pk). Burn-through 15–23 nm (28–43 km), then auto-STT | yes | high | 1 |
| DLZ marks | Raero (triangle at top of scale), Rpi (max vs non-manoeuvring target), Rtr (max vs turn-and-run), Rmin. Range caret with closure next to it | yes | high | 1 |
| Shoot cue | HUD: flashing star (AIM-120) or flashing triangle (AIM-7) below the TD box, shown when in range with the steering dot inside the ASE circle. No "SHOOT" text | yes | high | 1 |
| Pre-launch time | VSD bottom centre: `M26SEC`-style. Prefix M = AIM-120, T = AIM-7, S = AIM-9 | yes | high | 1 |
| Post-launch time (AIM-120) | HUD lower-left, flashing: `T <tta> <tti>`, then `M <tti>` after seeker activation. Post-launch info is HUD-only (not on VSD) | yes | med (manual wording muddled) | 1 |
| HUD stores code | AIM-120 = `A` + qty + version (`A2C`, `A4B`). AIM-7M = `M4M`. AIM-9 = `S` | yes | high | 1 |
| AIM-120 pitbull | Seeker `sens_far_dist` 30 km (16.2 nm), FOV 0.2618 rad (15°), gimbal ±60°. Actual activation distance before target not published; 2020 player reports ≈8 nm (15 km); manual generic "10–20 km" | yes | low-med | 4, 1, 15 |
| AIM-120 loft | Lofts if launch range > 25 km (13.5 nm); loft ends 15 km (8.1 nm) to go; loft angle 30° | yes | med | 4, 5, 9 |
| AIM-120C DLZ reference | Head-on / tail-on, both at 900 km/h: 1 km alt 25 / 7.5 km; 5 km alt 35 / 12 km; 10 km alt 75 / 21.5 km (13.5/4.0, 18.9/6.5, 40.5/11.6 nm). Range_max 61 km, Life_Time 90 s | yes (legacy DLZ table) | med | 4, 9 |
| AIM-120B DLZ reference | 1 km: 21.5 / 6.5 km; 5 km: 33 / 10 km; 10 km: 65 / 19.5 km. Range_max 57 km | yes | med | 5, 9 |
| AIM-7M DLZ reference | 1 km: 19 / 5 km; 5 km: 27 / 7 km; 10 km: 38 / 12 km. Range_max 50 km (27 nm) | yes | med | 6, 9 |
| Target RWR: TWS | No lock, no launch warning until the AIM-120 goes active. Player TWS shots confirmed silent (ED tester, 2022) | yes | high | 1, 16 |
| Target RWR: STT + AIM-120 | Lock (spike) warning. Launch warning only at pitbull in DCS RWRs (reported 2020; no datalink-triggered launch warning). 2014 manual implies a launch indication. Current (2026) behaviour not re-verified | yes | med | 15, 1 |
| Target RWR: AIM-7 | Lock plus launch warning for the SARH shot, lasting the whole time of flight | yes | med | 1 |
| RWR coverage | ±180° azimuth, ±45° elevation; max 16 threats; 7 s history; modes All / Lock (`RShift+R`) | yes | high | 1, 8 |
| RWR radial position | DCS: nearer the centre = stronger signal. EW and AWACS never in inner ring. Real ALR-56C: radial position is a priority/lethality ranking (not verified this session) | DCS: yes; real: real-world only | high (DCS) / low (real) | 1 |
| RWR audio | New threat: single high tone. Search: periodic chirp. Lock: continuous chirping. Launch: launch tone repeating every 15 s | yes | high | 1 |
| RWR priority logic | 1) ARH missile or command-guidance launch; 2) locked (STT); 3) type order: airborne > long-range > mid-range > short-range SAM > EW > AWACS; 4) signal strength | yes | high | 1 |
| Countermeasures | Default 120 chaff + 60 flares (240 charge units; flares use 2 each). Chaff `Insert`, flare `Delete`. ECM (AN/ALQ-135) `E`: open X in TEWS centre, flashing = warming up, steady = on | yes | high | 3, 1 |
| AI unit | F-15C unit RCS = 5 (m²); RWR type "Abstract RWR"; ECM AN/ALQ-135 | yes | high | 3 |

## Display & symbology

### VSD (Vertical Situation Display, upper-left of the front panel)
- **Colours:** monochrome **green on black**, with a square display area and a rounded bezel. All symbols are green (a stylised version can use one green, such as `#7FD13B`, on near-black).
- **Frame:** a B-scope (range vertical, azimuth horizontal) with a 4×4 grid of thin lines. Near targets are at the bottom and far targets at the top.
- **Top-left:** PDT/STT target data: **TAS (kt)**, **aspect** (for example `20L`, `16L`) and **target heading** (for example `76`, `130`). An example is `400 20L 76`.
- **Top-right:** range scale number (`10`, `20`, `40`, `80`, `160`).
- **Left edge:** elevation scale.
  - Two small circles with numbers give the upper and lower coverage altitudes in kft at the TDC range (for example `41`, `19`).
  - A `<` caret shows antenna elevation.
  - Target altitude is shown beside the scale in the form `29-9` (29,900 ft) or `40-0`.
- **Bottom edge:** azimuth scale.
  - Two small circles mark the scan limits, and a `V` caret shows the current antenna azimuth.
  - The row also has a short horizon line.
- **Bottom row (left to right):** `G 423` (ground speed); NCTR print (for example `MIG25`, `Su17`); time-to-intercept `M26SEC`; bearing and range to the PDT (for example `031 22`).
- **Lower-left:** mode legend `TWS` or `STT` (the LRS legend is not documented; see Uncertain), and bar/PRF (`HI`/`MED`).
- **TDC (cursor):** two short vertical bars `II`.
- **Contacts:**
  - **LRS hit:** small filled horizontal brick, with no altitude or vector.
  - **TWS track:** filled brick, altitude in thousands of feet above it (`28`, `30`), and a short **aspect/heading stick** from the brick.
  - **SDT:** **hollow** brick with altitude and a vector stick.
  - **PDT / STT target:** **star/asterisk** with a longer velocity vector line.
  - **Friendly (IFF):** filled **circle** with altitude and vector.
  - **Jammer strobe:** vertical column of hollow rectangles. HOJ lock adds a solid line through it and the `HOJ` legend.
- **Attack symbology:**
  - **ASE circle:** dashed in TWS, solid in STT. It has a **steering dot**, and a short **angle-off bar** on the circle (top = target going away, bottom = hot).
  - **Right edge:** DLZ scale. Triangle at top = Raero, then bars for Rpi, Rtr and Rmin. The range caret `>` has closure next to it (for example `824 >`, `950 >`).
- **FLOOD:** `FLOOD` legend on the VSD and HUD.

### HUD (for completeness)
- **Target symbology:** target designator box, ASE circle with steering dot, and range scale on the right with Rpi/Rtr/Rmin bars plus a range caret with closure.
- **Lower-right data block:**
  - `R xx.x` range (nm).
  - Aspect: `H` (head), `T` (tail), or `R nn` / `L nn`.
  - Pre-launch time-to-intercept `M nn` (AIM-120) or TTI (AIM-7).
- **Lower-left:** stores (`A4C`, `M4M`), own Mach, target Mach, and the flashing post-launch `T tta tti` / `M tti`.
- **Valid-shot cue:** flashing star (AIM-120) or triangle (AIM-7) under the TD box. Flood shows a 12° circle and `FLOOD`. VISUAL shows a dashed AIM-120 seeker circle and `VISUAL`.

### TEWS (AN/ALR-56C, round scope, lower-left of the panel)
- **Layout:** round dark scope with green symbology, and a small **cross** in the centre (own aircraft, top-down, nose up). There is an **inner ring** and an **outer ring** of small green dots, with 12 dots on the outer ring (every 30°). The bezel has white tick marks every 30°, a vertical `TEWS` label on the left and an `INT` knob.
- **Symbols (FC3 table):**
  - **Airborne:** `23` MiG-23, `29` MiG-29/Su-27/Su-33, `31` MiG-31, `30` Su-30, `F4` F-4E, `14` F-14A, `15` F-15C, `16` F-16C, `18` F/A-18C, `50` A-50, `E2` E-2C, `E3` E-3.
  - **Ground:** `10` SA-10 (40V6M / 5N63S), `CS` Clam Shell, `BB` Big Bird, `SD` Snow Drift, `11` SA-11 (9A310), `6` SA-6, `8` SA-8, `13` SA-13, `DE` Dog Ear, `15` SA-15 (Tor; same digits as the F-15, told apart by the airborne hat), `S6` 2S6, `23` ZSU-23-4, `RO` Roland, `GR` Giraffe, `P` Patriot, `GP` Gepard, `HA` Hawk search, `H` Hawk HPI, `VU` Vulcan, `FF` SA-3 Flat Face, `LB` SA-3 Low Blow.
  - **Ships:** `HP` Grisha, `SW` Kuznetsov, `TP` Rezky/Neustrashimy, `T2` Moskva, `SS` Carl Vinson (Sea Sparrow), `SM` Perry/Ticonderoga.
  - Symbols for units added after 2014 (for example F-15E, M-2000, JF-17, MiG-21) are not documented.
- **Marks:**
  - `^` hat above the symbol: airborne emitter.
  - Upper semicircle: new threat.
  - Diamond: primary (most dangerous) threat.
  - **Flashing circle:** missile launch detected.
  - Flashing **lower** semicircle: missile guiding on you.
  - **`M` symbol:** active radar missile (AIM-120C, R-77, AIM-54C, MICA-RF). It is always the primary threat, so it is drawn in a diamond, in the inner ring. When it first appears it sits near the shooter's bearing, about halfway toward the inner ring.
- **ECM on:** open `X` in the centre (flashing = warming up, steady = active).

## Controls (DCS default keyboard, FC3 F-15C; names as in the Controls menu)

| Action | Controls-menu name | Default key |
|---|---|---|
| Radar power | Radar On/Off | `I` |
| Search mode (LRS/BVR) | (2) Beyond Visual Range Mode | `2` |
| TWS toggle | Radar RWS/TWS Mode Select | `RAlt+I` (manual's quick-ref says `RCtrl+I`; that is actually Target Designator To Center) |
| PRF cycle | Radar Pulse Repeat Frequency Select | `RShift+I` |
| Designate / lock / STT | Target Lock | `Enter` |
| Drop designations / return to search | Radar – Return To Search/NDTWS | `Backspace` |
| Remove one TWS designation | Unlock TWS Target | unbound |
| Cursor (TDC) | Target Designator Up / Down / Left / Right | `;` / `.` / `,` / `/` |
| Centre TDC | Target Designator To Center | `RCtrl+I` |
| Scan zone (antenna) | Scan Zone Up / Down / Left / Right | `RShift+;` / `RShift+.` / `RShift+,` / `RShift+/` |
| Scan width | Radar Scan Zone Decrease / Increase | `RCtrl+-` / `RCtrl+=` |
| Range scale | Display Zoom In / Out | `=` / `-` |
| Vertical Scan | (3) Close Air Combat Vertical Scan Mode | `3` |
| Boresight | (4) Close Air Combat Bore Mode | `4` |
| FLOOD / VISUAL / AIM-9 cage | (6) Longitudinal Missile Aiming Mode/FLOOD mode | `6` |
| Guns (+ Auto Guns AACQ) | Cannon | `C` |
| Navigation mode | (1) Navigation Modes | `1` |
| Cycle weapon | Weapon Change | `D` |
| Launch missile | Weapon Release | `RAlt+Space` |
| Gun trigger | Weapon Fire | `Space` |
| Salvo | Salvo Mode | `LCtrl+V` |
| Chaff | Countermeasures Chaff Dispense | `Insert` |
| Flare | Countermeasures Flares Dispense | `Delete` |
| ECM | ECM | `E` |
| RWR mode (All/Lock) | RWR/SPO Mode Select | `RShift+R` |
| RWR volume | RWR/SPO Sound Signals Volume Down / Up | `RAlt+,` / `RAlt+.` |
| Game aid (not realistic) | Auto lock on nearest / center / next / previous aircraft | `RAlt+F5` / `F6` / `F7` / `F8` |

Also present: "Countermeasures Release" and "Countermeasures Continuously Dispense" (default keys not verified).

## Procedures (F-15C, FC3)

**A. Search**
1. Press `I` for radar on and `2` for LRS. Pick PRF with `RShift+I` (interleaved by default; HI for long-range head-on, MED for tail or beaming).
2. Set range (`=` / `-`) and width (±60° / ±30° with `RCtrl+=` / `RCtrl+-`).
3. Put the TDC at the expected range and read the elevation-coverage altitudes on the left scale. Tilt with `RShift+;` / `RShift+.` until the target altitude lies between them.

**B. Build tracks (TWS)**
1. Press `RAlt+I` and check that `TWS` shows at lower-left. Azimuth becomes a ±30° window that you can slew with `RShift+,` / `RShift+/`.
2. Wait at least one or two scans (scan period ~5 s) for bricks to get altitude numbers and aspect sticks.

**C. Designate**
1. Move the TDC onto the most threatening track and press `Enter`. It becomes the PDT (star).
2. Press `Enter` on up to three more tracks to make them SDTs (hollow bricks), in the order you want to shoot them.
3. To reset, press `Backspace` (Return To Search/NDTWS). To remove one designation, use "Unlock TWS Target" (bind it yourself).

**D. Launch AIM-120 (multi-target)**
1. Select AIM-120 with `D` (HUD shows `A#C` or `A#B`).
2. Fly to put the steering dot in the ASE circle. Check the range caret against Rpi/Rtr and wait for the flashing star.
3. Press `RAlt+Space`. The 1st missile goes to the PDT. Press again for the SDTs in order (it cycles back to the PDT after the 4th). Space shots about 1–2 s apart.
4. **Support:** stay in TWS and keep every target inside the ±30° window. Crank toward the gimbal edge if needed. Watch HUD `T tta tti` until it turns to `M tti` for the PDT missile. After that, going active means you can turn away.
5. Do not press `Enter` twice on a target while missiles are flying to other targets. STT drops the other tracks and their missiles lose datalink updates (see Uncertain).

**E. Launch AIM-120 on a single target (STT)**
1. `Enter` in LRS, or `Enter` twice in TWS, gives STT.
2. Get the shoot cue, then press `RAlt+Space`.
3. Support until `M` shows, then break lock with `Backspace` and defend or turn cold.
4. The target gets a lock warning for the whole time you hold STT.

**F. Launch AIM-7M**
1. Select AIM-7 (`M#M`), then get STT (`Enter` in LRS, twice in TWS).
2. Get the flashing triangle, press `RAlt+Space`, and hold STT until impact. The target sees lock plus launch the whole time.
3. Within 10 nm, FLOOD (`6`) also works without a lock: keep the target in the 12° circle.

**G. Close in**
- Use `3` (Vertical Scan: put the target between the two HUD lines or on the lift vector), `4` (Boresight) or `C` (Auto Guns, 60°×20°). Each locks the first target within 10 nm and goes to STT.
- AIM-120 VISUAL (`6`): target within 10 nm and inside the dashed circle, then fire. The missile goes active 2 s after launch.

**H. Defend**
1. Read the TEWS. The diamond marks the primary threat.
   - `^`-topped number = fighter. Steady chirp = locked.
   - Flashing circle plus launch tone = SARH or command launch (AIM-7, R-27).
   - `M` in a diamond in the inner ring = active missile, react now.
2. Against SARH: beam (put the threat at 3 or 9 o'clock), go low for look-down clutter, and pump chaff (`Insert`). Remember the notch threshold is about 100 km/h radial velocity. ECM (`E`) can help, but it can also give HOJ to enemy missiles and disturb your own.
3. Against an active missile: beam or drag hard perpendicular to the missile, chaff (`Insert`), and use altitude and terrain. Against IR: flares (`Delete`).
4. Only when you are no longer defending, re-commit with `2` and `RAlt+I`.

## F-15E (Razbam) air-to-air differences (brief)
- The radar is the APG-70, driven from colour MPD/MPCD A/A RDR pages with HOTAS (castle switch, AACQ switch, TDC).
- **Search modes:** RWS (PRF `HI`/`MED`/`INLV`), VCTR (HPRF-only; Chuck's guide calls it "Vector Scan", the real jet's velocity search), RGH (range-gated high).
- **TWS:** 2TWS (2-bar/60°), 4TWS (4-bar/30°), 3HDT (3-bar/30°), 2HDT (2-bar/30°), narrow (6-bar/15°), up to 10 track files plus 20 observation files. The legend combines pattern and PRF, for example `2TWSH` or `4TWSM`. There is a "undesignated/miniraster" TWS.
- **AACQ modes:** SS (Super Search), BST, LR BST (2.5° circle, lock to 40 nm), VTS (+5° to +55°, 10 nm), Guns (weapon switch AFT, 15 nm).
- The TEWS is shown as a display page rather than an FC3-style scope.
- A trainer should model the F-15E separately. Its PRF, bars and TWS patterns are pilot-selectable, unlike the FC3 F-15C.

## Uncertain / conflicting
- **What happens to AIM-120s in flight when you go STT on another target or drop to LRS.** Nothing F-15C-specific is documented. Best estimate (low-med): each missile whose track is dropped keeps flying to the last extrapolated intercept point, goes active on schedule and attacks whatever its seeker finds. Pk falls sharply if the target has manoeuvred. The missile that goes to the new STT target keeps getting updates. Whether a missile re-targets to a different STT target is not verified.
- **STT AIM-120 and target launch warning.** The 2014 manual implies STT gives "radar lock and launch indication". The 2020 ED forum thread says DCS gives only a lock until pitbull, because datalink transmissions do not trigger launch warnings. Not re-verified on 2.9.x (2025–26). Candidates: (a) lock only until pitbull (more likely), or (b) launch warning at launch.
- **AIM-120 pitbull distance.** Not in plain datamine fields. Candidates: ~8 nm (15 km, 2020 player observation), 10 nm (18.5 km), or the manual's generic 10–20 km (5.4–10.8 nm). Seeker `sens_far_dist` is 30 km, but that is detection capability, not the activation trigger.
- **Vertical Scan geometry.** The manual contradicts itself: 7.5° × (–2° to +50°) versus 2.5° × (–2° to +55°).
- **Bar count and LRS legend.** Bar count in LRS/TWS is not documented, and neither is the exact lower-left VSD legend in LRS (possibly nothing, or the bar/PRF only). The manual only says "Current Bar/PRF". The 16-target figure may be a display limit rather than track files.
- **Detection range for the player.** The datamine table (48 nm head-on) is used by AI, and its reference RCS is undocumented (often assumed to be a fighter-size target). Player observations of ~65 nm vs an Su-27 suggest the RCS scaling differs. Use 40–65 nm vs fighters head-on as a realistic trainer band (low).
- **Real ALR-56C symbology.** Real-world ring meaning (priority/lethality ranking, "U" for unknown) was not verified this session. The DCS FC3 manual has no `U` symbol listed, and the unknown-emitter symbol in DCS is not verified.
- **Weapon fire keys.** The manual and FC3-derived files give Weapon Release as `RAlt+Space`. `Space` (Weapon Fire) is the trigger, and on FC3 aircraft it is commonly reported to also launch missiles (unverified).
- **Raero, Rpi and Rtr formulas.** Not published. The DLZ tables above are the legacy `ModelData` values (900 km/h shooter and target). Treat them as guide numbers, not DLZ outputs.
- **F-15E module status.** Razbam support was disrupted in 2024–25. Behaviour may be frozen or patched by ED. Not verified for 2026.

## Sources
1. DCS F-15C Flaming Cliffs Flight Manual (Belsimtek/ED, 2014), https://cdn.akamai.steamstatic.com/steam/apps/250300/manuals/F-15C%20DCS%20Flaming%20Cliffs%20Flight%20Manual%20EN.pdf (mirror: https://www.digitalcombatsimulator.com/upload/iblock/1ad/F-15C%20DCS%20Flaming%20Cliffs%20Flight%20Manual%20EN.pdf)
2. DCS Lua datamine, sensor AN/APG-63: https://github.com/Quaggles/dcs-lua-datamine/blob/master/_G/db/Sensors/Sensor/ANAPG-63.lua
3. DCS Lua datamine, F-15C unit: https://github.com/Quaggles/dcs-lua-datamine/blob/master/_G/db/Units/Planes/Plane/F-15C.lua
4. DCS Lua datamine, AIM-120C: https://github.com/Quaggles/dcs-lua-datamine/blob/master/_G/weapons_table/weapons/missiles/AIM_120C.lua
5. DCS Lua datamine, AIM-120B: https://github.com/Quaggles/dcs-lua-datamine/blob/master/_G/weapons_table/weapons/missiles/AIM_120.lua
6. DCS Lua datamine, AIM-7M: https://github.com/Quaggles/dcs-lua-datamine/blob/master/_G/weapons_table/weapons/missiles/AIM_7.lua
7. F-15C DCS command list (JoystickProfiler DB): https://github.com/Holdi601/JoystickProfiler/blob/master/JoyPro/JoyPro/DB/DCS/F-15C.html
8. FC3-derived keyboard default.lua (F-16A demo mod; same command names and keys as FC3): https://github.com/gyrovague/F-16A-Demo-CDMW/blob/master/Input/keyboard/default.lua (also https://github.com/grinnellidesigns/f-22a/blob/main/Input/F-22A/keyboard/default.lua)
9. Commented ModelData layout (loft/DLZ field meanings): https://github.com/grinnellidesigns/f-22a/blob/main/Weapons/AIM_120_C7.lua
10. DCS 1.2.7 Update 1 changelog (Feb 2014, "Return To Search/NDTWS"): https://www.digitalcombatsimulator.com/en/news/dcs_1_2_7_update_1_is_now_available/
11. FC3 changelog ("Radar scan zone in TWS is limited by 60 degrees now"): https://www.digitalcombatsimulator.com/en/products/planes/flaming_cliffs/?PAGEN_1=3
12. ED Forums, "STT, TWS and Azimuth scanning zone width" (Dec 2014): https://forum.dcs.world/topic/113433-stt-tws-and-azimuth-scanning-zone-width/
13. ED Forums, "Cycling through TWS targets?" (2018–2020): https://forum.dcs.world/topic/190143-cycling-through-tws-targets/
14. Mudspike, "DCS F-15C TWS Combat Questions" (Jun 2018): https://forums.mudspike.com/t/dcs-f-15c-tws-combat-questions/6310
15. ED Forums, "No Missile Launch Warning when FOX3 shoot with STT" (Oct–Nov 2020): https://forum.dcs.world/topic/251303-no-missile-launch-warning-when-fox3-shoot-with-stt/
16. ED Forums, "TWS launches and enemy RWR behavior" (Jul 2022, ED tester near_blind): https://forum.dcs.world/topic/304744-tws-launches-and-enemy-rwr-behavior/
17. ED Forums, "F-15C radar changes" (Jun–Aug 2022): https://forum.dcs.world/topic/303413-f-15c-radar-changes/
18. Chuck's Guides, DCS F-15E Strike Eagle (PDF, May 2025): https://chucksguides.com/aircraft/dcs/f-15e/
19. Steam DCS discussions, "F-15 TWS Multiple Targets" (Jul 2021) and general TWS/STT threads: https://steamcommunity.com/app/223750/discussions/0/5190945662891130944/
