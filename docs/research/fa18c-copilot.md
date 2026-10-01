# F/A-18C copilot: guide facts for live callouts

Scope: gameplay facts the F/A-18C copilot (fuel and limits watch, field and carrier landing coach, live
checklists, threat helper) can call out from DCS export data. Game-level only (AGENTS.md rule 1): switch names,
positions, keys, displayed numbers, lights, tones and voice alerts as the player meets them. No weapon
engineering.

Source: ED, *DCS: F/A-18C Early Access Guide* (EN), "Updated 24 March 2024" (p1), file
`Mods/aircraft/FA-18C/Doc/DCS FA-18C Early Access Guide EN.pdf` in the DCS install. Page numbers below are the
printed page numbers; they equal the PDF page index in this edition (checked on p44, 45, 81, 84, 101, 411, 422).
Figures were read from rendered pages where the text layer is garbled (AoA indexer table, checklist page,
pattern diagram, EW symbols). The author's note on p12 says the guide needs a larger revision to match the
current module: treat everything here as "per the guide", not in-game verified.

Research date: 1 Oct 2026. Manual reading only; no DCS session.

## 1. Cold start

The guide skips pre-flight and "upon entering cockpit" checks and starts at "Before Engine Start" (p93).
Auto-start: `LWin+Home`, cancel with `LWin+End` (p93).

| Step | Switch / action as written | Cockpit cue to confirm | Page |
|---|---|---|---|
| 1 | BATTERY switch ON; confirm both Left and Right Generators ON (right console) | BATT SW caution while ON (p65); voltmeter live (p66) | 93 |
| 2 | Fire detection switch: hold FIRE TEST A until all audio caution messages play; wait 10 s; repeat FIRE TEST B. Battery switch can be cycled between tests to rewind the tape (left console) | Three red fire lights, L/R BLEED lights, voice alerts "Engine fire left/right", "APU fire", "Bleed air left/right" | 93, 60-61 |
| 3 | APU switch ON; wait for APU READY light | Green APU READY light | 94, 61 |
| 4 | ENG CRANK switch right (R) | Right engine spools | 94 |
| 5 | Right throttle OFF to IDLE above 25 % rpm (`RShift+Home`) | IFEI RPM above 25 % | 94 |
| 6 | Above 60 % rpm on the right engine: BLEED AIR knob 360° clockwise, NORM to NORM (right console) | IFEI RPM above 60 % | 94 |
| 7 | CAUTION, WARNING and ADVISORY lights test (right console) | Lights illuminate (LT TEST switch, p68) | 94 |
| 8 | Power both DDIs, MPCD and HUD; FCS page on left DDI, BIT page on right DDI | Displays on | 94 |
| 9 | COMM 1 and COMM 2 as required | — | 94 |
| 10 | ENG CRANK switch left (L), after confirming right engine: rpm 63-70 %, TEMP 190°-590°, FF 420-900 PPH, NOZ 73-84 %, OIL 45-110 psi | IFEI values in those bands | 95 |
| 11 | Left throttle OFF to IDLE at 25 % rpm or more (`RAlt+Home`) | IFEI RPM at least 25 % | 95 |
| 12 | Left engine above 60 % rpm: INS knob to GND (field) or CV (carrier) (right console) | Alignment shows on HSI (see INS below) | 96 |
| 13 | Radar knob OPR (right console) | — | 96 |
| 14 | OBOGS control switch and FLOW switch ON (left console) | — | 96 |
| 15 | FCS RESET button; monitor FCS DDI page (left console) | FCS page channel Xs clear | 97, 82 |
| 16 | Flap switch AUTO (left quarter panel) | — | 97 |
| 17 | Takeoff Trim button (left console) | TRIM advisory on DDI while held; stab 12° NU | 97, 62, 80 |
| 18 | Hold FCS BIT switch up (`Y`, right wall) and press the FCS OSB on the BIT/FCS page at the same time | — | 97 |
| 19 | Four down test: cycle refuelling probe, speed brake, launch bar, arrestor hook, pitot heat; set flaps HALF | — | 98 |
| 20 | Release the hand brake (left click) | — | 98 |
| 21 | Set BINGO with the IFEI up/down arrows | Bingo value on IFEI lower counter | 98 |
| 22 | Standby barometric altimeter to field elevation | — | 98 |
| 23 | Radar altimeter 200 ft (field) or 40 ft (carrier) | — | 98 |
| 24 | Uncage the standby attitude indicator | — | 98 |
| 25 | Attitude source AUTO | — | 98 |

Engine start notes: either engine can start first; right first gives normal brake hydraulic pressure (p61).
The crank switch returns to OFF by itself when the generator comes on line; the APU shuts down about 1 minute
after the second generator is on line (p61-62). On battery only, the IFEI shows RPM and TEMP until the APU is on
line (p41). JHMCS alignment, if used, comes after step 25 (p98).

### INS alignment

| Fact | Value | Page |
|---|---|---|
| Parking brake | Set before alignment; releasing it before alignment completes can invalidate it | 116 |
| Knob | GND on an airfield, CV on a carrier (carrier taxi text calls it "NORM CVN", p104) | 116, 104 |
| Where to watch | HSI page: alignment type (GRND, CV RF, CV CBL, CV MAN), quality, time into alignment, stored heading option | 116 |
| Quality cue | NO ATT first, then a number; OK appears next to QUAL when acceptable | 116 |
| Finish | INS knob to IFA (with GPS) or NAV (without GPS) when OK shows | 117 |
| Alignment duration | Not in guide | — |

Copilot cues with an observable value: RPM 25 % and 60 % per engine, the five step-10 bands, APU READY, IFEI
bingo value, INS QUAL "OK". The rest are switch states that the export may or may not expose.

## 2. Taxi, takeoff and after takeoff

### Airfield taxi (p99)

| Item | Value | Page |
|---|---|---|
| Throttle | `PgUp` / `PgDn` | 99 |
| Rudder / steer | `Z` left, `X` right; hold the NWS button for NWS HI (tighter turns) | 99 |
| Wheel brakes | `W` | 99 |
| Displays | Left DDI checklist page, right DDI FCS page | 99 |
| Hold short | Arm the ejection seat; close canopy (`LCtrl+C`); left DDI to HUD page | 99 |

CHKLST page T.O. items (figure, p81): CONTROLS, WINGS, TRIM, FLAPS, HOOK, HARNESS, WARN LITES, NWS LO, SEAT ARM.
The page also shows gross weight and STAB POS; takeoff trim is 12° NU (p80).

### Carrier taxi checklist (p104)

1 Arm ejection seat. 2 Nosewheel steering on. 3 No warning lights. 4 Hook up. 5 Flaps HALF. 6 Trim set to total
aircraft weight. 7 Wings match wing fold handle. 8 Oxygen on. 9 Brake off. 10 Launch bar up. 11 Anti-skid off.
12 Master Arm off. 13 MPCD: WYPT, cycle to waypoint 1. 14 Countermeasures off. 15 Radar altimeter 40 ft.
16 Canopy closed. 17 Master external light switch aft.

### Airfield takeoff (p100)

| Fact | Value | Page |
|---|---|---|
| Line up | Centre of runway, roll forward to straighten the nosewheel | 100 |
| Left DDI | HUD page | 100 |
| Power | "Advance throttles to afterburner" | 100 |
| Directional control | Nosewheel steering | 100 |
| Rotation | At nosewheel rotation speed, hold stick back to 6°-8° nose high (waterline above the HUD horizon) | 100 |
| Rotation speed | Not in guide | — |
| After takeoff | Gear up and FLAP switch AUTO once positive climb is established; right DDI to A/A radar | 100 |
| Flaps for takeoff | Not stated in the takeoff section; the cold start ends with flaps HALF (p98) and the carrier checklist says HALF (p104) | 98, 104 |
| Gear-up speed limit | Not in guide | — |

### Carrier launch (p105-107)

| Fact | Value | Page |
|---|---|---|
| Taxi steering | NWS high gain `S` | 105 |
| Wings | Spread behind the JBD with the wing fold handle (right click to SPREAD, mouse wheel forward) | 105 |
| Launch bar | Lower the launch bar when the nosewheel is directly behind the shuttle (no key given) | 105 |
| Hook-up | `U` auto-connects the launch bar to the catapult shuttle | 105 |
| Stab trim by gross weight (CHECKLIST page) | Below 44000 lb: 16° (MIL or burners). 45000-48000 lb: 17° (MIL or burners). 49000 lb and above: 19° (burners required) | 106 |
| Run-up | Throttles MIL, wipe out the controls (stick full circle, full forward and back, full left and right rudder) | 107 |
| Launch power | "Increase throttle to 100% afterburner and move hand off stick" | 107 |
| Stroke | Catapult launches and sets flyaway trim | 107 |
| After launch | Positive climb: gear up `G`, flaps AUTO `F` | 107 |
| Clearing turn | Cat 1 or 2: right, then parallel the carrier BRC for 7 miles at no more than 500 ft / 350 kt. Cat 3 or 4: left | 107 |
| Salute | Not in guide (the only mention is the p2 slogan) | 2 |
| L BAR lights | Green: bar extended with weight on wheels. Red: launch bar malfunction, nose gear cannot retract | 43, 58 |
| Gear handle interlock | Gear cannot be raised with weight on wheels or with the launch bar extended (main gear up, nose stays down) | 57 |

## 3. Landing

### AoA indexer and HUD (p44-45, p59, p102-103, p110-111)

The indexer is left of the HUD. It works only with gear down, weight off wheels and a valid ADC AoA; it is dark
with weight on wheels (p44). Symbols flash if the hook is up and the hook bypass switch is CARRIER; solid in FIELD.
Lowering the hook moves the switch to CARRIER (p44, p59).

| Indexer cue (figure p44-45) | Airspeed | AoA as printed | Page |
|---|---|---|---|
| Green upper chevron only | Slow | "9.3° to 9.0°" (printed as such; reads as a typo for "above 9.3°") | 44 |
| Green upper chevron + amber doughnut | Slightly slow | 8.8° to 9.3° | 45 |
| Amber doughnut only | On speed | 7.4° to 8.8° | 45 |
| Amber doughnut + red lower chevron | Slightly fast | 6.9° to 7.4° | 45 |
| Red lower chevron only | Fast | 0° to 6.9° | 45 |

| Fact | Value | Page |
|---|---|---|
| On-speed target | 8.1° AoA, "yellow circle" on the indexer | 102 |
| HUD cue | Velocity vector centred in the AoA "E" bracket | 102, 110 |
| Trim | Trim to 8.1° to be hands-free; with flaps down, trim sets an AoA target | 103, 72 |
| ATC approach mode | `T` with flaps HALF or FULL and TEF at least 27°: throttles hold on-speed AoA. Drops out on flaps AUTO, WOW, bank over 70°, throttle force, and other listed faults | 76 |
| HUD AoA readout | True AoA in degrees | 77 |

### Field VFR pattern (p101-103)

| Fact | Value | Page |
|---|---|---|
| Entry | NAV master mode, Master Arm SAFE; 350 kt, 800 ft AGL along runway heading, offset away from the break | 102 |
| Diagram labels | ENTER: armament switch OFF. Break. Speedbrake as required. Gear down, flaps FULL, 250 knots. Speedbrake retract. On speed AoA. Landing check list. Base leg / final: maintain on speed AoA. Touchdown: throttles idle | 101 |
| Break | 5-10 s after the wingtip passes the runway end; pull 1 % of airspeed in g (350 kt = 3.5 g) | 102 |
| Downwind | Reciprocal heading, 600 ft AGL, about 1.2 mi lateral offset | 102 |
| Gear and flaps | Below 250 kt: gear down, flaps FULL | 102 |
| On speed | Establish 8.1° at 600 ft AGL | 102 |
| Base turn | When the wingtip aligns with the threshold; 30° bank, velocity vector just below the HUD horizon, add a little power | 103 |
| Final | Velocity vector 500 ft past the threshold, 3° flight path, throttle for path | 103 |
| Touchdown | Throttles idle, small rudder corrections | 103 |
| Waveoff | MIL power (MAX if required); retract gear and flaps only after a safe climb is established | 101 |
| Field approach speed | Not in guide (only AoA) | — |
| Touch-and-go | Not in guide | — |

CHKLST page LAND items (figure, p81): WHEELS, FLAPS, HOOK, ANTI SKID, HARNESS, DISPENSER.

### Case I carrier recovery (p108-113)

| Fact | Value | Page |
|---|---|---|
| Case I weather | Visibility at least 5 miles, clouds no lower than 5000 ft | 108 |
| Before entry | A/A radar on right DDI, HUD repeater on left DDI; NAV master mode; Master Arm SAFE; hook down `H`; HUD altitude to radar | 108 |
| Holding | Port holding: 5 nm diameter circle, 1500 to 5000 ft over the carrier (guide describes a direct approach instead) | 108 |
| Initial | From astern at 800 ft and 350 KIAS, starboard of the carrier, close enough to check the deck is clear | 108 |
| Break | Level left turn no more than 1.5 nm past the bow; 1 % of airspeed in g (350 kt = 3.5 g) | 109 |
| Downwind | Reciprocal heading, 600 ft; airbrake if above 350 KIAS until 250 KIAS | 109 |
| Gear and flaps | Below 150 KIAS: gear down `G`, flaps FULL `LCtrl+F` | 109 |
| Abeam distance | 1.3 to 1.4 nm (see also 1.2 mi on p48 and 1.1-1.3 nm on p145) | 109 |
| On speed | Let speed decay to about 145 KIAS at 600 ft; capture on-speed AoA (E-bracket and indexer) | 110 |
| Start of the 180 | When the round-down on the stern is visible and forms a straight line | 111 |
| First 90° | On-speed AoA, 100-200 ft/min descent, 27°-30° bank; velocity vector just below the HUD horizon; fly instruments, do not peek | 111 |
| Second 90° | Let descent increase to 500 ft/min; acquire the carrier and IFLOLS | 112 |
| Groove | Rolling out on final, all direction from the IFLOLS | 112 |
| Glideslope | IFLOLS normally set to 3.5°, targeting the 3-wire | 112 |
| IFLOLS reading | Ball above datums: high. Below: low. Red cell visible: dangerously low | 112 |
| Cut lights | Green; momentary at the groove = "Roger ball"; again = add power | 112 |
| Waveoff lights | Red; when lit, wave off immediately. Alternating waveoff and cut lights = "Bingo" | 112 |
| Touchdown | Throttles to full power immediately on main gear contact in case the hook misses | 113 |
| Trap | Throttles idle, hook up `H`, flaps AUTO `F`, taxi clear | 113 |
| Bolter | Not named; the full-power-at-touchdown rule is the only bolter action given | 113 |
| Ball call (radio) | Not in guide | — |
| 90 and 45 altitudes, groove time, ball distance, break interval | Not in guide | — |

### Case III / ICLS (p150-151)

Only the ICLS procedure is given (mission practice "Case III Carrier Landing"): UFC ILS, ON/OFF, enter the
carrier ICLS channel (1-20, from the briefing) and ENT, box ILS on HSI pushbutton 5. Fly the localizer and
glideslope bars to a cross on the velocity vector; glideslope bar above the velocity vector means low (p48,
p151). No Case II or Case III pattern, marshal or platform numbers in the guide (p108 defers them).

### Gear, flap and hook facts

| Fact | Value | Page |
|---|---|---|
| Gear handle | `G`; red light in the handle while in transit; aural tone after the light has been on 15 s | 57 |
| Gear lights | Three green: NOSE, LEFT, RIGHT | 40 |
| Flap keys | AUTO `F`, HALF `LShift+F`, FULL `LCtrl+F` | 58 |
| Flap limit cue | HALF / FULL green lights below 250 kt; amber FLAPS light with HALF or FULL above 250 kt (flaps run in auto-flaps-up mode) | 40, 58 |
| FULL flaps | Up to 45° TEF and 42° aileron droop at approach speeds | 58 |
| Hook | `H`; HOOK light while in transit or when hook and handle disagree | 64 |
| Anti-skid | For airfield use, not carrier; brakes held off until wheel speed above 50 kt (or 3 s after touchdown) | 59 |
| Speedbrake keys | Extend `LShift+B` (while held), retract `LCtrl+B`, centre `B` | 75 |
| Speedbrake auto | Retracts above 6.0 g or 28° AoA in auto-flaps-up; retracts when flaps are extended unless held aft; creeps closed above 400 kt | 74-75 |
| Max vertical g | CHKLST page shows the maximum vertical g of the last landing (0.01 g) | 80 |

## 4. Fuel

| Fact | Value | Page |
|---|---|---|
| Set BINGO | IFEI up/down arrows (centre of IFEI); only editable while the IFEI shows T and I | 41, 98 |
| BINGO display | IFEI lower counter, 100 lb steps; FUEL page BINGO field | 41, 83-84 |
| BINGO alert | Bingo caution message and audio; voice "Bingo", repeated twice | 41, 70 |
| IFEI counters | Upper: total (T), middle: internal (I), 10 lb steps | 41 |
| IFEI QTY cycle | T/I, FL/FR (feed tanks 2 and 3), TL/TR (transfer 1 and 4), WL/WR (wings), XL/XR (external), C (centreline). Off T/I, the bingo window shows total fuel | 41 |
| FUEL page | Each tank, internal, total, BINGO; caret shows fraction of capacity; INV / EST flags | 83-84 |
| FUEL LO | Caution when either feed tank is below 800 lb; stays on at least 1 minute; voice "Fuel low" | 65, 70 |
| FLBIT | Tests FUEL LO: caution, voice, MASTER CAUTION; 13 s | 83 |
| HOME FUEL | FPAS: caution and MASTER CAUTION when 2000 lb would remain at the HOME waypoint | 88 |
| FPAS | Range and endurance to 2000 lb (to 0 lb below 2500 lb total); removed above M0.9 | 86-87 |
| External tank | FPU-8/A, 330 gal, about 2200 lb | 36 |
| Fuel flow readout | IFEI FF, main engine only (no afterburner flow), 300 to 19900 PPH in 100 PPH steps; shows 0 below 320 PPH | 41 |
| Start fuel flow | 420-900 PPH on the running engine before cranking the second | 95 |
| Bingo formula | Bingo (lb) = (time of flight / 60) x fuel lb/hr | 423 |
| Internal fuel capacity | Not in guide (history section only says the F/A-18 grew internal fuel by 4460 lb over the YF-17, p27) | — |
| Per-tank capacities | Not in guide (figure p84 shows one example load) | — |

## 5. Limits, warnings and cautions

| Fact | Value | Page |
|---|---|---|
| G limit | FCS page shows the g limit for gross weight; no number given | 82 |
| G limiter override | Paddle switch with stick near full aft: command limit +33 %; g-LIM OVRD caution, MASTER CAUTION and tone; ends when stick returns near neutral | 72 |
| HUD g | Current g; peak g shown once over 4 g | 77 |
| Departure warning tone | High-pitched solid or broken tone when certain AoA limits are exceeded (limits not given) | 70 |
| Flap / speed | 250 kt for HALF/FULL scheduling (FLAPS light above) | 40, 58 |
| Carrier gear/flap speed | Below 150 KIAS | 109 |
| Spin recovery display | 120 ±15 kt with sustained yaw; reverts above about 245 kt or below 15°/s yaw. Switch is prohibited in official manuals | 54-56 |
| Standby ASI range | 60 to 850 kt | 54 |
| Mach / airspeed limits, symmetric / asymmetric g numbers, AoA limit, overspeed cue | Not in guide | — |

### Voice alerts (p70; each repeated twice)

"Flight controls, flight controls" (any FCS caution except CHECK TRIM, FCS, NWS, FC AIR DAT, g-LIM OVRD,
R-LIM OFF); "Engine fire left"; "Engine fire right"; "APU fire"; "Bleed air left"; "Bleed air right";
"Flight computer hot"; "Fuel low"; "Bingo"; "Altitude". Also "IFF" on an unrecognised Mode 4 interrogation in
DIS/AUD (p63).

| Alert | Trigger | Page |
|---|---|---|
| "Altitude" | Passing the HSI DATA A/C warning altitude (baro up to 25000 ft, radar up to 5000 ft; 0 disables) | 139 |
| Radar altitude warning | Gear up and below the radar altimeter low index: "whoop whoop" tone / voice, repeats until reset (set index below altitude, climb, or press RALT on the UFC). Gear down: sounds once | 70 |
| Master caution tone | "Deedle deedle" whenever MASTER CAUTION lights | 70, 42 |
| Gear tone | Gear handle light on for 15 s | 57 |
| Not in guide | "ROLL LEFT / ROLL RIGHT", "OVER-G", "Warning, warning" or any other Betty calls beyond the list above | — |

### Lights

| Light | Meaning | Page |
|---|---|---|
| MASTER CAUTION (yellow) | Any caution; press to reset; tone with it | 42 |
| FIRE (red, L/R/APU) | Fire detected; push to shut off fuel and arm the bottle (READY), extinguisher pushbutton discharges (DISCH) | 42-43, 53 |
| L BLEED / R BLEED (red) | Bleed leak or fire; voice "Bleed air left/right" | 42 |
| SPD BRK | Speedbrake not fully retracted | 43 |
| FUEL LO, L GEN, R GEN, BATT SW, FCS HOT, FCES, GEN TIE, CK SEAT, APU ACC | Right panel cautions (yellow); CK SEAT = seat not armed | 65 |
| PARK BRK caution | Parking brake set, INS on, both throttles above about 80 % rpm | 59 |
| LOCK / SHOOT | LOCK: STT inside RMAX. SHOOT steady: inside RMAX; flashing: inside RNE; steady with gun: in solution | 52 |

## 6. ALR-67 RWR (gameplay level)

| Fact | Value | Page |
|---|---|---|
| Azimuth indicator bands (outside in) | Critical, lethal, nonlethal, status circle; tick marks every 30° | 412-413 |
| Band meaning | Critical: specific threats or lethal modes. Lethal: threats judged lethal. Nonlethal: unknown, friendly or known nonlethal | 413 |
| Status circle | Area I: EW priority mode (N, I, A, U, F). Area II: L in limit mode. Area III: B = BIT failure, T = thermal overload | 413 |
| LIMIT | Six highest-priority emitters, "L" in area II | 413 |
| OFFSET | Separates overlapping symbols | 414 |
| Airborne symbols (p411 figure) | Number with an arc above = friendly; number with an open box above = unknown; number with a hat (^) above = hostile | 411 |
| Ground / naval symbols | SAM: code under a "house" outline (e.g. HK). AAA: "A" under a hat with tick marks. Naval: code over a boat outline (e.g. AE, SS). EWR: hook-shaped symbol | 411 |
| Airborne codes | e.g. 29 MiG-29 / Su-27 / Su-33 / J-11, 30 Su-30, 31 MiG-31, 50 A-50 / KJ-2000, 14 F-14, 15 F-15, 16 F-16, 18 F/A-18, F4, F5, M2 Mirage 2000, F1, JF JF-17, E2, E3; U for unknown types (Tornado IDS, AJS37) | 422 |
| Missile seeker | "M": missile radar seeker detected (active radar missiles) | 422 |
| SAM / ship codes | Full table pp420-422 (e.g. 6 SA-6, 8 SA-8, 10 / BB / CS SA-10, 11 / SD SA-11, 15 SA-15, HK Hawk, P Patriot) | 420-422 |
| Tones | New emitter: single short tone. Status change (e.g. search to lock): descending three-tone. Launch: repeating multi-pitch tone while the threat is detected | 70 |
| Status change rule | New symbol, or a move to a more lethal band, gives a status change tone; dropping off or moving to a less lethal band does not | 413 |
| BIT tones | New contact (waterfall), AAA, missile launch, radar lock, power up | 411 |
| Threat lights | AI: hostile AI radar lock (lethal band). CW: CW radar, probably guiding a missile (critical). SAM: SAM radar locked (critical; p53: solid tracking, flashing guiding). AAA: AAA radar. DISP: ALE-47 program ready, consent needed (DISPENSE cue on HUD) | 414, 53 |
| REC light | Aircraft illuminated by a threat radar (ASPJ detects a lock) | 43, 416 |
| HUD EW | Box HUD EW on the EW page to show RWR symbols on the HUD | 410 |
| Countermeasure keys | Dispense switch forward `E` (program 5), aft `D` (EW-page program); BYPASS: forward one chaff, aft one flare (p74) / two (p408, p418): internal conflict | 74, 408, 418 |
| Default loadout readout | C 14, F 18, O1 14, O2 14 on the EW page after ALE-47 BIT | 409 |

## 7. HUD on approach and E-bracket

- Velocity vector centred in the AoA "E" bracket = on speed, matching the amber doughnut (p102, p110-111).
- HUD altitude: ALT switch RDR shows radar altitude with "R"; above 5000 ft AGL it falls back to baro with a
  flashing "B" (p49, p77). The Case I procedure sets HUD altitude to radar (p108).
- Bank scale marks at 5°, 15°, 30°, 45° (p78); the base turn uses 30° (p103), the carrier 180 uses 27°-30° (p111).
- Selected course on the HUD: arrow with dots at 4° and 8° off course; dots vanish under 1.25° (p145).
- The bracket's own geometry (which tick is which AoA) is not described in the guide.

## Conflicts with repo data

Checked `src/data/flightOps.ts` (lines 40-145, 330-380) and `docs/research/flight-ops.md`.

### Confirmed by the guide

| Repo value | Guide | Page |
|---|---|---|
| fa18c on speed 8.1°, band 7.4-8.8° | Same | 102, 45 |
| initialKt 350, initialAltFt 800 AGL | Same (field and carrier) | 102, 108 |
| breakG 3.5, break 5-10 s past the runway end | Same | 102 |
| downwindAltFt 600, abeamNm 1.2 (field) | Same | 102 |
| glideDeg 3, aimPointFt 500 | Same | 103 |
| hudCue "E-bracket on the flight path marker" | Same | 102 |
| gearMaxKt 250 (marked `nv`) | Field section states it plainly: below 250 kt, gear and flaps FULL. Can be `ok` for the field | 102 |
| Carrier hook `H` | Same | 108, 64 |
| Carrier downwind 600 ft (SUPERCARRIER source) | Hornet guide agrees | 109 |
| Carrier initial 800 ft (SUPERCARRIER source) | Hornet guide agrees | 108 |
| gearFlapsMaxKt 150, about 145 KIAS on speed | Same | 109, 110 |
| touchdownPower max | "Full power" at main gear contact | 113 |
| Takeoff pitch 6-8° | Same | 100 |
| Brakes `W`, NWS HI `S`, hook-up `U` | Same (`U` connects the launch bar to the shuttle) | 99, 105 |
| Stab trim by weight 16° / 17° / 19°, burners at 49000 lb and above | Same | 106 |
| Clearing turn right from cats 1-2, left from 3-4 | Same | 107 |
| After launch: gear up, flaps AUTO | Same | 107 |
| Glide slope 3.5° (research doc) | Same | 112 |

### Contradicted or refined by the guide

| Repo value | Guide | Page |
|---|---|---|
| takeoff `afterburner: nv(false)`, note "the guide reading does not fix MIL or MAX" | Airfield takeoff step 3: "Advance throttles to afterburner" | 100 |
| HORNET_LAUNCH `power: ok('MIL')` | p106 allows MIL below 49000 lb, but the launch steps say MIL for the wipe-out, then "100% afterburner" for the shot. Internal guide conflict; the procedure text says afterburner | 106, 107 |
| aoa colours `{ slow: null, on: 'amber', fast: null }`; research doc "chevrons not given" | Indexer figure: slow = green upper chevron, fast = red lower chevron, on speed = amber/yellow doughnut | 44-45 |
| Carrier abeamNm [1.25, 1.5] (SUPERCARRIER) | Hornet guide: 1.3-1.4 nm (p109); also 1.2 mi (p48) and 1.1-1.3 nm (p145). Guide is self-inconsistent; all inside or near the repo band | 109, 48, 145 |
| keys `flaps: 'F'` used for every position | `F` is AUTO only; HALF `LShift+F`, FULL `LCtrl+F` | 58, 109 |
| keys `speedbrake: 'B'` | Guide: `B` is the centre (off) position; extend `LShift+B`, retract `LCtrl+B` | 75 |
| Launch step trainer key `L` (launch bar) | Guide gives no launch bar key; `L` is the exterior lights master switch | 75 |
| ballCallKey trainer `Y` | Guide uses `Y` for the FCS BIT switch in the cold start | 97 |
| Break point (Supercarrier "before 4 nm") | Hornet guide: no more than 1.5 nm past the bow | 109 |
| Research doc "180 at 27-30° bank" | Guide adds 100-200 ft/min descent in the first 90°, 500 ft/min in the second 90° | 111-112 |

### Not covered by the guide

approachKt 140 (field), Vr 145, tail strike 12°, gearUpMaxKt 250 at takeoff, ball call key and the radio
ball call, breakIntervalS, ninetyAltFt, ballNm 0.75, grooveS, salute key, launch bar key, wipe-out key `K`,
trainer weights 42000 / 50000 lb, and the takeoff flap setting inside the takeoff section itself (HALF comes
from the cold start, p98, and the carrier checklist, p104).

## Not in guide

- Numeric G limits (symmetric, asymmetric, by weight); only "FCS page shows the g limit" (p82).
- AoA limits beyond the indexer bands; the departure tone threshold.
- Mach and airspeed limits, overspeed cue, gear extension or retraction speed, takeoff gear-up speed.
- Voice alerts "ROLL LEFT/RIGHT", "OVER-G" and any Betty calls outside the p70 list.
- Internal fuel capacity and per-tank capacities; cruise or afterburner fuel flow figures.
- Rotation speed, field approach speed (only AoA), touch-and-go and bolter procedures by name.
- Case I break interval, 90 and 45 altitudes, ball distance, groove time, radio ball call.
- Case II and Case III pattern, marshal and platform numbers (only the ICLS procedure, p150-151).
- INS alignment duration.
- Salute key; launch bar key.
- The E-bracket's internal markings.
