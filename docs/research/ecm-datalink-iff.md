# Jamming (ECM), Datalink and IFF in DCS World, per jet

Scope: what DCS shows the player and the gameplay rules that follow from it, for the ten jets in the app:
Su-27, J-11A, Su-33, MiG-29S, F-15C (FC3), F/A-18C, F-16C, F-14B, JF-17, M-2000C. It covers how a jammer
shows on the radar, burn-through as a gameplay range, home-on-jam (HOJ) launches, the player's own jammer,
the datalink picture and IFF. Real-world EW theory, jammer techniques and radar signal processing are out
of scope and were skipped when a source gave them. **What DCS does wins.**

Confidence tags used on every fact:
- **verified**: stated in an ED manual or a developer's own manual (Heatblur, Deka via its official guide text). Page numbers are the printed page numbers.
- **game files**: read from the DCS Lua datamine. It shows what the game defines, not always what the player sees.
- **community**: Chuck's Guides, FlyAndWire, Stormbirds or forum reports. Useful, but not ED text.
- **not verified**: a best guess or a gap. The UI must label it.

All sources were accessed 2026-09-27.

---

## Summary

1. **DCS models one kind of jamming.** The self-protection jammer denies **range** to the victim radar
   and leaves the **bearing**. Every radar therefore shows a jammer as an azimuth-only cue: a strobe, a
   line, chevrons or a "dugout" symbol. Once the target is inside **burn-through** range, the radar gets
   range again and the jammer shows as a normal contact. [3][4][1][2][16]
2. **Burn-through ranges are short and roughly the same for every jet**: F-15C 15–23 nm (ED) [3], Su-27
   under 25 km / 13.5 nm (ED) [4], Viper pod about 25 nm (ED video, via a blog) [15], F-14 about 23–29 nm
   (community test) [16], M-2000C about 20–25 nm (community) [13]. Community testers report that the range
   barely depends on the jammer's aircraft type [16].
3. **HOJ launches without range exist in DCS**: F-15C (AIM-120 and AIM-7M after an `Enter` lock on the
   strobe) [3], Su-27 family (AOJ lock, R-27R/ER home on the jam, range set by hand, default 10 km) [4],
   F-14 (JAT lock, AIM-7 and AIM-54) [9]. The Hornet's AIM-7 needs STT "unless in HOJ or FLOOD" [1]. For the
   Viper, the manual describes HOJ as a missile mode and gives no player procedure [2].
4. **Your own jammer** makes you visible in azimuth before the enemy would detect you, denies him range,
   and gives his HOJ missiles a beacon. The FC3 manual and both ED EA guides say this plainly [1][2][3].
5. **The Link 16 picture exists only in the Hornet and the Viper.** The F-14B has Link 4 (A and C), the
   Russian FC3 jets and the J-11A get an automatic AWACS/EWR picture on the HDD, the JF-17 has its own
   datalink, and the M-2000C has a ground-controlled "TAF" link. The F-15C has no datalink display. [1][2][4][6][12][13][3]
6. **IFF differs the most between jets.** The FC3 jets identify automatically (circle = friend). The Hornet
   needs a Mode 4 interrogation and needs two factors (or an AWACS) to show "hostile". The Viper shows
   short-lived green circles with a "4" (for 2 s). The JF-17 and M-2000C have an interrogate key. The F-14's
   RIO holds a DDD button. [3][4][1][2][12][13][7]

---

## 1. Jamming as the player sees it

### 1.1 How a jammer shows on each radar

| Jet | What the radar shows | Confidence | Src |
|---|---|---|---|
| F-15C | VSD: "a vertical series of hollow rectangles along the azimuth of the jammer" (a strobe). After a lock on it: a solid vertical line through the rectangles and **HOJ** on the VSD and HUD. "HOJ mode provides the azimuth of the target but gives no target data regarding range, aspect, speed, or altitude." | verified (pp. 70–71) | 3 |
| Su-27 (FC3 manual; same family: Su-33, J-11A, MiG-29S) | HUD: "a vertical jamming strobe of randomly flashing target marks" on the jammer's bearing, and **АП** ("ECM detected") at the right of the HUD. HDD: a jammer without range = dashed line; a jammer with range = mark plus dashed line. TWS cannot be used in heavy ECM (use ОБЗ/SCAN). | verified (pp. 52, 58) for Su-27; not verified per jet for the others | 4 |
| F/A-18C | Attack radar: jammers that deny range are drawn at the top of the B-scope in the **AOJ "dugout"**, azimuth only. The AZ/EL format also has a dugout for "azimuth-only contacts". | verified (pp. 157, 180) | 1 |
| F-16C | FCR: **a pair of yellow chevrons** along the top of the MFD at the jammer's azimuth; range unknown. At burn-through, when the jammer correlates with a radar contact, the chevrons sit over that target symbol. | verified (pp. 392–393, 411) | 2 |
| F-14B | TID: jam strobe = a line from own aircraft toward the jammer (JAM STROBE button toggles it); with no range, an angle symbol "<" sits on the strobe at **50 nm**. DDD (PD modes): jamming trace on the lower third and a **JET** vertical strobe at the jammer azimuth. An STT target that starts jamming goes to **STT-JAT** automatically. | verified (developer doc) | 9, 5* |
| JF-17 | Not found in the sources read. The JF-17 RWR draws a line under an emitter symbol when that emitter is being jammed by you (own-jammer cue, not an enemy-jammer cue). | not verified (radar); community (RWR) | 12 |
| M-2000C | Not described in the sources read. Chuck's guide gives only the burn-through figure. | not verified | 13 |

*[5] refers to the existing note `tomcat-thunder-mirage.md`, which already records the TID symbols.

**RWR and enemy jammers.** No source says that a DCS RWR shows an *enemy* jammer as such. The F-15C manual
says the strobe appears "when the radar and radar warning receiver (RWR) detects active ECM", but the
drawing is on the VSD [3]. Treat RWR display of enemy jamming as **not verified**.

### 1.2 Burn-through ranges (gameplay values)

| Jet (radar looking at a jammer) | Burn-through range | Kind of source | Src |
|---|---|---|---|
| F-15C | "generally 15...23 nautical miles" (28–43 km). At burn-through the radar **auto-transitions to STT** from LRS or TWS. | ED manual | 3 |
| Su-27 (FC3) | "less than 25 km" (13.5 nm); the HUD returns to normal SCAN with range | ED manual | 4 |
| F-16C (the Viper's *own pod* against a threat radar) | "effective at ranges between 25nm, after which the jamming effect becomes less apparent" | blog summary of an ED video (Dec 2021) | 15 |
| F-14B | "about 23nm to 29 nm" against most jammers, "the same" for an F-16 or a MiG-21 | community test (FlyAndWire, Dec 2022) | 16 |
| M-2000C | Noise jamming effective "only until about 20–25 nm" | community (Chuck's) | 13 |
| F/A-18C, JF-17 | No figure found. The Hornet guide describes burn-through only in words. | not verified | 1 |

Reading of the numbers: every figure sits between about **13 and 29 nm**. FlyAndWire says ED sets these
ranges "arbitrarily", not per jammer or era [16]. A single trainer rule is defensible if labelled
"simplified".

### 1.3 Home-on-jam: shooting a jammer without range

| Jet | Player action | Missiles | Confidence | Src |
|---|---|---|---|---|
| F-15C | TDC on any hollow rectangle of the strobe, **Enter**. HOJ appears; fire as normal (`RAlt+Space`). The missile flies "a less efficient pure-pursuit trajectory and the probability of kill is much less". No range, so "a call to a friendly AWACS is suggested". "A HOJ attack is a completely passive attack" (no warning to the target). | AIM-120, AIM-7M | verified (p. 70) | 3 |
| Su-27 family | Slew the cursor onto the strobe (`; , . /`), **Enter** for an AOJ lock. The range shown is *entered by the pilot*, default **10 km**. If that range is outside the zone, lower it with `RCtrl+-` until **ПР** shows, or use launch override `LAlt+W`. "Missiles flying in the passive mode have a lower probability to hit." | SARH (R-27R/ER) in HOJ, per manual. R-77 has `hoj = 1` in the game files; an AOJ R-77 launch from the J-11A/MiG-29S is not described. | verified (pp. 58–59); game files (R-77) | 4, 17, 19 |
| F-14B | Lock the jammer (STT buttons, DDD cursor, or Jester) to enter **JAT** (angle known, range unknown). AIM-7 and AIM-54 then use HOJ; "lofting is disabled" (automatic loft) and guidance uses angle only. Community: the AIM-54 can be manually lofted (35–40°) for HOJ shots; the AIM-7 does not loft. | AIM-7, AIM-54 | verified (developer blog); community (loft) | 9, 16 |
| F/A-18C | Guide: "The AIM-7 requires an STT track for launch unless in HOJ or FLOOD modes." The step-by-step for locking a dugout target is not written. | AIM-7 (stated); AIM-120 HOJ capable per the ASPJ chapter | verified (statement); not verified (procedure) | 1 |
| F-16C | The manual lists HOJ as an AIM-120 guidance mode but gives no pilot procedure. Forum reports: a jammer cannot be locked before burn-through (Apr 2024), and HOJ shots from TWS or SAM with the jammer bugged work without STT (Feb 2025). | AIM-120 | community / not verified | 2, 18 |
| JF-17, M-2000C | Nothing found. SD-10 and Super 530D have `hoj = 1` in the game files per `missiles.md`. | SD-10, Super 530D | game files only | 19 |

Missiles with HOJ in the game files: AIM-120B/C, AIM-7, AIM-54, R-77, R-27R/ER, SD-10, Super 530D
(`hoj = 1`); IR missiles never. The AIM-54 homes on a jammer automatically [19]. Known bug report: an AIM-7MH
switched to a nearby jammer that was not the locked target (Nov 2021) [18]. **community**

### 1.4 The player's own jammer

| Jet | Jammer in DCS | How the player uses it | Gameplay cues | Confidence | Src |
|---|---|---|---|---|---|
| F-15C | AN/ALQ-135, internal | **E** toggles ECM | TEWS: open X in the centre, flashing = warming up, steady = on | verified; game files | 3, 17 |
| Su-27 | SPS-171 Sorbtsiya **pods on the wingtips** (stations 1 and 10, as a pair) | **E** | ECM lamp on the right panel blinks while warming up (about 15 s), then steady | verified (p. 68); game files | 4, 17 |
| Su-33 | The Su-33 pylon table has the same paired L005/Sorbtsiya pod entries as the Su-27 | **E** (FC3 common key) | As Su-27 (assumed) | game files; in-game not verified | 17 |
| J-11A | No pod and no internal jammer in the game files | none | none | game files; in-game not verified | 17 |
| MiG-29S | Internal "Gardenia" | **E** | ECM lamp (assumed as Su-27) | game files; lamp not verified | 17 |
| F/A-18C | AN/ALQ-165 ASPJ, internal | ECM panel knob: OFF / STBY (warm-up about 4–5 min) / REC / XMIT. In XMIT it **jams automatically when a radar lock is detected**. No default key found. | REC and XMIT lights; **"JAMMER ON"** on the attack radar | verified (pp. 415–416) | 1 |
| F-16C | ALQ-131 or ALQ-184 (short/long) pod; ED: all pods "function identically" in DCS | ECM panel: power OFF / STBY (warm-up about **3 min**) / OPR; XMIT 1 or 2 = reactive deception jamming (needs CMDS SEMI or AUTO; CMS Aft gives consent), XMIT 3 = continuous noise (needs CMDS MAN; **CMS Aft** on, **CMS Right** off). XMIT 2 and 3 put the FCR in standby (XMIT 2 keeps it running with the AIM-120 selected); XMIT 1 reduces own FCR detection and lock range. | ECM Enable light on the glareshield; blue "T" lights on the ECM panel | verified (pp. 698–706); community (lights) | 2, 11 |
| F-14B | AN/ALQ-100 and AN/ALQ-126 DECM, **RIO** panel: OFF / STBY / TEST / REC / RPT. In RPT it jams detected threats on its own. Heatblur: "In DCS both are modelled as a simple noise jammers." No pilot key found. | RCV and XMIT lights | verified (developer doc) | 8, 14 |
| JF-17 | KG-600 SPJ pod | UFCP/CMBT page: SPJ power, BIT (about 15 s), choose type (1 = jam when locked, 2 = jam when painted) and direction; then **T2 forward = SPJ toggle ("E")**. "JAM" blinking = warming up, "JAMING" steady = jamming. | CMBT page text | community (Chuck's); game files (pod) | 12, 17 |
| M-2000C | Internal jammer (Sabre in the existing note; the game files list "AN/ALQ-135" as its ECM entry) | **E** = Jammer ACTIVATE / Standby (manual mode) | BR light on the Serval display; PCM mode gives the jammer priority | community (Chuck's); game files | 13, 17, 19 |

**Rules the manuals state for using your own jammer**
- It "makes it easier for enemy radars to determine the azimuth of your aircraft, while denying them range
  information or a radar lock", so leave it off "until the enemy is already aware of your presence" [1]. **verified**
- Inside burn-through the jammer is "less effective at breaking lock", and AIM-7 and AIM-120 can HOJ on it,
  so switch it off "during medium- to close-range engagements" [1]. **verified**
- FC3: the jammer "may interfere with the player's own radar-guided missiles", enemy radars may "enjoy
  increased detection range", and hostile missiles "may see active ECM as a beacon" [3]. **verified**
- Viper XMIT 3 (continuous noise) "will increase the likelihood your aircraft's presence will be detected" [2]. **verified**

### 1.5 AI jammers

- Mission editor AI option **"ECM Using"** (Hoggit, scripting enum): `NEVER_USE` (0), `USE_IF_ONLY_LOCK_BY_RADAR`
  (1, jam only while locked), `USE_IF_DETECTED_LOCK_BY_RADAR` (2, jam when detected by a radar),
  `ALWAYS_USE` (3). [5] **community (wiki of the scripting API)**; the default value was not found: **not verified**.
- The AI can jam only if its unit has an ECM entry (e.g. F-15C AN/ALQ-135, F/A-18C AN/ALQ-165,
  F-14B AN/ALQ-126, MiG-29S Gardenia, M-2000C) or carries a pod. [17] **game files**
- FlyAndWire: "in DCS only self-protection devices are implemented" (no stand-off jamming) [16]. **community**

---

## 2. Datalink picture

### 2.1 F/A-18C (MIDS / Link 16, called TNDL in the guide)

| Topic | Fact | Confidence | Src |
|---|---|---|---|
| Sources | Three track types: **F/F** (fighter-to-fighter: up to 7 donors × 8 tracks), **PPLI** (position of network members), **SURV** (AWACS and ground radars). Up to 16 trackfiles. Tracks of your own aircraft are not shown. | verified (p. 200) | 1 |
| Setup | UFC **D/L** button, then **ON/OFF** to power MIDS. 2024 guide: "all network options will be configured automatically." Current ME has a DATALINK section with STN and callsign per aircraft (game files). | verified; game files | 1, 17 |
| Where it shows | Attack radar, **SA page** (TAC menu PB13; Sensor Control Switch Aft puts the TDC on the AMPCD/SA), JHMCS. SA page sensor sub-level toggles **F/F** (PB12), **PPLI** (PB13), **SURV** (PB14), **UNK** (PB9). | verified (pp. 200, 207–208) | 1 |
| HAFU | Top half = own-sensor ID, bottom half = donor ID. Hemisphere = friendly (green), bracket = unknown (yellow), caret = hostile (red). Threat rank number only for own-sensor, non-friendly tracks. | verified (p. 208) | 1 |
| PPLI symbols | Basic PPLI circle; AWACS (C2) PPLI with a dot in the centre; donor PPLI with a dot on the left; own flight shows a letter A–D in the centre. Stem = heading. "All AI aircraft with JTIDS or MIDS terminals can act as donors." | verified (p. 209) | 1 |
| RWS note | In RWS, "donor HAFUs from other aircraft will not be displayed, only HAFUs that are correlated to radar returns" unless LTWS is boxed. | verified | 1 |

### 2.2 F-16C (MIDS LVT / Link 16, TNDL)

| Topic | Fact | Confidence | Src |
|---|---|---|---|
| Sources | Flight/Team members (up to 8 incl. ownship), **up to 4 Donors**, C2 platforms (AWACS), other participants. Flight members send PPLI, air target tracks with **lock and shot lines**, markpoints, SEAD targets; donors send PPLI, air tracks, markpoints; plain participants send PPLI only. AWACS **Air Surveillance tracks** come on the Mission channel. | verified (pp. 452–455) | 2 |
| Setup | INS aligned; **MIDS LVT knob ON**; DED LIST → ENTR (NET status) and DLNK pages. STNs come from the ME; "Donor STNs must be configured prior to the mission and cannot be configured from within the cockpit." GPS needed for sync (mission date and coalition rules apply). RF switch QUIET = low power, SILENT = receive only. | verified (pp. 458–459; RF switch in the cockpit chapter) | 2 |
| Where it shows | **FCR** and **HSD** MFD formats. Surveillance tracks are extrapolated **20 s** after the last update, then dropped. On the FCR, a number above an air target = bugged by that flight member; a donor's 4-character callsign = bugged by that donor; "M" = bugged by several. Lock lines on the HSD only for flight members 1–4. | verified (pp. 457, 475) | 2 |
| Colours | Blue = your own flight, green = friendly donors from other flights (Chuck's). Sovereignty classes are Friendly / Unknown / Suspect / Hostile (shapes are drawn as images in the ED guide; not transcribed here). | community (colours); verified (classes) | 11, 2 |
| Sovereignty | With the ROE factors off, the jet uses the sovereignty sent over the datalink (e.g. by AWACS). The Viper always transmits its own bugged target as "Unknown". | verified (pp. 310–311, 470) | 2 |

### 2.3 Other jets

| Jet | Datalink in DCS | Confidence | Src |
|---|---|---|---|
| Su-27 | Automatic: active once the radar is first switched on (`I`) if a friendly AWACS or EWR is in the mission; stays after the radar is off. HDD top-down view: **filled triangle = own-radar track, open triangle = AWACS track**, circles = friendlies. AWACS tracks outside the radar's elevation coverage may not be lockable. | verified (pp. 57–58) | 4 |
| Su-33, J-11A, MiG-29S | Assumed to work like the Su-27 (FC3 shared logic). Not confirmed per jet. | not verified | — |
| F-15C | The FC3 manual describes no datalink display; it suggests calling AWACS by radio for range on a jammer. The ME still offers an STN/DATALINK field for the F-15C (likely so others see it on their network). | verified (absence in manual); game files (ME field) | 3, 17 |
| F-14B | **Link 4A** (from AWACS or a ship, set by Data Link Control Panel ON) or **Link 4C** (up to 4 F-14s share tracks, AUX). Not both at once. Frequency 300.0–324.9 MHz by thumbwheel; DATA LINK button on the TID. Datalink tracks are drawn below the track dot: unknown ⊔, hostile ∨, friendly ∪. Community: a datalinked jammer is visible on the TID but gives no firing solution; two F-14s on Link 4C can triangulate a jammer's range. | verified (developer doc); community (jammer) | 6, 5*, 16 |
| JF-17 | Own datalink ("Link 17" in Chuck's). COM2 on **channel 199**, NET on, MASTER if no master exists, CLNK page channel ID. An AWACS can feed the network. HSD: green = friendly, red = unknown or hostile, circle = friendly donor, triangle = air contact, "house" = ground contact; a line around a symbol = not seen by your own radar. EVP shows donors' radar and SD-10 cones. | community (Chuck's) | 12 |
| M-2000C | No air-to-air datalink. **TAF** GCI link from ground stations (airfields, SAM search radars, EWR), enabled per mission ("Enable TAF GCI Link"); UHF mode F1, channel on the CDC selector. Serval corner "M" = hostile within 10 nm via TAF. | community (Chuck's) | 13 |

---

## 3. IFF

| Jet | How to interrogate | What shows | Confidence | Src |
|---|---|---|---|---|
| F-15C | Automatic: "the radar will also interrogate friend or foe (IFF) all the targets automatically." | VSD: friendly = circle, hostile = rectangle (brick). Unknown is drawn as hostile. | verified (p. 66) | 3 |
| Su-27 family | Automatic | HUD: a friendly return is a **double row** of dots; HDD: circle marks = friendly | verified (pp. 51–52) | 4 |
| F/A-18C | Power: UFC **IFF**, hold ON until "XP". Interrogate: TDC on the contact, **Sensor Control Switch depress (<1 s), then SCS toward the radar DDI** (Chuck's). An interrogation is also sent automatically on a "target under cursor" action. Most AZ/EL CIT options are not implemented. | Friendly reply = green hemisphere. **Hostile needs two factors** (no Mode 4 reply **and** NCTR print, or a donor/AWACS calling it hostile); one factor = unknown (yellow bracket). Without an AWACS or NCTR, enemies stay yellow. | verified (ID rules, pp. 209–210); community (key) | 1, 10 |
| F-16C | IFF MASTER on (STBY is enough to interrogate). FCR as SOI, **TMS Left**: short (<0.5 s) = **SCAN** (±60° az/el around the nose), long (>0.5 s) = **LOS** (±15° around the cursor). Only Mode 4 is simulated. | Correct reply = **green circle with "4"**, shown for **2 s**, may be offset from the radar return. The IFF result is not written into the track file; sovereignty colours come from the datalink. | verified (pp. 433–435, 470) | 2 |
| F-14B | **RIO**: IFF button on the DDD panel, held (up to 10 s). APX-76 Mode 4 capable. | Friendly = **two bars**, one above and one below the radar return on the DDD. Can show replies the AWG-9 does not see. | verified (developer doc) | 7 |
| JF-17 | Power IFF on the AAP, set interrogation mode on the UFCP; MMS to INTC; **T4 press = "I" key**. Against non-JF-17 aircraft the result depends only on coalition and transponder on; codes matter only JF-17 vs JF-17. | Green = friendly, red = no valid reply | community (Chuck's) | 12 |
| M-2000C | **S** = NWS / IFF interrogate (gear up) | STT data block shows **"A"** (ami) for a friendly reply | community (Chuck's) | 13, 19 |

**AI and default behaviour.** The Hornet's Mode 4 transponder does not answer an interrogator whose key it
does not recognise, so an enemy stays unknown to you [1] **verified**. The JF-17 guide notes that in DCS a
valid Mode 4 reply "is a guarantee of a friendly contact" while a missing reply does not prove hostile [12]
**community**. How AI pilots identify targets is not documented; they are commonly assumed to know each
contact's coalition. **not verified**

---

## Implementation notes

Solid enough to teach as DCS fact (cite the manual in the UI):
- F-15C strobe, HOJ lock with `Enter`, pure-pursuit low-Pk HOJ shot, auto-STT at burn-through, 15–23 nm.
- Su-27 АП cue, flashing strobe, AOJ lock with a manual range (default 10 km), `LAlt+W` override,
  burn-through under 25 km. Apply to the other Russian FC3 jets only as "same family, simplified".
- Viper yellow jam chevrons; Hornet AOJ dugout; F-14 jam strobe with "<" at 50 nm and JAT.
- Own-jammer trade-off (azimuth given away, range denied, HOJ beacon) and the key `E` on FC3 jets,
  the M-2000C and the JF-17 (T2 forward).
- Hornet ASPJ modes and "JAMMER ON"; Viper ECM panel logic (XMIT 1/2 reactive, 3 continuous) and CMS Aft/Right.
- IFF: F-15C circle vs brick (automatic), Su-27 double row, Viper TMS Left green circle "4" for 2 s,
  Hornet two-factor HAFU rule, F-14 two bars.
- Datalink: Su-27 filled vs open triangles; Hornet HAFU halves and PPLI; Viper donor/flight structure and 20 s surveillance-track coast.

Label **"simplified"** in the UI:
- A single burn-through range for all jets (for example 20 nm / 37 km). DCS values cluster between 13 and 29 nm.
- HOJ missile flight as pure pursuit with reduced kill chance for every missile (stated only for the F-15C and Su-27).
- Russian FC3 datalink and ECM behaviour applied to the Su-33, J-11A and MiG-29S.
- Viper and JF-17 datalink colours (from Chuck's, not the ED text).

Label **"not verified"**:
- Hornet IFF key sequence (SCS depress then SCS toward the radar DDI) and the Hornet dugout-lock HOJ procedure.
- Viper HOJ launches (from TWS/SAM without STT) and whether a jammer can be locked before burn-through.
- J-11A having no jammer; Su-33 pod jammer; MiG-29S ECM lamp.
- JF-17 and M-2000C radar jamming symbols; any RWR cue for an enemy jammer.
- AI "ECM Using" default; AI identification rules.

---

## Open questions for in-game checks

1. For each jet, fly against an AI Su-27 or F-15C with "ECM Using: always". Record the radar symbol and the range at which range returns (burn-through), in nm, three runs each.
2. J-11A: is `E` bound to anything, and does any lamp or RWR cue react? Su-33: does `E` work with and without the wingtip pods?
3. MiG-29S: which lamp or HUD cue shows the Gardenia jammer is on?
4. Hornet: confirm the IFF key sequence; lock a dugout jammer and try AIM-120 and AIM-7 launches (HOJ cue, fly-out, kill rate).
5. Viper: can a jammer be bugged in TWS or SAM before burn-through, and does an AIM-120 fired that way guide (HOJ)? Is there a HUD "HOJ" cue?
6. J-11A and MiG-29S: can an R-77 be fired from an AOJ lock, and does it home on the jam?
7. Does any RWR (TEWS, Beryoza/SPO-15, ALR-67, ALR-56M, JF-17, Serval) show an enemy that is jamming you?
8. Does the FC3 F-15C show anything from its ME datalink (STN) field in the cockpit?
9. Su-33, J-11A, MiG-29S: confirm the HDD/HUD AWACS picture (filled vs open triangles) matches the Su-27.
10. What is the mission editor default for the AI "ECM Using" option, and does the AI switch the jammer off inside burn-through?

---

## Sources

1. Eagle Dynamics, *DCS F/A-18C Hornet Early Access Guide* (EN), "Updated 24 March 2024": pp. 62 (IFF panel), 157 (AOJ dugout), 180–182 (AZ/EL, CIT), 200–210 (TNDL, SA page, HAFU, PPLI, IFF/NCTR), 415–416 (ASPJ). https://www.digitalcombatsimulator.com/upload/iblock/ea9/lxf69u2uk1fhqq7ndb55z9egzabe8hdg/DCS%20FA-18C%20Early%20Access%20Guide%20EN.pdf (accessed 2026-09-27)
2. Eagle Dynamics, *DCS F-16C Viper Early Access Guide* (EN), "Updated 16 August 2026": pp. 310–311 (DTC ROE), 392–393 and 411 (FCR jamming), 433–435 (AIFF), 452–475 (TNDL), 698–706 (CMDS, ECM panel). https://www.digitalcombatsimulator.com/upload/iblock/e78/33zl8132hi71d3tv0194vvkzpzl3mrr6/DCS%20F-16C%20Early%20Access%20Guide%20EN.pdf (accessed 2026-09-27)
3. Eagle Dynamics/Belsimtek, *DCS: F-15C Flaming Cliffs Flight Manual* (2014): p. 66 (auto IFF), pp. 70–71 (HOJ, burn-through), ECM section. https://www.digitalcombatsimulator.com/upload/iblock/1ad/F-15C%20DCS%20Flaming%20Cliffs%20Flight%20Manual%20EN.pdf (accessed 2026-09-27)
4. Eagle Dynamics, *DCS: Su-27 Flanker Flight Manual* (Oct 2014): pp. 51–52 (HUD/HDD, IFF), 57–59 (datalink, ECM conditions, AOJ, burn-through), 68 (Sorbtsiya, ECM lamp). https://www.digitalcombatsimulator.com/upload/iblock/ed7/Su-27%20DCS%20Flaming%20Cliffs%20Flight%20Manual%20EN.pdf (accessed 2026-09-27)
5. Hoggit wiki, "DCS option ECMUsing". https://wiki.hoggitworld.com/view/DCS_option_ECMUsing (accessed 2026-09-27). (*"5\*" in the tables = the repo note `docs/research/tomcat-thunder-mirage.md`, TID symbol section.)
6. Heatblur, *F-14 manual*, "Link 4A & C Datalink". https://f14.manuals.heatblur.se/f14ab/systems/nav_com/link4.html (accessed 2026-09-27)
7. Heatblur, *F-14 manual*, "Identification Systems" (mirror). https://officialdsplayer.github.io/f-14-manual/systems/identification_systems.html (accessed 2026-09-27)
8. Heatblur, *F-14 manual*, "Electronic Countermeasures". https://f14.manuals.heatblur.se/f14ab/systems/defensive_systems/ecm.html (accessed 2026-09-27)
9. Heatblur, "F-14 v2.8 – Jamming, JESTER, and Headless Bodies" (dev blog). https://store.heatblur.com/blogs/news/f-14-v2-8-jamming-jester-and-headless-bodies (accessed 2026-09-27)
10. Chuck's Guides, *DCS F/A-18C Hornet* (PDF, Dec 2025), Part 12 "Datalink & IFF". https://assets.chucksguides.com/pdf/DCS%20FA-18C%20Hornet%20Guide.pdf (accessed 2026-09-27)
11. Chuck's Guides, *DCS F-16C Viper* (PDF), Part 13 "Datalink & IFF" and ECM pod section. https://assets.chucksguides.com/pdf/DCS%20F-16C%20Viper%20Guide.pdf (accessed 2026-09-27)
12. Chuck's Guides, *DCS JF-17 Thunder* (PDF, 10/04/2026), Part 13 (KG-600 SPJ) and Part 14 (Datalink & IFF). https://assets.chucksguides.com/pdf/DCS%20JF-17%20Thunder%20Guide.pdf (accessed 2026-09-27)
13. Chuck's Guides, *DCS Mirage 2000C* (PDF, 14/08/2024): controls table (S = IFF, E = jammer), TAF section 3.6.2. https://assets.chucksguides.com/pdf/DCS%20Mirage%202000C%20Guide.pdf (accessed 2026-09-27)
14. Chuck's Guides, *DCS F-14B Tomcat* (PDF, 19/08/2023): DECM ALQ-126 panel, DDD IFF button. https://assets.chucksguides.com/pdf/DCS%20F-14B%20Tomcat%20Guide.pdf (accessed 2026-09-27)
15. Stormbirds, "ECM is coming to the DCS: F-16" (13 Dec 2021) and "Jamming effects for DCS: F-16 too" (15 Dec 2021), summarising ED videos. https://stormbirds.blog/2021/12/13/ecm-is-coming-to-the-dcs-f-16/ , https://stormbirds.blog/2021/12/15/jamming-effects-for-dcs-f-16-too/ (accessed 2026-09-27)
16. FlyAndWire (Karon): "Electronic Countermeasures – Introduction – Part I" (20 Oct 2022), "– F-14 Avionics – Part II" (11 Nov 2022), "– Missiles Employment – Part III" (7 Dec 2022), "[Thoughts] DCS: A Poor Combat Sim" (6 Dec 2022). https://flyandwire.com/2022/10/20/electronic-countermeasures-introduction/ , https://flyandwire.com/2022/11/11/electronic-countermeasures-f-14-avionics/ , https://flyandwire.com/2022/12/07/electronic-countermeasures-missiles-employment-part-iii/ , https://flyandwire.com/2022/12/06/thoughts-dcs-a-poor-combat-sim/ (accessed 2026-09-27)
17. DCS Lua datamine (Quaggles), unit files `F-15C`, `FA-18C_hornet`, `F-16C_50`, `F-14B`, `JF-17`, `M-2000C`, `MiG-29S`, `Su-27`, `Su-33`, `J-11A` (Countermeasures.ECM, pylon pod entries, AddPropAircraft DATALINK/STN, datalinks). https://github.com/Quaggles/dcs-lua-datamine/tree/master/_G/db/Units/Planes/Plane (accessed 2026-09-27)
18. ED Forums threads, read as search-result snippets only (pages return 403): "questions about F-16 jamming target/DL" (Feb 2025) https://forum.dcs.world/topic/356548-questions-about-f-16-jamming-targetdl/ ; "Question: Locking on jamming targets" (Apr 2024) https://forum.dcs.world/topic/346882-question-locking-on-jamming-targets/ ; "F-16 and AIM-120 HOJ?" (Mar 2023) https://forum.dcs.world/topic/320595-f-16-and-aim-120-hoj/ ; "AIM-7MH enters HOJ even if target that is locked and fired on isn't jamming" (Nov 2021) https://forum.dcs.world/topic/286767-aim-7mh-enters-hoj-even-if-target-that-is-locked-and-fired-on-isnt-jamming/ (accessed 2026-09-27)
19. Existing repo research: `docs/research/missiles.md` (HOJ flags), `ru-fc3.md` (FC3 Russian ECM, AOJ), `f15c-fc3.md`, `hornet-viper.md`, `tomcat-thunder-mirage.md` (M-2000C Serval, JF-17 RWR, TID symbols).
