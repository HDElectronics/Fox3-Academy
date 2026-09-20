# F/A-18C Hornet and F-16C Viper Air-to-Air Radar in DCS World

Scope: the full-fidelity DCS F/A-18C Lot 20 (APG-73, ALR-67(V)) and DCS F-16C Block 50 (APG-68(V)5, ALR-56M). Where the DCS model differs from the real aircraft, **DCS wins for the trainer**, and the real-world behaviour is noted.
Primary sources: the ED F/A-18C Early Access Guide ("Updated 24 March 2024") and the ED F-16C Early Access Guide ("Updated 16 August 2026". Its FCR chapter was revised 21 Mar 2026 and its A/A weapons chapter 12 Aug 2026).

---

## Summary (what a trainer designer must know)

1. **Hornet search/track modes:** RWS (default, with Latent TWS "LTWS" HAFUs), TWS (up to 10 ranked trackfiles, L&S + DT2), VS (velocity search, closure-vs-azimuth, no range), STT, plus RAID/SCAN RAID, SPOT and EXP sub-modes. ACM modes: GACQ, BST, VACQ, WACQ, and AACQ from BVR. **Only STT or TWS can launch weapons. LTWS cannot.** [1][3]
2. **Hornet TWS targeting:** the highest-priority track automatically becomes **L&S** (star in the HAFU). TDC-depress on a second track makes it **DT2** (diamond in the HAFU). **Undesignate** cycles L&S through the ranked tracks when there is no DT2, and swaps L&S and DT2 when there is one. **Sensor Control Switch toward the radar DDI** (normally Right) in TWS puts the L&S into **STT**, which drops the TWS picture. [1]
3. **Hornet AMRAAM cues:** HUD NIRD/ASE circle with RMIN/RNE/RMAX (and RAERO diamond) cues. **SHOOT** above the TD box is solid inside RMAX and flashes inside RNE. The HUD countdown reads **"xx ACT"** (time to active) and converts to **"xx TTG"**. On the radar format, a fly-out pyramid shows seconds to active, then **"A"**. [1][3]
4. **Viper CRM sub-modes (current DCS manual):** RWS (MPRF) → **VSR** (interleaved MPRF/HPRF, hot targets only) → TWS (10 tracks). **SAM / DT SAM / DTT / STT** are tracking states entered with TMS. ACM: 30×20, 10×60, SLEW, BORE. Azimuth A6 ±60° / A3 ±30° / A2 ±25° / A1 ±10°. Bars 4B / 3B / 2B / 1B. Range 5–160 nm. [2]
5. **Viper TWS "shoot list":** in DCS the chain is Search Target → Track Target ("tank") → **System Track** → **Bugged Target (FCR TOI, circle)**.
   - **TMS Right** upgrades all tracks and bugs the closest, then steps the bug.
   - **TMS Up** upgrades or bugs the track under the cursor. TMS Up on the bug gives STT.
   - **TMS Aft** rejects or downgrades.
   - **TMS Right held 1 s** toggles TWS ↔ RWS/VSR.
   - The F-16C can guide **6 AIM-120s at separate targets** at once. [2]
6. **Viper DLZ (2026 manual naming):** the linear missile scale shows **RAERO, ROPT, RPI, RTR, RMIN**. Below the scale are the **M-pole / F-pole** ranges (nm) and times **"A" (to active) / "T" (to termination)** for the missile of interest. The AIM-120 target symbol gets a rectangular **tail** at launch, which flashes when the seeker goes active, and an **×** for the final 8 s. [2]
7. **RWR geometry is opposite between the two jets:** on the Viper ALR-56M, more lethal threats move **toward the centre** (search on the outer ring, track = box, missile guidance = inside the circle with a flashing circle). On the Hornet ALR-67, ED documents the **critical band as the OUTERMOST ring** and the non-lethal band as the innermost. Airborne emitters carry a chevron/"hat" modifier. An active AMRAAM seeker shows as **"M"**. [1][2][9]
8. **Firing buttons differ:** the Hornet fires A/A missiles with the **Trigger [Space]**. The Viper fires them with the **Weapon Release button [RAlt+Space]**, pressed and held. [1][2][7][8]
9. **Detection range:** the player-module radar models are compiled code and are not published. The only DCS-internal numbers are the AI sensor-database values: APG-73 about **76 km / 41 nm** head-on and APG-68 about **68 km / 37 nm** head-on against a reference fighter. Use them as ballpark only. [4][5]

---

## Facts

### F/A-18C Hornet: APG-73 modes and parameters

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| Radar type | AN/APG-73 X-band pulse-Doppler, look-down/shoot-down; B-scope with ownship at bottom centre | yes | high | 1 |
| Range scales (A/A) | 5, 10, 20, 40, 80, 160 nm (9.3, 18.5, 37, 74, 148, 296 km). Range marks at ¼, ½, ¾ | yes | high | 1 |
| RWS azimuth | Total widths 20°, 40°, 60°, 80°, 140° (±10/±20/±30/±40/±70°) | yes | high | 1 |
| RWS bars | 1, 2, 4, 6 bars. Label e.g. "4B 1" = bar 1 of 4. Bar spacing 1.3° (4.2° on the 5 nm scale) | yes | high | 1 |
| PRF | MED, HI, INTL (interleaved) | yes | high | 1 |
| Target aging (RWS DATA) | 2, 4, 8, 16, 32 s | yes | high | 1 |
| RWS trackfiles | Up to 10 trackfiles. LTWS shows HAFUs; the top 8 priority tracks show as HAFUs and the rest as low-priority "+" | yes | high | 1, Hoggit snippet |
| LTWS | Boxed by default on the RWS DATA page. Designate = L&S; second designate = DT2. **No SHOOT cues, no weapon employment** | yes | high | 1 |
| TWS trackfiles | 10 ranked trackfiles (L&S, DT2 + up to 8 more); with HITS on, up to 64 raw "bricks" | yes | high | 1 |
| TWS bar/az combos | 2B: 20/40/60/80°. 4B: 20/40°. 6B: 20°. Bar spacing 2° (2B), 1.3° (4B/6B) | yes | high | 1 |
| TWS scan centering | **MAN** (default; slew with TDC) or **AUTO** (centred on L&S; auto-selected if TWS entered from STT). In AUTO, TDC-depress on empty space = **BIAS** (new centroid) | yes | high | 1 |
| TWS track loss | Trackfiles that leave the scan volume disappear "after a few seconds" | yes | med | 1 |
| TWS range auto-scale | Automatic range control only increments in TWS (increments and decrements in STT). Keeps the furthest control target at 40–90 % of scale | yes | high | 1 |
| EXP (TWS) | 10 nm window centred on L&S, 20° azimuth scan | yes | high | 1 |
| SCAN RAID | RAID button [I] or PB9. 10 nm display, 22° az, 2-bar, centred on L&S; forces AUTO centering; "SCAN RAID" at bottom | yes | high | 1 |
| One-Look RAID (STT) | Enabled on DATA. Scan every 1.5 s; resolves targets within ~1.5° (≈1 nm at 25 nm / 46 km) of the L&S as bricks | yes | high | 1 |
| SPOT | Hold TDC >1 s over an area: 22° az scan centred on cursor, "X" in cursor. Not available in STT | yes | high | 1 |
| VS (Velocity Search) | HPRF. Vertical axis = closure (top = 2,400 kt), horizontal = azimuth. **No range.** Nose-aspect targets; beam targets vanish. Selected via TDC over the mode legend (RWS/VS/TWS) | yes | med | 3 |
| STT | Entered by TDC-designating a hit (RWS), double-designating an LTWS track, SCS toward radar DDI in TWS, or AACQ/ACM. **Displays only the locked target** | yes | high | 1 |
| AIM-7 in TWS | Launching an AIM-7 on a TWS L&S makes the radar go to STT automatically | yes | high | 1 |
| NCTR | STT only; within 25 nm (46 km) and within 30° of nose or tail; result shown on SA page data block | yes | high | 1 |
| ACM: GACQ | Gun select (Weapon Select Aft). 20° dashed HUD circle, 5 nm (9.3 km). Guns only | yes | high | 1 |
| ACM: BST | SCS Fwd. 3.3° dashed HUD circle, 10 nm (18.5 km) | yes | high | 1 |
| ACM: VACQ | SCS Aft (in ACM). Vertical lines on HUD, −13° to +46° elevation, 5 nm | yes | high | 1 |
| ACM: WACQ | SCS Left (in ACM). 60° az × 10° el box, caged centre; uncage (TDC depress) to slew within 140°; 10 nm | yes | high | 1 |
| AACQ | From BVR mode: SCS toward radar DDI with TDC not on a target; locks the nearest target out to the range scale (or the target under TDC) | yes | high | 1 |
| Weapon-select radar defaults | AIM-7: 4B, 140°, 40 nm, INTL. AIM-9: 4B, 80°, 40 nm, INTL. Gun: GACQ 5 nm. AIM-120: **2B, 40 nm, INTL; azimuth 80° (HOTAS section) vs 140° + 4 s aging (AIM-120 section)** | yes | med (conflict) | 1 |
| SET / RESET | SET saves range/bars/az/PRF/aging per priority weapon; RESET restores defaults | yes | high | 1 |
| Detection vs fighter (AI DB) | AI sensor DB for AN/APG-73: 76 km (41 nm) head-on look-up and look-down; tail-on 46 km (25 nm) look-up / 35 km (19 nm) look-down. Scan ±60° az, ±30° el; track volume ±70° az | AI/FC3 DB only (player module unpublished) | low for player jet | 4 |

### F/A-18C: TWS targeting, AIM-120, attack format

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| L&S | Highest-priority trackfile, automatic on TWS entry; star inscribed in HAFU; HUD TD box | yes | high | 1 |
| DT2 | Not automatic. Set by TDC-depress on another track; diamond inscribed in HAFU; HUD shows DT2 as an "X" | yes | high | 1 |
| Swap / step | Undesignate: no DT2 → steps L&S through tracks in priority order; with DT2 → swaps L&S and DT2. TDC-depress on the DT2 also swaps | yes | high | 1 |
| Designating a hit in TWS | Makes it a track; the lowest-priority track is dropped to a hit | yes | high | 1 |
| RESET (TWS) | Drops manually added trackfiles, resumes normal prioritisation | yes | high | 1 |
| Multi-shot AIM-120 | Missile is guided to the L&S at launch; step L&S (Undesignate or designate) between shots. ED's guide gives no hard cap on simultaneous missiles | yes | med | 1 |
| Going STT | SCS toward radar DDI (TWS) → L&S becomes STT. Other trackfiles are no longer displayed, so missiles on other targets lose updates | yes | high (display) / med (missile effect) | 1 |
| HUD NIRD/ASE | NIRD circle with RMIN, RNE, RMAX cues around it (clockwise from 12 o'clock); RAERO diamond outside; steering dot; aspect pointer; breakaway X inside RMIN | yes | high | 1 |
| SHOOT cue | Above TD box: solid inside RMAX, flashing inside RNE. Separate SHOOT light by the HUD: steady = within Rmax, flashing = within Rne | yes | high | 1, 3 |
| TD box | Box; rotated 45° (diamond) if hostile; flashes when outside HUD FOV; hashed when radar in MEM | yes | high | 1 |
| HUD countdown | "xx ACT" (time to active) counts to 0 then becomes "xx TTG" | yes | high | 1, 12 |
| DDI post-launch | Fly-out pyramid on azimuth steering line with seconds to activation, then "A" when seeker active | yes | high | 1 |
| DDI pre-launch | ASE circle, steering dot, RMAX/RNE/RMIN (+RAERO) on range scale, target range caret with Vc, target altitude differential, time of flight, **Max Aspect cue 1–18** (higher = better shot) | yes | high | 1, 3 |
| L&S data | Mach to the left of the HAFU, altitude (thousands ft) to the right; aspect/heading vector; acceleration vector when target >3 g | yes | high | 1 |
| MEM mode | On track loss, radar enters MEM, showing elapsed seconds | yes | high | 1 |
| Mad-dog (VISUAL) | No track → "VISUAL" at HUD bottom; dashed seeker FOV circle; missile takes the first target it sees (~10 nm seeker per Chuck) | yes | med | 1, 3 |
| AIM-120 SMS | Stations 2, 3, 7, 8 (dual rails); "AB"/"AC" type; target SIZE and RCS SML/MED/LRG | yes | high | 1 |

### F/A-18C: HAFU and colours

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| HAFU shapes | Top half = own-sensor ID, bottom half = offboard (donor) ID. **Hemisphere = friendly, rectangular bracket = unknown, caret/triangle = hostile** | yes | high | 1 |
| HAFU colours | Green friendly, yellow unknown, red hostile | yes | high | 1 |
| Threat rank | Number 1–16 in the HAFU centre (own sensor, non-friendly); lower = more threatening | yes | high | 1 |
| Hostile ID rule | Needs two factors (e.g. no-Mode-4 reply AND NCTR print); a single factor gives Unknown | yes | high | 1 |
| SURV-only tracks | ¾-size green circle (friendly) or red diamond (hostile) with stem | yes | high | 1 |
| Attack radar colour | Monochrome green by default; DATA > COLOR adds yellow TDC cursor and yellow/red trackfiles | yes | high | 1 |

### F/A-18C: ALR-67(V) RWR and countermeasures

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| Bands | Critical (outermost), lethal (middle), non-lethal (innermost), status circle in centre | yes (per ED) | med (Chuck says inverse) | 1, 9 |
| Tick marks | 30° increments on the outer ring | yes | high | 1 |
| Status circle | Area I: priority mode (N, I, A, U, F). Area II: "L" = limit. Area III: "B" BIT fail / "T" thermal | yes | high | 1, 3 |
| LIMIT | Shows the 6 highest-priority emitters | yes | high | 1 |
| OFFSET | Spreads overlapping symbols (loses exact bearing) | yes | high | 1, 3 |
| Air threat codes | 29 = MiG-29/Su-27/Su-33/J-11; 30 = Su-30; 31 = MiG-31; 21, 23, 25, 19, 24, 34; 50 = A-50/KJ-2000; 15 = F-15; 16 = F-16; 18 = F/A-18; 14 = F-14; F4, F5; M2 = Mirage 2000; F1; JF = JF-17; F2 = Tornado GR4; E2, E3; U = Tornado IDS / AJS37 | yes | high | 1 |
| Missile seeker | "M" = active-radar-homing missile seeker detected | yes | high | 1, 9 |
| Airborne modifier | Airborne emitters carry a modifier graphic above the code (community: "hat"/chevron) | yes | low–med | 1, 13 |
| Threat lights | AI = hostile AI radar lock; CW = CW illumination (likely missile guidance); SAM (solid track / flashing guidance); AAA; DISP = program ready for consent | yes | high | 1, 3 |
| Tones | Single beep new ground emitter; double beep new airborne; repeating beep = tracking; faster = guiding/missile | yes | med | 3 |
| Dispense switch | Fwd = MAN program 5 / consent in S/A and AUTO; Aft = EW-page selected MAN program. BYPASS: Fwd chaff, Aft flare | yes | high | 1 |
| ASPJ (ALQ-165) | OFF/STBY/REC/XMIT; ~4–5 min warm-up; "JAMMER ON" on attack radar; HOJ risk vs AIM-120/AIM-7 | yes | high | 1 |

### F-16C Viper: APG-68(V)5 modes and parameters

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| Gimbal | ±60° az and el, ~60°/s antenna rate | yes | high | 2 |
| CRM sub-modes | RWS (MPRF), VSR (MPRF+HPRF interleave, no cold targets, no hot lines), TWS (MPRF, 10 tracks); tracking: SAM, DT SAM, DTT, STT. OSB 2 cycles RWS → VSR → TWS | yes (2026 manual) | high | 2 |
| Azimuth | A6 ±60° (nose-centred, not slewable), A3 ±30°, A2 ±25° (TWS with Cursor/Bugged target only), A1 ±10°. OSB 18 | yes | high | 2 |
| Bars | 4B, 3B (TWS with Cursor/Bug only), 2B, 1B. OSB 17 | yes | high | 2 |
| Range | CRM 5–160 nm (OSB 19 down / OSB 20 up; cursor "bump"). ACM BORE 5–40 nm; ACM 20/60/SLEW fixed 10 nm | yes | high | 2 |
| Frame times | A6 4B ≈ 8 s per frame; A3 2B ≈ 2 s | yes | high | 2 |
| Spotlight | Hold TMS Up in RWS/TWS (no TOI): ±10° 4-bar on cursor (~17 % of full volume). Release over a target = designate | yes | high | 2 |
| Cursor altitude readout | Upper/lower coverage (kft MSL) at cursor range; upper in blue (red if negative), lower in white (red if negative) | yes | high | 2 |
| MTR (FCR CNTL) | RWS/TWS HI 110 kt / LO 71 kt; VSR 110/59; SLEW 110/71; ACM 20/60/BORE 71/55 | yes | high | 2 |
| Target history | 1–4 frames | yes | high | 2 |
| TWS tracks | Max 10 track files; dropped after **13 s** of stale data | yes | high | 2 |
| Bug scan | Cursor Target or Bug forces ±25° 3-bar (A2 3B) centred on it | yes | high | 2 |
| Auto range scale | Increments at >90 % of scale, decrements at <40 % (TOI) | yes | high | 2 |
| SAM | From RWS: TMS Up on a search target. Sets A3; periodic dwell on the primary; **STT automatically inside 3 nm (5.6 km)** | yes | high | 2 |
| DT SAM → DTT | Second TMS Up in SAM = secondary target. Either target <10 nm (18.5 km) → DTT. DTT <3 nm → STT on the closest | yes | high | 2 |
| Mini-search | On TOI loss (TWS/SAM/DTT): conical search, HUD TD box spins CCW; TOI dropped after 2 s | yes | high | 2 |
| EXP | 8×8 nm (14.8 km) window; RWS/TWS/SAM/DTT; centred on TOI if one exists | yes | high | 2 |
| Jamming | Yellow chevron pair at top of MFD at the jammer's azimuth; overlays the target at burnthrough | yes | high | 2 |
| ACM entry | DOGFIGHT switch outboard or FCR menu; starts 30×20 in **NO RAD** | yes | high | 2 |
| ACM 30×20 ("20") | TMS Right: ±15° az, +4° to −16° el, 10 nm, body-stabilised | yes | high | 2 |
| ACM 10×60 ("60") | TMS Aft from NO RAD: ±5° az, +53° to −7° el, 10 nm | yes | high | 2 |
| ACM BORE | TMS Up: 0° az / −3° el, default 20 nm (5/10/20/40). Second TMS Up = HMCS cueing | yes | high | 2 |
| ACM SLEW | RDR CURSOR any direction: 4-bar ±30°, 10 nm, slewable, space-stabilised | yes | high | 2 |
| ACM lock | First detection → STT with "Lock" voice. TMS Aft = reject / NO RAD. No datalink tracks shown in ACM | yes | high | 2 |
| AIM-120 simultaneous | "The F-16C is capable of simultaneously guiding six AIM-120 missiles to separate targets" (TWS, SAM, DT SAM, DTT, STT) | yes | high | 2 |
| Detection vs fighter (AI DB) | AI sensor DB AN/APG-68: 68.4 km (37 nm) head-on; tail-on 54 km (29 nm) look-up / 32 km (17 nm) look-down | AI/FC3 DB only | low for player jet | 5 |

### F-16C: FCR symbology and DLZ

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| Search Target | Small filled target with a "hot line" tick (RWS/TWS): **tick at bottom = hot**, tick on top = cold. Altitude (kft) shown under the cursor | yes | high | 2 |
| Track Target ("tank") | Rotated to the target's ground track, with a nose line; altitude below | yes | high | 2 |
| System Track | Upgraded track (distinct symbol); only System Tracks can be the cursor target or bug | yes | high | 2 |
| Bugged Target | Circle around the target = FCR TOI | yes | high | 2 |
| AIM-120 target | Rectangular "tail" at launch; tail **flashes when seeker active**; × over target in the final 8 s, flashes 5 s after termination (not a kill indication) | yes | high | 2 |
| NCTR colours | Unknown white square, Friendly green circle, Suspect yellow square, Hostile red triangle | yes | high | 2 |
| TOI data (top of MFD) | Aspect in tens of degrees + L/R (e.g. "9R", "14L"), magnetic ground track, KCAS, closure (kt); CATA intercept cue | yes | high | 2 |
| HUD | TD box (solid = FCR, dotted = TGP); slant range "F021.2" (nm, tenths); TLL/TLA when off-HUD; Missile Diamond over TD box (SLAVE) or 6° below boresight (BORE) | yes | high | 2 |
| ASEC / ASC | ASE circle grows as range closes below ROPT (max at RPI) and shrinks below 50 % RTR; aspect caret on the circle (top = 180° hot) | yes | high | 2 |
| DLZ ranges | RAERO (assumes 40° loft), ROPT (20° loft), RPI (non-manoeuvring), RTR (turn & run), RMIN | yes | high | 2 |
| Poles / times | **M-pole "M"** = target range when the seeker goes active; **F-pole "F"** = at intercept (nm). Times: **"A" = s to active, "T" = s to termination**. Pre-launch and post-launch (for the MOI = missile with the longest time remaining) | yes (2026 labels) | med (label naming) | 2 |
| Missile count | HUD "4 MRM" (AIM-120), "SRM" (AIM-9), "HOB" (AIM-9X); HMCS "MRM-S" (SLAVE) / "MRM-V" (BORE) | yes | high | 2 |
| SMS | A120B / A120C; OSB for SLAVE/BORE; status RDY/SIM/REL | yes | high | 2 |

### F-16C: ALR-56M RWR

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| Coverage | 360° az, **±45° elevation** (blind above/below the fuselage) | yes | high | 2 |
| Display logic | Lethality moves the symbol inward. Search = outer; **Track = just outside the inner solid white circle, with a box**; **Missile guidance = inside the circle, with a flashing circle** | yes | high | 2 |
| Airborne | Chevron ("hat") over the symbol | yes | high | 2 |
| Priority | Diamond on the top threat (Handoff "Floating"); Handoff long press cycles, release = "Latched" | yes | high | 2 |
| Capacity | OPEN: 16 threats; PRIORITY: 5 | yes | high | 2 |
| Panel cues | LAUNCH button flashes "MISSILE LAUNCH"; ACT/PWR "ACTIVITY" on track or guidance; TGT SEP separates symbols for 5 s; "S" search mode, "L" low-altitude table, "U" unknown | yes | high | 2 |
| Codes | Same ED airborne code list (29, 30, 31, 15, 16, 18, 14, M2, …) and "M" for an ARH seeker (Appendix B graphics) | yes | med | 1, 2 |

### AIM-120 (DCS weapon DB, both jets)

| Topic | Fact / value | DCS-modelled? | Confidence | Source # |
|---|---|---|---|---|
| Nominal max range | AIM-120C Range_max 61 km (33 nm); AIM-120B 57 km (31 nm). Not the cockpit DLZ | yes (DB) | med | 6 |
| Loft | Loft active; loft_sin ≈ 0.5 (≈30° loft); loft off inside 15 km (8 nm) | yes (DB) | med | 6 |
| Seeker-related | D_max 16 km (8.6 nm) in the DB (probably the autonomous seeker distance); Chuck: seeker ~10 nm (18.5 km) | yes | low | 3, 6 |

---

## Display & symbology

### Hornet: Attack Radar format (normally RDDI; monochrome green, optional COLOR)
- **B-scope.** Ownship at bottom centre. Azimuth runs left–right (edges = selected scan width), range runs bottom→top, with ¼/½/¾ tick marks on the right edge.
- **Top-left:** OPR / STBY / crossed "RDY" (radar status). In SIL, the aging field becomes **ACTIVE**. Bullseye-to-TDC bearing/range also sits top-left.
- **Top-right:** TDC-assigned **diamond with a dot**. Heading, weapon name and quantity (e.g. "AC 4"), and the range scale number with ▲/▼ arrows (removed in STT) are also along the top and right edges.
- **Pushbutton legends** (ED-documented positions): PB5 = mode (RWS/TWS; box over the legend selects RWS/VS/TWS), PB9 = RAID, PB15 = NCTR. Other legends:
  - bar legend "4B 1"
  - SIL, ERASE, SET, RESET, DATA, EXP
  - azimuth "140"
  - PRF "INTL" / "MED" / "HI"
  - in TWS: HITS, AUTO / MAN / BIAS
- **Bottom:** ownship altitude, IAS/Mach, bullseye-to-ownship readout. Optional BRA (ownship-to-TDC) bottom-left.
- **Centre overlay:** horizon line and velocity vector (DCLTR1 removes them).
- **Left edge:** antenna elevation caret. A vertical **B-sweep** line marks the antenna azimuth.
- **TDC cursor:** two parallel vertical lines, with max/min altitude coverage (kft) above and below. Over a contact it shows speed on the left and altitude on the right.
- **Contacts:**
  - raw hits = solid rectangles ("bricks")
  - trackfiles = HAFU + aspect stem, rank number inside
  - L&S = star inside HAFU, with **Mach left / altitude right**
  - DT2 = diamond inside HAFU
  - AOJ targets in the "dugout" at the top edge
- **Launch zone (L&S):** vertical scale on the right with RMAX, RNE, RMIN (+ RAERO) markers and a target range caret with Vc. The ASE circle and steering dot sit centre-screen. Also shown: target altitude differential, time of flight, and the Max Aspect number (1–18).
- **Post-launch:** a small pyramid on the azimuth steering line shows seconds to active, then "A". "SCAN RAID" or "JAMMER ON" may appear at the bottom.

### Hornet: HUD (A/A, AIM-120)
- NIRD/ASE circle with range cues around it; steering dot; aspect pointer.
- TD box (diamond if hostile; hashed in MEM); **SHOOT** above it; breakaway **X** inside RMIN.
- Countdown **"23 ACT" → "15 TTG"**. Weapon label e.g. "AC 4".
- "VISUAL" with a dashed seeker circle when no track exists. L&S = box; DT2 = "X".
- ACM cues: BST 3.3° dashed circle, GACQ 20° dashed circle, VACQ two dashed vertical lines, WACQ small rectangle in the lower right.

### Hornet: ALR-67 azimuth indicator / EW page
- Four concentric areas, outer to inner: **critical, lethal, non-lethal**, then a status circle (I/II/III sectors). 30° ticks on the outer ring.
- Symbols are alphanumeric codes ("29", "30", "15", "M"), with an airborne modifier above the code.
- Warning panel lights on the right of the instrument panel: **AI, CW, SAM, AAA, DISP, GO/NO GO**. EW symbols can be repeated on the HUD (HUD option on the EW page).

### Viper: FCR A-A format (colour MFD)
- **OSB 1** (top left) = mode "CRM" / "ACM". **OSB 2** = sub-mode "RWS" / "VSR" / "TWS" (ACM: "20" / "60" / "SLEW" / "BORE"). **OSB 3** = "NORM" / "EXP". **OSB 4** = "OVRD". **OSB 5** = "CNTL".
- **Left column, top to bottom:** OSB 20 ▲ / range number / OSB 19 ▼, **OSB 18 "A6"**, **OSB 17 "4B"**.
- **Bottom OSBs 12–14:** format selection (FCR / SMS / HSD …).
- **Scales:** antenna elevation scale ("sideways T") on the left edge, antenna azimuth scale ("T") on the bottom edge, ±60°, 10° minor ticks. SAM track indicators appear on both scales.
- **Scan and cursor:** two vertical azimuth scan limit lines. Acquisition cursor = two short vertical bars with an upper altitude (blue) and lower altitude (white) to its right.
- **Other symbols:** steerpoint = white "wedding cake"; bullseye symbol with a pointer (range inside, bearing below) bottom-left; cursor bullseye bearing/range readout.
- **Top data line (TOI):** aspect ("9R"), track, KCAS, closure. CATA cue at the TOI range.
- **Targets:** search target with hot/cold tick; track "tank" with nose line and altitude; system track; bug = circle; AMRAAM tail / ×; NCTR/datalink colours (white, green, yellow, red, blue for flight members). Jamming = yellow chevron pair on the top edge.
- **DLZ:** vertical linear missile scale on the right (RAERO / ROPT / RPI / RTR / RMIN, target caret with closure). Below it: "M xx" / "F xx" pole ranges and "A xx" / "T xx" times.

### Viper: HUD (MRM)
- ASEC circle + ASC dot; missile diamond on a solid TD box; "4 MRM"; slant range "F021.2".
- Linear missile scale on the right.
- Missile reticle for BORE launch. ACM: "NO RAD", radar bore cross (BORE), fuselage reference line (10×60), slewable bore cross + search cue with altitudes (SLEW).

### Viper: ALR-56M threat azimuth indicator
- Round scope with a solid white inner circle.
- Search symbols on the outer ring; tracking symbols just outside the circle with a **box**; missile guidance inside the circle with a **flashing circle**.
- Airborne **chevron** over the code; **diamond** on the priority threat; "S" / "L" in the centre.
- Prime panel buttons: HANDOFF, MODE (OPEN / PRIORITY), LAUNCH ("MISSILE LAUNCH"), TGT SEP, UNKNOWN ("U"), SYS TEST.

---

## Controls

### Hornet (DCS control names; default keyboard)
| Action | HOTAS function (DCS controls menu name) | Default key |
|---|---|---|
| Assign TDC to right DDI / AACQ / STT the L&S (TWS) | Sensor Control Switch - Right | RAlt+/ |
| Assign TDC left DDI / STT on LDDI radar; ACM: WACQ | Sensor Control Switch - Left | RAlt+, (the manual prints LAlt+,) |
| ACM entry + BST; NAV/AG: TDC to HUD | Sensor Control Switch - Fwd | RAlt+; |
| TDC to AMPCD/SA; ACM: VACQ | Sensor Control Switch - Aft | RAlt+. |
| Slew cursor | Throttle Designator Controller - Up/Down/LEFT/RIGHT | ; . , / |
| Designate (L&S/DT2), hold >1 s = SPOT | Throttle Designator Controller - DEPRESS | Enter |
| Undesignate / step L&S / swap L&S-DT2 / exit ACM | Undesignate/Nose Wheel Steer Switch | S |
| AIM-9 seeker cage/uncage; AIM-7: STT on L&S; WACQ uncage is via TDC | Cage/Uncage Button | C |
| RAID / SCAN RAID | RAID/FLIR FOV Select Button | I |
| Antenna elevation | Radar Elevation Control - Up/Down | = / - |
| Weapon select AIM-7 / AIM-9 / Gun / AIM-120 | Select Sparrow / Select Sidewinder / Select Gun / Select AMRAAM | LShift+W / LShift+S / LShift+X / LShift+D |
| Fire A/A missiles and gun | Trigger (gun trigger) | Space |
| A/G weapons | Weapon Release Button | RAlt+Space |
| Countermeasures | Dispense Switch - Forward(CHAFF)/Center(OFF); Dispense Switch - Aft(FLARE)/Center(OFF) | E / D |
| Master Arm | Master Arm Switch - ARM/SAFE | M |

### Viper (DCS control names; default keyboard)
| Action | HOTAS function | Default key |
|---|---|---|
| TMS Up: RWS→SAM / SAM or VSR→STT / TWS upgrade/bug / ACM BORE; hold = Spotlight | Target Management Switch - Up | RCtrl+Up |
| TMS Right: TWS upgrade-all + bug closest / step bug; SAM/DT SAM step bug; ACM 30×20; **hold 1 s = TWS ↔ RWS/VSR, or TWS↔SAM with a bug** | Target Management Switch - Right | RCtrl+Right |
| TMS Aft: reject bug / downgrade / purge / back to RWS; STT→previous; ACM reject, NO RAD, 10×60 | Target Management Switch - Down | RCtrl+Down |
| TMS Left: IFF scan interrogate (short); NCTR / LOS interrogate (long) | Target Management Switch - Left | RCtrl+Left |
| SOI to HUD / to MFD / swap MFDs | Display Management Switch - Up/Down | RAlt+; / RAlt+. |
| Cycle MFD formats | Display Management Switch - Left/Right | RAlt+, / RAlt+/ |
| Slew cursor / ACM SLEW | RDR CURSOR Switch - Up/Down/Left/Right | ; . , / |
| Enable (context) | ENABLE Switch - Depress | Enter |
| Antenna elevation | ANT ELEV Knob - CW/CCW | = / - |
| Missile step (short = station, long = type) | NWS A/R DISC MSL STEP Button | S |
| Uncage AIM-9 | UNCAGE Switch | C |
| Missile Override / Dogfight | DOGFIGHT/Missile Override Switch - MISSILE OVERRIDE/CENTER; - DOGFIGHT/CENTER | 4 / 3 |
| Fire A/A missiles | WPN REL Button - Depress (hold) | RAlt+Space |
| FCR EXP | Expand/FOV button | (no default found) |
| CMS Fwd / Left / Right / Aft | Countermeasures Management Switch: Fwd = Manual Program 1–4 (PRGM knob); Left = Manual Program 6; Right = ECM off / revoke AUTO; Aft = 1× Auto program + ECM (SEMI) or consent (AUTO) | (no default found) |
| Manual Program 5 | CHAFF/FLARE Dispense button (left cockpit wall) | (no default found) |

---

## Procedures

### Hornet: BVR AIM-120, TWS multi-target
1. RADAR knob OPR. Master Arm ARM [M]. Weapon Select Right, AMRAAM [LShift+D] (auto A/A master mode). Check the SMS page for "AC"/"AB" and set target SIZE and RCS.
2. Put ATTK RDR on the RDDI. **Sensor Control Switch Right** assigns the TDC (diamond appears top-right).
3. **Search:** 40–80 nm range, 140° or 80° azimuth, 2–4 bars, INTL PRF (HI for long-range hot targets). Set antenna elevation [=]/[-] so the altitude numbers at the TDC cover the expected target altitude. Use RWS + LTWS for SA; try VS for long-range nose-on detection.
4. **Build tracks:** TDC over the mode legend → select **TWS** (PB5). Choose a combination: 2B/80°, 4B/40°, or 6B/20°. Start in MAN centering and slew to the group. Box HITS if you want raw hits. Use **RAID [I]** or EXP to split formations.
5. **Designate:** check the automatic L&S (star). TDC over a second track + **TDC depress** makes it DT2 (diamond). Switch to AUTO centering to keep the scan on the L&S (TDC-depress on empty space gives BIAS).
6. **Launch:** put the steering dot in the ASE circle. Inside RMAX, SHOOT is solid; inside RNE it flashes. Press the **Trigger [Space]**. Call "Fox 3".
7. **Next target:** press **Undesignate [S]** (swaps DT2 to L&S), or TDC-designate the next track. Re-steer and fire again. Each missile shows a fly-out marker with its countdown.
8. **Support:** stay in TWS (**do not** bump the SCS toward the radar DDI, which STTs the L&S and drops the others). Keep the tracks inside the scan; the steering dot flashes near the gimbal limits (15° az, 5° el). Crank toward the limit. Watch the HUD "xx ACT" count to 0, then "TTG" (the radar format shows "A").
9. **Defend** after pitbull, or earlier if targeted. Watch the ALR-67: the AI light means lock; a critical-band flashing symbol with the launch tone, or an "M" symbol, means a missile. Dispense with the Dispense switch (Aft [D] = selected MAN program, Fwd [E] = program 5 or S/A consent). ASPJ to XMIT only when already detected, because of HOJ risk.

### Hornet: close-in auto-acquisition
1. Weapon Select Aft (GACQ, gun) or SCS Fwd (BST).
2. In ACM, the SCS selects the pattern: Fwd = BST, Aft = VACQ, Left = WACQ (TDC depress uncages/slews WACQ).
3. The radar auto-locks the first target inside 5–10 nm. Undesignate returns to search.

### Viper: BVR AIM-120, TWS multi-target
1. DOGFIGHT switch to MSL Override [4] (or ICP A-A). SMS: AAM, **A120C**, **SLAVE**, Master Arm, verify **RDY**.
2. FCR on an MFD. **DMS Aft** makes the FCR the SOI.
3. **Search:** CRM RWS, or **VSR** for long-range hot targets. A6/4B for a wide picture (8 s frame) or A3/2B toward a known group (2 s). Use ANT ELEV so the cursor altitudes bracket the target. Hold **TMS Up** for a Spotlight if the target is faint.
4. **Build tracks:** hold **TMS Right** 1 s to enter TWS. Wait for search targets to become "tank" tracks (several frames).
5. **Shoot list:** cursor over each intended track + **TMS Up** upgrades it to a System Track. Or press **TMS Right** once to upgrade all and bug the closest. Bug the first target: TMS Up on it, or TMS Right to step. The radar goes to A2/3B around the bug.
6. **Launch:** centre the ASC in the ASEC. Launch below RPI (below RTR against a manoeuvring target), or loft 40° at RAERO / 20° at ROPT. Press and hold **WPN REL [RAlt+Space]**.
7. **Next target:** a short **TMS Right** steps the bug to the next System Track. Re-steer and fire. Repeat, up to 6 simultaneous missiles.
8. **Support:** stay in TWS (**TMS Up on the bug = STT**, which loses the other tracks). Keep the targets in the scan. Watch the DLZ "A xx" countdown for the missile of interest and the tail on each target symbol flashing when that missile goes active. The × appears in the last 8 s.
9. **Defend:** on the RWR, a boxed symbol (track) or a flashing circle inside the ring (guidance) + **MISSILE LAUNCH** means you are engaged. **CMS Fwd** = Manual 1–4, **CMS Left** = Manual 6, **CMS Aft** = auto program / ECM. Remember the ±45° RWR elevation blind zone when manoeuvring hard.

### Viper: two-target option (DT SAM/DTT)
1. In RWS, **TMS Up** on target 1 enters SAM (A3). **TMS Up** on target 2 enters DT SAM.
2. Short **TMS Right** swaps the primary target. Shoot, swap, shoot.
3. Inside 10 nm the radar goes to DTT automatically; inside 3 nm it goes to STT on the closest target.

### Viper: close-in
1. DOGFIGHT outboard [3] enters ACM 30×20 NO RAD.
2. Pick the pattern with TMS: Right = 30×20, Aft = 10×60, Up = BORE (Up again = HMCS cue), or the cursor for SLEW.
3. The radar auto-locks (STT, "Lock" voice). TMS Aft rejects the lock and returns to NO RAD.

---

## Uncertain / conflicting

- **Player-jet detection ranges:** the DCS radar models for these modules are compiled and unpublished. The datamine values (APG-73 76 km/41 nm, APG-68 68.4 km/37 nm head-on) belong to the AI/FC3 sensor DB and a reference RCS. Candidate trainer values: Hornet and Viper detect a fighter-size head-on target at roughly 35–45 nm (65–85 km) at altitude. Confidence **low**.
- **Hornet ALR-67 ring order:** ED's 2024 guide and Heatblur's F-14 ALR-67 documentation both put the **critical band outermost**. Chuck's guide (Dec 2025) says the inner band is critical. Using ED is recommended; confidence **med**.
- **Hornet airborne RWR modifier:** the shape is only in ED graphics. Community sources say a "hat"/chevron above the code (some describe a "gull"). Chuck's list also mentions a house = ground, a lower bar = naval, and a lower arc = emitter locking you. Confidence **low–med**.
- **Hornet AIM-120 radar defaults:** 80° (HOTAS section) vs 140° + 4 s aging (AIM-120 section) of the same ED guide.
- **Hornet TWS capacity:** ED says 10 trackfiles; one third-party guide snippet says 12. Use 10.
- **Hornet "LOST" cue:** could not verify a DCS "LOST" legend for a missile whose trackfile is lost (the ED forum was unreachable, 403). Candidate: the countdown freezes or disappears when the track drops. Confidence **low**.
- **Hornet simultaneous AMRAAM limit:** ED's guide does not state it. Candidate: limited only by loadout and the 10 trackfiles. Confidence **low–med**.
- **Viper DLZ label names:** the Aug 2026 ED guide uses "M-Pole (M)" and "F-Pole (F)", plus times "A"/"T". Older guides and the community call the first one "A-pole". Which labels a given DCS build draws may depend on the patch. The DLZ items (RAERO/ROPT/RPI/RTR/RMIN) were documented in both.
- **Viper VSR and DT SAM/DTT availability dates:** these are documented in the Mar 2026 FCR revision. The patch that added VSR could not be pinned down. Treat them as present in current (2026) DCS.
- **Viper default keys:** no default keyboard binding was found for CMS, the gun trigger, Expand/FOV or the CHAFF/FLARE button. The data comes from a Nov 2023 "clean profile" listing defaults, so these may be unbound by default.
- **Hornet SCS-Left key:** the manual prints LAlt+,; the binding data says RAlt+,.
- **Viper FCR base symbol colours** (search/track targets): not stated in the ED text beyond the NCTR/datalink colours and the altitude colours. Candidate: white/green symbols, with coloured sovereignty when datalink- or NCTR-correlated. Confidence **low**.
- **Viper RWR airborne codes:** the ED appendix is graphical. They are assumed to match the Hornet list (29 covers MiG-29, Su-27, Su-33 and J-11; 30 = Su-30; M2; and so on). Confidence **med**.
- **AMRAAM pitbull distance in DCS:** the datamine lists D_max = 16 km (8.6 nm); Chuck says about 10 nm. The exact meaning of D_max was not verified. Confidence **low**.
- **Real-world vs DCS:** the real APG-73/APG-68 details (e.g. real F-16 TWS track counts, real ALR-67 codes) are not asserted here beyond what the ED manuals present. The ED manuals are based on real-world documentation, but ED marks some items N/I (Hornet speed gate WIDE/ECCM "coming later", AZ/EL CIT functions, Viper CNTL items).

---

## Sources

1. Eagle Dynamics, *DCS F/A-18C Hornet Early Access Guide* (EN), "Updated 24 March 2024", pp. 71–75 (HOTAS), 157–185 (A/A radar), 209–212 (HAFU), 288–297 (AIM-120), 407–422 (EW/ALR-67/appendix). https://www.digitalcombatsimulator.com/upload/iblock/ea9/lxf69u2uk1fhqq7ndb55z9egzabe8hdg/DCS%20FA-18C%20Early%20Access%20Guide%20EN.pdf (landing page: https://www.digitalcombatsimulator.com/en/downloads/documentation/dcs-hornet_early_access_guide_en/)
2. Eagle Dynamics, *DCS F-16C Viper Early Access Guide* (EN), "Updated 16 August 2026" (FCR chapter revised 21 Mar 2026; A/A weapons revised 12 Aug 2026), pp. 83–85 (HOTAS), 374–431 (FCR), 590–607 (AIM-120), 693–708 (RWR/CMDS), 749–755 (appendices). https://www.digitalcombatsimulator.com/upload/iblock/e78/33zl8132hi71d3tv0194vvkzpzl3mrr6/DCS%20F-16C%20Early%20Access%20Guide%20EN.pdf (landing page: https://www.digitalcombatsimulator.com/en/downloads/documentation/dcs-viper_early_access_manual_en/)
3. Chuck's Guides, *DCS F/A-18C Hornet Guide* (PDF dated Dec 2025), Part 9 (VS mode), Part 10 (AIM-7/AIM-120 symbology), Part 11 (RWR). https://assets.chucksguides.com/pdf/DCS%20FA-18C%20Hornet%20Guide.pdf
4. DCS Lua datamine, AN/APG-73 sensor DB. https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/db/Sensors/Sensor/ANAPG-73.lua
5. DCS Lua datamine, AN/APG-68 sensor DB. https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/db/Sensors/Sensor/ANAPG-68.lua
6. DCS Lua datamine, AIM-120C and AIM-120B weapon definitions. https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/weapons_table/weapons/missiles/AIM_120C.lua and https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/weapons_table/weapons/missiles/AIM_120.lua
7. JoyPro "keyboard clean profile" (lists DCS default keyboard binds), FA-18C_hornet (Nov 2023). https://github.com/Holdi601/JoystickProfiler/blob/master/JoyPro/JoyPro/KeyboardCleanProfile/DCS/FA-18C_hornet.cf
8. JoyPro "keyboard clean profile", F-16C_50 (Nov 2023). https://github.com/Holdi601/JoystickProfiler/blob/master/JoyPro/JoyPro/KeyboardCleanProfile/DCS/F-16C_50.cf
9. Heatblur, *DCS F-14 Manual – ALR-67* (band order, "M" symbol). https://f14.manuals.heatblur.se/f14ab/systems/defensive_systems/rwr/alr_67.html
10. Hoggit wiki, RWR. https://wiki.hoggitworld.com/view/RWR
11. SimTuts, F/A-18C radar modes (secondary; "12 trackfiles" claim). https://simtuts.com/guides/fa18-attack-radar-air-to-air
12. ED Forums, "[MISSING TRACK FILE] TWS missile HUD countdown" (search snippet only; page returned 403). https://forum.dcs.world/topic/223978-missing-track-file-tws-missile-hud-countdown
13. ED Forums, "RWR symbol" / "RWR Symbology" threads (search snippets only; pages returned 403). https://forum.dcs.world/topic/199266-rwr-symbol/ , https://forum.dcs.world/topic/182888-rwr-symbology/
