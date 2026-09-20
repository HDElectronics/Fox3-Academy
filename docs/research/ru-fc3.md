# Russian-style Flaming Cliffs 3 fighters in DCS: Su-27S, Su-33, J-11A, MiG-29A/G/S

Scope: the FC3 (low-fidelity, keyboard-driven) Su-27, Su-33, J-11A, MiG-29A, MiG-29G and MiG-29S, and how they differ from the full-fidelity **DCS: MiG-29A Fulcrum**, a separate module that entered Early Access on 19 Sep 2025.

Research date: Sep 2026.

Where this file says "manual", it means the Eagle Dynamics (ED) FC3-era manuals: Su-27 (2014), FC3 (2014), MiG-29 (Oct 2018) and Su-33 (Feb 2021). The 2018 and 2021 manuals repeat the 2014 radar text word for word. Where this file says "datamine", it means the Quaggles DCS Lua dump.

## Summary (what a trainer designer must know)

- **The FC3 Su-27, Su-33 and J-11A share one radar model**, N-001 (datamine `RADAR = "N-001"`), and one HUD logic. The MiG-29A and MiG-29G use `N-019`. The MiG-29S uses `N-019M` and is the only FC3 Russian jet with **СНП2 (TWS2)**, a two-target mode for R-77s.
- **BVR radar modes on the HUD** (lower-left label):
  - **ОБЗ ДВБ**: scan (RWS). Up to 24 contacts.
  - **СНП ДВБ**: TWS. Up to 10 tracks.
  - **АТК ДВБ**: STT lock.
- **PRF labels**: **ППС** is high PRF, for head-on targets. **ЗПС** is medium PRF, for tail-on targets. **АВТ** interleaves the two for any aspect, at about −25 % detection range. TWS works only with ППС or ЗПС.
- **The "0.85 Rmax" claim is confirmed in ED's own manuals.** In СНП you slew the cursor onto a contact and it "snaps" to the track (designation). The radar then **locks STT automatically at 85 % of the selected missile's computed max launch range**.
  - The Su-27 manual says you can force an earlier lock with Enter.
  - The later MiG-29 and Su-33 procedure text says a lock commanded above 85 % "will not take place". These two statements conflict.
- **In practice every radar-missile shot in FC3 is fired from STT**, which means the target's RWR shows a lock.
  - R-27R/ER need the STT held until impact.
  - The J-11A and MiG-29S fire R-77 from STT only, with one exception: the MiG-29S in СНП2 can fire at 2 targets at once. Those targets must be within 8° of each other in azimuth, pulling no more than 3 g, and not jamming.
  - The manual says that once the R-77 is within about 15 km (8 nm) of its target you can drop lock and switch targets.
- **Launch cues**:
  - The left HUD range scale has three thick inward ticks. From top to bottom: **Rmax**, **Rtr** (the "no-escape" range against a manoeuvring target) and **Rmin**.
  - A caret moves down the scale showing current range.
  - **ПР** means launch authorised. Hold the launch button for at least 1 s.
  - After launch the lock symbol **flashes at 2 Hz**. No time-to-impact or "active" cue is documented.
- **Weapons (datamine pylons)**:
  - Su-27 and Su-33: R-27R, R-27ER, R-27T, R-27ET and R-73. **No R-77.**
  - J-11A: adds **R-77**, up to 6.
  - MiG-29S: R-27 family (2 max, inner pylons), R-73/R-60M (6), **R-77 (6)**.
  - MiG-29A/G: the same as the MiG-29S **without R-77**.
- **The SPO-15 "Beryoza" RWR in FC3 is simplified.**
  - Direction lamps: 8 forward lamps (±10/30/50/90°) and 2 rear-quadrant lamps.
  - Signal-strength ring, В and Н (above/below) lamps, a red lock/launch lamp and 6 threat-type letters (**П З Х Н F С**).
  - Steady red lamp with a steady high tone means lock. Flashing red with a high-pitched tone means a SARH launch (CW illumination).
  - An ARH missile appears only when its own seeker goes active: it becomes the primary threat and the signal strength rises fast.
- **The FF MiG-29A (Early Access, Sep 2025) is a different aircraft in DCS.**
  - New SPO-15LM model: 8 channels from 10 antennas, power in 2 dB steps, **no launch warning modelled**, and ARH missiles detected only 2–4 s before impact.
  - R-60/R-60M, R-73, R-27R/T and R-27ER/ET. No R-77.
  - Nothing found says the FC3 jets were changed by it.
- **Datamine detection ranges** for the reference target, which is unstated for N-001 and `RCS = 3` m² for N-019:

  | Radar | Head-on | Tail-on, look-up | Tail-on, look-down |
  |---|---|---|---|
  | N-001 | 68.4 km (36.9 nm) | 38 km (20.5 nm) | 26.6 km (14.4 nm) |
  | N-019 / N-019M | 60 km (32.4 nm) | 30 km (16.2 nm) | 30 km (16.2 nm) |

  Both have ±60° azimuth search and a 5 s scan period. For comparison, ED's Su-33 manual gives the real N001K as ≥100 km head-on and 40 km tail-on against 3 m².

## Facts

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| Radar per jet | Su-27, Su-33 and J-11A: `N-001`. MiG-29A and MiG-29G: `N-019`. MiG-29S: `N-019M`. IRST: `OLS-27` (Su/J-11), `KOLS` (MiG-29). RWR: `Abstract RWR` (all) | yes (datamine) | high | 5,6,7,8 |
| N-001 detection_distance | Upper hemisphere (look-up): head-on 68 400 m (36.9 nm), tail-on 38 000 m (20.5 nm). Lower hemisphere (look-down): head-on 68 400 m, tail-on 26 600 m (14.4 nm). Indices: [0]=upper/[1]=lower, [0]=head-on/[1]=tail-on. Reference RCS not stated in the file | yes (datamine) | high for values, med for index meaning | 5 |
| N-019 / N-019M detection_distance | Head-on 60 000 m (32.4 nm) and tail-on 30 000 m (16.2 nm), the same in both hemispheres. File has `RCS = 3` (m², the reference target) | yes (datamine) | high for values, med for meaning | 6 |
| Max measuring distance | 200 km (108 nm) for N-001, N-019 and N-019M | yes | high | 5,6 |
| Search volume | N-001: azimuth ±60°, elevation ±30°. N-019: azimuth ±60°, elevation ±30°. N-019M: azimuth ±60°, elevation ±40° | yes | high | 5,6 |
| Track (STT) volume | N-001: azimuth ±60°, elevation ±60°. N-019/M: azimuth ±67°, elevation −45/+50°. The manual says STT tracks within 120° of azimuth | yes | high | 5,6,1 |
| Scan period | 5 s (datamine). The manual says to wait up to about 6 s for a contact to appear after pointing the scan | yes | high | 5,3 |
| Azimuth scan positions | The scan is 60° wide with 3 discrete positions: centre ±30°, left −60..0°, right 0..+60°. In TWS the scan is limited to 60° and is always centred on the tracked target (FC3 changelog) | yes | high | 3,1,12 |
| Elevation aiming | Enter the expected range (km) with RCtrl +/− and the expected height difference (km) with RShift ;/. and the scan elevation is computed from them ("range-angle"). Alternatively, slew with an axis or RShift ;/. | yes | high | 1,3 |
| Doppler notch | N-001: `radial_velocity_min` 58.3 m/s (210 km/h, 113 kt) and `relative_radial_velocity_min` 41.7 m/s (150 km/h, 81 kt). N-019/M: 41.7 m/s for both | yes (datamine) | med for interpretation | 5,6 |
| Lock-range coefficient | `lock_on_distance_coeff` is 0.85 (N-001), 0.864 (N-019M) and 13.83 (N-019, probably a data quirk). This is a sensor lock-versus-detection factor, separate from the manual's 0.85×Rmax TWS auto-lock | yes (datamine) | med | 5,6 |
| SCAN contacts | Up to 24 targets detectable in ОБЗ | yes | high | 1,3 |
| TWS tracks | Up to 10 tracks in СНП and in СНП2 | yes | high | 1,3 |
| HUD contact size | A contact is a horizontal row of dots: 1 dot = RCS ≤ 2 m², 2 = 2–30 m², 3 = 30–60 m², 4 = ≥ 60 m². Fighters usually show 2 dots. IFF-friendly contacts get a second row above | yes | high | 1 |
| PRF | ППС = HI PRF (head-on, longest range). ЗПС = MED PRF (tail-on). АВТ = interleaved on alternate bars, all-aspect, −25 % range. Toggle with RShift+I | yes | high | 1,3 |
| TWS restrictions | Needs ППС or ЗПС, so АВТ is incompatible. Unusable in heavy ECM (use ОБЗ instead) | yes | high | 1,3 |
| TWS designation and auto-STT | Move the cursor over a contact and it snaps to it and follows it. Auto-lock to STT happens at **85 % of the computed max launch range** for the selected weapon | yes (manual 2014, 2018, 2021) | high that it is documented; med that it is unchanged in 2026 | 1,3,4 |
| Early lock in TWS | Su-27 manual: "the pilot can force an earlier lock on by pressing Enter". MiG-29 and Su-33 procedure: a lock "initiated over 85 % ... will not take place". Conflicting | yes | med | 1,3,4 |
| Unlock in TWS | "Target unlock" in Russian TWS clears the current track and the contact data. When STT is lost, the radar returns to TWS, not RWS (FC3 changelog, about 2012–13) | yes | med | 12 |
| Multiple designations (Su-27/33/J-11A) | Only one designated TWS track at a time. No multi-target launch | yes | med-high | 1,10,11 |
| R-27 from TWS | Not possible in effect. СНП converts to STT (АТК ДВБ) before ПР, and R-27R/ER need STT for the whole flight | yes | high | 1,3 |
| R-77 on J-11A | STT only. The target gets a lock warning. There is no F-15C-style TWS launch | yes | med-high | 11,3 |
| R-77 on MiG-29S, СНП2 | Enter it by pressing RAlt+I twice from ОБЗ. Primary target shows as a diamond, secondary as a cross ("crosshairs"). **Ц1** and **Ц2** appear bottom-centre when in zone. Launch needs Ц1/Ц2 plus ПР; hold the trigger and both missiles fire | yes | high (manual 2018) | 3 |
| СНП2 limits | Targets within 8° of azimuth (the cursor/strobe width), target g ≤ 3, no organised ECM. If Ц2 leaves coverage the radar may reset or drop to single-target track. Community reports a solution time of about 10 s | yes | high (manual); low (the 10 s) | 3,10 |
| R-77 switch-away | "In case of ARH missiles, when target range is 15 km and less, you can switch to another target." This enables sequential shots at several targets | yes | med | 3 |
| R-77 seeker | Manual: seeker lock-on range about 16 km (8.6 nm) against 5 m². Datamine (legacy "rockets" table): `Range_max` 50 km (27 nm), `D_max` 15 000 m, launch gimbal `Fi_start` 0.88 rad (50°), `hoj = 1`, burn 3 s boost + 6 s sustain | yes | med | 3,9 |
| R-27R / R-27ER | Datamine `Range_max`: R-27R 35 km (18.9 nm), R-27ER 60 km (32.4 nm). SARH (`Head_Type 6`) with `rad_correction = 1`. Gimbal `Fi_start` 0.88 rad (50°). The manual requires STT for the whole time of flight; a quick re-lock after a break lets the missile continue | yes | high (values); med (midcourse behaviour) | 9,3 |
| R-27T / R-27ET | IR. `Range_max` 25 km (13.5 nm) and 54 km (29.2 nm). Seeker sensitivity 25 km (13.5 nm). `Fi_start` 0.96 rad (55°). Can be cued by radar or IRST; no RWR warning | yes | high | 9,1 |
| R-73 | IR, `Range_max` 12 km (6.5 nm), seeker 20 km. `Fi_start` 0.79 rad (45°), tracking gimbal 1.31 rad (75°). Used with the helmet sight | yes | high | 9 |
| Game `Range_max` versus the HUD | The HUD Rmax, Rtr and Rmin are computed live from the launch conditions; `Range_max` is only a database nominal value | yes | med | 1,9 |
| Su-27 / Su-33 air-to-air stations | Su-27: R-73 on 1,2,3,8,9,10. R-27R/ER on 3–8. R-27T/ET on 3 and 8 only. L005 Sorbtsiya ECM pods on 1 and 10 (paired). Typical load: 6×R-27 (e.g. 4 ER + 2 ET) + 4×R-73. Su-33 has 12 stations: R-27R/ER on 8, R-27T/ET on 2, R-73 on 6 | yes (datamine) | high (Su-27); med (Su-33 station count) | 8 |
| J-11A stations | As the Su-27, plus R-77 on 3–8 (6 max). Typical load: 6×R-77 + 4×R-73. No Sorbtsiya pod or internal ECM entry in the datamine | yes | high (weapons); med (ECM) | 8 |
| MiG-29 stations | 7 stations; station 4 is the centreline fuel tank. R-27R/ER/T/ET only on 3 and 5 (2 max). R-73 and R-60M on 1,2,3,5,6,7. MiG-29S: R-77 on 1,2,3,5,6,7 (6 max). Typical S load: 4×R-77 + 2×R-73, or 2×R-27ER + 4×R-73 | yes | high | 8 |
| MiG-29S ECM | Internal `Countermeasures.ECM = "Gardenia"` on the MiG-29S only (A and G have none) | yes | high | 8 |
| Chaff / flares | Su-27 and J-11A: 96 chaff + 96 flares (192). Su-33: 48 + 48. MiG-29A/G/S: 30 + 30. Su-27 PPD-SP panel: each chaff light is 16 bundles, each flare light is 8 cartridges, and flares go in pairs | yes | high | 8,1 |
| Su-33 real CM | APP-50 with 48 × 50 mm cartridges. Salvos of 1–8, series intervals, or continuous (real-world description in the ED manual) | real-world (ED text) | med | 4 |
| ECM use | Press E. The ECM lamp blinks about 15 s while warming up, then stays steady. Jamming can hurt your own radar and missiles and invites home-on-jam | yes | high | 1 |
| Jammed target | A vertical flashing strobe on the jammer's bearing plus **АП** on the right of the HUD. An AOJ lock (Enter on the strobe) gives a default range of 10 km (5.4 nm), adjustable with RCtrl −. Override ПР with LAlt+W. Burn-through below 25 km (13.5 nm) | yes | high | 1,3 |
| Close combat | VS: a 3°-wide bar from −10° to +50°, lock in 1–3 s. BORE: a 2.5° circle, slewable. HELMET: Shchel-3UM ring, which flashes at 2 Hz for ПР, with an "X" above the ring if the target is outside the seeker gimbal. Fi0: the IR missile's own seeker, a 2° cone, with no RWR trigger. VS, BORE and HELMET default to the IRST and an IR missile | yes | high | 1,2 |
| VS lock trigger | FC3 manual (2014): lock is automatic. Su-27 manual (2014): lock only while Enter is pressed | yes | med | 1,2 |
| IRST | OLS-27 and KOLS search ±30° × ±30°. Laser ranger, no RWR warning. Datamine tail-on vs Su-27 table: OLS-27 {80, 40, 25} km (43, 22, 13.5 nm), head-on factor 0.333. KOLS {20, 12, 6} km (10.8, 6.5, 3.2 nm), head-on factor 0.25 | yes | high (values); low (index meaning) | 7 |
| Datalink (Su-27) | The AWACS/EWR picture appears on the HDD once the radar has first been switched on, and stays after the radar is off. Own-radar tracks are filled triangles; AWACS tracks are open triangles | yes | high | 1 |
| SPO-15 coverage (FC3) | Azimuth ±180°, elevation ±30°. Unlimited threats. Threat history 8 s. Modes ALL or LOCK-only (RShift+R; the MiG-29 switch is "ОБЗОР/ОТКЛ") | yes | high | 2,3 |
| SPO-15 threat letters | **П** airborne radar (all fighters). **З** long-range SAM. **Х** medium-range SAM. **Н** short-range SAM. **F** early-warning radar. **С** AWACS | yes | high | 2,3 |
| SPO-15 audio | Search/acquisition: low-frequency tone. Lock: steady high-frequency tone and red lamp lit. SARH launch: red lamp flashes with a high-pitched (intermittent) tone. Volume on RAlt+, and RAlt+. | yes | high | 2,3,18 |
| SPO-15 and ARH missiles | The missile is shown only after its own seeker locks. It becomes the primary threat, and the cue is a rapid rise in signal strength | yes | high | 2,3 |
| SPO-15 primary-only data | The В/Н elevation lamps, the power lamps and the lock/launch lamp refer to the primary threat only. Azimuth lamps do not blink if the spikes are 8 s or more apart | yes | high | 2 |
| FF MiG-29A SPO-15LM (2025) | 8 azimuth channels from 10 antennas (the outer two forward antennas on each side are merged). 2 elevation channels. Power in 2 dB steps. Best 10° resolution within ±50°, weak at 90° and in the rear. **No launch warning**. ARH missiles seen 2–4 s before impact and mistaken for the carrier | FF MiG-29A only | high | 13,14 |
| FF MiG-29A module | Early Access 19 Sep 2025. Weapons: R-60/R-60M, R-73, R-27R/T, R-27ER/ET and GSh-30-1; **no R-77**. Radar modes listed as HEAD ON, PURSUIT, AUTOMAT, "TWF" and CLOSE COMBAT. IRST modes IR, CLOSE COMBAT, HELMET, OPT and Boresight. Cyrillic and English cockpit options | separate module | high | 15,16,17 |
| Real N001 (Su-33 N001K) | Detection ≥ 100 km (54 nm) head-on and ≥ 40 km (21.6 nm) tail-on against 3 m². Azimuth ±60°. Tracks up to 10 threats while searching | real-world only | med | 4 |
| Real MiG-29 9.12 N019 | No usable TWS or R-77 capability. TWS2 and R-77 belong to the 9.13S with N019M. DCS FC3 still gives the MiG-29A and MiG-29G the СНП mode | real-world vs DCS | med | 3,16 |

## Display & symbology

### ИЛС (HUD), BVR radar page. The default HUD colour is green; target the stylised version at that.

- **Left edge**: a vertical **range scale**. The selected scale value is printed at the top; change it with = and −.
  - Beneath the scale value is the **PRF/aspect label**: `ППС`, `ЗПС` or `АВТ`.
  - Further down the left side is the sensor-active label: `ИЗЛ` for the radar transmitting, or `Т` for the IRST on the Su-27. The MiG-29 manual writes `ТП`.
- **Picture area**: a B-scope in azimuth versus range. Contacts are short horizontal rows of dots (1–4 dots by RCS). A friendly IFF return shows as a double row.
  - The **radar cursor** (target designator) is a pair of short vertical bars. On the MiG-29 its strobe is 8° wide.
  - In TWS the cursor snaps to and follows the designated track.
- **Right edge**: a fixed **elevation scale**, ±60°. Inward ticks mark the top and bottom of the scale and the horizon; outward ticks mark the HUD field of view.
  - A moving **elevation-coverage bar** beside it shows where the scan is pointing.
  - Next to the bar is the entered **expected relative altitude** in km.
- **Bottom**: the **azimuth-coverage bar**, which has 3 positions (left, centre, right). Under it is the entered **expected target range** in km.
- **Lower left**: the mode label, one of `ОБЗ ДВБ`, `СНП ДВБ` or `АТК ДВБ`. The MiG-29S also shows `СНП2`.
- **Lower right**: the selected weapon, under the elevation scale. Documented examples are `27ЭР` and `77`. By the same pattern the others are probably `27Р`, `27Т`, `27ЭТ`, `73` and `60`.
- **STT (`АТК ДВБ`)**:
  - The target is marked with a circle (Su-27) or a diamond (MiG-29).
  - The range scale gets three thick inward ticks: **Rmax** (top), **Rtr** (middle) and **Rmin** (bottom). An **arrow/caret** shows current range.
  - An aspect-angle line shows the target's velocity vector. A **dot** shows the antenna position (Su-27).
  - **`ПР`** appears when a launch is authorised.
  - The attack/lock symbol flashes at 2 Hz after launch.
- **MiG-29S СНП2**: the primary target is a diamond and the secondary is a cross. `Ц1` and `Ц2` appear bottom-centre.
- **ECM**: a flashing vertical strobe on the jammer's bearing, and `АП` on the right side of the HUD.
- **Close-combat modes**:
  - VS: two vertical lines from the HUD's lower edge upward, about 2 HUD heights in total.
  - BORE: a 2.5° circle.
  - HELMET: a ring fixed at screen centre that flashes for ПР, with an "X" above it when the target is outside the gimbal.
  - Fi0: a fixed cross-hair.
  - The ED manuals give these only as "VS", "ОПТ – СТРОБ", "ШЛЕМ" and "Фи0". The exact HUD mode strings are not confirmed; see Uncertain.

### HDD (head-down display)

- **Su-27, Su-33 and J-11A**: a top-down tactical view.
  - Your own aircraft is fixed near the bottom and the scale in km is shown bottom-left. A 60° scan arc sits in one of 3 positions, matching the HUD azimuth bar.
  - Each target mark has a velocity vector whose length scales with speed, and a cross stroke whose length scales with altitude.
  - Friendlies are circles.
  - A jammer with unknown range is a dashed line; once its range is known it gets a mark plus a dashed line.
  - The DLZ for the selected weapon is shown.
  - In STT, the target has a solid triangle above it and a 120° tracking arc is drawn.
  - Datalink tracks: own-radar tracks are filled triangles and AWACS tracks are open triangles.
  - Colour: monochrome green is likely but low-confidence.
- **MiG-29**: the HDD (ИПВ) simply **repeats the HUD**, for use when the HUD is washed out by the sun. There is no top-down tactical page.

### SPO-15 "Beryoza" panel (FC3)

- **Top arc**: 8 large azimuth lamps with the angle printed inside: 10, 30, 50 and 90° on each side. The primary threat's lamp lights yellow (large).
  - Secondary threats light small **green** lamps. ED's example shows two green lamps for a threat between 10° and 30°.
- **Bottom**: 2 large rear-quadrant lamps (left rear and right rear) marked with triangles. Accuracy is poor behind you.
- **Centre**: an aircraft silhouette sitting on the "light strip", a circular ring of yellow **signal-power** lamps that roughly shows the threat's range.
  - Two yellow half-circles, **В** (above) and **Н** (below), show the primary threat's height. Both lit means co-altitude, within about 15°.
  - A **large red circle** under or behind the silhouette is the lock lamp: steady for a lock, flashing for a launch.
- **Bottom row**: 6 rectangular threat-type lamps: `П З Х Н F С`. The primary threat type is lit yellow and secondary types green.
- The number of lamps in the power ring and whether there are separate type rows for primary and secondary threats are not confirmed; see Uncertain.

## Controls (FC3 default keyboard; names as in the DCS controls menu)

| Action | Default key | Controls-menu name |
|---|---|---|
| Nav / BVR / VS / Bore / Helmet / Fi0 / Air-to-ground | 1 / 2 / 3 / 4 / 5 / 6 / 7 | "(2) Beyond Visual Range Mode", "(3) Close Air Combat Vertical Scan Mode", "(4) Close Air Combat Bore Mode", "(5) Close Air Combat HMD Helmet Mode", "(6) Longitudinal Missile Aiming Mode" |
| Radar on/off | I | "Radar On/Off" |
| RWS/TWS toggle (MiG-29S: twice for СНП2) | RAlt+I | "Radar RWS/TWS Mode Select" |
| PRF ППС / ЗПС / АВТ | RShift+I | "Radar Pulse Repeat Frequency Select" |
| Cursor to centre | RCtrl+I | "Target Designator To Center" |
| Lock / designate | Enter | "Target Lock" |
| Unlock | Backspace (medium confidence) | "Target Unlock" / "Radar - Return To Search" |
| Cursor slew | ; , . / (up, left, down, right) | "Target Designator Up/Left/Down/Right" |
| Scan zone | RShift + ; , . / | "Scan Zone Up/Left/Down/Right" |
| Display range +/− | = / − | "Display Zoom In/Out" |
| Expected range +/− (range-angle aiming) | RCtrl+= / RCtrl+− | listed as "Radar Scan Zone Increase/Decrease" |
| Gun target span | RAlt+= / RAlt+− | "Target Specified Size Increase/Decrease" |
| IRST (EOS) on/off | O | "Electro-Optical System On/Off" |
| Weapon cycle / gun | D / C | "Weapon Change" / "Cannon" |
| Launch (hold at least 1 s) | Space | "Weapon Release" |
| Launch permission override | LAlt+W | "Launch Permission Override" |
| Chaff / flare single | Insert / Delete | "Countermeasures Chaff Dispense" / "Countermeasures Flares Dispense" |
| CM program / continuous | Q / LShift+Q | "Countermeasures Release" / "Countermeasures Continuously Dispense" |
| ECM jammer | E | "ECM" |
| RWR mode / volume | RShift+R / RAlt+, and RAlt+. | "RWR/SPO Mode Select" / "RWR/SPO Sound Signals Volume Down/Up" |
| HMS with padlock | Num. (padlock), then 5 | view padlock + helmet mode |

## Procedures

### BVR with SARH missiles (Su-27, Su-33, J-11A, MiG-29A/G/S)
1. Press **2** (ОБЗ ДВБ) and **I** (radar on; `ИЗЛ` appears). Press **D** until `27ЭР` or `27Р` shows.
2. Set the PRF with **RShift+I**: ППС for a closing target, ЗПС for a tail chase, АВТ if the aspect is unknown (−25 % range).
3. Set the HUD range with **= / −**.
4. Point the scan:
   - In azimuth with **RShift+, or /** (three 60° positions).
   - In elevation by entering the expected range (**RCtrl+=/−**) and the height difference (**RShift+; or .**). For example, you at 5 km with a target 80 km out at 10 km: enter 80 and +5.
5. Wait one or two frames of 5 s each for the dot-rows to appear.
6. **Option A (ОБЗ)**: put the cursor on the contact and press **Enter**. The radar goes to АТК ДВБ (STT) and the target's RWR shows a lock.
   **Option B (СНП)**: press **RAlt+I** (ППС or ЗПС only), then slew the cursor onto the contact until it snaps to it. The radar auto-locks to STT at 0.85 Rmax, or earlier with Enter (Su-27 manual).
7. Watch the range caret. Shoot at or under **Rtr** for a good kill chance, or at Rmax to force the target defensive. When **ПР** appears, **hold Space for at least 1 s**.
8. Support the missile by keeping the STT. The radar switches to CW illumination, which the target sees as a launch. After launch the lock symbol flashes at 2 Hz.
   - If lock breaks, relock quickly and the missile continues.
   - To reduce closure while supporting, turn toward the edge of the gimbal, not past about 50–60°.
9. After impact or a miss, unlock (Backspace) or let the radar fall back to TWS.

### J-11A with R-77
Follow steps 1–7 above with `77` selected; launch is from STT. Keep the lock until the missile is within about 15 km (8 nm) of the target, when its seeker takes over. Then you may unlock and lock the next target for another shot.

### MiG-29S with СНП2 (two R-77s)
1. From ОБЗ, press **RAlt+I twice**. The HUD shows `СНП2`.
2. Slew onto the lead target without locking manually. The second target, which must be within 8° of azimuth, is picked automatically.
3. The radar locks: the primary shows a diamond and the secondary a cross.
4. When **Ц1/Ц2** and **ПР** appear, **hold the trigger** and two R-77s fire, one per target.
5. Jamming, a target pulling more than 3 g, or Ц2 leaving coverage drops the radar to a single track.

### IR shots (R-27T/ET, R-73)
1. Radar or IRST (**O**): IRST gives no RWR warning.
2. Lock, get **ПР**, fire.
3. Fire and forget; manoeuvre or defend straight away.
4. For a fully passive shot: **6** (Fi0), put the cross-hair on the target, wait for ПР (the seeker has locked), fire. Judge the range by eye.

### Close combat
- **3** (VS): put the target between the vertical lines; lock in 1–3 s (see the Uncertain note about Enter).
- **4** (BORE): the 2.5° circle, slewable, then **Enter**.
- **5** (HELMET): look at the target, press **Enter**, and fire when the ring flashes (ПР). Padlocking first (Num.) makes this quicker.

### Defend
1. Read the SPO-15:
   - A yellow azimuth lamp and **П** means a fighter.
   - The power ring filling up means it is getting closer.
   - A **steady red** lamp with a steady high tone means a lock.
   - A **flashing red** lamp with a high-pitched tone means a SARH launch (CW).
2. Against SARH: beam the launching aircraft (put it at 3 or 9 o'clock) and put it in the ±90° lamp. Dispense chaff (**Insert**, or program **Q**), go low (look-down range is 26.6 km instead of 38 km), and let the threat's STT break.
3. Against ARH: there is no launch cue until the missile's seeker goes active. Then the missile becomes the primary threat and the power lamps jump. Beam and chaff at once.
   - An AIM-120 fired from TWS gives no warning before it goes active.
4. Use **E** (ECM) with care: it denies the enemy range out to about 25 km, but it is a home-on-jam beacon.
5. For IR missiles, the SPO shows nothing. Pre-emptively drop flares (**Delete**) when inside R-27ET or R-73 range of a hostile.

## Uncertain / conflicting

- **Early TWS lock above 85 %**: the Su-27 manual says Enter forces an earlier lock. The MiG-29 and Su-33 procedure text says a lock above 85 % "will not take place". Which is true in 2026 builds is not verified. Best guess: Enter forces STT; confidence low.
- **What 0.85 means**: the manual's "85 % of computed max launch range" auto-lock and the datamine `lock_on_distance_coeff = 0.85` (N-001) may be different mechanisms. The trainer should present the manual behaviour.
- **Detection-table reference RCS**: N-019 lists `RCS = 3`, while N-001 lists none (possibly the same or 5 m²). Whether the FC3 player radars read these AI sensor tables directly is not confirmed; confidence med.
- **Exact HUD strings for the close-combat modes**: the manuals name the modes "VS", "ОПТ – СТРОБ", "ШЛЕМ" and "Фи0". Candidate HUD labels are `ВЕРТ`, `ОПТ`, `ШЛЕМ`, `Ф0` or `ФИ0`, possibly with `БВБ`. Confidence low; verify from an in-game screenshot.
- **VS lock trigger**: automatic (FC3 manual) versus Enter required (Su-27 manual).
- **HUD cue after launch**: no documented time-to-impact, time-to-active or "А" cue. The only documented cue is the 2 Hz flashing lock symbol. A TTI counter may exist but is not verified.
- **R-77 if lock is dropped before 15 km**: whether the missile continues inertially, goes active on its own or is lost is not verified.
- **Is R-77 from STT shown as a launch?** Community consensus is that the target sees a lock and possibly a launch indication; the exact FC3 logic is not verified.
- **SPO-15 hardware details**: the number of power-ring lamps (candidate 15) and whether there are separate type rows for primary and secondary threats. The HDD colours (green monochrome is likely).
- **Unlock key**: Backspace is inferred from mod copies of the FC3 bindings; not verified in a stock FC3 input file.
- **J-11A ECM**: the datamine shows no jammer (no L005 pod and no internal ECM); not checked in game.
- **Su-33 station counts** were inferred from counts of launcher CLSIDs.
- **Range-scale steps** (candidates 10/25/50/100/200 km) were not verified. The datamine has `detection_range_max` of 250 (Su family) and 160 (MiG-29).
- **"TWF"** in the FF MiG-29A feature list is unexplained; it may be a typo or a transliteration.
- **FF MiG-29A changes to FC3 jets**: no evidence that the FF MiG-29A (2025) SPO-15LM or radar changes were back-ported to the FC3 MiG-29A/G/S or the Su-27 family.

## Sources
1. ED, DCS: Su-27 Flanker Flight Manual EN (Oct 2014): https://www.digitalcombatsimulator.com/upload/iblock/ed7/Su-27%20DCS%20Flaming%20Cliffs%20Flight%20Manual%20EN.pdf
2. ED, DCS: Flaming Cliffs 3 Flight Manual EN (Dec 2014), mirror: https://server.3rd-wing.net/public/Manuels%20DCS/DCS%20FC3%20Flight%20Manual%20EN.pdf
3. ED, DCS: MiG-29 Fulcrum Flight Manual EN (Oct 2018): https://www.digitalcombatsimulator.com/upload/iblock/463/DCS%20MIG-29%20Flight%20Manual%20EN.pdf
4. ED, DCS: Su-33 Flight Manual EN (Feb 2021): https://www.digitalcombatsimulator.com/upload/iblock/e28/DCS_Su33_FC3_Flight_Manual_EN.pdf
5. Datamine N-001: https://github.com/Quaggles/dcs-lua-datamine/blob/master/_G/db/Sensors/Sensor/N-001.lua
6. Datamine N-019 / N-019M: https://github.com/Quaggles/dcs-lua-datamine/blob/master/_G/db/Sensors/Sensor/N-019.lua and .../N-019M.lua
7. Datamine OLS-27 / KOLS: https://github.com/Quaggles/dcs-lua-datamine/blob/master/_G/db/Sensors/Sensor/OLS-27.lua and .../KOLS.lua
8. Datamine aircraft: https://github.com/Quaggles/dcs-lua-datamine/tree/master/_G/db/Units/Planes/Plane (Su-27.lua, Su-33.lua, J-11A.lua, MiG-29S.lua, MiG-29A.lua, MiG-29G.lua)
9. Datamine missiles: https://github.com/Quaggles/dcs-lua-datamine/tree/master/_G/rockets (P_77.lua, P_73.lua) and https://github.com/Quaggles/dcs-lua-datamine/tree/master/_G/weapons_table/weapons/missiles (P_27P, P_27PE, P_27T, P_27TE)
10. ED Forums, "Engaging multiple targets in TWS mode?" (Nov 2021): https://forum.dcs.world/topic/287726-engaging-multiple-targets-in-tws-mode/
11. ED Forums, "R-77 Usefulness?" (search summary; R-77 STT-only on J-11A/MiG-29S): https://forum.dcs.world/topic/217069-r-77-usefulness/
12. ED FC3 product page changelog (Russian TWS changes): https://www.digitalcombatsimulator.com/en/products/planes/flaming_cliffs/?PAGEN_1=3
13. ED news, SPO-15LM development (12 Jul 2025): https://www.digitalcombatsimulator.com/en/news/2025-07-12/
14. Fly and Wire, "MiG-29's SPO-15 RWR: Q&A with Eagle Dynamics" (4 Sep 2025): https://flyandwire.com/2025/09/04/mig-29s-spo-15-rwr-qa-with-eagle-dynamics/
15. ED news, MiG-29A Fulcrum Early Access (19 Sep 2025): https://www.digitalcombatsimulator.com/en/news/2025-09-19/
16. ED shop, DCS: MiG-29A Fulcrum: https://www.digitalcombatsimulator.com/en/shop/modules/fulcrum/
17. Stormbirds, "Eagle Dynamics provide additional MiG-29 details" (23 Aug 2025): https://stormbirds.blog/2025/08/23/eagle-dynamics-provide-additional-mig-29-details/
18. Community "DCS FC3 Su-27 Complete Guide to Air to Air Combat" (undated, 3rd Wing): https://server.3rd-wing.net/public/Bureau%2092nd/DCS%20Su27%20Combat%20Guide.pdf
19. FC3 default key bindings as copied in mods (names and keys): https://github.com/grinnellidesigns/f-22a/blob/main/Input/F-22A/keyboard/default.lua ; https://github.com/luizrenault/a-29b-community/blob/main/Input/A-29B/keyboard/default.lua ; https://github.com/Na1veNoob/DCS-A-6E-Intruder/blob/main/Input/keyboard/default.lua
