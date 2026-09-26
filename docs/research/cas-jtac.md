# DCS World built-in JTAC / FAC: what the player sees and does

Research for the Fox3 Academy CAS module. Gameplay level only: radio menus, JTAC messages, marks, keys,
player actions. No weapon engineering detail.

Accessed 2026-09-26. Confidence tags:

- **manual**: Eagle Dynamics (ED) manual or guide.
- **community source**: Chuck's Guides, Hoggit/Airgoons wikis, Mudspike, Steam, or ED forum posts seen in
  search snippets.
- **unverified/conflicting**: sources disagree, the source is thin, or I could only read a search-engine
  summary of it.

Main source: the ED *DCS A-10C II Tank Killer Flight Manual*, section "F4 JTAC / JTAC Engagement Flow"
(pp. 784–788). It is the only ED document I found that walks through the whole AI JTAC dialogue [S1].
Other modules use the same AI JTAC, but their ED guides only mention it in passing.

Access note: the ED forums (forum.dcs.world) sit behind a Cloudflare check that blocked both fetching and
curl. Facts taken from forum threads therefore come from search-result snippets and are tagged
unverified unless another source confirms them.

---

## 1. Contacting the JTAC

| Fact | Source | Confidence |
|---|---|---|
| Open the radio menu with **`\`** (backslash, US keyboard; "other language keyboards may vary"). The top-level list shows each recipient with its F-key. | S1 p.767 | manual |
| Top-level list in the A-10C II: F1 Wingman…, F2 Flight…, F3 Second Element…, **F4 JTACs…**, F5 ATCs…, F6 Tankers…, F7 AWACSes…, F8 Ground Crew…, F10 Other…, F12 Exit. ESC also closes the menu. With Easy Communication on, recipients that are not in the mission are left off the list. | S1 p.768 | manual |
| You can also open the menu by pressing the Mic switch toward a radio. For the A-10C: Mic switch forward = VHF AM, aft = VHF FM, down = UHF. For a JTAC, "most often the Mic switch Aft for VHF FM". | S1 p.767, p.784 | manual |
| **F4 JTACs** lists the JTACs in the mission. With Easy Communication on, the list also shows each JTAC's callsign and frequency, and picking one tunes the radio for you. Without it, you must tune the right radio to the right frequency yourself (usually listed in the mission briefing). | S1 p.784 | manual |
| Easy Communication colours: **white** = a radio is tuned to that recipient; **grey** = it can be tuned but isn't yet; **black** = out of range, or blocked by terrain or the curve of the earth. | S1 p.767; S2 p.40 | manual |
| JTACs are "most often" on a unique **VHF FM** frequency. In the A-10C, Radio 2 (ARC-186 VHF FM, 30.000–76.000 MHz) is normally used for JTACs. | S1 p.791, p.? (ARC-186 section) | manual |
| JTAC frequency and AM/FM modulation are set by the mission designer in the FAC task, so they vary by mission. Chuck's A-10C example uses UHF 245.00 MHz and reaches "JTAC – Axeman11 (F4)" with the Mic switch down. | S2 pp.240, 267–269; S4 p.289 | manual; example is community source |
| **Check-in:** after picking the JTAC you are offered a check-in with your time on station ("Play Time"). Chuck's guide gives the item as **"CHECK-IN 15 MIN" (F1)**. | S1 p.785; S4 p.289 | manual (item wording is community source) |
| Check-in is automatic. The game radios your mission number, your position relative to the IP and your altitude, your weapons, and your time available (hours + minutes), then asks the JTAC for tasking. | S1 p.785 | manual |
| The JTAC replies with the control type ("Type 3 in effect" in Chuck's example) and asks whether you are ready for the 9-line. You answer with **`\` then F1 "Ready to copy"**. | S1 p.785; S4 p.289 | manual |
| JTAC callsigns in the DCS enum: Axeman, Darknight, Warrior, Pointer, Eyeball, Moonbeam, Whiplash, Finger, Pinpoint, Ferret, Shaba, Playboy, Hammer, Jaguar, Deathstar, Anvil, Firefly, Mantis, Badger. | S6 | community source |
| **F10 Other…** holds mission-scripted radio items (the ME trigger action "RADIO ITEM ADD"). Script JTACs such as CTLD and JTACAutoLase put a "JTAC Status" item there. Pressing F10 on its own opens the map, so the player must open the radio menu first. | S2 (RADIO ITEM ADD); S9; S13 | manual + community source |
| The Hornet uses the same Radio Menu. You select COMM 1 or COMM 2 on the throttle radio switch, then "Use the Radio Menu to issue your radio message". | S3 p.153 | manual |

**Not found:** the exact on-screen label of every JTAC menu item in every module. The A-10C II manual names
most of them (listed in section 4). The complete check-in submenu (other time options besides "15 MIN")
was not found.

## 2. The 9-line as DCS delivers it

| Fact | Source | Confidence |
|---|---|---|
| The JTAC reads the lines in this order: **1** IP (a point placed in the Mission Editor; in the A-10C it is also a NAV point in the CDU); **2** attack heading to the target, plus any offset; **3** distance to target; **4** target elevation (MSL); **5** target type; **6** target position as UTM coordinates; **7** mark type (None, White Phosphorus (WP), Laser, or IR Pointer); **8** location of nearby friendly ground forces; **9** control point to egress to. | S1 p.785 | manual |
| After line 9 the JTAC automatically asks whether you are ready for remarks. `\` F1 accepts them. Remarks "generally include the weapon to use, weather information, and/or attack headings". | S1 p.785 | manual |
| Community guides say the remarks also carry threats, the laser code and the final attack heading. The ED manual says the **laser code is given "during the 9-line"** (default 1688). Where exactly the code is spoken (line 7 or the remarks) could not be confirmed from an ED source. | S1 p.786; S5; S12 | unverified/conflicting |
| **Readback:** press `\` F1 to read back the target location and elevation, plus the final attack heading if one was given. Chuck's guide calls the item **"9-LINE READBACK"**. The remarks item is labelled **"READY TO COPY REMARKS"**. | S1 p.785; S4 p.289 | manual (labels are community source) |
| After a good readback the JTAC says **"Standby for data"**. In the A-10C a digital 9-line then arrives by datalink: a NEW TASKING message on both MFCDs, the 9-line on the MSG page, a red triangle on the TAD at the target, and an ATTACK cue. You answer **WILCO** (OSB 19) or **CNTCO** (OSB 7). | S1 p.785, pp.379–380 | manual |
| Line 1–3 can be "N/A" (no IP). Chuck's example 9-line: target elevation 23 ft MSL, "Truck", DQ083998, "No Mark", JTAC 800 m SE of the target, egress West, remarks asking for GBU-38. | S4 p.290 | community source |
| **Delivery is voice plus text.** DCS radio traffic has spoken audio and on-screen subtitles, controlled by the options "Radio Speech" and "Subtitles". The A-10C also gets the datalinked text 9-line on the MSG page. | S2 p.? (Audio options); S1 p.785 | manual |

**Not found:** a verbatim transcript of the AI JTAC's voice lines from an ED source. ED's own phrases quoted
in the manual are "Standby for data", "mark is on the deck", "cleared hot", "continue" and "abort".

## 3. Marks

| Fact | Source | Confidence |
|---|---|---|
| The JTAC can mark by **coordinates, smoke, laser, IR pointer, or SA Link** (datalink). Which one it uses depends on line of sight, time of day, the weapon, and how close friendlies are. | S1 p.784 | manual |
| **Coordinates only:** used when the JTAC has no line of sight to the target ("often the case with Type 2 and 3"). The JTAC clears you to engage once the point data has been sent. | S1 p.786 | manual |
| **Smoke (built-in AI):** the smoke is **white**. Once you are within **10 nm** of the target, the JTAC marks it and radios **"mark is on the deck"**. You answer `\` F1 **"Contact the Mark"** and the JTAC gives the target's position relative to the smoke. | S1 p.786 | manual |
| The ME designation options are Auto, **smoke marker ("Willy Pete", WP)**, IR-Pointer, Laser, and **WP-Laser**. The mark is made **"on the player's radio request"** at a fixed radio range. | S2 pp.241, 269, 328 | manual |
| The built-in smoke colour is not selectable. Coloured JTAC smoke (green/red/white/orange/blue) comes from scripts such as JTACAutoLase and CTLD. There is a forum mod thread on changing the WP colour. | S9; S14 (title only) | community source |
| **Laser:** used when the tasking is for laser-guided bombs. The code is given during the brief, **1688 by default**. After "IP Inbound" and "continue" you ask for it with `\` F1 **"Laser On"**. You find the spot with the targeting pod's laser spot search (LSS/LST), then report `\` F1 **"Spot"**. F3 **"Shift"** moves the laser to another target in the group, and **"Terminate"** stops it. | S1 pp.786–787 | manual |
| The player must **request** the laser ("Laser On"). The smoke is triggered by distance (inside 10 nm) once you have called IP Inbound. In the ME, marks happen "on the player's radio request". | S1; S2 | manual |
| The AI JTAC is said to lase for only about **5 minutes**, so call "Laser On" just before release. | S7 (jross, Sep 2023) | community source |
| Community-compiled maximum designation ranges: airborne FAC: WP 8 nm, IR pointer 3 nm, laser 5 nm; ground JTAC: laser 3 nm. The ME itself shows the maximum range for each method when the FAC is too far away. | S7; S2 p.241 | community source (numbers); manual (that the ME shows ranges) |
| If the ground FAC has no line of sight, the ME shows **"problem: no LOS"** next to the designation method. | S2 p.328 | manual |
| **IR pointer:** replaces smoke in low light. It is visible only with **NVGs on** and appears as a line from the JTAC to the target. The flow is the same as for smoke, with the extra menu items **"Pulse"** (flash the pointer) and **"Rope"** (move it around). | S1 p.787 | manual |
| **Airborne FAC** (ME "AFAC" task) marks targets with **smoke rockets or illumination flares** (flares are useful at night). | S2 p.191 (AFAC mission task) | manual |
| ME trigger action **SMOKE MARKER** puts a white WP marker in a zone, "useful … when creating FAC missions". | S2 | manual |
| How codes are set in the cockpit: Hornet: set the pod's LST code on the UFC, and "Contact the JTAC radio and input directed laser code" for the AGM-65E. Viper: set the TGP LSS code, "The default laser code is 1688". A-10C: LSS code defaults to 1688. | S3 p.346; S4b (Viper); S1 | manual (Hornet, A-10C); community source (Viper) |
| Whether the **built-in AI JTAC's code** can be changed from 1688 in the Mission Editor: the manual lists no laser-code field in the FAC tasks, and the Hoggit scripting pages list no `laserCode` parameter. Forum threads ask how to change it, and players change codes through scripts. | S2; S5; S10; S15 | unverified/conflicting (treat as fixed at 1688 unless verified in the current ME) |

**Colours for a trainer:** the built-in AI JTAC's smoke should be shown as **white**. Orange, red and green
are Combined Arms player-JTAC smokes (section 5). Green, red, white, orange and blue are script smokes.

## 4. Control types, the attack sequence, clearances, BDA

| Fact | Source | Confidence |
|---|---|---|
| **Type 1:** the JTAC must see both the aircraft and the target. Most common and most restrictive; used when friendlies are "danger close". **Type 2:** the JTAC controls each attack but cannot see the aircraft or the target at release, or the aircraft cannot acquire the mark or target before release. **Type 3:** low fratricide risk; least restrictive. | S1 p.784 | manual |
| After check-in the JTAC states the type (1, 2 or 3). A community compiler says **DCS picks the type from line of sight**, not from the number of enemy units. | S1 p.785; S7 | manual; community source (LOS rule) |
| **Coordinate-only flow:** point data → JTAC "clears you to engage" → attack → `\` F1 **"Attack Complete"**. | S1 p.786 | manual |
| **Smoke / IR flow:** JTAC asks you to report IP inbound → `\` F1 **"IP Inbound"** → JTAC says **"continue"** → mark inside 10 nm, "mark is on the deck" → `\` F1 **"Contact the Mark"** → talk-on from the mark → `\` F1 **"In"** when you start the attack run → JTAC answers **"cleared hot"** or **"abort"** → after release `\` F1 **"Off"**. | S1 pp.786–787 | manual |
| **Laser flow:** IP Inbound → continue → **Laser On** → find the spot → **Spot** (F3: Shift / Terminate) → **In** → cleared hot or abort → **Off**. | S1 p.787 | manual |
| After the attack the JTAC either clears you to **re-attack** (start again from IP Inbound) or **clears you to depart**. | S1 pp.786–787 | manual |
| Other JTAC menu items: **Repeat Brief**; **What is my target?**; **Contact** (you report a target description and MGRS at your SPI, and the JTAC confirms it or warns that it is the wrong target and gives directions to the right one); **Request BDA** (status of the target); **Unable to comply**; **Check Out** (ends JTAC control). | S1 pp.787–788 | manual |
| Human-JTAC procedure uses "IN from the [direction]". The ED manual describes only the single "In" menu item, so the AI voice line may or may not include a direction. | S1 | unverified/conflicting |
| **Firing without clearance:** players report **"ABORT ABORT ABORT, You do not have permission to fire"**. | S16 (search snippet of ED forum thread 192411) | unverified/conflicting (snippet only) |
| **Wrong target:** a player reported an abort and being told they "dropped on the wrong target" after switching to a different laser bomb. | S7 (weaponz248, Sep 2023) | community source (one report) |
| **Aborts after "In":** players advise calling IP Inbound / Laser On before getting too close, and running in **about 90° off the JTAC-to-target line**. The AI's exact abort rules are **not documented by ED**. | S8 (Steam, Feb 2021); S17 (snippet) | unverified/conflicting |
| Weapon choice: the AI JTAC asks for the gun on soft targets and bombs on hard ones, depending on your loadout. It does not change its request when you run out of that weapon, and using a different weapon has "no consequences". | S7 | community source |
| **Hitting friendlies:** no source describes a specific AI JTAC reaction. | none | not found |

## 5. Mission Editor side

| Fact | Source | Confidence |
|---|---|---|
| A mission must contain at least one JTAC. Any unit can be one, "including aircraft like a Predator"; units with night vision and a laser designator work best. | S1 p.784 | manual |
| **Ground JTAC:** the manual advises an armed unit with sensors ("The armed HMMWV is a good choice"). The FAC unit should have direct line of sight and be within a few km of the target. | S2 p.306, p.327 | manual |
| **FAC – Assign Group** (a waypoint Task): the designer picks the **target group**, the **weapon(s)** the FAC will ask for, the **designation** (Auto / WP / IR-Pointer / Laser / WP-Laser), **datalink**, **callsign**, **number**, **frequency** and **modulation**. The FAC assumes full knowledge of where the target is. It only targets that group, and it starts once friendly aircraft arrive and make radio contact. | S2 pp.240–241, 327–329 | manual |
| **FAC** (Enroute Task): the FAC picks targets on its own, which "may not correspond to the targets intended" by the designer. **FAC – Engage Group** (Enroute Task): the designer names a group, but the FAC must **detect it itself** first. It adds VISIBLE and PRIORITY fields. | S2 pp.267–269, 333–335 | manual |
| **Airborne FAC:** the FAC tasks apply to fixed-wing and helicopter groups with the **AFAC** mission task, **BLUE coalition only** (per the manual). The AFAC marks with smoke rockets or illumination flares. | S2 p.191, p.240, p.267 | manual |
| **Datalink:** only ground units with **EPLRS** can send target data by datalink. The scripting parameter `datalink` means "send the 9-line via SADL" and is on by default. | S2 p.329; S5 | manual; community source |
| **Human JTAC (Combined Arms):** roles are Game Master, Tactical Commander, **JTAC/Operator**, and Observer. The binocular view key is **B**; **L** turns the laser on and off, **C** sets or activates the laser code (maximum designation range 9,998 m), **R** is the IR pointer, **N** NVG, **Z** IR view; smokes are **1 orange, 2 red, 3 green**. | S2 p.239; S18 pp.23–26 | manual |
| Community scripts (CTLD, JTACAutoLase, MOOSE) add auto-lasing JTACs with configurable codes, coloured smoke and an F10 "JTAC Status" report. Many multiplayer servers use these rather than the built-in 9-line dialogue. | S9; S19 | community source |
| **Mission types this allows:** a scripted 9-line CAS with a ground JTAC (any mark); a UAV (Predator/Reaper) AFAC; a free-hunting FAC Enroute Task; night IR-pointer CAS; a coordinate-only Type 3 attack; and multiplayer CAS with a Combined Arms JTAC or a script JTAC. | derived from the above | inference |

## 6. Module differences

| Module | What is different | Source | Confidence |
|---|---|---|---|
| **A-10C / A-10C II** | Fullest integration: digital 9-line over SADL (MSG page, TAD triangle, WILCO/CNTCO), TAD symbol can be made the SPI, VHF FM radio for the JTAC, CDU waypoint entry from a UTM/MGRS grid. | S1; S4 | manual |
| **F/A-18C** | Voice/text 9-line only; no SADL tasking was found. Grid coordinates go into a waypoint by hand (MGRS on the UFC). Laser: set the pod LST code or the AGM-65E code to "the directed laser code" (1688 in the examples). Radios are COMM 1/2 (ARC-210) plus the Radio Menu. | S3 p.153, p.346; S4a | manual + community source |
| **F-16C** | Set the TGP LSS code to the JTAC code (default 1688). JTAC grids go in through the DED DEST page in MGRS. No JTAC→Link 16 tasking was found in any source. | S4b | community source |
| **Su-25T** | ED's Su-25T manual does not mention JTACs. Community wikis say any laser on code **1113** (from a JTAC or a buddy) shows as a **diamond on the HUD**, and the Kh-29L, Kh-25ML and S-25L can be launched at it in manual override (LAlt+W), but **not the Vikhr**. The built-in AI JTAC lases on 1688 by default, so a Su-25T pilot probably cannot use a built-in JTAC laser unless the code can be set to 1113 (see section 3). A **June 2025 ED bug report** says Su-25 missiles "stopped being guided by laser code 1113". The Su-25T can still use JTAC voice, coordinates and smoke through the radio menu (radio menu presence not confirmed). | S20; S21; S22 (snippet) | unverified/conflicting |
| **Combined Arms player JTAC** | Can set any laser code (C) and use three smoke colours, so the Su-25T 1113 route works with a human JTAC. | S18; S21 | manual + community source |
| **Other** | Players report that one aircraft sometimes fails where another works in the same mission ("JTAC not working"). | S17 | unverified/conflicting |

## 7. Common player mistakes and pain points (lesson ideas)

1. **Wrong radio or band.** The JTAC is usually on VHF FM while most traffic is VHF AM. Without Easy
   Communication the player must tune the correct radio. Lesson: read the JTAC frequency and band from the
   briefing, then pick the right Mic-switch direction. [S1; S17 snippet] (manual + community source)
2. **Out of range or masked.** A black entry in the Easy Comms list means out of range or terrain-masked.
   The AI FAC may also have no LOS or be out of range for its designator, and then it gives no mark.
   [S1; S2; S7] (manual + community source)
3. **Pressing F10 without opening the radio menu** opens the map instead. [S13] (community source)
4. **Releasing before "cleared hot"** leads to "ABORT … no permission to fire". IP Inbound and "In" are not
   clearances. [S16; S12] (unverified/conflicting)
5. **Skipping steps.** Not calling IP Inbound, not calling "Laser On", calling "In" too early or too close,
   or running in along the JTAC-to-target line. [S1; S8; S17] (manual + community source)
6. **Laser timing and code.** Calling Laser On too early (reported ~5 min lase), a mismatched LSS or weapon
   code (1688 default), or a jet that cannot use the code (Su-25T needs 1113). [S1; S7; S20]
7. **Mis-copying line 6.** Entering UTM/MGRS into the CDU, UFC or DED wrongly; use the kneeboard to note
   lines 4, 6, 7 and 8. [S4; S12] (community source)
8. **Treating smoke as the aim point.** The smoke is a reference; the JTAC gives the target's position from
   the mark. [S1; S12]
9. **Asking for a mark the JTAC cannot give.** IR pointer only at night with NVGs; Type 2/3 without LOS means
   coordinates only. [S1; S7]
10. **Mission-editor surprises** (for mission-building lessons): the JTAC uses WP when laser was selected
    [S23 snippet], the IR pointer does not appear [S24 title], and the FAC Enroute Task picks unintended
    targets [S2].

Possible lessons: a radio-menu drill that matches `\` → F4 → JTAC → check-in to what the game says; a 9-line
copy-and-readback quiz; "which mark, which call" cards; a clearance-discipline scenario ("In" → wait for
"cleared hot"); per-jet laser-code setup.

---

## Sources (all accessed 2026-09-26)

- **S1**: ED, *DCS A-10C II Tank Killer Flight Manual* (EN), sections "Radio Communications", "F4 JTAC", "JTAC Engagement Flow", TAD tasking, ARC-186. https://www.digitalcombatsimulator.com/upload/iblock/715/t05fb1h8itdhcvcf6fyi3h5944fvv4fx/DCS_A-10C_II_Flight_Manual_EN.pdf
- **S2**: ED, *DCS World User Manual* (EN, 2020), Options (Easy Communication, Radio Speech, Subtitles), Mission Editor FAC tasks, AFAC, EPLRS, Smoke Marker, MP roles. https://www.digitalcombatsimulator.com/upload/iblock/ed6/87v22jwd1xh51i3rgki944xsf503istq/DCS_User_Manual_EN_2020.pdf
- **S3**: ED, *DCS F/A-18C Early Access Guide* (EN). https://www.digitalcombatsimulator.com/upload/iblock/ea9/lxf69u2uk1fhqq7ndb55z9egzabe8hdg/DCS%20FA-18C%20Early%20Access%20Guide%20EN.pdf
- **S4**: Chuck's Guides, *DCS A-10C Warthog Guide*, "GBU-38 JDAM (JTAC Coordinates)". https://assets.chucksguides.com/pdf/DCS%20A-10C%20Warthog%20Guide.pdf
- **S4a**: Chuck's Guides, *DCS F/A-18C Hornet Guide* (LST mode; grid coordinates). https://assets.chucksguides.com/pdf/DCS%20FA-18C%20Hornet%20Guide.pdf
- **S4b**: Chuck's Guides, *DCS F-16C Viper Guide* (LSS code; MGRS DEST). https://assets.chucksguides.com/pdf/DCS%20F-16C%20Viper%20Guide.pdf
- **S5**: Hoggit wiki, DCS task fac AttackGroup / fac engageGroup. https://wiki.hoggitworld.com/view/DCS_task_fac_AttackGroup ; https://wiki.hoggitworld.com/view/DCS_task_fac_engageGroup
- **S6**: Hoggit wiki, Template: DCS enum callsigns jtac. https://wiki.hoggitworld.com/view/Template:DCS_enum_callsigns_jtac
- **S7**: Mudspike forums, "DCS World JTAC Question(s)" (Sep 2023). https://forums.mudspike.com/t/dcs-world-jtac-question-s/15641
- **S8**: Steam, "Help with F/A-18C GBU-82 mission w/JTAC" (Feb 2021). https://steamcommunity.com/app/223750/discussions/0/3106890436349852965/
- **S9**: ciribob, DCS-JTACAutoLaze README. https://github.com/ciribob/DCS-JTACAutoLaze/blob/master/README.md
- **S10**: ED forum, "JTAC Laser code" (Mission Editor). Blocked; snippet only. https://forum.dcs.world/topic/191766-jtac-laser-code/
- **S12**: Fly Away Simulation, "How do I use JTAC in DCS World?" https://flyawaysimulation.com/ask/answers/use-jtac-dcs-world/
- **S13**: Steam discussion, F10 menu confusion (Aug 2021). https://steamcommunity.com/app/223750/discussions/0/3038228636860993149
- **S14**: ED forum, "JTAC Willie Pete / WP Smoke Marker color change" (title only). https://forum.dcs.world/topic/144040-jtac-willie-pete-wp-smoke-marker-color-change/
- **S15**: GitHub, DCS-CTLD issue #148 "AFAC/JTAC change laser code" (Feb 2025). https://github.com/ciribob/DCS-CTLD/issues/148
- **S16**: ED forum, "JTAC ABORT ABORT ABORT message." Blocked; snippet only. https://forum.dcs.world/topic/192411-jtac-abort-abort-abort-message/
- **S17**: ED forum, "Help with AI JTAC – when are you cleared hot / told ABORT ABORT ABORT?" and "JTAC not working". Blocked; snippets only. https://forum.dcs.world/topic/242607-help-with-ai-jtac-when-are-you-cleared-hot-told-abort-abort-abort/ ; https://forum.dcs.world/topic/192743-jtac-not-working/
- **S18**: ED, *DCS: Combined Arms User Manual* (EN), "Playing as JTAC", "JTAC Commands". http://cdn.akamai.steamstatic.com/steam/apps/240300/manuals/Combined_Arms_Manual_EN.pdf
- **S19**: Hoggit wiki, "JTAC" (becoming a JTAC in multiplayer; CTLD). https://wiki.hoggitworld.com/view/JTAC
- **S20**: Airgoons wiki, "Su-25T Frogfoot". https://www.airgoons.com/w/Su-25T_Frogfoot
- **S21**: ED forum, "Laser Code 1113 and (at least) Su-25T". Snippet only. https://forum.dcs.world/topic/138919-laser-code-1113-and-at-least-su-25t/
- **S22**: ED forum, "Su-25 missiles stopped being guided by laser code 1113" (General Bugs, ~Jun 2025). Snippet only. https://forum.dcs.world/topic/375657-su-25-missiles-stopped-being-guided-by-laser-code-1113/
- **S23**: ED forum, "Can't get AFAC or JTAC to use the laser instead of WP". Snippet only. https://forum.dcs.world/topic/307186-cant-get-afac-or-jtac-to-use-the-laser-instead-of-wp/
- **S24**: ED forum, "Can't get JTAC to use IR pointer in my missions…" (title only). https://forum.dcs.world/topic/257293-cant-get-jtac-to-use-ir-pointer-in-my-missions/
- ED, *DCS World Su-25T Flight Manual* (checked: no JTAC content). https://www.digitalcombatsimulator.com/upload/iblock/61b/DCS%20World%20Su-25T%20Flight%20Manual%20EN.pdf

Page numbers are the printed manual page numbers seen in the extracted text. "p.?" means the exact page was
not recorded.
