# A-10C II CDU: coordinates and markpoints

Researched 2026-10-14 for the A-10C II CAS slice. Game level only (AGENTS.md rule 1): CDU pages, keys, the order
of presses and what the screen shows. No navigation-system internals. Extends `docs/research/a10c.md`,
`docs/research/cas-jets.md` section 2 (one-line summaries of UTM entry and markpoints) and
`docs/research/cas-jtac.md` (9-line order). Facts already stated there are only referenced.

Confidence tags (same as `a10c.md`):

- **verified (M p.N)**: ED *DCS A-10C II Tank Killer Flight Manual* (EN, 814 pp., file dated 2023-07-11),
  printed page N (printed and PDF page numbers match). "fig." = read from the manual's screenshot.
- **verified (T)**: ED A-10C II *Navigation* training mission text, read through the public Japanese
  localisation [T]. Key names are in Latin there; the wording is a translation.
- **community (C)**: Chuck's *DCS A-10C Warthog Guide* [C] (covers A-10C and A-10C II), text and screenshots.
- **inferred**: worked out from two verified facts; say so in the UI or check in game.
- **not verified**: no reliable source found.

Nothing here was checked in game.

---

## 1. CDU layout as the player sees it

| Item | What the player sees | Tag |
|---|---|---|
| Place | Right console, CDU above the AAP (Auxiliary Avionics Panel). | verified (M p.204–205) |
| Screen | 10 lines x 24 characters, green text. Line 1 = page title, active flight plan (blank unless STEER PT is FLT PLAN), steerpoint number, DTSAS and EGI FOM (e.g. `WAYPT  F1  1   D5/B1`). Line 2 = annunciations. Lines 3–9 = data. Line 10 left = scratchpad. | verified (M p.206, p.208; fig. p.425) |
| Line numbering | Every field is named by side and line: L1–L10, R1–R10. The manual uses this naming throughout. | verified (M p.206) |
| LSKs | 8 Line Select Keys, 4 per side, beside lines **3, 5, 7, 9** (L3 L5 L7 L9, R3 R5 R7 R9). Even lines (L4, R6, ...) are display-only fields. | verified (M p.206; LSK lines from every page description, e.g. p.277, p.280) |
| LSK symbols | `←`/`→` branch to another page; `±` value steps with the ± rocker; `↕` rotary (each press cycles); `[ ]` data entry from the scratchpad; `⊕`-style target symbol = system action (e.g. copy `?5`). | verified (M p.206–207; fig. p.284, p.425) |
| Scratchpad | Line 10 left, shown as `[` ... `]` with a cursor; **15 characters** on the CDU (the HUD scratchpad holds 24). Valid entry clears it; invalid entry shows **`CDU INPUT ERR`** until CLR. | verified (M p.206, p.209, p.278) |
| Function Select Keys (row under the screen) | **SYS**, **NAV**, **WP**, **OSET**, **FPM**, **PREV**, then the **DIM / BRT** rocker. FSKs work only with the AAP PAGE dial at **OTHER**. | verified (M p.207–208; fig. p.205) |
| Keypad | Digits 1–9, `.`, 0, `/` on the left; letters A–Z on the right; **BCK** (backspace), **SPC** (space), **CLR** (clears the whole scratchpad, clears errors), **FA** (fault acknowledge, also clears `MARK x`), **MK** (overhead markpoint), **P/G** page rocker (sub-pages 1/2, 2/2), **±** rocker, a blank rocker (steps through waypoint IDs during an ID search). | verified (M p.205, p.207; fig. p.205) |
| AAP PAGE dial | **OTHER / POSITION / STEER / WAYPT**. Only OTHER allows editing; the other three are read-only info pages (POS INFO, STEER INFO, WP INFO). | verified (M p.204; T) |
| AAP STEER PT dial | **FLT PLAN / MARK / MISSION**. MARK cycles markpoints only; MISSION cycles all non-mark points; FLT PLAN cycles the flight plan and is the only setting that draws the route on the TAD. | verified (M p.204; T) |
| AAP STEER toggle | Up/down cycles the steerpoint inside the STEER PT database; each new selection becomes the steerpoint. | verified (M p.205) |
| CDU on an MFCD | **CDU repeater page**, page label CDU (ED lesson: Coolie Right, or `K` twice, or the CDU OSB 13 on the right MFCD). OSBs 1–6 and 20 do nothing on this page; OSBs 11–15 are the normal page labels. | verified (M p.425; T) |
| Repeater OSB = LSK | Left side **OSB 19 = L3**, OSB 18 = L5, OSB 17 = L7, **OSB 16 = L9**; right side **OSB 7 = R3**, OSB 8 = R5, **OSB 9 = R7**, **OSB 10 = R9**. | inferred: OSB 19 = L3 (T); OSB 7/9/10/16 match R3/R7/R9/L9 in the manual's procedure (M p.555 vs p.277–280); OSB 17, 18, 8 by position (fig. p.425) |
| UFC repeat | UFC keys type into the same scratchpad. **LTR** for letters (phone-style multi-tap, `L` on the HUD scratchpad; press twice to lock). **FUNC** then a key = SYS, NAV, **WP** (FUNC 3), OSET, FPM, PREV, plus FPLAN / MARK / MSN (STEER PT) and POS / STEER / WAYPT (PAGE). FUNC + DATA rocker = CDU page up/down. UFC **MK** = CDU MK. UFC **CLR** = one character back, hold over 0.5 s to clear all. UFC **STEER** rocker = AAP STEER toggle. | verified (M p.303–306, p.555; T for FUNC + DATA) |

Keyboard defaults for the CDU keys: **not verified** (not searched in an input-list export; the ED lesson only
uses mouse clicks on the CDU and UFC).

## 2. Page names met in these workflows

| Page | How to get there | Lines that matter | Tag |
|---|---|---|---|
| `WP MENU` | PAGE dial OTHER, **WP** FSK | L3 `→STEERPOINT`, L5 `→ANCHOR PT`, R3 `WAYPOINT←`, R5 `FROM PT←`, R9 `WG84[]` | verified (M p.276–277, fig.) |
| `WAYPT` page 1/2 | WP MENU R3 (WAYPOINT) or L3 (STEERPOINT); WP INFO L5 | L3 `±n` number (`SP` if it is the steerpoint), R3 `MSN004[]` identifier, R4 type (`UNK`), L5 `EL:6554` elevation, L6 `CR` / `NO CR`, R5 `DTOT[]`, L7 lat or UTM grid zone, R7 copy `?5⊕`, R8 `WND 180/ 000`, L9 long or UTM area/E/N, R9 `L/L↕` or `UTM↕`, `P1/2` | verified (M p.278–280, p.284–287; fig. p.284, p.425); line text also community [C p.293] |
| `WAYPT` page 2/2 | P/G rocker | SCALE, STEER mode (TO FROM / DIRECT / TO TO), 2D/3D, DTTG, DTOT | verified (M p.281–284) |
| `STEER INFO` (`STRINFO`) | PAGE dial STEER | L3 steerpoint number/letter (`±`), R3 identifier, DMH, DIS, EL | verified (M p.212–213) |
| `WP INFO` | PAGE dial WAYPT | L3 waypoint number, R3 identifier, R4 TTG, R5 heading/distance, L5 `→WAYPOINT` branch; lower block = steerpoint and anchor data | verified (M p.214–215, p.551, p.556) |

Mission waypoints get the default ID `MSNxxx` (001 up); markpoints get letter IDs from A. **verified (T)**.
The markpoint WAYPT page shows the ID as `MRK C` for mark C. **verified (M fig. p.563)**; community [C p.307, p.487]
writes `MRK A`.

## 3. Workflow 1: JTAC 9-line line 6 (UTM/MGRS grid) into a new waypoint

The ED manual procedure (M p.555–556) is written with the right MFCD on the CDU repeater page and quotes
MFCD OSBs; the CDU LSK equivalent is given beside it. The community walkthrough [C p.293] does the same flow on
the CDU itself and shows the screen at each step.

| # | Pilot presses | CDU shows | Tag |
|---|---|---|---|
| 0 | Copy line 6 from the 9-line: **2 letters + 6 digits**, e.g. `DQ083998` (grid square + 3-digit easting + 3-digit northing; the grid zone is normally left out). ED advice: set up a wide orbit on the autopilot first. | Kneeboard / radio text, e.g. `PLAYER: 23, DQ083998` read-back. | verified (M p.554–555); example community [C p.290–293] |
| 1 | AAP **PAGE** dial to **OTHER**. STEER PT: the manual says **FLT PLAN** for the entry, then MISSION at step 9; Chuck sets **MISSION** from the start (see Conflicts). | — | verified (M p.555); community [C p.293] |
| 2 | **WP** FSK (or UFC **FUNC**, **3**). | `WP MENU   1   D5/B1`, `→STEERPOINT  WAYPOINT←`, `→ANCHOR PT  FROM PT←`. | verified (M p.277 fig., p.555) |
| 3 | **R3** (WAYPOINT) [repeater **OSB 7**]. Chuck presses **L3** (STEERPOINT) instead; both open a `WAYPT` page. | `WAYPT   1   D5/B1`; L3 `±0` (or the current number), R3 `INIT POSIT[]`, R7 `?4⊕`, R9 `L/L↕`, L7 `N..°..…`, L9 `E...°..…`. | verified (M p.277, p.284–285, p.553); community [C p.293] |
| 4 | **R7** copy, the `?n` key [repeater **OSB 9**]. Copies the shown point into the next free mission slot and displays it. | L3 `±4`, R3 `MSN004[]`; R7 now shows the next free slot (`?5⊕`). | verified (M p.279, p.553 "?6", p.741 "Copy (?xx)"); screen community [C p.293] |
| 5 | **R9** rotary [repeater **OSB 10**] to change `L/L` to **`UTM`**. Manual does this before step 4; order does not matter in either source. | R9 `UTM↕`; L7 `[]40R WG84` (grid zone + spheroid); L9 `[]DQ 16913 95765` (area, easting, northing, still the copied point). | verified (M p.280, p.287, p.555); screen community [C p.293] |
| 6 | Type `DQ083998` on the CDU keypad (letters on the right block) or UFC (LTR for the letters). No spaces. | Scratchpad `[DQ083998`. | verified (M p.555); community [C p.293] |
| 7 | **L9** [repeater **OSB 16**] enters the area/easting/northing. | L9 `[]DQ 08300 99800` (6 digits padded to 5 + 5). Elevation updates by itself: `EL:24`, flag `CR`. | verified (M p.280, p.555); padding and auto elevation community [C p.293 fig.] |
| 7a | Different grid zone only: type the zone (`##` + letter, e.g. `37T`) and press **L7**. | L7 `[]37T WG84`. | verified (M p.280) for the field; scratchpad spelling **not verified** |
| 7b | Optional: line 4 elevation, type feet MSL and press **L5** (second press flips the sign). | L5 `EL:23`. | verified (M p.279, p.553) |
| 8 | Check the digits against the 9-line. | — | verified (M p.555) |
| 9 | Type a name, e.g. `TGT A` (manual) or `JTAC1` (Chuck), and press **R3** [repeater **OSB 7**]. Max 12 characters, first a letter, letters/digits/period only, unique. | R3 `JTAC1[]` replaces `MSN004`. | verified (M p.203, p.279, p.555); community [C p.293] |
| 10 | Make it the steerpoint: STEER PT dial to **MISSION**, then the UFC **STEER** rocker, the AAP STEER toggle, or **DMS Up/Down** with the HUD as SOI, until the HUD shows `4` / `JTAC1`. | HUD lower right: steerpoint number and ID. | verified (M p.552, p.556); community [C p.296] |
| 10 alt | Or: PAGE dial **STEER** (STEER INFO), type `4`, press **L3**; or with PAGE at STEER cycle with the CDU **±** rocker. | L3 shows the new steerpoint number. | verified (M p.213, p.557, p.742) |
| 11 | If the SPI is not the steerpoint: HUD SOI, **TMS Aft Long** (SPI back to steerpoint). | HUD SPI generator `STPT`. | verified (M p.483; a10c.md §2); community [C p.296] |
| 12 | Fly the HUD and TAD steering: the steerpoint is a **yellow square** with its number on the TAD; with MISSION or MARK only the selected point is drawn. | — | verified (M p.355–356, p.558) |

Notes:
- The UTM area/easting/northing key (L9) is inactive (no brackets) for navigation waypoints (51–2050) and for
  markpoints; only mission waypoints take a grid. That is why the flow copies to a mission point first.
  **verified (M p.280, p.287)**.
- The manual allows up to 10 digits (5 + 5) on L9. **verified (M p.280)**. How 8 digits are split
  (presumably 4 + 4) is **not verified**.
- The manual also explains MGRS precision (4+4 digits = 10 m, 5+5 = 1 m) with the example `38T ME04586742`.
  **verified (M p.554)**.

## 4. Workflow 2: markpoints

| # | Pilot presses | What happens / what shows | Tag |
|---|---|---|---|
| 1 | **MK** on the CDU (or UFC **MK**): overhead mark at the aircraft position. | New letter in order A–Y. CDU jumps to the `WAYPT` page of the new mark (not if Mark Z is on screen). Line 2: `MARK A` (cleared by FA). HUD: steerpoint ID/number/distance flash about 5 s, mark elevation flashes about 10 s (5 digits, `M` suffix in metres); accept with UFC **ENT**. | verified (M p.202, p.207, p.209, p.472) |
| 2 | **TMS Right Short** with a designation source as SOI: HUD TDC, **TGP** crosshair, Maverick seeker, TAD cursor, HMCS HDC. | Mark at that point (offset mark: coordinates and elevation of the sensor point), next letter A–Y. HUD TDC must be valid (no `X`). | verified (M p.202, p.434, p.483, p.562); TGP also T (a10c.md §3) |
| 2a | Community tip with the TGP: fire the laser (NWS button) while pressing TMS Right Short, so the mark is at the laser range, not the ground behind the target. | — | community [C p.305–306] |
| 3 | Weapon release. | Mark **Z** is made; each release replaces Z. HUD `W` weapon event marker while release is held. | verified (M p.204, p.472–473, p.563) |
| 4 | 26th user mark. | Overwrites **A**, then B, and so on. | verified (M p.202) |
| 5 | Make a mark the steerpoint: AAP STEER PT to **MARK** (or UFC FUNC + MARK), then CDU **±** rocker, AAP/UFC STEER, or **DMS Up/Down** with HUD SOI. | Selected mark becomes the steerpoint **and the SPI by default**. HUD lower right shows the letter and ID. | verified (M p.563, p.743); community [C p.307, p.483] |
| 5 alt | **TMS Right Long**: "Make Last Mark Point SPI". | Manual lists it in the HMCS HOTAS table. Chuck: in the A-10C II it replaces "STEER PT to MARK + select + TMS Aft Long" for any source. | verified for HMCS SOI (M p.483); other SOIs community [C p.307, p.486] |
| 6 | Read a mark: WP FSK, WAYPOINT branch, type the letter (e.g. `C`), **L3**; or ± rocker with STEER PT at MARK. | `WAYPT   F1  1   D5/B1`, L3 `±C`, R3 `MRK C[]`, R4 `UNK`, L5 `EL:323`, L7 `N41°53.085`, L9 `E041°58.858`, R8 `WND 111/011`, R9 `L/L↕`, R7 `?5⊕`. Lat/long/EL show **no brackets**: a markpoint position cannot be edited. R9 to UTM shows its grid. | verified (M p.285, p.563 fig., p.280) |
| 7 | Edit or keep a mark: R7 copy to a mission waypoint, then edit it like workflow 1. R3 can rename a mark. | — | verified (M p.202, p.279, p.286) |
| 8 | On the TAD | Same square as a waypoint; yellow when it is the steerpoint. The manual names "active markpoint" among TAD symbols but gives no separate markpoint shape. With STEER PT at MARK only the selected one is drawn. | verified (M p.354–356) |
| 9 | On the HMCS | "Mark points are shown similarly to steerpoints", name below. | verified (M p.475) |

## Conflicts between sources

1. **OSB vs LSK numbers.** `cas-jets.md` says "OSB 10 L/L→UTM ... OSB 16 enter". Those are **MFCD CDU-repeater
   OSBs** from the manual procedure (M p.555). On the CDU itself the same keys are **R9** and **L9**
   (M p.280). The manual's CDU chapter uses LSK names. Teach LSKs and note the repeater OSBs.
2. **STEER PT during entry.** The manual says STEER PT **FLT PLAN** for the entry, then **MISSION** to select the
   point (M p.555–556). Chuck uses **MISSION** throughout [C p.293]. The manual's WAYPT page edits work with
   the dial anywhere when PAGE is OTHER (M p.552). Teach MISSION (one dial move).
3. **Branch key.** The manual uses WP MENU **R3 WAYPOINT** (M p.553, p.555 "OSB 7"). Chuck uses **L3 STEERPOINT**
   [C p.293]. Both reach a `WAYPT` page with the copy key.
4. **Order of UTM toggle and copy.** Manual: toggle (OSB 10), then copy (OSB 9). Chuck: copy, then toggle. No
   source says the order matters.
5. **Elevation.** The manual's create-waypoint steps have the pilot type the elevation (M p.553). Chuck's
   screenshots show `EL` updating by itself with a `CR` flag after the grid entry (24 ft against a 9-line
   elevation of 23 ft) [C p.293]. M p.279 confirms the `CR` flag means the elevation came from the terrain
   database. Teach: check EL against line 4.
6. **How many marks.** M p.202: "A through Y (25 total)", overwrite A. M p.204 and p.207: "A-Z" with Z made on
   weapon use. Consistent: 25 user marks A–Y plus Z for weapon release.
7. **`MARK x` annunciation time.** M p.209 says 30 s; M p.472 says 10 s. Both say FA clears it.
8. **DMS naming.** The manual says "DMS Up/Down" (p.552, p.563) and "DMS Forward and Aft" (p.557) for the same
   steerpoint cycling. Same switch: show Fwd/Aft (keys `Home`/`End`, a10c.md §1).
9. **TMS Right Long scope.** The manual lists it only under HMCS SOI (M p.483). Chuck says it works for the
   last mark from any source.

## Not verified / open questions for in-game checks

1. Grid zone entry on L7: exact scratchpad text (`37T`? `37 T`?) and whether a JTAC grid in another zone
   needs it.
2. 8-digit (`DQ08349985`) and 10-digit entries on L9: split and padding.
3. Does the copy key (R7) keep the `UTM` setting, or does R9 reset to `L/L` on the new point?
4. Does TMS Right Long make the last mark the SPI with the HUD, TGP or TAD as SOI (not only HMCS)?
5. Exact TAD and HUD drawing of a markpoint steerpoint (shape, label `A` vs `MRK A`).
6. `MARK x` annunciation time on CDU line 2 (10 s or 30 s).
7. Default keyboard bindings for CDU keys (MK, CLR, LSKs, FSKs), if any.
8. Repeater OSB 17, 18 and 8 = L7, L5 and R5 (inferred from position only).
9. Does a TGP mark taken without laser ranging fall behind the target (Chuck tip) in the current build?
10. Do STEER PT MISSION + DMS Fwd/Aft cycle mission points when a flight plan is loaded? The manual says this
    "assumes you do not have a Flight Plan loaded" (M p.552).

## Sources (accessed 2026-10-14)

1. [M] Eagle Dynamics, *DCS A-10C II Tank Killer Flight Manual* (EN, 814 pp.):
   https://www.digitalcombatsimulator.com/upload/iblock/715/t05fb1h8itdhcvcf6fyi3h5944fvv4fx/DCS_A-10C_II_Flight_Manual_EN.pdf
   (pp. 202–215 EGI database, AAP, CDU layout, keys, line items, STEER INFO, WP INFO; 276–287 WP MENU and
   WAYPT pages; 303–306 UFC; 354–356 TAD symbols; 425 CDU repeater; 434–435 HUD TDC mark and steerpoint
   fields; 472–475 markpoint elevation, weapon event, HMCS; 483 HMCS TMS table; 551–563 waypoint creation,
   UTM entry, steerpoint, markpoints; 741–744 checklists)
2. [T] ED A-10C II training mission *Navigation* (dictionary), via 5kdn, *DCS-Translation-Japanese*:
   https://github.com/5kdn/DCS-Translation-Japanese/tree/HEAD/DCSWorld/Mods/aircraft/A-10C_2/Missions/Training
   (CDU repeater, OSB 19 for L3, FUNC + DATA paging, AAP dials, MSNxxx IDs). The lesson does not cover UTM
   entry or markpoints.
3. [C] Chuck's Guides, *DCS A-10C Warthog Guide* (updated 2023-08-31), **community**:
   https://assets.chucksguides.com/pdf/DCS%20A-10C%20Warthog%20Guide.pdf
   (p.27, p.54 AAP and FSKs; pp.290–296 JTAC UTM to waypoint with CDU screenshots; pp.300–309 TGP markpoint
   and JDAM; pp.473–488 waypoints and markpoints)
4. Cross-reference: `docs/research/a10c.md`, `docs/research/cas-jets.md` (section 2),
   `docs/research/cas-jtac.md`.

The Hoggit wiki was not needed for any fact above.
