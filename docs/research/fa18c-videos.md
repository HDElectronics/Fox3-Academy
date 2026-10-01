# F/A-18C: notes from the Grim Reapers Hornet playlist

Researched 2026-10-01 for the live F/A-18C copilot (fuel and limits watch, field and carrier landing coach,
live checklists, threat helper). Game level only (AGENTS.md rule 1): procedures, cues and techniques as the
videos show them in DCS. Nothing here is weapon engineering.

**Source status: secondary.** ED's F/A-18C manual is the primary source and is covered in other research
files (`flight-ops.md`, `hornet-viper.md`, `bvr-mechanics.md`). Use these notes for what to coach and which
mistakes to watch for. Do not use them to set numbers unless the ED manual agrees. Each item names its video
as `[Vn]` (playlist order). Tags:

- **(opinion)**: the creator's own technique, preference or claim, not a DCS fact.
- **(dated)**: the video says a feature was missing, buggy or "early access" when it was recorded. Recheck in
  the current build.
- **(conflict)**: disagrees with the ED manual, another video or another research file. The ED value wins.

**Access.** The playlist page and all 117 watch pages were read: titles, order, length, publish date,
description and chapter list. YouTube's auto-generated English captions were read for the 27 videos in
scope (V4, 6, 7, 10, 11, 12, 14 to 23, 34, 53, 54, 97, 98, 99, 105, 106, 107, 111, 117). The captions are
machine-made and garble cockpit terms (for example "IV" for IFEI, "o box" for OBOGS). Everything below is
paraphrased; nothing is transcribed. Other videos were reviewed from title, description and chapters only.
Dates are YouTube publish dates. The descriptions give no DCS version numbers, so the date is the only
version marker. Most videos are from 2018 to 2021; several say on screen that the Hornet was in early access.

Playlist: "Tutorials: FA-18C Hornet", owner Grim Reapers (@grimreapers), 117 videos, last updated
2026-09-09, https://www.youtube.com/playlist?list=PL3kOAM2N1YJc5x-z99XdX-XxWg4I0Of-a . The description
calls it a structured course to work through in order. V117 is presented by "Matrix"; the rest are
presented by the channel's main host.

## 1. Playlist

All videos are from the Grim Reapers channel. "DCS WORLD" / "DCS" title suffixes are dropped.

| Order | Title | Channel | Date | Length | Topic | URL |
|---|---|---|---|---|---|---|
| 1 | FA-18C Hornet: Setting HOTAS Joystick Controls | Grim Reapers | 2019-02-16 | 12:33 | Controls | https://youtu.be/Kur-pF7XNLM |
| 2 | FA-18C Hornet: Cockpit Familiarization Tutorial | Grim Reapers | 2020-12-27 | 28:44 | Cockpit | https://youtu.be/YRLTp9aHQ4Q |
| 3 | FA-18C Hornet: TDC Sensor Screen Assignment (SOI) Tutorial | Grim Reapers | 2019-12-22 | 2:35 | Cockpit (SOI) | https://youtu.be/0RC7kvvTstE |
| 4 | FA-18C Hornet: FPAS DDI Page Tutorial | Grim Reapers | 2019-01-07 | 4:43 | Fuel (FPAS) | https://youtu.be/Ajz5AfEqjQI |
| 5 | FA-18C Hornet: JHMCS HMD Format DDI Page Tutorial | Grim Reapers | 2020-08-04 | 3:16 | Cockpit (HMD page) | https://youtu.be/XdrHZybxaKg |
| 6 | FA-18C Hornet: FCS DDI Page Tutorial | Grim Reapers | 2020-08-07 | 5:27 | FCS page, G-limit | https://youtu.be/gqlTo739Rz0 |
| 7 | FA-18C Hornet: FUEL, ADI, ENG & CHECKLIST DDI Pages Tutorial | Grim Reapers | 2020-08-05 | 7:42 | Fuel, ADI, ENG, checklist pages | https://youtu.be/IwGfMd2CUWI |
| 8 | FA-18C Hornet: BIT Test DDI Page Tutorial | Grim Reapers | 2020-08-08 | 6:17 | BIT page | https://youtu.be/i9WDm29ZfKw |
| 9 | FA-18C Hornet: HUD Symbology & Modes Tutorial | Grim Reapers | 2020-01-02 | 6:05 | HUD | https://youtu.be/SR-blHYxhko |
| 10 | FA-18C Hornet: Fast Cold Start, Alignment & Taxi Tutorial | Grim Reapers | 2019-12-27 | 4:24 | Cold start (field) | https://youtu.be/RWD8GqRLRcQ |
| 11 | FA-18C Hornet: Carrier Fast Cold Start & Alignment Tutorial | Grim Reapers | 2020-01-03 | 4:13 | Cold start (carrier) | https://youtu.be/dABdsCQUJyA |
| 12 | FA-18C Hornet: (STD HDG & IFA) Stored Heading & In-Flight Alignment | Grim Reapers | 2020-08-20 | 5:35 | INS alignment | https://youtu.be/mG7x39YOzro |
| 13 | FA-18C Hornet: JHMCS HMD Alignment Tutorial | Grim Reapers | 2021-07-23 | 2:10 | JHMCS alignment | https://youtu.be/shGFtQPqG9I |
| 14 | FA-18C Hornet: Shut Down Procedure | Grim Reapers | 2018-07-04 | 3:41 | Shutdown | https://youtu.be/OJfcVmfldOk |
| 15 | FA-18C: Airfield Takeoff & VFR Landing Tutorial | Grim Reapers | 2019-02-19 | 8:23 | Takeoff, field landing | https://youtu.be/uoR584xBZ6o |
| 16 | FA-18C Hornet: Carrier Trim, Taxi, Hookup & Launch Tutorial | Grim Reapers | 2019-12-27 | 3:47 | Carrier taxi, launch | https://youtu.be/p_ZwZw-uYcA |
| 17 | Supercarrier: FA-18C Taxi, Hookup, Launch & Departure Tutorial | Grim Reapers | 2020-05-14 | 8:57 | Carrier taxi, launch, departure | https://youtu.be/w99DKFWIPlk |
| 18 | FA-18C Hornet: Carrier CASE I (1) Approach & Landing Tutorial | Grim Reapers | 2018-06-11 | 22:31 | Case I | https://youtu.be/MnQYhNI5j9o |
| 19 | Supercarrier: CASE I (1) Approach & Recovery Landing Tutorial | Grim Reapers | 2020-05-14 | 14:49 | Case I (Supercarrier) | https://youtu.be/QN418NgEBW8 |
| 20 | Supercarrier: Case III (3) Approach & Recovery Landing Tutorial | Grim Reapers | 2020-05-19 | 21:08 | Case III | https://youtu.be/6xG3RS3HtQs |
| 21 | FA-18C Hornet: TACAN & ICLS(ILS) IFR Landing Tutorial | Grim Reapers | 2019-01-28 | 21:40 | TACAN, ICLS approach | https://youtu.be/r2QV8MDS59o |
| 22 | FA-18C Hornet: Airfield TACAN IFR Fog Landing Tutorial | Grim Reapers | 2019-01-05 | 12:05 | Field IFR approach (TACAN) | https://youtu.be/EfRqHLPDqHw |
| 23 | FA-18C Hornet: ACLS Automatic Carrier Landing System Tutorial | Grim Reapers | 2023-08-13 | 15:20 | ACLS, Case III | https://youtu.be/G4W4ZAgSqJ0 |
| 24 | FA-18C Hornet: INS/HSI Navigation & Waypoint Manipulation Tutorial | Grim Reapers | 2020-01-08 | 16:54 | Navigation | https://youtu.be/aPGa6DJg0Ec |
| 25 | FA-18C Hornet: TACAN & Radial Intercept Navigation Tutorial | Grim Reapers | 2019-12-31 | 6:29 | Navigation | https://youtu.be/C-vpxgHH5G4 |
| 26 | F-14B, F-16C, JF-17 & FA-18C: TACAN Yardstick Tutorial | Grim Reapers | 2020-07-12 | 2:41 | Navigation | https://youtu.be/OQYmjzYE7bw |
| 27 | FA-18C Hornet: ADF Navigation Tutorial | Grim Reapers | 2019-01-27 | 9:38 | Navigation | https://youtu.be/yO3nmTTxTFo |
| 28 | FA-18C Hornet: ToT Time On Target Navigation Tutorial | Grim Reapers | 2019-09-02 | 5:49 | Navigation | https://youtu.be/ZKwrlgHl4N4 |
| 29 | FA-18C Hornet: Basic Initial IFF Functionality | Grim Reapers | 2018-06-23 | 1:23 | IFF | https://youtu.be/xv2wF6Qy5eU |
| 30 | FA-18C Hornet: Mark Points For Navigation & Rippling Weapons Tutorial | Grim Reapers | 2020-09-24 | 6:09 | Navigation, markpoints | https://youtu.be/wUoU5bAdabw |
| 31 | FA-18C Hornet: SA Page, Datalink & IFF Tutorial | Grim Reapers | 2019-06-06 | 58:06 | SA page, datalink, IFF | https://youtu.be/GwEnRetJSP0 |
| 32 | FA-18C Hornet: *IMPORTANT NEW* Air To Air/Ground Datalink Features Tutorial | Grim Reapers | 2023-10-27 | 17:33 | Datalink | https://youtu.be/37EeAYS4I3w |
| 33 | FA-18C Hornet: TXDSG Target Assignment Function Tutorial | Grim Reapers | 2021-01-29 | 4:13 | Datalink | https://youtu.be/s31oLKlhnLk |
| 34 | FA-18C Hornet: Air To Air BVR Radar (RWS/LTWS/TWS) Tutorial | Grim Reapers | 2019-12-19 | 32:44 | A-A radar (BVR) | https://youtu.be/J7JCI3_L0JE |
| 35 | F-16C Viper & FA-18C Hornet: VSR & VS Radar Modes Tutorial | Grim Reapers | 2023-11-02 | 7:47 | A-A radar | https://youtu.be/rx7yBqFYAWg |
| 36 | FA-18C Hornet: AZ/EL DDI Page Tutorial Vid (1 of 2) | Grim Reapers | 2020-11-06 | 10:26 | A-A radar | https://youtu.be/uj8xUtC_v8I |
| 37 | FA-18C Hornet: AZ/EL DDI Page Tutorial Vid (2 of 2) | Grim Reapers | 2020-12-19 | 4:48 | A-A radar | https://youtu.be/4x89PSKCsq4 |
| 38 | FA-18C Hornet: Using RAID Radar Modes To Beat "Res Celling" Tutorial | Grim Reapers | 2024-01-11 | 7:58 | A-A radar | https://youtu.be/gwo3DTWIXtY |
| 39 | FA-18C Hornet: MSI Track Targeting & General A-A Radar Refresher Guide | Grim Reapers | 2025-09-15 | 13:01 | A-A radar, MSI | https://youtu.be/N2utwGVuzbs |
| 40 | FA-18C Hornet: Air To Air ACM Radar Modes Tutorial | Grim Reapers | 2019-12-22 | 6:59 | A-A radar (ACM) | https://youtu.be/c_VNwg4gVHo |
| 41 | FA-18C Hornet: WACQ(Caged/Uncaged) & SPOT Radar Modes Tutorial | Grim Reapers | 2021-04-17 | 5:44 | A-A radar | https://youtu.be/bfJ7GZGKZTw |
| 42 | FA-18C Hornet: Air To Ground Radar (Basics)(With AGM-84D Harpoon) | Grim Reapers | 2020-06-06 | 7:42 | A-G radar | https://youtu.be/VULxns6OkF4 |
| 43 | FA-18C Hornet: Air To Ground Radar (EXP Modes)(With AGM-154 JSOW) | Grim Reapers | 2020-08-20 | 5:52 | A-G radar | https://youtu.be/r4FOaKynl_8 |
| 44 | FA-18C Hornet: Air To Ground (GMT & SEA Modes) Tutorial | Grim Reapers | 2021-01-29 | 4:17 | A-G radar | https://youtu.be/1XjlrQfguik |
| 45 | FA-18C Hornet: Air To Ground Radar (AGR Ranging Mode) Tutorial | Grim Reapers | 2020-09-25 | 4:10 | A-G radar | https://youtu.be/Is2YTbSb9k0 |
| 46 | FA-18C Hornet: Terrain Avoidance Radar Tutorial | Grim Reapers | 2025-08-03 | 3:54 | A-G radar | https://youtu.be/dlqjFDNJjL0 |
| 47 | FA-18C Hornet: Air To Air Gunnery (BOR/STT) Tutorial | Grim Reapers | 2019-12-28 | 5:56 | A-A gun | https://youtu.be/e2XOvXwUIpU |
| 48 | FA-18C Hornet: Air To Air Gunnery (FEDS/Training) Tutorial | Grim Reapers | 2021-01-14 | 1:29 | A-A gun | https://youtu.be/Bm9gHLgGAeg |
| 49 | FA-18C Hornet: Aim-9 Sidewinder Missile (SEEK/STT) Tutorial | Grim Reapers | 2019-12-29 | 6:21 | A-A missile | https://youtu.be/5Y850VkmNTA |
| 50 | FA-18C Hornet: JHMCS Helmet Mounted Display & AIM-9X Tutorial | Grim Reapers | 2018-11-29 | 5:49 | A-A missile, HMD | https://youtu.be/NLnT33jrJQU |
| 51 | FA-18C Hornet UPDATE: JHMCS A/G Functionality & Changes To HUD TGT Designation | Grim Reapers | 2020-11-19 | 4:19 | A-G weapons | https://youtu.be/P9sxZwjlm3o |
| 52 | FA-18C Hornet: Aim-7 Sparrow Missile (FLOOD/STT) Tutorial | Grim Reapers | 2019-12-28 | 6:50 | A-A missile | https://youtu.be/gbwtBKPGXYc |
| 53 | FA-18C Hornet: Aim-120 AMRAAM (VISUAL/STT/TWS) Tutorial | Grim Reapers | 2019-12-20 | 8:33 | A-A missile (BVR) | https://youtu.be/xtd6UOaEYwE |
| 54 | FA-18C Hornet: BVR Offensive Missile Cranking Tutorial | Grim Reapers | 2019-01-05 | 21:15 | BVR tactics (crank) | https://youtu.be/BLZaOvtn2wo |
| 55 | FA-18C Hornet: ATFLIR TGP TPOD - Air To Ground Tutorial | Grim Reapers | 2021-04-16 | 15:12 | Targeting pod | https://youtu.be/DiY9564RXZ0 |
| 56 | FA-18C Hornet: Litening TGP TPOD - Air To Ground Tutorial | Grim Reapers | 2021-04-19 | 18:25 | Targeting pod | https://youtu.be/HJRb_ofEtYQ |
| 57 | FA-18C Hornet: ATLFIR TGP TPOD - Air to Air Tutorial | Grim Reapers | 2021-04-18 | 3:14 | Targeting pod | https://youtu.be/ChsMcv46Rj4 |
| 58 | FA-18C Hornet: Litening TGP TPOD - Air To Air Tutorial | Grim Reapers | 2020-06-05 | 5:17 | Targeting pod | https://youtu.be/CQew_LtvmnI |
| 59 | FA-18C Hornet: Litening TGP TPOD - LSS & LST Tutorial | Grim Reapers | 2020-06-09 | 2:47 | Targeting pod | https://youtu.be/vvJPW-b0XA0 |
| 60 | FA-18C Hornet: Using Targeting Pod Offsets In Combat Tutorial | Grim Reapers | 2024-01-14 | 6:44 | Targeting pod | https://youtu.be/LDWJDteqWV4 |
| 61 | FA-18C Hornet: Litening vs ATFLIR - Which TPOD Is Best? | Grim Reapers | 2021-04-22 | 6:34 | Targeting pod | https://youtu.be/QGAYvzY6k8M |
| 62 | FA-18C Hornet: Air To Ground Gun & Rockets Tutorial | Grim Reapers | 2019-12-25 | 5:59 | A-G weapons | https://youtu.be/ZIQxFf_y7Ck |
| 63 | FA-18C Hornet: Unguided Bombing (AUTO, CCIP, MANUAL & Setups) Tutorial | Grim Reapers | 2019-01-28 | 18:29 | A-G weapons | https://youtu.be/wjVHHGfsjoM |
| 64 | FA-18C Hornet: Bombing On A Waypoint(Auto & CCIP) Tutorial | Grim Reapers | 2018-06-09 | 5:22 | A-G weapons | https://youtu.be/Eg27e7MP_ZU |
| 65 | FA-18C Hornet: Using Offset Aim Points To Deploy Weapons Tutorial | Grim Reapers | 2021-05-21 | 4:15 | A-G weapons | https://youtu.be/vFnO-aConYo |
| 66 | FA-18C Hornet: Snakeye High Drag Ripple Bombing Tutorial | Grim Reapers | 2018-06-18 | 6:59 | A-G weapons | https://youtu.be/QU6vk7M6Ruc |
| 67 | FA-18C Hornet: Toss/Loft Bombing Tutorial | Grim Reapers | 2019-01-28 | 7:47 | A-G weapons | https://youtu.be/GgvMMVA2Hrc |
| 68 | FA-18C Hornet: Cluster Bomb Tutorial | Grim Reapers | 2020-01-27 | 2:59 | A-G weapons | https://youtu.be/QFkm5JqKr7A |
| 69 | FA-18C Hornet: GBU-24 PAVEWAY III LGB Tutorial | Grim Reapers | 2020-12-18 | 9:37 | A-G weapons | https://youtu.be/j8-B6odVaf8 |
| 70 | FA-18C Hornet: GBU-24 Auto Lase Function Tutorial | Grim Reapers | 2021-01-29 | 2:52 | A-G weapons | https://youtu.be/LBdX4Kap4BE |
| 71 | FA-18C Hornet: GBU10/12/16 Laser Guided Bomb Tutorial | Grim Reapers | 2021-02-03 | 5:15 | A-G weapons | https://youtu.be/9eN8l-oU9B4 |
| 72 | FA-18C Hornet: GBU10/12/16 Laser Guided Bomb (without TGP/TPOD) Tutorial | Grim Reapers | 2019-08-15 | 4:08 | A-G weapons | https://youtu.be/Tfq8B7tbQ5c |
| 73 | FA-18C Hornet: ADM-141A TALD Decoy Tutorial | Grim Reapers | 2023-08-13 | 5:34 | A-G weapons | https://youtu.be/ajugCN9Y0gk |
| 74 | FA-18C Hornet: AGM-62 Walleye "Fat Albert" Tutorial | Grim Reapers | 2019-10-21 | 9:08 | A-G weapons | https://youtu.be/R5FC-oVdexA |
| 75 | FA-18C Hornet: AGM-62 Walleye II With TGP/TPOD & Waypoint Designation Tutorial | Grim Reapers | 2019-12-04 | 5:52 | A-G weapons | https://youtu.be/8k9mEF36Sek |
| 76 | FA-18C Hornet: AGM-62 Walleye Long Range Toss/Loft Tutorial | Grim Reapers | 2019-10-22 | 5:40 | A-G weapons | https://youtu.be/TIpVImvUK84 |
| 77 | FA-18C Hornet: AGM-62 Walleye For Air To Air Tutorial | Grim Reapers | 2019-10-24 | 5:47 | A-G weapons | https://youtu.be/PfwcN_WEt7U |
| 78 | FA-18C Hornet: AGM-65E Laser Guided Maverick Tutorial | Grim Reapers | 2021-02-10 | 6:10 | A-G weapons | https://youtu.be/hYTjje-owv4 |
| 79 | FA-18C Hornet & AV-8B Harrier: AGM-65E Laser Maverick Ripple Tutorial | Grim Reapers | 2020-08-08 | 6:52 | A-G weapons | https://youtu.be/nXQPevd6byA |
| 80 | FA-18C Hornet: AGM-65F Maverick Missile (SLEW/SLAVE) Tutorial | Grim Reapers | 2019-12-30 | 5:28 | A-G weapons | https://youtu.be/8lCwAXJj4nY |
| 81 | FA-18C Hornet: AGM-84D Harpoon (BOL Mode) Tutorial | Grim Reapers | 2019-08-15 | 9:41 | A-G weapons | https://youtu.be/F0cC5TxPI50 |
| 82 | FA-18C Hornet: AGM-84D Harpoon (BOL Mode) Pop-Up Now Works | Grim Reapers | 2019-10-14 | 2:15 | A-G weapons | https://youtu.be/KZJpQccxlMQ |
| 83 | FA-18C Hornet: AGM-84D Harpoon (R/BL Mode)(Without Radar) Tutorial | Grim Reapers | 2019-10-22 | 8:30 | A-G weapons | https://youtu.be/qcbeasSvmWk |
| 84 | FA-18C Hornet: AGM-84E SLAM Cruise Missile Tutorial | Grim Reapers | 2020-06-03 | 8:25 | A-G weapons | https://youtu.be/uFFpFxODpuE |
| 85 | FA-18C Hornet: AGM-84E SLAM For Air To Air Tutorial | Grim Reapers | 2020-06-15 | 8:55 | A-G weapons | https://youtu.be/wX3Wn5F4xe8 |
| 86 | FA-18C Hornet: AGM-84H SLAM-ER (PP/TOO)(Single/Ripple) Tutorial | Grim Reapers | 2021-05-21 | 15:07 | A-G weapons | https://youtu.be/nsM2Jr227ao |
| 87 | FA-18C Hornet: AGM-88C HARM (SP Mode) Tutorial | Grim Reapers | 2019-01-18 | 7:41 | A-G weapons | https://youtu.be/jKzmTkqJGXY |
| 88 | FA-18C Hornet: AGM-88C HARM (TOO Mode) Tutorial | Grim Reapers | 2019-03-13 | 6:32 | A-G weapons | https://youtu.be/XjSdYyLYVG8 |
| 89 | FA-18C Hornet: AGM-88C HARM (PB Mode) Tutorial | Grim Reapers | 2021-04-17 | 6:51 | A-G weapons | https://youtu.be/YSuIhXBBJfM |
| 90 | FA-18C Hornet: AGM-88C HARM (SP PULLBACK Mode) Tutorial | Grim Reapers | 2021-04-17 | 6:35 | A-G weapons | https://youtu.be/x53IGv2Et3Y |
| 91 | FA-18C Hornet: AGM-154 JSOW Glide Bomb Tutorial | Grim Reapers | 2019-06-15 | 12:57 | A-G weapons | https://youtu.be/Pl83e6nuSHQ |
| 92 | FA-18C Hornet: JDAM (TOO)(Via TPOD/TGP) Tutorial | Grim Reapers | 2019-12-18 | 5:23 | A-G weapons | https://youtu.be/-wmnRVNeo2Q |
| 93 | FA-18C Hornet: JDAM (TOO & PP)(Via Waypoints & Coordinates)(Rippling) Tutorial | Grim Reapers | 2019-09-05 | 11:59 | A-G weapons | https://youtu.be/ckty9GKxjjg |
| 94 | FA-18C Hornet: Rippling 8 x JDAM/JSOW (TOO)(Via TPOD/TGP) Tutorial | Grim Reapers | 2020-07-18 | 6:20 | A-G weapons | https://youtu.be/dImQAAHYTAk |
| 95 | FA-18C Hornet: Changes To JSOW/JDAM December 2019 | Grim Reapers | 2019-12-21 | 1:52 | A-G weapons | https://youtu.be/Itq_ZlBfOpo |
| 96 | FA-18C Hornet: IZLAR Guidance With JDAMs Added June 2020 | Grim Reapers | 2020-06-04 | 3:58 | A-G weapons | https://youtu.be/VAeBF6QFbPs |
| 97 | FA-18C Hornet: EW Page/RWR Radar Warning Receiver Tutorial | Grim Reapers | 2019-12-23 | 6:59 | RWR | https://youtu.be/PsZTDpFU0TE |
| 98 | FA-18C Hornet: Countermeasures (ECM, Chaff & Flares) | Grim Reapers | 2018-12-10 | 13:15 | Countermeasures, ECM | https://youtu.be/Fih6MYs6lp8 |
| 99 | FA-18C Hornet: Updated Countermeasures (ECM, Chaff & Flares) | Grim Reapers | 2021-01-28 | 6:30 | Countermeasures, ECM | https://youtu.be/rDFY71g-2rw |
| 100 | FA-18C Hornet: Radio Tutorial | Grim Reapers | 2019-01-13 | 9:08 | Radio | https://youtu.be/PHmwDlvjMAg |
| 101 | FA-18C Hornet: Air To Air Refueling Tutorial | Grim Reapers | 2018-06-10 | 7:46 | Air refuelling | https://youtu.be/FP74D4gCK_U |
| 102 | FA-18C Hornet: Int/Ext Lighting, Night Vision & Marking Tutorial | Grim Reapers | 2019-12-25 | 3:47 | Lighting | https://youtu.be/pXKVrtmFuV4 |
| 103 | FA-18C Hornet: Selective Jettison Tutorial | Grim Reapers | 2019-12-24 | 2:23 | Jettison | https://youtu.be/_WN1Z5vt7_c |
| 104 | FA-18C Hornet: ATC Auto Throttle Control - Cruise Mode Tutorial | Grim Reapers | 2019-08-14 | 3:37 | Auto throttle | https://youtu.be/1mMlg2Ite_g |
| 105 | FA-18C Hornet: ATC Auto Throttle Control - Approach Mode Tutorial | Grim Reapers | 2019-09-04 | 5:29 | Auto throttle (approach) | https://youtu.be/Lp-QqoV-3SU |
| 106 | FA-18C Hornet: Using "Pirouette Maneuver" In Combat Tutorial | Grim Reapers | 2020-07-04 | 4:18 | BFM | https://youtu.be/NkVjkBimd-c |
| 107 | FA-18C Hornet: Spin Recovery Tutorial | Grim Reapers | 2019-05-05 | 7:41 | Spin recovery | https://youtu.be/9mcSvq_uVpg |
| 108 | FA-18C Hornet: Dynamic Bullseye Tutorial/Ability | Grim Reapers | 2019-01-07 | 7:38 | Navigation (bullseye) | https://youtu.be/enzEM20Ll08 |
| 109 | FA-18C Hornet: Autopilot Modes Tutorial | Grim Reapers | 2018-06-03 | 6:46 | Autopilot | https://youtu.be/tTBr-nTedvE |
| 110 | FA-18C: Coupled Autopilot Modes Tutorial | Grim Reapers | 2021-04-16 | 7:19 | Autopilot | https://youtu.be/21q1kcqCwhQ |
| 111 | FA-18C Hornet: How To Remove G-Limiter | Grim Reapers | 2018-06-03 | 3:03 | G-limiter override | https://youtu.be/_mdeoI5vdCE |
| 112 | FA-18C Hornet: Removing Pylons Tutorial | Grim Reapers | 2018-06-23 | 1:34 | Loadout | https://youtu.be/upurkCEcwEo |
| 113 | FA-18C Hornet: Doubly Ugly Air To Ground Loadout Tutorial | Grim Reapers | 2020-05-28 | 3:22 | Loadout | https://youtu.be/FsA8LG8TFEs |
| 114 | FA-18C Hornet: IMPORTANT Changes; A/G FTT, INLAR, GRID & Link 16 HMD | Grim Reapers | 2020-11-06 | 9:30 | Avionics changes | https://youtu.be/S_2m36OP1so |
| 115 | F-16C & FA-18C: DTC Overview & Implementation As Of April 2025 | Grim Reapers | 2025-04-27 | 23:28 | DTC | https://youtu.be/mzMEkGsJiHM |
| 116 | FA-18C: Using JSOW/JDAM With A-10C Litening TGP/TPOD Tutorial | Grim Reapers | 2019-06-27 | 11:42 | A-G weapons | https://youtu.be/2dRWExI5e1Y |
| 117 | F-15E & FA-18C TACAN, ILS & ACLS IFR Landings In Zero Visibility With New Fog System | Grim Reapers | 2025-01-05 | 26:31 | IFR landing, ACLS | https://youtu.be/99DmljQuxe0 |

In scope for the copilot: V4, V6, V7 (fuel, limits, checklist pages); V10 to V14 (start, alignment,
shutdown); V15 to V23 and V117 (takeoff, field and carrier landing); V105 (approach auto throttle); V107 and
V111 (spin, G-limiter); V97 to V99 (RWR, countermeasures); V34, V53, V54 (BVR radar, AMRAAM, crank).

## 2. Topic notes

### 2.1 Cold start and alignment

**Field quick start [V10, 2019-12-27].** The creator presents a stripped-down "combat" start, not the
official procedure. Order as flown:

1. Parking brake set (handle pulled and vertical). Battery ON, both generators ON, canopy closed.
2. APU ON, wait for the green READY light.
3. Crank the right engine. At about 25 % on the IFEI, move the right throttle to IDLE.
4. At about 60 %, turn the BLEED AIR knob one full turn back to NORM. The creator calls this essential.
5. HUD, both DDIs and the AMPCD on to warm up.
6. Crank the left engine; left throttle to IDLE at about 25 %.
7. At about 60 %, set the INS knob to GND (CV on a carrier). Watch the alignment countdown on the HSI.
8. Radar to OPR. OBOGS on, flow on.
9. FCS page: clear the X boxes with FCS RESET (hold, then release).
10. Flaps AUTO, then press and hold T/O TRIM. Check the stabilators read 12 on the FCS page.
11. When the HSI shows OK, set the INS knob to NAV. Release the parking brake, uncage the standby attitude
    indicator, check ADI source AUTO, arm the seat, set lights.
12. ECM to STBY so it warms up. Dispenser ON or BYPASS. RWR power on.
13. Taxi at minimum throttle, about 20 kt at most. Hold the NWS button for high-gain steering in tight turns.

**Carrier quick start [V11, 2020-01-03].** Same flow with these deck items: INS to CV; anti-skid OFF; flaps
go to HALF later for launch; launch trim is set later from gross weight (the video says 16 to 18 degrees);
wings stay folded until hooked to the catapult; ask the ground crew to remove the chocks through the radio
menu.

**Stored heading and in-flight alignment [V12, 2020-08-20].** A normal alignment took about 8 min, STD HDG
about 90 s (both "as of August 2020", dated). After alignment, select IFA rather than NAV when GPS is
available. The HSI then shows that GPS is keeping the INS aligned. In NAV alone the jet raises an INS-only
advisory and the position drifts. During alignment the IFA label shows whether GPS is present (IFA GPS) or
not (IFA RDR). The video says GPS is missing when the jet is on the red side with satnav not forced on, or when
the mission date is before about 1986 (creator's mission-editor test).

**FCS page after start [V6, 2020-08-07].** X boxes after a cold start are normal: the FCS powers up before
hydraulic pressure, and FCS RESET clears them. An X that stays after reset, or one that appears after battle
damage or a random failure, is a real fault. The FCS page also shows control surface positions, stabilator
trim (useful for checking takeoff trim) and G-LIM, the current g limit computed from the loadout.

**Shutdown [V14, 2018-07-04].** The creator says the order is adapted from a well-known community procedure,
simplified. Order: parking brake set, seat disarmed, flaps AUTO, standby ADI caged, INS OFF, radar OFF, radios
off, exterior lights off, OBOGS off, canopy open, engines off one at a time, displays off, flaps FULL, battery
OFF. Moving the stick between the two engine cuts to bleed hydraulic pressure is the creator's own habit
(opinion).

### 2.2 Takeoff and departure

**Field takeoff [V15, 2019-02-19].**

- Flaps HALF. Check the stabilators read 12 on the FCS page.
- Hold the brakes and run up to MIL (the creator treats about 95 % RPM as MIL).
- Afterburner when heavy with bombs. MIL is fine when light (opinion).
- Release the brakes and keep the centreline with rudder.
- With takeoff trim set, the jet lifts off by itself at about 130 to 150 kt. Add a little back stick only if
  it is not airborne by about 145 kt.
- Gear up at 160 to 170 kt, then flaps AUTO and retrim.
- The squadron's circuit is 300 kt at 1000 ft AGL (opinion).
- (conflict) `flight-ops.md` (ED guide) says to rotate to 6 to 8 degrees nose-high. The copilot should coach
  the ED attitude, not "let it fly off".

**Carrier launch, pre-Supercarrier [V16, 2019-12-27].**

1. Chocks removed through the radio menu. Parking brake off, NWS on, flaps HALF.
2. Read gross weight on the CHECKLIST page and set stabilator trim from the weight table. Example in the
   video: 47.3k lb gives 17 degrees. This agrees with the ED table in `flight-ops.md` (17 degrees at
   45000 to 48000 lb).
3. Anti-skid OFF. Taxi at no more than 5 to 6 kt. NWS high gain is easy to over-steer.
4. On the catapult: launch bar down, hook up (U key), spread the wings.
5. MIL, wipe the controls, full afterburner, then hands off the stick. Check the afterburner-detent setting
   in the special options.
6. After the stroke: gear up, flaps AUTO. Clearing turn: right from cats 1 and 2, left from cats 3 and 4.
7. Stay at or below 500 ft and 350 kt until 7 nm, then climb.

**Supercarrier taxi, launch and departure [V17, 2020-05-14, pre-release preview, dated].**

- Set TACAN and ICLS from the briefing before taxiing. Doing it early saves work on the return.
- Follow the yellow-shirt director's signals: wings spread, steer, stop, launch bar down, tension. Line the
  nose gear up with the shuttle.
- On the run-up signal: full power and a control wipe. Salute (key bind or radio menu) to launch. Keep the
  stick neutral; the creator says a touch of aft stick does no harm (opinion). Then gear up and flaps AUTO.
- (conflict) The creator sets stabilator trim to 12 and says that is fine. V16 and the ED table use 16 to
  19 degrees by weight. Coach the ED table.
- Departure, as the video condenses the Supercarrier guide:

| Case | Weather in the video | Departure |
|---|---|---|
| I | Day, ceiling above 3000 ft, visibility over 5 nm | Clearing turn, then 500 ft and 300 KIAS parallel to the BRC to 7 nm, then climb on course. |
| II | Day, ceiling at least 1000 ft, visibility over 5 nm | Same to 7 nm, then turn to intercept the 10 nm arc. Stay on the arc at 500 ft and 300 kt to the departure radial, then climb on the radial. |
| III | Night or below the Case II minimums | 30 s between launches. Climb straight ahead at 300 KIAS, at least 1500 ft by 5 nm. At 7 nm intercept the 10 nm arc and climb to the departure radial. |

- (conflict) V16 says 350 kt below 500 ft, V17 says 300 KIAS at 500 ft. Use the Supercarrier guide.

### 2.3 Field landing

**VFR circuit [V15, 2019-02-19].**

- Downwind at circuit height. Extend only about 1 nm past the threshold: a long extension gives a shallow
  final, and the Hornet's naval approach should be steeper than 3 degrees.
- Configure in the base turn: first stage of flaps, gear below about 200 kt, then full flaps. Expect big trim
  changes; keep the flight path marker steady and retrim.
- End the turn at about 150 kt, then slow to on-speed.
- Fly the final on angle of attack:
  - the AoA indexer shows the "on speed" circle;
  - the HUD E-bracket brackets the flight path marker;
  - the flight path marker stays on the threshold;
  - the throttle holds the path.
- No flare: fly it into the runway at on-speed AoA.
- Speeds the creator saw: about 140 kt with 70 to 80 % fuel and no stores, about 150 kt heavy, about 120 kt
  very light. These are observations; on-speed is an AoA, and the speed follows the weight.
- (conflict) The video calls on-speed AoA "just below 8". The ED guide gives 8.1 degrees (band 7.4 to 8.8,
  `flight-ops.md`).
- The creator mentions hearsay that real pilots flare on runways. This is not a DCS procedure; ignore it.

**IFR field approach without ILS [V22, 2019-01-05].**

- The video says the Hornet's ICLS works only with carriers (dated, recheck). It uses TACAN and an HSI course
  line as the localizer.
- Steps:
  1. Tune the field TACAN (T/R, channel with X/Y).
  2. Set the course line to the runway heading in **magnetic**. The F10 map gives true; the creator
     subtracts about 6 degrees on the Caucasus map.
  3. Intercept the course outside 10 nm, then fly a home-made glide path of 300 ft per nm: 3000 ft at 10 nm,
     1500 ft at 5 nm, 600 ft at 2 nm.
- The creator uses radar altitude for this (opinion). Barometric altitude only works if it is set for the
  field.
- The TACAN station sits beside the runway, not on it, so expect a small lateral offset at the end.
- Mistakes shown: configuring late, which upsets trim and altitude; drifting off course while busy trimming;
  getting slow.

**Auto throttle, approach mode [V105, 2019-09-04, dated].**

- Engage with the ATC key once configured and inside its limits. The HUD "ATC" cue is steady when engaged,
  flashes when out of limits, and goes out when disengaged.
- ATC holds on-speed AoA. Any manual throttle movement or too much bank drops it.
- In 2019 it worked only with half flaps; the video also says the flaps must be at 27 degrees or more. Check
  the current manual before coaching ATC flap rules.

### 2.4 AoA and approach technique (common to V15, V18, V19, V21)

- Fly AoA, not airspeed. On speed means the flight path marker sits in the E-bracket, the indexer shows the
  circle and the HUD AoA lights show amber. The creator keeps the amber light, not the red or green one
  [V18].
- Before the glide slope, trim to zero stick force at on-speed. The creator's aim is pitch by trim only on
  final [V21].
- Throttle sets the glide path. Make small power changes ("on a little, off a little") [V18, V21].
- Do not flare. Select MIL (or full power) as the wheels touch, expecting a bolter [V18, V19].
- On-speed speeds seen in the videos: about 128 kt at about 30 % fuel [V21]; high 120s at about 2000 lb
  [V18]; 130 to 140 kt typical [V18]. These are observations only.

### 2.5 Case I

**Pre-Supercarrier, simplified [V18, 2018-06-11].** The creator says this is his own simplified version and
that he is not an expert (opinion throughout).

- Find the ship by TACAN T/R. Set the HSI course to the landing-deck heading: the ship's heading minus about
  10 degrees for the angled deck.
- Manual radio tuning needed a workaround for an input bug at the time (dated).
- Orbit counter-clockwise at 2000 ft.
- Pre-break items: radar altimeter warning set (the video uses 40 ft), FCS page up for AoA, anti-skid OFF,
  hook bypass to CARRIER, hook down and master arm off at 800 ft.
- Initial at 800 ft and 350 kt. Break left about 1 nm past the ship.
- Break g is about 1 % of airspeed (350 kt gives about 3.5 g). This matches the ED rule in
  `flight-ops.md`.
- Gear and full flaps as the speed comes off. Downwind at 600 ft about 1 nm abeam, 85 to 88 % RPM,
  landing checklist (gear, hook, flaps).
- Base turn at about 30 degrees of bank down to about 500 ft, on speed (8.1 degrees, E-bracket, amber).
- Bolter: about 500 to 600 ft straight ahead for 1 nm, then rejoin downwind.
- Mistakes the creator shows and names:
  - a 2 to 3 nm downwind extension;
  - coming out of the break too fast;
  - over-tight then under-tight turns to final;
  - lineup drift to the left in a crosswind;
  - not using the ball (flown visually).

**Supercarrier Case I [V19, 2020-05-14].** Condensed from the Supercarrier guide. Sequence:

1. Inside the 50 nm carrier control area, check in with marshal: callsign, position, altitude, fuel. Marshal
   gives the altimeter setting, the BRC and the case.
2. The stack is left-hand over the ship, offset to port, from 2000 ft up in 1000 ft steps. Climb and descend
   only on the sides the video shows.
3. Call "see you at 10" at 10 nm; tower takes over.
4. On the "Charlie" call, leave the stack and descend to 800 ft. Hook down by 10 nm.
5. Initial on the starboard side, at least 3 nm astern, at 800 ft.
6. Break after passing the bow: a left 180. Dirty up in the break and level at 600 ft.
7. Downwind 600 ft, 1.25 to 1.5 nm abeam, on the BRC reciprocal. Be on speed by the end of the downwind.
8. Start the base turn after passing the stern. Descend to 450 to 500 ft and glance left for the
   ship-relative picture.
9. Wings level in the groove near 3/4 nm: call the ball, or "Clara" with no ball. Fly the ball and the LSO.
10. Touch-and-go or bolter: full power at touchdown, speed brake in, climb to 600 ft, then a shallow right
    turn to parallel the BRC. A waveoff goes straight up the angled deck.

Useful extras:

- ICLS is worth tuning in Case I too, as a cross-check. The HUD also shows a ball graphic, because the real
  ball is hard to see on a monitor.
- The creator switches the altimeter to radar for the pattern (opinion).
- These numbers agree with the Case I table in `flight-ops.md`.

### 2.6 Case III, ICLS and ACLS

**Case III [V20, 2020-05-19; the video says the rules are as of 18 May 2020, dated].**

- Marshal stack: on the reciprocal of the final bearing, at 15 nm plus 1 nm per 1000 ft of holding
  altitude. Angels 6 is at 21 nm, angels 9 at 24 nm.
- The inbound call at about 50 nm gets the final bearing, the marshal radial and DME, angels and the push
  (expected approach) time. The creator writes these down; the copilot could hold them.
- Hold in left-hand racetracks timed to the push time: 1 min legs and 2 min turns. One aircraft per
  altitude, 1000 ft apart, pushes at least 60 s apart. Call "established".
- At push time call "commencing":
  1. Descend at 4000 fpm and 250 kt to 5000 ft and call "platform".
  2. Then descend at 2000 fpm to 1200 ft by 10 nm.
  3. At 10 nm configure (gear, full flaps, hook; speed brake if needed). Slow to about 150 kt, then
     on-speed by 6 nm, level at 1200 ft.
- Fly the ICLS needles. Ball call at 3/4 nm.
- The long-range laser line-up lights show amber on centreline and red or flashing colours when off.
- Mistakes shown: drifting off the radial while configuring; running low on the needles after a trim change.

**TACAN and ICLS to the carrier [V21, 2019-01-28].**

- TACAN modes: T/R gives bearing and range; RCV gives bearing only; A/A is for tankers. Channels end in X or
  Y.
- A ship's TACAN and ICLS channels come only from the briefing or the mission.
- Set every system early to cut workload near the ship.
- Intercept the final-bearing radial outside 10 nm at about 3000 ft. Lead the turn so you do not overshoot.
- Be configured, on speed and trimmed before 10 nm, then switch the HSI to ICLS.
- Nudge toward the localizer; do not chase it. Chasing it caused the creator's pilot-induced oscillations.
- The glide slope appears at about 6 to 7 nm. If it is above you, hold level and let it come down; do not
  climb to it. If it is below you, follow it down gently.
- Change to the ball at about 1 to 3/4 nm.
- The HSI course is set in whole degrees, so the radial can be about half a degree off.
- TACAN range depends on altitude and line of sight; terrain blocks it.

**ACLS [V23, 2023-08-13].**

- Mission editor: give the carrier TACAN, ICLS, Link 4 and ACLS commands, with group and unit names that
  match. Bad weather or night forces Case III.
- Cockpit setup:
  1. Radio to the carrier frequency (from the kneeboard).
  2. TACAN T/R, ICLS on, datalink (Link 4) frequency on.
  3. HSI course to the final bearing.
  4. The ACL page runs a TEST and then shows ACL 1. FAIL means a setup error.
- Sequence flown:
  1. "Established" at 6000 ft.
  2. "Commencing" at about 20 nm. The datalink then commands 250 kt and 5000 ft at 4000 fpm.
  3. "Check-in", then "platform". Then 1200 ft at 2000 fpm.
  4. At about 8 nm the command changes to 140 kt with a landing check: configure.
  5. The ICLS glide slope appears at about 6 nm. Stay level and let it come down.
- When "ACL READY" shows, engage autopilot and then CPL. Re-engage ATC. Be trimmed and near the needles
  first; the creator says coupling fails when he is untrimmed or out of position (opinion).
- A flashing couple cue means out of limits and about to drop.
- Still call the ball at 3/4 nm. Select MIL at touchdown.

**Fog and ACLS [V117, 2025-01-05, presented by Matrix].**

- The presenter's observations with the autopilot:
  - in course-coupled mode it hunted on the TACAN course, so he switched to heading mode;
  - it handled the change from 250 kt to approach AoA poorly, so monitor it;
  - in coupled ACLS it settled slightly low, and the jet caught the 4-wire.
- The lesson: monitor the glide path even when coupled. All of this is opinion and observation.

### 2.7 Fuel, bingo and checklist pages

**FPAS page [V4, 2019-01-07].**

- Shows range and endurance at the current settings down to 2000 lb remaining (down to 0 once below
  2000 lb).
- Shows the best Mach for range and for endurance at the current altitude.
- For a selected waypoint or TACAN: time to go, fuel on arrival, lb per nm.
- Shows the optimum altitude and Mach for range and for endurance. CLIMB shows the optimum climb speed.
- HOME: the creator thinks it warns when reaching the selected home point would leave 2000 lb, but says he
  had not tried it (unverified).
- Figures update live: in afterburner the fuel on arrival dropped to 0 for a field 57 nm away.

**FUEL, ADI, ENG and CHECKLIST pages [V7, 2020-08-05].**

- FUEL page: total and internal fuel, each tank (feeds, wings, externals) with level chevrons, and the
  BINGO value set on the IFEI.
- The creator saw all tanks draining together in afterburner and asked viewers to explain (opinion,
  unverified). Some fuel functions were not working in 2020 (dated).
- ADI page: its source defaults to the standby instrument and can be set to INS.
- ENG page: N1, N2, EGT, fuel flow, nozzle, oil pressure.
- CHECKLIST page:
  - a landing list (wheels, flaps, hook, anti-skid, harness, dispenser);
  - a takeoff list (controls, wings, trim, flaps, hook, harness, warning lights, NWS, seat armed);
  - gross weight, used for the launch-trim table and the landing weight;
  - stabilator position;
  - peak normal g of the last landing.

### 2.8 Limits and handling

- **G-limiter [V6, V111 2018-06-03].** G-LIM on the FCS page is the computed limit for the loadout. The HUD
  shows current g and peak g. Holding the paddle switch overrides the limiter; it returns when released. The
  DCS bind is "Autopilot/Nosewheel Steering Disengage (Paddle)". The video's limit after dropping tanks
  (about 6.4 g) is from 2018 (dated; use the ED value).
- **Spin [V107, 2019-05-05].** In a spin the DDIs show a recovery arrow; follow its stick direction. In the
  creator's tests the SPIN switch made no visible difference, and recoveries took several thousand feet
  (opinion, single test).
- **Pirouette [V106, 2020-07-04].** A slow-speed BFM trick: zoom up from about 400 kt, reduce power, full
  aft stick to high AoA, then rudder and aileron the same way to pivot onto the bandit. Recover by
  neutralising the stick. It is out of scope for the copilot except as a low-speed warning.

### 2.9 RWR and countermeasures

**RWR [V97, 2019-12-23].**

- The EW page combines the ALR-67 RWR, the ALE-47 dispenser and the ASPJ jammer. Its HUD option repeats the
  RWR symbols in the HUD.
- The display shows threat azimuth only, no range.
- Three rings: outer is non-lethal (search), middle is lethal (tracking you), inner is critical (missile in
  the air).
- A track is shown by a lock mark on the symbol and a longer tag. A launch gives an audio tone and a flashing
  symbol, and the type light changes (AI, SAM, AAA, CW).
- Panel: off/on, audio, dim, LIMIT, OFFSET to spread overlapping symbols, and display filters (the video says
  the filters did not work then, dated).
- **Key point the creator shows:** the RWR has blind zones above and below the jet. During a hard defensive
  manoeuvre the launch symbol vanished while the missile was still guiding. A dropped symbol does not mean
  the missile is defeated (the coverage is the creator's description).

**Countermeasures, current [V99, 2021-01-28].**

- DISPENSER switch: OFF, ON, or BYPASS (manual only).
- ASPJ knob: OFF, STBY (warm-up), BIT, REC (receive only), XMIT.
- ALE-47 modes:
  - MAN fires the selected program;
  - SEMI picks a program from the RWR threat and cues you to press dispense;
  - AUTO picks and fires by itself. The creator warns that AUTO wastes expendables (opinion).
- With the ASPJ in XMIT and you locked, your own radar stops searching and tracking. Go to REC to get your
  radar back.
- A jamming target is shown in the "dugout" with a J and an unknown range, until burn-through. The creator
  measured about 20 to 30 nm, depending on radar and jammer.

**Countermeasures, original [V98, 2018-12-10, largely superseded by V99].**

- Programs are edited on the ground: chaff and flare count, repeat, interval, then SAVE.
- The aft and forward dispense switch positions fire different programs. This is the 2018 behaviour (dated).
- The ECM needs a few minutes to warm up from cold.
- The creator thinks the ECM advertises your bearing to the enemy at long range, but is unsure about the
  Hornet (opinion).

### 2.10 BVR (radar, AMRAAM, crank)

**A-A radar [V34, 2019-12-19].**

- Modes: RWS, RWS with LTWS, and TWS.
  - RWS: TDC depress over a contact gives STT. STT is the L&S and can guide AIM-7 and AIM-120.
  - LTWS: hovering over a contact shows its altitude, Mach and priority. TDC depress makes it the L&S
    (star); a second one becomes DT2 (diamond); Undesignate swaps them. Only the L&S gets launch steering.
  - TWS: up to 10 track files, ranked by threat. Undesignate steps the L&S down the list. More bars means
    less azimuth. The scan centre is MAN (follows the cursor), AUTO (centres on the L&S) or BIAS.
- RAID zooms on the group and holds the beam there; EXP zooms the display but the radar keeps sweeping.
  RESET clears designations.
- Common mistake shown: in MAN, moving the cursor slews the scan away and drops your tracks. Use AUTO once
  targets are designated.
- Datalink and MSI are not covered. V39 (2025, MSI tracks) and V32 (2023, datalink) are newer; they were
  reviewed from chapters only.

**AIM-120 [V53, 2019-12-20].**

- VISUAL mode: no radar. The missile seeks the first target in its circle, within about 10 nm. There is no
  IFF, so check for friendlies.
- STT and TWS shots use these cues:
  - Rmax, Rne and Rmin on the range bar;
  - the ASE circle and steering dot;
  - a SHOOT cue that is steady inside Rmax and flashes inside Rne (as the video describes it);
  - a countdown to active, then TTG.
- Once the missile is active you may turn away.
- TWS ripple: launch, Undesignate to the next L&S, launch again. Keep supporting until the last missile is
  active.

**Offensive crank [V54, 2019-01-05; early access, before Hornet TWS; heavy on opinion].**

- The idea: offset after the merge-in so the enemy's missile must fly a big lead and bleeds energy, while
  you keep your own lock.
- The creator's recipe:
  - crank 65 to 70 degrees off, read from the HUD angle;
  - start the crank at Rne + 15 nm and turn back hard at Rne + 3 nm;
  - fire at Rne, with full afterburner and the tanks jettisoned;
  - use it only one-v-one against a capable fighter.
- His Rne figures (10 nm at 15000 ft and 6 nm at sea level, co-altitude, head-on) are from 2019 and
  predate later missile changes (dated).
- His claim that a correct crank makes you "invincible" is opinion; do not repeat it.
- (conflict) `bvr-mechanics.md` gives a ±60 degree gimbal limit, a steering dot that flashes near the limit
  on the F/A-18, and a crank of about 50 degrees. Coach the research value, not 65 to 70.

## 3. Conflicts and dated items to settle against the ED manual

| Item | Videos say | Other source | Action |
|---|---|---|---|
| Carrier launch trim | 17 degrees at 47.3k lb [V16]; 12 degrees "fine" [V17] | ED table 16/17/19 degrees by weight (`flight-ops.md`) | Use ED table |
| Field rotation | Jet flies off by itself at 130 to 150 kt [V15] | Rotate to 6 to 8 degrees nose-high (ED) | Use ED |
| On-speed AoA | "Just below 8" [V15]; 8.1 [V18] | 8.1, band 7.4 to 8.8 (ED) | Use ED |
| Departure speed | 350 kt [V16]; 300 KIAS [V17] | Supercarrier guide | Use guide |
| Crank angle | 65 to 70 degrees [V54] | About 50, gimbal ±60 (`bvr-mechanics.md`) | Use research |
| ICLS at airfields | Carrier only [V21, V22, 2019] | not checked | Recheck in current build |
| ATC approach flaps | Half flaps only, 2019 [V105] | not checked | Recheck |
| G-limit clean | About 6.4 g, 2018 [V111] | ED manual | Use ED |
| Bleed-air knob cycle | Called essential [V10, V11] | not checked | Confirm in ED start checklist |

## 4. Ideas for the copilot

Callouts and checklist items these videos stress, and mistakes a copilot could watch for. Each needs a
matching ED source before it ships with a number.

**Start and taxi**

- Parking brake set before the APU [V10, V11].
- Engine at about 25 % with its throttle still OFF: "throttle to idle" [V10, V11].
- X boxes on the FCS page after both engines are up: "FCS reset" [V6, V10].
- INS knob not in GND/CV once there is power; offer STD HDG; after alignment suggest IFA over NAV when GPS
  is available [V12].
- ECM still OFF at taxi: "ECM standby, it needs warm-up" [V10, V11, V98].
- Carrier deck: anti-skid ON, wings spread before the catapult, taxi above about 6 kt [V11, V16].
- Field taxi above about 20 kt [V10].

**Takeoff**

- Flaps not HALF, or stabilator trim not matching gross weight (CHECKLIST page weight against the ED table)
  [V15, V16].
- Catapult: stick input during the stroke: "hands off" [V16, V17].
- After launch: gear and flaps still down above the gear limit; departure above 500 ft or above the
  departure speed inside 7 nm [V16, V17].

**Landing coach**

- Speak AoA, not airspeed: "fast" or "slow" from AoA against 8.1 degrees and the E-bracket; never "add 5
  knots" [V15, V18, V21].
- Gates, Case I:
  - initial at 800 ft;
  - break g at about airspeed/100;
  - downwind at 600 ft and 1.2 to 1.5 nm abeam;
  - on speed by the end of the downwind;
  - base after the stern at 450 to 500 ft;
  - ball call near 3/4 nm.
  Flag a downwind that runs long [V18, V19].
- Gates, Case III:
  - marshal distance (15 nm + 1 nm per 1000 ft);
  - push-time countdown;
  - 4000 fpm and 250 kt to platform at 5000 ft, then 2000 fpm;
  - 1200 ft and configured at 10 nm;
  - on speed by 6 nm;
  - ball at 3/4 nm [V20, V23].
- Glide slope above you: "hold level, let it come down"; never a climb to chase it [V21, V23].
- Localizer chasing (back-and-forth roll reversals near the localizer): "small corrections" [V21].
- Landing checklist before the groove: gear, FULL flaps, hook, anti-skid OFF, hook bypass CARRIER [V7, V18].
- Field: no flare, flight path marker on the threshold [V15]. IFR field approach: "set the course in
  magnetic" and a 300 ft per nm glide path check [V22].
- At touchdown: "MIL" (bolter insurance) [V18, V19, V23].
- ATC: warn when the ATC cue flashes or drops; on ACLS, warn when the couple cue flashes [V105, V23].
- Monitor the glide path even when coupled [V117].

**Fuel**

- Bingo still 0 on the IFEI at takeoff: "set bingo" [V7].
- FPAS-style checks: fuel on arrival at home or the carrier below the reserve; afterburner use that
  collapses range [V4].
- Remember the Case III push time and BRC the pilot was given [V20].

**Limits**

- G-LIM from the loadout against current g. Note when the paddle override is held, and peak g after the
  fight [V6, V111].
- Spin: "follow the DDI arrow" [V107].

**Threat helper**

- RWR escalation: a new lethal-ring symbol means a lock; critical ring, CW light or launch tone means a
  missile. Call the bearing [V97].
- A launch symbol that vanishes while you are defending: "missile may still be tracking, you are in the RWR
  blind zone" [V97].
- Expendables count and dispenser mode. Warn when AUTO is draining chaff [V99].
- ASPJ in XMIT and your radar is not tracking: explain why, suggest REC to shoot [V99].
- BVR support: keep the L&S inside the scan and near the gimbal limit while cranking; call "active" and "TTG"
  so the pilot knows when to turn cold [V34, V53, V54].
