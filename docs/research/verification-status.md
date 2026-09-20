# B6 web verification status

Checked 21 September 2026. This note covers DCS player-facing behavior only. It records what the current official manuals can establish and separates that from behavior that still needs a controlled test in a current DCS build. No DCS session was available for this pass, so none of the items below is described as in-game verified.

## Sources used

1. Eagle Dynamics, *DCS: Su-27 Flanker Flight Manual* (October 2014), pp. 39–41, 53–56: [official PDF](https://www.digitalcombatsimulator.com/upload/iblock/ed7/Su-27%20DCS%20Flaming%20Cliffs%20Flight%20Manual%20EN.pdf).
2. Eagle Dynamics/Belsimtek, *DCS: F-15C Flaming Cliffs Flight Manual* (2014), pp. 58–61, 68–70, 76–80: [official PDF](https://www.digitalcombatsimulator.com/upload/iblock/1ad/F-15C%20DCS%20Flaming%20Cliffs%20Flight%20Manual%20EN.pdf).
3. Eagle Dynamics, *DCS: F-16C Viper Early Access Guide*, updated 16 August 2026, pp. 83–85, 590–607, 693–708: [official documentation page](https://www.digitalcombatsimulator.com/en/downloads/documentation/dcs-viper_early_access_manual_en/), [official PDF](https://www.digitalcombatsimulator.com/upload/iblock/e78/33zl8132hi71d3tv0194vvkzpzl3mrr6/DCS%20F-16C%20Early%20Access%20Guide%20EN.pdf).
4. Eagle Dynamics, *DCS: F/A-18C Hornet Early Access Guide*, updated 24 March 2024, pp. 72–74 and 407–418: [official documentation page](https://www.digitalcombatsimulator.com/en/downloads/documentation/dcs-hornet_early_access_guide_en/), [official PDF](https://www.digitalcombatsimulator.com/upload/iblock/ea9/lxf69u2uk1fhqq7ndb55z9egzabe8hdg/DCS%20FA-18C%20Early%20Access%20Guide%20EN.pdf).
5. Heatblur, *F-14 Tomcat Manual*, repository revision `49bbd9a` accessed 21 September 2026: [classic F-14 TID symbology](https://f14.manuals.heatblur.se/f14ab/systems/radar/interface.html), [classic F-14 countermeasures](https://f14.manuals.heatblur.se/f14ab/systems/defensive_systems/countermeasures/ale_39.html), and the [F-14B(U) lesson control table](https://github.com/Heatblur-Simulations/f-14-manual/blob/49bbd9a144c32033bd3b3d98f04b113c58f22fa0/src/f14bu/dcs/training_lessons/lesson01.md#L78-L83).
6. Deka Ironwork Simulations, *DCS: JF-17 Thunder Flight Manual*, document dated 21 September 2024, pp. 55–59, 293–298: [mirror of the module manual](https://flyandwire.com/wp-content/uploads/2024/09/odt_dcs-jf-17-flight-manual-en-faw240921.pdf). This is a primary Deka-authored manual, but the available English copy is an unofficially hosted machine translation; confidence in exact English control wording is therefore moderate.

## Findings that support a correction now

### Su-27 СНП cursor and the 85% transition

The official Su-27 manual is explicit: in СНП/TWS, moving the radar cursor over a target makes the cursor snap to and follow that target; transition to STT is automatic at 85% of the calculated maximum weapon launch range; `Enter` forces an earlier STT lock (source 1, pp. 53–54). This corroborates the Su-27 behavior described in the existing research.

The three actions must remain distinct in the trainer:

- freely slewing the player-controlled cursor;
- the cursor snapping to a target once the player places it over that target in СНП;
- automatic STT at 85% Rmax, or explicit early STT with `Enter`.

Discrete target-to-target cursor stepping is a trainer aid, not behavior supported by this manual. Confidence: **high for the documented Su-27 behavior**, but current DCS must still be checked because the MiG-29 and Su-33 manuals reportedly contradict the early-`Enter` sentence.

### Viper launch cue label

The current 2026 F-16C guide enumerates AIM-120 HUD symbology as the Allowable Steering Error Circle, Attack Steering Cue, missile diamond, target-designator box, slant range, and linear missile scale. Its employment steps say to launch at RAERO or ROPT with the required loft and centered ASC, or at/below RPI with the ASC inside the ASEC (source 3, pp. 590–607). The guide contains no `SHOOT` text cue for the Viper.

The trainer should not label the F-16C cue `SHOOT`. A pilot-facing description such as **“ASC inside ASEC; target at/below RPI”** matches the current guide. Confidence: **high**.

### Classic F-14 launch cue label

The current Heatblur classic F-14 manual documents launch-zone vectors with TUMR, TUOR and TUIR; the WCS blinks the target symbol, launch-zone vector and firing-order number when time to optimum missile range is under eight seconds (source 5). It does not document an `IN RNG` text cue for the classic F-14A/B. The newer F-14B(U) manual documents a `SHOOT` cue, which must not be back-applied to the classic display.

The trainer should remove `IN RNG` from the classic F-14 display and use the launch-zone vector plus optimum-zone blinking. Confidence: **high**.

### Hornet chaff and flare defaults

The official Hornet guide names the throttle control **Dispense Switch** and gives the DCS keyboard defaults directly: Forward `[E]`, Aft `[D]` (source 4, pp. 72–74). In MAN, Forward runs manual program 5 and Aft runs the selected manual program. In BYPASS, Forward releases chaff and Aft releases flares (pp. 407–418). The current data's `E`/`D` bindings are corroborated. Confidence: **high**.

### F-14 trigger and pilot countermeasure control

Heatblur's F-14B(U) training control table says `Trigger` has Spacebar assigned and tells the player to de-assign it because Spacebar advances the lesson. That is direct evidence for the B(U) default. The classic F-14 cockpit manual separately identifies the second trigger detent as the selected forward-firing weapon release. Treat **Spacebar as strongly supported but still version-specific for the classic F-14B** until its Controls menu is checked.

For countermeasures, Heatblur names the pilot command **DLC Toggle / Countermeasure Dispense** and its training table says **To be assigned**. With flaps up, the ALE-39 FLARE MODE switch determines whether that button releases one flare (`PILOT`) or one chaff cartridge (other positions). The trainer should not invent a default keyboard key. Confidence: **high for the command and absence of a B(U) suggested default; medium for carrying that default status back to the classic F-14B**.

### JF-17 initial radar mode

The Deka manual's display schedule is mode-dependent (source 6, pp. 55–59): normal tactical navigation shows the radar in **RWS**, while air-to-air **Intercept (INTC)** master mode shows the radar in **TWS**. Thus “the JF-17 starts in TWS” is too broad, but a trainer entering its BVR/INTC lesson should initialize the JF-17 in TWS. Confidence: **moderate-high**, limited by the machine-translated English copy.

The manual names the countermeasure HOTAS action as the **T2 switch pulled aft**, which launches chaff/flares (pp. 297–298). It does not state a default keyboard binding. Keep the keyboard key unverified. Confidence: **moderate**.

## Corroborated only in part; retain the caveat

### STT-launched AIM-120 or R-77 warning

The official F-15C manual says an AIM-120 fired from TWS gives no radar lock or launch indication before the missile seeker activates (source 2, p. 70). It says STT may alert the target to the lock (p. 68), but does not state whether firing an AIM-120 from STT adds an immediate launch warning. The Su-27 manual similarly explains STT lock, SARH launch illumination, and ARH seeker detection, but does not resolve whether an R-77 launch from STT creates a launch warning before seeker activation.

Therefore `sttArhLaunchWarning: false` remains a plausible trainer default, not a verified DCS fact. Do not remove the F-15C, J-11A or MiG-29S caveats without a current-game test.

### SPO-15 lamp for an active missile

The Su-27 manual says the Lock/Launch light is steady for a radar lock and flashes when a radar-guided missile launch is detected. It then says an ARH missile is detected only after its own seeker locks, becomes the primary threat, and is recognized by the rapid increase in the power-of-emission lamps (source 1, pp. 39–41).

Reading the adjacent statements together supports a flashing Lock/Launch lamp for detected ARH guidance, but the manual does not explicitly say “the red lamp flashes for an active ARH seeker.” Keep that exact visual claim caveated until observed in the current game. Confidence: **medium**.

### F-16 countermeasure defaults

The 2026 guide fully defines CMS Forward/Left/Aft/Right behavior (source 3, pp. 83–85 and 693–708), but it does not supply default keyboard keys. The HOTAS functions are verified; default keyboard bindings are not. Confidence: **high for function, unresolved for keyboard default**.

## Not established by authoritative web documentation

- **AIM-120B/C pitbull distance.** The current F-16 manual provides the cockpit activation countdown and no fixed activation distance. The older FC3 manuals give only a generic 10–20 km description. Do not convert either into a B/C-specific verified distance.
- **SD-10 pitbull distance.** The Deka manual uses the cockpit TOA countdown and does not publish a fixed distance. Retain the approximation and caveat.
- **FC3 player-radar use of AI detection tables.** No official manual or current changelog found in this pass connects the N-001/N-019 AI sensor-table ranges to the player radar.
- **FC3 notch behavior in look-up.** The manuals explain the look-down clutter notch but do not establish whether the simulated FC3 gate is also applied in look-up.
- **Default keyboard bindings for F-16 CMS, classic F-14 countermeasure dispense, or JF-17 countermeasure dispense.** The manuals document control functions, not current default keyboard mappings.

## Reproducible current-game checklist

Record the exact DCS version, module version shown by Module Manager, mission file, hot/cold/air start, realism presets, aircraft roles, and both players' tracks. Disable mods. Use the same head-on, co-altitude setup and repeat each result three times.

1. **STT ARH warning:** target aircraft with an RWR; shooter uses F-15C AIM-120 and J-11A or MiG-29S R-77 in separate runs. Establish STT, note the target's steady lock indication, fire outside pitbull range, and record whether the RWR changes at launch or only when the missile seeker becomes active. Run matching TWS shots as the silent-control case.
2. **Su-27 СНП:** enter BVR, radar on, СНП. Move the cursor manually across empty display space, then over a contact. Record free slew, snap/follow behavior, auto-STT range as a fraction of displayed Rmax, and whether `Enter` above 85% Rmax forces STT. Repeat with MiG-29S and Su-33 to expose module-specific differences.
3. **Pitbull distance:** for AIM-120B, AIM-120C and SD-10, use a non-manoeuvring co-altitude target and record target range when the shooter cockpit activation countdown reaches zero and when the target RWR first shows the missile. Repeat at two launch ranges and two altitudes; report a range band, not a universal constant, if results vary.
4. **FC3 radar range:** place a known aircraft type and aspect at fixed altitude. Approach in 1 km steps and record first detection and stable track for N-001 and N-019M. Repeat look-up and look-down; do not infer player behavior from AI tables.
5. **FC3 look-up notch:** hold target speed and geometry constant, first with the target above the shooter and then below. Sweep target aspect through the beam in small increments and record track loss/reacquisition.
6. **Default keys:** reset only the relevant module's keyboard category to the current default, then record the Controls-menu command and binding for F-16 CMS directions, F-14 Trigger and DLC/Countermeasure Dispense, JF-17 T2 countermeasure release, and Hornet Dispense Switch Forward/Aft.
7. **Cue labels:** capture an F-16 AIM-120 HUD at RPI and a classic F-14 TID/HUD approaching optimum launch range. Verify that the Viper uses DLZ/ASC/ASEC geometry without `SHOOT`, and that the classic Tomcat uses launch-zone vectors/blinking without `IN RNG`.
8. **SPO-15 active missile cue:** launch an AIM-120 from TWS at the Su-27. Record the SPO-15 power ring, primary-threat bearing/type lamps, red Lock/Launch lamp, and audio from before activation through seeker lock.
9. **JF-17 entry mode:** record the centre MFCD radar mode after a hot air start in NAV, then after selecting A/A INTC, and repeat from cold start after DTC load. The expected manual result is RWS in NAV and TWS in INTC.
