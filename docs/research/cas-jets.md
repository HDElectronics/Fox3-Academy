# CAS with a JTAC in DCS: Su-25T, A-10C II, F/A-18C, F-16C

Researched 2026-09-26 for the planned CAS module. Game level only (AGENTS.md rule 1): what the player
sees, which keys, which in-game procedure works. No weapon engineering. Extends
`docs/research/su25t.md` (S1 there = ED Su-25T Flight Manual); facts already in that note are not repeated.

Confidence tags per fact:
- **manual**: ED official manual (A-10C II Flight Manual, F/A-18C and F-16C Early Access Guides, DCS User
  Manual, Su-25T Flight Manual). Manuals can lag the current build; nothing here was checked in game.
- **community**: forum post, community wiki, or mission-generator source code.
- **not found**: searched, no source.

---

## 0. The built-in JTAC (applies to every jet)

### Mission editor side (what makes a JTAC exist)

- The JTAC is an AI group given a FAC task: **FAC – Assign Group**, **FAC** (enroute) or **FAC – Engage
  Group**. [U] **manual**
- Designation options set by the mission maker: **Auto, smoke ("Willy Pete", WP), IR-Pointer, Laser,
  WP-Laser**. "Target designation is carried out on the player's radio request at a fixed radio range." [U]
  **manual**
- Best JTAC unit: "an armed vehicle with direct line of sight to the target and placed within a few
  kilometers range". "Only armed units can designate a target with smoke and laser" (e.g. armed HMMWV).
  [U] **manual**
- Datalink tasking needs a ground unit with **EPLRS** enabled. [U] **manual**
- Any unit can be a JTAC, including aircraft such as a Predator. [A] **manual**

### Game limitations players hit

| Limitation | Confidence |
|---|---|
| No line of sight: the radio menu shows **"problem: no LOS"** in brackets and the JTAC cannot mark; it must move until it sees the target. Terrain blocks LOS. | manual [U] |
| Out of range: the menu shows the maximum distance for each designation method until the JTAC is close enough. | manual [U] |
| FAC – Assign Group only works the group chosen by the mission maker; FAC (enroute) picks its own targets, which "may not correspond to the targets intended". FAC – Engage Group must detect the group itself first. | manual [U] |
| No line of sight = coordinates only (typical for Type 2/3 control). | manual [A] |
| Smoke goes down only when you are **within 10 nm** of the target, after IP inbound; JTAC says "mark is on the deck". | manual [A] |
| JTAC lases only after you call **Laser On** (after IP inbound), and in the A-10C II manual flow only when it tasked you with a laser-guided bomb (GBU-10/12). | manual [A] |
| Default JTAC laser code **1688**, read out in the 9-line. | manual [A] |
| IR pointer needs NVGs; it shows as a line from JTAC to target. | manual [A] |
| Script JTACs (CTLD / JTACAutoLase, common on servers): LOS check ignores buildings and trees; smoke is refreshed every 5 minutes. These are scripts, not core DCS. | community [C1] |
| Mission generators cap JTAC codes at 1688 ("JTAC will not use laser codes above 1688 anymore"). | community [C2] |
| AI JTAC laser code in the core editor: how to change it from 1688 was not found in the manuals. | not found |

### Radio flow (A-10C II manual, the only ED manual that writes it out) [A] **manual**

1. Radio menu `\` (or the Mic switch for the radio), **F4 JTACs**, pick the JTAC. With Easy Communications
   the radio tunes itself; otherwise tune the briefed frequency (usually VHF FM on the A-10C).
2. **Check-in** with play time. Your check-in is automatic: mission number, position from IP and altitude,
   weapons, time on station.
3. JTAC gives the control type (1, 2 or 3) and asks if you are ready for the 9-line. `\` **F1 Ready to copy**.
4. 9-line: IP, heading and offset, distance, target elevation (MSL), target type, UTM/MGRS coordinates,
   **mark (None, WP, Laser, IR Pointer)**, friendlies, egress.
5. Remarks (`\` F1): weapon to use, weather, attack headings. Then read back (`\` F1).
6. A-10C II only: "Standby for data", digital 9-line on the MSG page, red triangle on the TAD, WILCO.
7. By mark type:
   - **Coordinates only**: JTAC clears you to engage after the data. Attack, `\` F1 **Attack Complete**.
   - **Smoke**: `\` F1 **IP Inbound**, JTAC says continue; inside 10 nm, smoke; `\` F1 **Contact the Mark**;
     JTAC talks you from the smoke to the target; `\` F1 **In**; **cleared hot** or **abort**; release;
     `\` F1 **Off**. Then cleared to re-attack (restart at IP Inbound) or depart.
   - **Laser**: IP Inbound, then `\` F1 **Laser On**, point the pod at the target and run LSS/LST; on detect
     `\` F1 **Spot** (F3 **Shift** to another target in the group, or **Terminate**); In; cleared hot; Off.
   - **IR pointer**: same as smoke, plus **Pulse** and **Rope** requests.
8. Other items: Repeat Brief, What is my target?, **Contact** (report what is at your SPI; JTAC confirms or
   corrects and gives directions), Request BDA, Unable to comply, Check Out.

The same core JTAC dialogue is reached from any jet's radio menu, but only the A-10C II manual documents it.
Whether the flow differs per module (for example for FC3 jets) was **not found**.

---

## 1. Su-25T (priority)

### Can it find a JTAC target?

| Mark | What works in game | Confidence |
|---|---|---|
| **Coordinates** | No coordinate entry for a target in the Su-25T avionics per S1 (navigation is waypoint-based). The player uses the 9-line and F10 map to pick the area and searches with the Shkval (tank 8–10 km, house 15 km per S1). | manual (S1, by absence); talk-on use is community |
| **Smoke / WP** | Works as a visual mark: smoke is a world object any jet sees. Find the smoke by eye, then slew the Shkval there, lock, and use the JTAC talk-on ("Contact the Mark" gives direction and distance from the smoke). Community: Soviet-style practice is smoke plus visual talk-on. | JTAC side manual [A]; Su-25T use community [C3] |
| **JTAC laser** | **No laser spot search.** The Shkval has no LST in DCS; the Su-25T manual lists none, and a 2016 forum thread says "no LST". | manual (S1, by absence); community [C3] |
| **Laser code 1113 (FC3 exception)** | Community reports: a target lased on code **1113** shows a small **diamond** in the Su-25T (and A-10A) HUD in A-G mode [7]. Kh-25ML, Kh-29L and S-25L can then be fired at it (not the beam-riding Vikhr). A 2016 post says ED "squashed" the related trick; mission generators still offer "JTAC Use FC3 laser code (1113)" in 2025 code. Current behaviour **not verified**. | community [C3][C4][C5] |
| **Laser code entry** | None in the Su-25T per S1: no cockpit code setting for Shkval, Vikhr or Kh missiles. | manual (by absence) |

Teaching consequence: in the app, the honest Su-25T CAS flow is **9-line → IP → smoke or talk-on →
Shkval search → lock → attack**. Any JTAC-laser hand-off for the Su-25T must be labelled "not verified"
(1113 diamond) or left out.

### Weapons sensible for CAS in game

| Weapon | Use | Source |
|---|---|---|
| Vikhr (9А4172) | Main anti-armour weapon, stand-off, hold Shkval lock and laser to impact. Community favourite: 2 Vikhr racks in almost every CAS loadout, used from max range against air defences first. | S1 + community [C6] |
| S-8 / S-13 rockets | Area targets, soft vehicles; shallow dive, pipper on target, fire when "Launch Authorized" and the range-bar arrow reaches the upper tick. | S1 (manual) |
| Free-fall bombs, RBK cluster, KMGU | CCIP visual; CCRP ("invisible zone") with Shkval designation; KMGU at 2 s intervals in СЕРИЯ КМГУ-МБД. Community: full load of cluster bombs, single pass, ripple in CCRP. | S1 + community [C6] |
| Kh-25ML / Kh-29L / Kh-29T | Heavy point targets, vehicle SAMs; drop early to lighten the jet. | S1 + community [C6] |
| Gun (built-in, [C]) | Strafe in a shallow dive, same pipper/range-bar logic as rockets; HUD ВПУ, ammo shown in quarters (4 = full, 1 = last quarter). | S1 (manual) |
| Gun pods | ФИКС for level strafing with fixed barrel depression, ПРОГР automatic depression on a laser-ranged target from level flight, 0 for firing in a dive. | S1 (manual) |

Release-mode switch (S1, **manual**): ЗАЛП (all at once), 0.1–0.4 s intervals, СЕРИЯ КМГУ-МБД; salvo size
ПО 1 / ПО 2 / ПО 4 / ВСЕ cycled with [LCtrl-Space].

### Attack profiles (gameplay tips)

- S1 only says **"shallow dive"** for rockets and gun; it gives no dive angle or release altitude. **manual**
- Community profiles (qualitative): (a) low, fast, terrain masking, single pass with cluster bombs,
  dispensers or S-8; (b) find air defences first with the Shkval, kill them from max range with Vikhr or
  Kh-29, then mop up. Typical group: 1–3 MANPADS, maybe a vehicle IR SAM, 0–5 AAA, often behind or to
  the side. **community [C6]**
- Numeric dive angles and release altitudes for the Su-25T: **not found** in any source read. If the app
  shows numbers, label them "simplified".

---

## 2. A-10C II

All **manual** [A] unless marked.

- **Laser code (own laser)**: TGP A-G page → **CNTL** page → type code in scratchpad → **OSB 18 (L)**.
  Default **1688**. Latch ON/OFF sets hold-to-fire vs toggle; fire with the Nosewheel Steering button.
  "L" on the TGP page and a flashing L on the HUD when lasing.
- **LSS code**: CNTL page → scratchpad → **OSB 17 (LSS)**. Default 1688; "any four-digit code may be
  entered".
- **LSS/LST**: point the TGP at the area (slew or slave), TGP as SOI, **OSB 6 (LSS)** or **DMS Right Long**.
  Video freezes, SA cue sweeps; **DETECT** on detection; then **LST** next to OSB 6 with a point-track box.
  Convert to AREA/POINT with **TMS Forward Short**, INR with **TMS Aft Short**. Then set SPI and attack.
- Community wording: LSS via **China Hat Aft Short** and "LSR"/"BTH" vs "IR" on a buddy's pod. **community [C7]**
- **AGM-65L laser Maverick**: code on DSMS INV page (scratchpad → OSB above CODE); status page alternates
  alignment and code (default 1688). Works with own pod or an external designator "like a FAC".
- **LGB / APKWS**: code on the DSMS INV page (LSR CODE, OSB 7 for LGBs; 1688 default for rockets/APKWS).
  Must match the designator.
- **Datalink 9-line (SADL/SA Link)**: after the read-back the JTAC sends a digital 9-line: **NEW TASKING**
  on both MFCDs (clear with TMS Left Short), **ATTACK** flashing on the TAD, **red triangle with a dot** at
  the target, 9-line on the **MSG** page. **WILCO (OSB 19)** or **CNTCO (OSB 7)**. Hook the triangle with the
  TAD cursor to make it the SPI. Needs EPLRS on the JTAC and correct SA Link net settings.
- **Coordinates to waypoint**: CDU WAYPOINT page, **OSB 10** L/L→UTM, new waypoint, type 2 letters + 6 digits,
  **OSB 16** enter, name it, STEER PT dial to **MISSION**.
- **Markpoints**: CDU **MK** button makes an overhead mark (A–Z, 25 slots, 26th overwrites A); Z is also
  created on weapon release. Mark with the TGP/SPI too.
- **Slave all to SPI**: China Hat Forward Long.

## 3. F/A-18C

All **manual** [H] unless marked.

- Pods: ATFLIR and Litening, both with LTD/R and LST. Power via the Sensor Control Panel (LST/NFLR switch).
- PRF codes described as **1211–1688** in the guide. LTD and LST codes can differ.
- **Code entry**: FLIR format **PB 14 (UFC)** → UFC **LTDC** (designator) or **LSTC** (tracker) → type → ENT.
  A mismatch shows a flashing **CODE** on the HUD (Litening). **community [C8]** for the CODE cue.
- **LST (ATFLIR)**: box **PB 17 (LST)**; display blanks; on detection the pod slews, **LST** at the top of the
  FLIR format; designate (TDC depress) or go to a track and LST exits.
- **LST (Litening)**: PB 17; **LST flashes** on the MPCD and HUD while searching near the pod line of sight;
  **WSRC/NSRC** wide/narrow search; LST steady once found; unbox LST to start your own track.
- **Paveway II code**: SMS **CODE (PB 1)** with the bomb selected → UFC → ENT; per-bomb codes possible.
- **JDAM from a 9-line (PP)**: Master Arm ARM, A/G, select JDAM, **PP**, wait for alignment, EFUZ, **MSN**, pick
  **PP1–6**, **TGT UFC (PB 14)** → **POSN** (lat/long) and **ELEV**, fly steering, release on **IN RNG**. PP
  stays X-ed out until coordinates and elevation are valid.
- **JDAM TOO**: target = designated waypoint (WPDSG) or sensor point.
- **MGRS**: waypoints can be entered in MGRS (**GRID**); **PRECISE** for 10-digit.
- **JTAC 9-line by datalink**: **not found** for the Hornet; voice 9-line then manual entry is the flow.

## 4. F-16C

All **manual** [F] unless marked.

- **LASR DED**: ICP LIST → 0 (MISC) → **5/CRUS**. Fields **TGP CODE** and **LST CODE**, codes **1111–1788**
  (PIM 2111–2888), A-G laser **CMBT/TRNG** (must be CMBT to guide bombs). Not editable while the pod is
  off or initialising.
- **Bomb seeker codes cannot be changed in flight**: set in the mission editor or on the kneeboard
  ([RShift-K], [ and ] to change pages) on the ground before engine start with STA POWER OFF. The TGP code
  must match the bomb.
- **LST**: TGP in A-G, Multi-Target track off, LST code set. Point the pod near the target (steerpoint in
  CCRP/PRE etc., or visual via TD box / CCIP pipper). Enable with **OSB 20 (LST)** or **MAN RNG/UNCAGE**
  depress with TGP SOI. Status: **LSRCH** → **DETECT** → **LTRACK**; full-screen crosshairs; **TISL** symbol in
  HUD/HMCS on the target. LST field of view about 3°, local scan around the SPI.
- **MGRS from a 9-line**: steerpoints **21–25** only; LIST → **1/T-ILS** (UTM DEST) or STPT page; enter
  GRID, SQUARE, 10-digit easting/northing (pad with zeros), then convert to lat/long before leaving the page,
  or the entry is lost.
- **JDAM PRE**: A-G [2], Master Arm, select GB38/GB31, **OSB 7 power**, wait for alignment, set steerpoint
  or designate, fly the steering line, hold release [RAlt]+[Space].
- **Markpoints**: steerpoints 26–30 own marks (cyan X on HSD); datalink marks 500+ (white X).
- **JTAC 9-line by datalink**: **not found** in the guide; Link 16 carries flight marks and SPIs, not JTAC
  tasking, as far as the guide shows.

---

## 5. Comparison for the app

| | Su-25T | A-10C II | F/A-18C | F-16C |
|---|---|---|---|---|
| Find JTAC laser | No (1113 diamond unverified) | LSS/LST | LST | LST |
| Laser code in cockpit | None | Pod, LSS, weapons | LTDC, LSTC, Paveway | Pod, LST; bombs ground only |
| Digital 9-line | No | Yes (TAD, MSG, WILCO) | Not found | Not found |
| Coordinate entry | No | CDU UTM/LL | MGRS/LL, PP JDAM | MGRS STPT 21–25, PRE JDAM |
| Smoke talk-on | Yes | Yes | Yes | Yes |
| Already in the app | Shkval, Vikhr, rockets, CCIP | No | No | No |

---

## Sources (all accessed 2026-09-26)

- [A] ED, *DCS A-10C II Tank Killer Flight Manual* (EN): https://www.digitalcombatsimulator.com/upload/iblock/715/t05fb1h8itdhcvcf6fyi3h5944fvv4fx/DCS_A-10C_II_Flight_Manual_EN.pdf
  (F4 JTAC and JTAC Engagement Flow; TGP laser and LSS; TAD tasking; UTM waypoint entry; AGM-65L)
- [H] ED, *DCS F/A-18C Early Access Guide* (EN): https://www.digitalcombatsimulator.com/upload/iblock/ea9/lxf69u2uk1fhqq7ndb55z9egzabe8hdg/DCS%20FA-18C%20Early%20Access%20Guide%20EN.pdf
- [F] ED, *DCS F-16C Viper Early Access Guide* (EN): https://www.digitalcombatsimulator.com/upload/iblock/e78/33zl8132hi71d3tv0194vvkzpzl3mrr6/DCS%20F-16C%20Early%20Access%20Guide%20EN.pdf
- [U] ED, *DCS User Manual* (DCS World 2.5, 2020), mission editor FAC tasks. Listed at https://www.digitalcombatsimulator.com/en/downloads/documentation/
- [S1] ED, *DCS World Su-25T Flight Manual* (EN): https://www.digitalcombatsimulator.com/upload/iblock/61b/DCS%20World%20Su-25T%20Flight%20Manual%20EN.pdf
- [C1] ciribob, DCS-JTACAutoLaze (deprecated, merged into CTLD): https://github.com/ciribob/DCS-JTACAutoLaze
- [C2] DCS Liberation changelog: https://github.com/dcs-liberation/dcs_liberation/blob/develop/changelog.md
- [C3] ED Forums, "Laser Code 1113 and (at least) Su-25T" (2016), pages 2–3: https://forum.dcs.world/topic/138919-laser-code-1113-and-at-least-su-25t/
- [C4] Airgoons wiki, Su-25T Frogfoot: https://www.airgoons.com/w/Su-25T_Frogfoot
- [C5] DCS Liberation source, CTLD plugin config ("JTAC Use FC3 laser code (1113)", "to allow lasing for Su-25 Frogfoots and A-10A Warthogs"): https://github.com/dcs-liberation/dcs_liberation/blob/develop/resources/plugins/ctld/ctld-config.lua
- [C6] ED Forums, "Optimal Attack Range" (Su-25, 2015): https://forum.dcs.world/topic/116324-optimal-attack-range
- [C7] Steam discussion, "A10C II Buddy Laser Help": https://steamcommunity.com/app/223750/discussions/0/4137186326778854946/
- [C8] Hoggit wiki, F/A-18C Litening II: https://wiki.hoggitworld.com/view/F/A-18C/Litening_II

Not used as facts (secondary, generic, unclear authorship): flyawaysimulation.com JTAC answer, simtuts.com
9-line guide.
