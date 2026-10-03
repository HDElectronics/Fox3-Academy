# F/A-18C AGM-88C HARM: modes, cues and the radars it hunts

Scope: gameplay only (ARCHITECTURE.md "Scope"). This note records what a DCS Hornet pilot sees and does with the
AGM-88C HARM, and what the SAM radars it attacks are, at the level the game presents them: display legends, keys,
UFC entries, HUD cues, RWR symbols and the pilot-level rule "the HARM needs the radar to keep transmitting". No
seeker, guidance-law, fuze, warhead or motor detail. Researched 3 October 2026 for the `#/harm` page.

## Sources

| # | Source | Used for |
|---|---|---|
| S1 | Eagle Dynamics, *DCS: F/A-18C Early Access Guide* (EN), updated 24 March 2024, in the DCS install at `Mods/aircraft/FA-18C/Doc`. Page numbers below are the printed page numbers. | Everything about the HARM in the Hornet |
| S2 | DCS in-game encyclopedia articles, `MissionEditor/data/scripts/Enc/SAM/*.txt` and `Enc/Weapon/AGM-88C.txt` in the DCS install (read 3 October 2026) | What each SAM vehicle is and does, ranges ED publishes |
| S3 | DCS Mission Editor option table, `MissionEditor/modules/me_action_db.lua` (`EVASION_OF_ARM = 31`, default `true`, "AD units in group try to counter anti-radiation missile attacks") | How AI SAMs react to a HARM |
| S4 | Grim Reapers, F/A-18C HARM tutorials (SP 2019, TOO 2019, PB 2021, SP Pullback 2021), in the user's playlist ([fa18c-videos.md](fa18c-videos.md) rows 87-90) | Watch-along only; not transcribed, nothing below depends on them |
| S5 | [sam-threats.md](sam-threats.md) | SA-10/11/15 envelopes already used by the trainer |

Facts from S1 carry its page as (p365). Observed-in-game items are marked as such; everything else is not verified
in game.

## The HARM in the Hornet (S1)

- Four HARMs on stations 2, 3, 7 and 8 (LAU-118 rails) (p361). After each launch the next HARM is selected in the
  order 8, 2, 7, 3 (p362).
- Selectable in A/G or NAV master mode, airborne, with at least one HARM loaded: HARM in the top row of the stores
  page (pushbuttons 6-10), or HARM DSPLY under pushbutton 9 on the TAC page (p361). The HARM format replaces the
  stores page and opens in SP or the last mode used (p362).
- The stores page shows STBY under the selected HARM until a target is handed off, then RDY (p362-363).
- Three modes: Self-Protect (SP, with the Pullback option), Target of Opportunity (TOO), Pre-Briefed (PB) (p361).
- Range "out to 80 nm" depending on launch altitude (p361). The guide advises 30000 ft AGL and above to maximise
  range (p367).
- **If the targeted radar turns off, the HARM loses guidance and will likely not hit the target** (p367). This is
  the one homing rule the trainer models.

### HARM format layout (S1 figures 203, 210, 214)

DCS numbers the DDI pushbuttons with the left column counting **up** from the bottom (1 bottom, 5 top), the top
row 6-10 left to right, the right column 11-15 top to bottom and the bottom row 16-20 right to left. Checked
against the figures and the text, which agree:

| Pushbutton | Legend | Notes |
|---|---|---|
| 5 (left, top) | SP | Mode select (p364) |
| 4 | TOO | Mode select |
| 3 | PB | Mode select; "box PB (pushbutton 3)" (p373) |
| 2 | A/C | PB only: aircraft pull-up (p373) |
| 1 (left, bottom) | HRM | PB only: HARM pull-up (p373); "PULLUP" is written beside A/C and HRM (fig. 214) |
| 11 (right, top) | CLASS | TOO class filter; the selected class shows to its left, e.g. ALL (p369-370) |
| 13 | STEP | Next HARM station (p364) |
| 14 | UFC | PB: enter the emitter code on the UFC (p374) |
| 15 (right, bottom) | RSET | Highest threat; cancels a hand-off (p364, p369) |
| 16 (bottom right) | HRM OVRD | Boxed by default = Pullback inhibited; the mode name is written above it (p363, figs.) |
| 17 | SCAN | TOO: list every class the RWR hears (p369, p372) |
| 19 | LIMIT | TOO: only the 5 highest priority emitters (p369); position from fig. 210 |

Top left of the format: the HARM weapon legend (boxed when selected, crossed out when not ready), the status
(RDY) and the station (STA 2) (figs. 203, 210, 214).

### SP: Self-Protect (p364-367)

1. Master Arm ARM, A/G. 2. Select HARM. 3. HARM Sequence `I` cycles detected emitters. 4. With the emitter boxed on
the EW page or EW HUD, weapon release `RAlt+Space`.

- The HARM is cued to the highest radar threat. `I` cycles between lethal or critical SAM/AAA threats; RSET or
  Cage/Uncage returns to the highest threat (p365).
- The cued emitter is boxed on the HUD, EW page and azimuth indicator. There is no target mark on the HARM format
  in SP (p365). HARM is written on the right side of the HUD when selected (p365).
- After a launch the next HARM is cued to the highest priority threat automatically (p365).
- No range: the HARM has no ranging capability and is not slewed by another sensor in SP (p367).

### Pullback (p365-367)

- When the RWR detects a critical threat (a tracking radar lock, an active missile radar lock or semi-active
  illumination), Pullback selects and readies a HARM against it. Inhibited by default: unbox HRM OVRD (p365).
- With Pullback active, HARM appears in the HUD and on the stores format; pickle launches it. HARM crossed out =
  not ready (not powered, Master Arm off and similar) (p366-367).
- Works in A/A or A/G. In A/A, the trigger still fires the selected air-to-air weapon (p367).
- With HRM OVRD boxed, PLBK is shown instead and the selected weapon does not change (p367).

### TOO: Target of Opportunity (p368-372)

1. Master Arm ARM, A/G. 2. Select HARM. 3. TDC to the HARM format. 4. `I` cycles emitters. 5. Cage/Uncage `C`
hands off. 6. With the emitter boxed and H-OFF shown, weapon release.

- The HARM acts as its own sensor and shows up to 15 emitters as numbers, in seeker-relative positions (not space
  stabilised). Four "T" marks frame the 30° field of view. Arrows at the top, bottom, left or right point to
  emitters outside it (p368-369).
- Symbols: the priority emitter is boxed; F before a number = friendly; a half-circle below = naval; a line above
  = that radar has locked you (p369).
- `C` hands off: H-OFF above the box, all other emitters disappear, the HARM legend loses its X and the stores page
  goes from STBY to RDY. A second `C`, or RSET, cancels the hand-off (p368-369).
- CLASS (pushbutton 11) opens the class page; picking a class returns to TOO with the class shown left of the
  legend. Classes: ALL, FRD, HOS, FN, HN, F1, F2, H1 (old hostile), H2 (new hostile), FAA, HAA, FS, HS, UKN, PRI
  (radars locked to you) (p370-371). SCAN (17) lists the classes being detected, with arrows for ones outside the
  field of view (p372).

### PB: Pre-Briefed (p373-375)

1. Master Arm ARM, A/G. 2. Select HARM. 3. Box PB (3). 4. UFC (14). 5. On the UFC select option 4 (TGT), type the
three-digit emitter code, ENT. 6. Pick A/C pull-up (2) or HARM pull-up (1). 7. Select and designate the waypoint
over the target. 8. Hold weapon release while following the HUD cues; the HARM launches when the flight path
marker meets the launch cue within 1° of the azimuth steering line.

- PB is for an emitter at a known location with a waypoint near it. The HARM lofts, flies to the location, then
  turns on its receiver and homes (p373).
- Until an emitter code is entered the HARM legend is crossed out and no launch is possible (p374).
- HRM pull-up: the HARM does all the manoeuvring, so the jet must be close enough for it to have the energy.
  A/C pull-up: the pilot lofts the jet, which increases the HARM's range (p374).
- In-range indication: A/C RNG or HRM RNG on the HUD and DDI (p374-375).
- Timers (upper right): time of flight of the next HARM if launched now; time to impact of the HARM in flight;
  the difference (p374). Figure 214 prints them under "FLT".
- Designation: HSI, WYPT, select the waypoint with the arrows, WPDSG (p121-122, p374). The waypoint becomes a TGT
  point shown as a diamond in the HUD (p122).
- HUD cues (fig. 216): azimuth steering line, in-range cue, distance to target, A/C pull-up release cue, HARM
  pull-up release cue, min range cue (p375).
- A/C pull-up flying: at A/C RNG hold release, raise the nose to 45° and climb until the flight path marker meets
  the A/C pull-up release cue. HRM pull-up: at HRM RNG hold release and raise the nose until the marker meets the
  HARM pull-up release cue; a small loft may be needed (p375).
- At the min-range cue the jet is too close: the HARM cannot pull down onto the target (p375).

### Keys printed in S1

Master Arm `M` (p40). Master mode buttons on the left instrument panel: A/A `1`, A/G `2` (p40: "Air-to-Air (A/A) [1]
and Air-to-Ground (A/G) [2]"; S1 writes keys in square brackets throughout). HARM Sequence `I`
(p361). Cage/Uncage `C` (p365, p368). Weapon release `RAlt+Space` (p364). Sensor Control: forward `RAlt+;` (HUD),
aft `RAlt+.` (AMPCD), right `RAlt+/` (right DDI), left printed as `LAlt+,` (p73; the other three use RAlt, so the
left one may be a misprint; not verified). Countermeasure dispense aft `D` runs the program selected on the EW page
(p74).

### EW page (p409-410)

The EW page shows the ALR-67 emitters and the countermeasure state. Boxing HUD on it puts the EW contact symbols in
the HUD (p410).

## Emitter codes (S1 ALIC appendix, p420)

ID = the code for PB. CLASS = the TOO filter. RWR = the symbol on the azimuth indicator and the TOO format.
The PDF text of this table is misaligned below the SA-15 row (AAA, Western and naval systems), so only the rows
whose columns line up are recorded here; read the rest in the guide.

| System | Radar | RWR | Class | ID |
|---|---|---|---|---|
| SA-2/3/5 | P-19 Flat Face B | S | H1 | 122 |
| SA-2 | SNR-75 Fan Song | 2 | blank | 126 |
| SA-3 | SNR-125 Low Blow | 3 | H1 | 123 |
| SA-5 | 5N62 Square Pair | 5 | blank | 129 |
| SA-6 | 1S91 Straight Flush | 6 | H1 | 108 |
| SA-8 | Land Roll | 8 | H1 | 117 |
| SA-10 | 64N6E Big Bird | BB | H2 | 104 |
| SA-10 | 5N66M Clam Shell | CS | H2 | 103 |
| SA-10 | 30N6E Flap Lid | 10 | H2 | 110 |
| SA-11 | 9S18M1 Snow Drift | SD | H2 | 107 |
| SA-11 | 9S35 Fire Dome | 11 | H2 | 115 |
| (SA-11 battery) | 9S80M1 Dog Ear | DE | HS | 109 |
| SA-13 | 9S86 Snap Shot | 13 | blank | 118 |
| SA-15 | Scrum Half | 15 | H2 | 119 |

What the code is, at pilot level: ALIC is the Aircraft Launcher Interface Computer (p420). In PB the code tells
the HARM which radar type to look for when it arrives over the designated point (p373-374, p420). Three digits,
entered on the UFC, then ENT.

## The radars (S2, ED encyclopedia)

Values below are the encyclopedia's published figures for the vehicles in DCS, recorded so the page can say what
each vehicle is for. They are encyclopedia text, not measured in game; rings already used by the trainer stay as
in S5.

| System | Vehicle (DCS type) | What it is (S2) | Figures (S2) |
|---|---|---|---|
| SA-6 Kub "Gainful" | 1S91 "Straight Flush" (`Kub 1S91 str`) | Search and track radar of the battery | Detection 75 km, up to 10 km altitude; tracking 28 km |
| | 2P25 (`Kub 2P25 ln`) | Launcher, 3 missiles, no radar of its own | Effective range 4-24 km, altitude up to 14 km |
| SA-8 Osa "Gecko" | 9A33 (`Osa 9A33 ln`) | Launcher with its own radar ("Land Roll" in S1), 6 missiles, one vehicle does it all | Min altitude 100 m; no range in the article |
| SA-11 Buk "Gadfly" | 9S18M1 "Snow Drift" (`SA-11 Buk SR 9S18M1`) | Target acquisition (search) radar for the battery | Instrumented range 10-160 km, elevation 0-40° |
| | 9A310M1 (`SA-11 Buk LN 9A310M1`) | Launcher with its own Fire Dome radar ("TEL"), 4 missiles | Reaction time 26 s |
| | 9S470M1 (`SA-11 Buk CC 9S470M1`) | Command post | Detection up to 100 km; engagement 3-35 km |
| SA-15 Tor "Gauntlet" | 9A331 (`Tor 9A331`) | One vehicle with radar and 8 missiles | No range in the article (S5: 1.5-12 km, not verified) |
| SA-10 Grumble | 64N6E "Big Bird" | Long-range surveillance radar | Detection 300 km |
| | 30N6 "Flap Lid" | Multifunction (tracking) radar | |
| | 5P85 launchers | 4 missiles each | 47 km against targets above 2000 m, 25 km at 25 m and below, up to 30 km altitude |

Vehicle sizes in S2 (length × width × height, m), used only to size the page's own artist models:
1S91 7.38 × 3.73 × 5.88; 2P25 7.389 × 3.18 × 3.45; 9A33 9.14 × 2.8 × 4.2; 9A331 7.5 × 3.3 × 4.1; 5P85 9.4 × 3.1 × 3.7;
64N6E 20.2 × 5.75 × 8.68. AGM-88C: 4.17 m long, 0.254 m body diameter. The page's HARM, SA-6, SA-8, Snow Drift,
SA-11 command post and SA-10 radar models are original approximations drawn from these sizes and public
photographs; no DCS model or texture is used.

Layout figures checked in S1 for the page's drawings:

- CLASS page (fig. 212): top row F1, F2, H1, H2, FAA (6-10); left column, top to bottom, HN, FN, HOS, FRD, ALL
  (5-1); right column, top to bottom, HAA, FS, HS, UKN, PRI (11-15); "CLASS ALL" written in the centre.
- EW page (fig. 231): a circular azimuth display with the emitter symbols on it; ASPJ, ALR-67, ALE-47 and ARM
  legends across the top; HUD EW on the right column, fourth from the top (14); STEP and MODE on the bottom row.

Conflicts and caveats:

- SA-10: S2's launcher article gives 47 km; S5 keeps 120 km from a community reference. Not resolved here; the
  HARM page shows no SA-10 ring.
- SA-11: S2's 3-35 km matches S5 (3.3-35 km).
- The HARM's range: S1 says 80 nm depending on altitude (p361); S2's weapon article lists 148 km. Speed: S1 p33
  says Mach 1.84, S1 p361 "exceeding Mach 2", S2 Mach 3.0. The page uses none of the speeds and quotes only S1's
  80 nm.

What matters to the pilot, from the table:

- **Kill the radar, not the launcher.** The SA-6 and SA-10 launchers depend on a separate radar vehicle; the
  SA-8, SA-15 and SA-11 launchers carry a radar. An SA-11 battery has a search radar (Snow Drift, SD) and a
  tracking radar on every launcher (Fire Dome, 11).
- **Search vs track on the RWR.** A search radar (SD, BB) tells you a battery is awake; a tracking radar locking
  you (the line above the number in TOO, the AI lamp on the ALR-67) is the one about to shoot.

## AI SAM behaviour that matters for HARM training (S3)

- Alarm state red keeps the radars on; green keeps them off; auto lets the AI decide (ME option ALARM_STATE).
- Evasion of ARM (option 31) defaults to **on**: "AD units in group try to counter anti-radiation missile
  attacks". With it on, expect a site to go quiet when a HARM comes; the HARM then loses guidance (S1 p367). The
  safe practice mission turns it off.

## Practice missions

Two pydcs-built missions ship with the page (generator `missions/harm/harm_training.py`):

- `Fox3_HARM_1_Ranges.miz`: radars on, weapons hold, Evasion of ARM off, no dispersal. Range 1 SA-6 (on at start),
  Range 2 SA-8 + SA-15 and Range 3 SA-11 from the F10 menu; one reset per range.
- `Fox3_HARM_2_Live.miz`: SA-6 and SA-11 weapons free with default Evasion of ARM.

Site positions were placed by hand in the Mission Editor on open ground. The missions were flown once by a
tester (3 October 2026) with no reported problem; no specific cue timing was recorded.

## Not verified in game

- Whether weapons-hold SAMs lock the player or only search.
- When each site first appears on the RWR at 25000 ft.
- The left Sensor Control key.
- The encyclopedia figures above.
