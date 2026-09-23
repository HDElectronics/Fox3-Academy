# Flight operations in DCS: pattern, approach, nav and return to base

Scope: the gameplay facts behind the Pattern & landing page (`src/data/flightOps.ts`, issues #18, #19, #22):
overhead-break numbers, on-speed AoA and indexer colours, gear and flap limits, and FC3 return-to-base
navigation. Game-level only (AGENTS.md rule 1): what the player sees, selects and flies.

Research date: 23 Sep 2026. Web and manual reading only; no DCS session. Nothing below is in-game verified.
Values the data file marks `verified: false` are listed in `docs/api/data.md` ("Uncertain values", Flight ops).

## Sources

1. ED, *DCS: F/A-18C Hornet Early Access Guide*, "Airfield VFR Landing" and "Case 1".
2. ED, *DCS: F-15C Flaming Cliffs Flight Manual* (2014), "Landing" and "Quick Start".
3. ED, *DCS: Su-27 Flanker Flight Manual* (2014) and *DCS: Su-33 FC3 Flight Manual* (2021): navigation modes,
   ISM-1 indexer, landing.
4. Heatblur, *F-14 Tomcat Manual*, Landing Procedures (github.com/Heatblur-Simulations/f-14-manual).
5. Chuck's Guides: *DCS F-16C Viper*, *DCS JF-17 Thunder*, *DCS Mirage 2000C*.
6. ED, *DCS Supercarrier Operations Guide*: Case I pattern, LSO section (thresholds, grades), CVN wires.
7. ED, *F-15C FC3 Flight Manual*, "Quick Start" and "Takeoff"; ED *F/A-18C Early Access Guide*, "Takeoff";
   Chuck's Guides F-16C, JF-17, M-2000C, "Takeoff"; Heatblur F-14 manual, "Takeoff" (work-in-progress stub).
8. ED, *DCS: F/A-18C Hornet Early Access Guide*, "Case 1"; Heatblur *F-14 Tomcat Manual*, Landing Procedures
   (carrier); ED *DCS: Su-33 FC3 Flight Manual*, carrier landing (hook, Svetlana-2, Luna-3).
9. ED, *DCS: F/A-18C Hornet Early Access Guide*, carrier takeoff; ED, *DCS Supercarrier Operations Guide*,
   catapult launch and Kuznetsov ski-jump; Heatblur DCS F-14 training lesson, carrier takeoff; ED, *DCS: Su-33
   FC3 Flight Manual*, intake FOD screens.
10. ED, *DCS: Su-33 FC3 Flight Manual*, air-to-air refuelling (IL-78M, UPAZ); Chuck's Guides: *DCS F-16C
    Viper*, *DCS JF-17 Thunder*, *DCS Mirage 2000C*, air-to-air refuelling; issue #28 research summary.

## Pattern and approach by jet

| Jet | On speed | Indexer colours | Pattern numbers | Source |
|---|---|---|---|---|
| F/A-18C | 8.1° (on-speed 7.4–8.8°) | guide calls on-speed a yellow circle; chevrons not given | initial 350 kt / 800 ft AGL; break 5–10 s past the runway end at 1 % of airspeed in g; downwind 600 ft, 1.2 nm abeam; gear and FULL flaps below 250 kt | 1 |
| F-16C | 11° (green doughnut 11–14°) | red above 14°, green 11–14°, yellow below 11° | initial 300 kt / 1500 ft AGL; break ~70° bank, 3–4 g, speedbrake out; downwind 200–220 kt; final 300 ft AGL at 1 nm on the 2.5° line; touchdown ≤ 13° | 5 |
| F-15C | 20–22 units | not given | NAV then ILSN on `1`; HUD GSUP / GSDN; at least 180 kt on final (quick start says ~150 kt at the outer beacon: conflict) | 2 |
| F-14B | 15 units | not given | carrier break 800 ft, 300–350 KIAS, 15–17 s interval; field pattern not published | 4 |
| JF-17 | about 10° | not given | flight path marker in the E-bracket | 5 |
| M-2000C | about 14° | not given | gear below 230 kt | 5 |
| Su-33 | not given | ISM-1: yellow low AoA (fast), green optimal, red high AoA (slow) | history section quotes 240 km/h approach (background only) | 3 |
| Su-27, J-11A, MiG-29S | not given | not given | Su-33 manual history quotes 270 km/h for the Su-27 (background only) | 3 |

Conflicts to settle in game: F-15C final speed; Hornet gear speed (250 kt field section, 150 KIAS carrier
section); the Viper target (11°) versus its band (11–14°).

## FC3 navigation and return to base

- **Russian FC3 jets:** `1` cycles the navigation modes МРШ (route), ВЗВ (return) and ПОС (landing).
  `LCtrl+~` cycles waypoints or airfields (not verified). ВЗВ steers to the glide-slope intercept point on
  the extended centreline, then the system switches to ПОС and the tower gives glide-path instructions
  (source 3; the automatic switch is not verified in game).
- **Tower calls** tell the pilot to correct toward the glide path (above / below / on glide path). Exact
  wording in the current game is not verified.
- **F-15C:** `1` selects NAV, then ILSN; the HUD shows GSUP / GSDN glide-slope cues (source 2). The meaning
  the trainer draws (fly up / fly down beyond a small deviation) is a simplification.
- The intercept-point distance and altitude are not published; the trainer uses 12 km and 600 m.

## Keys

Gear `G`, flaps `F` and airbrake `B` are used for every jet in the trainer. `src/data/procedures.ts` does not
carry these binds and no manual in this pass confirmed them per module: not verified. The stick and
throttle keys on the page are trainer keys, not DCS defaults.

## Takeoff (#24)

| Jet | What the source gives | Source |
|---|---|---|
| F-15C | Quick start: hold `W` (wheel brakes), throttle up, release, rotate at 150 kt. Detailed section: pull the stick half back at 100 kt, hold 10° after nosewheel lift-off (conflict with the quick start) | 7 |
| F/A-18C | Flaps HALF, T/O trim, rotate to 6–8° nose-high; gear up, then flaps AUTO. No rotation speed | 7 |
| F-16C | Vr by weight 128 kt (20000 lb) to 198 kt (44000 lb); start the pull 10 kt early in MIL, 15 kt in afterburner; 8–12° pitch; gear up before 300 kt | 7 |
| JF-17 | Takeoff trim set automatically above 41 kt; start pulling at 120 kt, lift off about 140 kt; gear up at 30 ft and below 300 kt | 7 |
| M-2000C | Full afterburner; nose-wheel steering for the start of the roll; keep pitch below 13° (tail strike); gear up before 260 kt. No flap control (elevons, automatic slats) | 7 |
| F-14B | Heatblur takeoff page is a stub: nothing sourced | 7 |
| Su-27, J-11A, Su-33, MiG-29S | No rotation speed or attitude in the FC3 manual reading; the brake key `W` is not confirmed in ru-fc3.md | 3 |

The trainer's rotation speeds, pitch bands and tail-strike attitudes where no source gives them are gameplay
values (`verified: false`). The ground roll, rotation rate and liftoff rule are arcade rules tied to Vr and the
pitch band (AGENTS.md rule 1), not takeoff performance data.

## Carrier Case I (#26)

| Item | What the source gives | Source |
|---|---|---|
| Stack and initial | Left-hand stack within 5 nm, no lower than 2000 ft. Initial 3 nm astern at 800 ft, just outboard of the starboard side | 6 |
| Break | Before 4 nm, 15–20 s interval between jets | 6 |
| Downwind | 600 ft, 1¼–1½ nm abeam | 6 |
| Groove | Wings level at ¾ nm and call the ball; CLARA with no ball. Touchdown at max power | 6 |
| LSO thresholds | Lineup off beyond 1.7°, far off beyond 2.9°. Glide 1.5° low or 2.5° high, far off 2.7° low or 4.9° high. Pitch rate above 5°/s, bank above 20°, thrust change above 30 %/s. Calls include "Power", "Right for lineup", "Come left", "Wave off", "Bolter". Glide slope 3.6° | 6 |
| Grades | _OK_, OK, (OK), ---, C, B, WO, OWO; comments H, LO, F, SLO, LUL, LUR, NERD, TMRD with X, IM, IC, AR | 6 |
| F/A-18C | Hook `H`, 350 KIAS initial, gear and FULL flaps below 150 KIAS, about 145 KIAS on speed, 180 at 27–30° bank, glide slope 3.5° | 8 |
| F-14B | 15 units; break at 800 ft, 300–350 KIAS, 15–17 s interval; 90 at 450–500 ft; ball at about 0.6 nm; 15–18 s in the groove; MIL at touchdown (afterburner waveoffs prohibited) | 8 |
| Su-33 | Hook `LAlt+G`; Svetlana-2 four wires 12 m apart; Luna-3: green on glide slope, yellow high, red low | 3, 8 |

Conflicts and gaps: glide slope 3.5° (Hornet guide) against 3.6° (Supercarrier LSO section); the Tomcat hook key,
the Kuznetsov LSO (calls and grades) and the Su-33 pattern numbers are not in the sources read. The ball call is
a radio-menu call in DCS; the trainer maps it to a key. The trainer turns the thresholds into an arcade rule
table (hysteresis, a waveoff range, comment bands) and grades from them; these are trainer rules, not the game's
own grading code. No wind: wind over the deck is the ship's speed (a gameplay value).

## Deck launch (#27)

| Item | What the source gives | Source |
|---|---|---|
| F/A-18C catapult | Nose-wheel steering HI `S`, wings spread, launch bar down behind the shuttle, hook up `U`. T/O trim by gross weight: 16° below 44000 lb, 17° at 45000–48000 lb, 19° at 49000 lb and above (afterburner). MIL, wipe out the controls, salute, hands off the stick. After the stroke gear up and flaps AUTO, then the clearing turn | 9 |
| Salute key | Supercarrier guide: `LCtrl+LShift+LAlt+S` or the radio menu. Heatblur lesson: `LShift+U` | 9 |
| Clearing turn | Right from catapults 1 and 2, left from 3 and 4 | 9 |
| F-14B catapult | Hook up `U`, salute `LShift+U` (lesson text) | 9 |
| Su-33 ski-jump | Positions 1 and 2 give a 90 m run, position 3 a 180 m run: use it heavy. The deck stoppers hold the jet during the run-up. Full afterburner, then special afterburner `LShift+E` (10-minute limit). Do not use the intake FOD screens `LAlt+I` (12 % less thrust) | 9 |

Conflicts and gaps: the salute key (the two sources disagree; the trainer shows the Supercarrier key for the
Hornet and the lesson key for the Tomcat, both flagged); the Hornet launch bar key; whether the Tomcat launches
in MIL without afterburner; how the Kuznetsov stoppers release; the weight above which position 3 is needed;
the gaps in the Hornet trim table (44000–45000 lb and 48000–49000 lb). The catapult stroke, the shooter delay,
the ski-jump run and ramp, the cold-cat and short-run settle are arcade rules that reproduce the outcome the
player sees, not catapult, ramp or engine data (AGENTS.md rule 1).

## Air-to-air refuelling (#28)

| Item | What the source gives | Source |
|---|---|---|
| Su-33 window | Refuel at 2000–9000 m and 500–570 km/h IAS | 10 |
| Su-33 call | Radio call "Tanker – Intent to refuel" | 10 |
| Su-33 keys | Probe out `LCtrl+R`, refuelling lights `LAlt+R`. The manual also lists `RCtrl+R` for the refuelling mode and for probe retract: double listing, not verified | 10 |
| Su-33 contact | Close on the basket from 10 m; in contact hold 3–6 m below the pod | 10 |
| IL-78M UPAZ hose bands | Cone-to-pod distance: yellow 3–13 m, yellow+green 13–16 m, green 16–22 m, green+red 22–24 m, red 24–26 m | 10 |
| F-16C boom | AIR REFUEL switch opens the receptacle door; open or close below 400 kt / M0.85, stay below 400 kt / M0.95 with it open | 10 |
| M-2000C, JF-17 | 2–3 kt of closure on the basket | 10 |

Not found or not verified: the default keys for the F-16C AIR REFUEL switch, the F-15C refuelling door, the
F/A-18C and F-14B probe switches (the trainer uses `LCtrl+R` and says so); KC-135 director lights; whether the
JF-17 and M-2000C probes are fixed in DCS (the trainer treats them as fixed); MiG-29S refuelling (not verified;
no lesson); J-11A (a probe is only a Deka plan; no lesson); Su-27 (no probe). Tanker speeds, altitudes and
racetracks are mission settings in DCS; the trainer values are gameplay choices.

What the trainer builds on this (AGENTS.md rule 1): a tanker on a racetrack, the rejoin, a pre-contact point,
a closure-limited contact, the hose bands or a boom envelope as position cues, disconnects and the radio calls.
The hose, basket, boom and fuel transfer are arcade rules that reproduce what the player sees, not hose
dynamics, boom control or fuel-system data.
