/**
 * [OWNER: data] Every source cited by docs/research/*.md, deduplicated (same document at a different
 * mirror counts once). Ids are stable within a build: they follow the order of LIST below, so append new
 * sources at the end of a group rather than inserting in the middle.
 *
 * SOURCE_TOPICS maps a topic (an AircraftId, MissileId, RwrId, or a mechanic such as 'notch') to the
 * source ids that back it. Use sourcesFor(topic) to get the Source objects.
 */
import type { AircraftId, MissileId, RwrId, Source } from './types';

const LIST = {
  // --- Eagle Dynamics manuals ---
  edSu27Fc3Manual: ['ED, DCS: Su-27 Flanker Flight Manual (FC3, EN, Oct 2014)', 'https://www.digitalcombatsimulator.com/upload/iblock/ed7/Su-27%20DCS%20Flaming%20Cliffs%20Flight%20Manual%20EN.pdf'],
  edSu27Manual: ['ED, DCS: Su-27 Flight Manual (EN, Steam copy)', 'https://cdn.akamai.steamstatic.com/steam/apps/250310/manuals/DCS_Su-27_Flight_Manual_EN.pdf'],
  edFc3Manual: ['ED, DCS: Flaming Cliffs 3 Flight Manual (EN, Dec 2014, 3rd Wing mirror)', 'https://server.3rd-wing.net/public/Manuels%20DCS/DCS%20FC3%20Flight%20Manual%20EN.pdf'],
  edMig29Manual: ['ED, DCS: MiG-29 Fulcrum Flight Manual (EN, Oct 2018)', 'https://www.digitalcombatsimulator.com/upload/iblock/463/DCS%20MIG-29%20Flight%20Manual%20EN.pdf'],
  edSu33Manual: ['ED, DCS: Su-33 Flight Manual (FC3, EN, Feb 2021)', 'https://www.digitalcombatsimulator.com/upload/iblock/e28/DCS_Su33_FC3_Flight_Manual_EN.pdf'],
  edF15cManual: ['ED/Belsimtek, DCS: F-15C Flaming Cliffs Flight Manual (EN, 2014)', 'https://www.digitalcombatsimulator.com/upload/iblock/1ad/F-15C%20DCS%20Flaming%20Cliffs%20Flight%20Manual%20EN.pdf'],
  edHornetGuide: ['ED, DCS F/A-18C Hornet Early Access Guide (EN, updated 24 Mar 2024)', 'https://www.digitalcombatsimulator.com/upload/iblock/ea9/lxf69u2uk1fhqq7ndb55z9egzabe8hdg/DCS%20FA-18C%20Early%20Access%20Guide%20EN.pdf'],
  edViperGuide: ['ED, DCS F-16C Viper Early Access Guide (EN, updated 16 Aug 2026)', 'https://www.digitalcombatsimulator.com/upload/iblock/e78/33zl8132hi71d3tv0194vvkzpzl3mrr6/DCS%20F-16C%20Early%20Access%20Guide%20EN.pdf'],

  // --- Eagle Dynamics news, changelogs, store ---
  edFc3Changelog: ['ED, Flaming Cliffs 3 product page changelog (Russian TWS, TWS scan 60°)', 'https://www.digitalcombatsimulator.com/en/products/planes/flaming_cliffs/?PAGEN_1=3'],
  edNews127: ['ED, DCS 1.2.7 Update 1 changelog (Feb 2014, Return To Search/NDTWS)', 'https://www.digitalcombatsimulator.com/en/news/dcs_1_2_7_update_1_is_now_available/'],
  edNewsSpo15: ['ED news, SPO-15LM development (12 Jul 2025)', 'https://www.digitalcombatsimulator.com/en/news/2025-07-12/'],
  edNewsMig29a: ['ED news, MiG-29A Fulcrum Early Access (19 Sep 2025)', 'https://www.digitalcombatsimulator.com/en/news/2025-09-19/'],
  edShopFulcrum: ['ED shop, DCS: MiG-29A Fulcrum', 'https://www.digitalcombatsimulator.com/en/shop/modules/fulcrum/'],
  edShopThunder: ['ED shop, DCS: JF-17 Thunder', 'https://www.digitalcombatsimulator.com/en/shop/modules/thunder/'],
  cl2_7_1: ['DCS 2.7.1.6430 Open Beta changelog (2021; stable 2.7.1.7139, 11 Jun 2021)', 'https://www.digitalcombatsimulator.com/en/news/changelog/openbeta/2.7.1.6430/'],
  cl2_7_14: ['DCS 2.7.14.24228 changelog (27 May 2022)', 'https://www.digitalcombatsimulator.com/en/news/changelog/release/2.7.14.24228/'],
  cl2_8_7: ['DCS 2.8.7.42718 changelog (2 Aug 2023)', 'https://www.digitalcombatsimulator.com/en/news/changelog/release/2.8.7.42718/'],
  cl2_9_1: ['DCS 2.9.1.48335 changelog (29 Nov 2023)', 'https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.1.48335/'],
  cl2_9_9: ['DCS 2.9.9 / 2.9.10 / 2.9.11 changelogs (Oct–Dec 2024, AIM-120 guidance)', 'https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.9.2280/'],
  cl2_9_13: ['DCS 2.9.13.6818 changelog (19 Feb 2025)', 'https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.13.6818/'],
  cl2_9_14: ['DCS 2.9.14.8222 changelog (19 Mar 2025)', 'https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.14.8222/'],
  cl2_9_20: ['DCS 2.9.20.15010 changelog (17 Sep 2025, R-27 overhaul)', 'https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.20.15010/'],
  cl2_9_27a: ['DCS 2.9.27.24969 changelog (12 Jun 2026, AI evasion)', 'https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.27.24969/'],
  cl2_9_27b: ['DCS 2.9.27.25183.5 changelog (23 Jun 2026, AIM-7 / R-27 seekers)', 'https://www.digitalcombatsimulator.com/en/news/changelog/release/2.9.27.25183.5/'],

  // --- Quaggles DCS Lua datamine ---
  dmRepo: ['Quaggles, DCS Lua datamine (build 2.9.29, Aug 2026)', 'https://github.com/Quaggles/dcs-lua-datamine'],
  dmSensors: ['DCS Lua datamine, sensors folder (APG-68/71/73, N-019, N-019M, N-001, KLJ-7)', 'https://github.com/Quaggles/dcs-lua-datamine/tree/master/_G/db/Sensors/Sensor'],
  dmN001: ['DCS Lua datamine, sensor N-001', 'https://github.com/Quaggles/dcs-lua-datamine/blob/master/_G/db/Sensors/Sensor/N-001.lua'],
  dmN019: ['DCS Lua datamine, sensors N-019 / N-019M', 'https://github.com/Quaggles/dcs-lua-datamine/blob/master/_G/db/Sensors/Sensor/N-019.lua'],
  dmIrst: ['DCS Lua datamine, OLS-27 / KOLS IRST', 'https://github.com/Quaggles/dcs-lua-datamine/blob/master/_G/db/Sensors/Sensor/OLS-27.lua'],
  dmApg63: ['DCS Lua datamine, sensor AN/APG-63', 'https://github.com/Quaggles/dcs-lua-datamine/blob/master/_G/db/Sensors/Sensor/ANAPG-63.lua'],
  dmApg73: ['DCS Lua datamine, sensor AN/APG-73', 'https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/db/Sensors/Sensor/ANAPG-73.lua'],
  dmApg68: ['DCS Lua datamine, sensor AN/APG-68', 'https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/db/Sensors/Sensor/ANAPG-68.lua'],
  dmKlj7: ['DCS Lua datamine, sensor KLJ-7', 'https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/db/Sensors/Sensor/KLJ-7.lua'],
  dmPlanes: ['DCS Lua datamine, aircraft units (Su-27, Su-33, J-11A, MiG-29S/A/G, F-15C…)', 'https://github.com/Quaggles/dcs-lua-datamine/tree/master/_G/db/Units/Planes/Plane'],
  dmF15c: ['DCS Lua datamine, F-15C unit', 'https://github.com/Quaggles/dcs-lua-datamine/blob/master/_G/db/Units/Planes/Plane/F-15C.lua'],
  dmRockets: ['DCS Lua datamine, legacy missiles folder (_G/rockets: R-77, R-73, AIM-9, PL-5EII, Magic II…)', 'https://github.com/Quaggles/dcs-lua-datamine/tree/master/_G/rockets'],
  dmNewMissiles: ['DCS Lua datamine, new-API missiles folder (weapons_table: R-27 family, AIM-120, AIM-7, SD-10, Super 530D)', 'https://github.com/Quaggles/dcs-lua-datamine/tree/master/_G/weapons_table/weapons/missiles'],
  dmAim120c: ['DCS Lua datamine, AIM-120C', 'https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/weapons_table/weapons/missiles/AIM_120C.lua'],
  dmAim120b: ['DCS Lua datamine, AIM-120B', 'https://github.com/Quaggles/dcs-lua-datamine/blob/master/_G/weapons_table/weapons/missiles/AIM_120.lua'],
  dmAim7: ['DCS Lua datamine, AIM-7M', 'https://github.com/Quaggles/dcs-lua-datamine/blob/master/_G/weapons_table/weapons/missiles/AIM_7.lua'],
  dmAim7mh: ['DCS Lua datamine, AIM-7MH', 'https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/weapons_table/weapons/missiles/AIM-7MH.lua'],
  dmSd10: ['DCS Lua datamine, SD-10 and PL-5EII', 'https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/rockets/SD-10.lua'],
  dmAim54: ['DCS Lua datamine, AIM-54A Mk47 / AIM-54C Mk47', 'https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/rockets/AIM_54A_Mk47.lua'],
  dmMirage: ['DCS Lua datamine, Super 530D and Magic II', 'https://raw.githubusercontent.com/Quaggles/dcs-lua-datamine/master/_G/rockets/Matra%20Super%20530D.lua'],

  // --- Lua field meanings (community copies of ED templates) ---
  luaModelData: ['Commented ModelData layout, F-22A mod AIM-120 (loft / DLZ fields)', 'https://github.com/grinnellidesigns/f-22a/blob/main/Weapons/AIM_120_C7.lua'],
  luaJas39Aim120: ['Community JAS-39 mod, AIM-120C-5 Lua (ModelData index comments)', 'https://github.com/whisky-actual/Community-JAS-39-C/blob/Master/Mods/aircraft/JAS39/Weapons/Loadouts/jas39_aim-120c5.lua'],
  luaJas39Aim9: ['Community JAS-39 mod, AIM-9M Lua (ccm_k0 comment)', 'https://github.com/whisky-actual/Community-JAS-39-C/blob/master/Mods/aircraft/JAS39/Weapons/Loadouts/jas39_aim-9m.lua'],
  luaLegacyFields: ['HighDigitSAMs mod, legacy missile field meanings (Fi_start, Fi_excort, D_max)', 'https://github.com/Auranis/HighDigitSAMs/blob/main/Mods/tech/HighDigitSAMs/Database/Weapon/9M82.lua'],
  luaExtractor: ['sourcedcs missile-sim extractor notes (field semantics)', 'https://github.com/NikNam3/sourcedcs/blob/main/tools/missile_simulation/public/js/weapon-extract.js'],

  // --- Key bindings ---
  bindsFc3Mods: ['FC3-derived keyboard default.lua in mods (F-22A, A-29B, A-6E, F-16A demo)', 'https://github.com/grinnellidesigns/f-22a/blob/main/Input/F-22A/keyboard/default.lua'],
  bindsF16aDemo: ['F-16A demo mod keyboard default.lua (FC3 command names and keys)', 'https://github.com/gyrovague/F-16A-Demo-CDMW/blob/master/Input/keyboard/default.lua'],
  joyproF15c: ['JoystickProfiler, DCS F-15C command list', 'https://github.com/Holdi601/JoystickProfiler/blob/master/JoyPro/JoyPro/DB/DCS/F-15C.html'],
  joyproHornet: ['JoystickProfiler keyboard clean profile, FA-18C_hornet (Nov 2023)', 'https://github.com/Holdi601/JoystickProfiler/blob/master/JoyPro/JoyPro/KeyboardCleanProfile/DCS/FA-18C_hornet.cf'],
  joyproViper: ['JoystickProfiler keyboard clean profile, F-16C_50 (Nov 2023)', 'https://github.com/Holdi601/JoystickProfiler/blob/master/JoyPro/JoyPro/KeyboardCleanProfile/DCS/F-16C_50.cf'],

  // --- Heatblur F-14 manual ---
  hbF14Manual: ['Heatblur, DCS F-14 manual (online)', 'https://f14.manuals.heatblur.se/'],
  hbAim54: ['Heatblur F-14 manual, AIM-54 Phoenix', 'https://github.com/Heatblur-Simulations/f-14-manual/blob/master/src/f14ab/stores/air_to_air/aim_54.md'],
  hbAim7: ['Heatblur F-14 manual, AIM-7 Sparrow', 'https://github.com/Heatblur-Simulations/f-14-manual/blob/master/src/f14ab/stores/air_to_air/aim_7.md'],
  hbRadarGeneral: ['Heatblur F-14 manual, AN/AWG-9 general operation', 'https://f14.manuals.heatblur.se/f14ab/systems/radar/general_operation.html'],
  hbRadarInterface: ['Heatblur F-14 manual, radar interface (DDD, TID)', 'https://github.com/Heatblur-Simulations/f-14-manual/blob/master/src/f14ab/systems/radar/interface.md'],
  hbAcm: ['Heatblur F-14 manual, ACM modes', 'https://github.com/Heatblur-Simulations/f-14-manual/blob/master/src/f14ab/systems/radar/acm_modes.md'],
  hbAlr67: ['Heatblur F-14 manual, AN/ALR-67', 'https://f14.manuals.heatblur.se/f14ab/systems/defensive_systems/rwr/alr_67.html'],
  hbJester: ['Heatblur F-14 manual, Jester (F-14A/B)', 'https://github.com/Heatblur-Simulations/f-14-manual/blob/master/src/f14ab/jester_iceman/overview.md'],
  hbJesterBU: ['Heatblur F-14 manual, Jester for the F-14B(U)', 'https://f14.manuals.heatblur.se/f14bu/jester_iceman/overview.html'],

  // --- Chuck's Guides ---
  chucksHornet: ["Chuck's Guides, DCS F/A-18C Hornet (Dec 2025)", 'https://assets.chucksguides.com/pdf/DCS%20FA-18C%20Hornet%20Guide.pdf'],
  chucksF14: ["Chuck's Guides, DCS F-14B Tomcat (Aug 2023)", 'https://assets.chucksguides.com/pdf/DCS%20F-14B%20Tomcat%20Guide.pdf'],
  chucksJf17: ["Chuck's Guides, DCS JF-17 Thunder (Apr 2026)", 'https://assets.chucksguides.com/pdf/DCS%20JF-17%20Thunder%20Guide.pdf'],
  chucksM2000: ["Chuck's Guides, DCS Mirage 2000C (Aug 2024)", 'https://assets.chucksguides.com/pdf/DCS%20Mirage%202000C%20Guide.pdf'],
  chucksF15e: ["Chuck's Guides, DCS F-15E Strike Eagle (May 2025)", 'https://chucksguides.com/aircraft/dcs/f-15e/'],

  // --- FlyAndWire ---
  fawSpo15: ['FlyAndWire, "MiG-29\'s SPO-15 RWR: Q&A with Eagle Dynamics" (Sep 2025)', 'https://flyandwire.com/2025/09/04/mig-29s-spo-15-rwr-qa-with-eagle-dynamics/'],
  fawR27: ['FlyAndWire, "A Look at the New R-27 Missile Family" (Sep 2025)', 'https://flyandwire.com/2025/09/24/a-look-at-the-new-r-27-missile-family/'],
  fawArh1: ['FlyAndWire, "Active Radar Homing Missiles I" (Nov 2024)', 'https://flyandwire.com/2024/11/18/active-radar-homing-missiles-i-first-launch-opportunity-ranges/'],
  fawArh2: ['FlyAndWire, "Active Radar Homing Missiles II" (Dec 2024)', 'https://flyandwire.com/2024/12/08/active-radar-homing-missiles-ii-performance-comparison/'],
  fawKlj7Search: ['FlyAndWire, "JF-17: KLJ-7 Air-to-Air Search Modes" (Oct 2024)', 'https://flyandwire.com/2024/10/23/jf-17-klj-7-air-to-air-search-modes-a-a-radar-i/'],
  fawKlj7Track: ['FlyAndWire, "JF-17: Air-to-Air Targeting & Tracking" (Nov 2024) and "VSTTWS" (Jan 2025)', 'https://flyandwire.com/2024/11/02/jf-17-air-to-air-targeting-tracking-a-a-radar-ii/'],
  fawAiGroup: ['FlyAndWire, "AI Group Improvements – DCS 2.9.7.58923" (Aug 2024)', 'https://flyandwire.com/2024/08/10/new-patch-ai-group-improvements-dcs-2-9-7-58923/'],
  fawAiThoughts: ['FlyAndWire, "A needed (and simple?) A/A AI improvement" (Jan 2025)', 'https://flyandwire.com/2025/01/10/dcs-a-needed-and-simple-a-a-ai-improvement-thoughts/'],
  fawRio: ['FlyAndWire, "Introduction to the RIO seat: antenna elevation, MLC, notching, TWS" (2019)', 'https://flyandwire.com/2019/05/24/introduction-to-the-rio-seat-antenna-elevation-mlc-countering-notching-tws/'],

  // --- ED forums and other community threads ---
  fTwsMulti: ['ED Forums, "Engaging multiple targets in TWS mode?" (Nov 2021)', 'https://forum.dcs.world/topic/287726-engaging-multiple-targets-in-tws-mode/'],
  fR77: ['ED Forums, "R-77 Usefulness?"', 'https://forum.dcs.world/topic/217069-r-77-usefulness/'],
  fSttTwsAz: ['ED Forums, "STT, TWS and Azimuth scanning zone width" (Dec 2014)', 'https://forum.dcs.world/topic/113433-stt-tws-and-azimuth-scanning-zone-width/'],
  fCyclingTws: ['ED Forums, "Cycling through TWS targets?" (2018–2020)', 'https://forum.dcs.world/topic/190143-cycling-through-tws-targets/'],
  fNoLaunchWarning: ['ED Forums, "No Missile Launch Warning when FOX3 shoot with STT" (Oct–Nov 2020)', 'https://forum.dcs.world/topic/251303-no-missile-launch-warning-when-fox3-shoot-with-stt/'],
  fTwsRwr: ['ED Forums, "TWS launches and enemy RWR behavior" (Jul 2022)', 'https://forum.dcs.world/topic/304744-tws-launches-and-enemy-rwr-behavior/'],
  fF15Radar: ['ED Forums, "F-15C radar changes" (Jun–Aug 2022)', 'https://forum.dcs.world/topic/303413-f-15c-radar-changes/'],
  fTwsCountdown: ['ED Forums, "[MISSING TRACK FILE] TWS missile HUD countdown" (snippet only)', 'https://forum.dcs.world/topic/223978-missing-track-file-tws-missile-hud-countdown'],
  fRwrSymbol: ['ED Forums, "RWR symbol" / "RWR Symbology" threads (snippets only)', 'https://forum.dcs.world/topic/199266-rwr-symbol/'],
  fTimeToActive: ['ED Forums, "Aim-120 / Time to Active" (F-16C, search summary only)', 'https://forum.dcs.world/topic/223446-aim-120-time-to-active/'],
  fNotchWidth: ['ED Forums, "Active Missile Look Down Notch Width Seems Excessive" (Sep 2021)', 'https://forum.dcs.world/topic/283107-active-missile-look-down-notch-width-seems-excessive/'],
  fNotchBug: ['ED Forums, "Radar detect target inside Notch BUG" (Dec 2021 – Jan 2022)', 'https://forum.dcs.world/topic/288302-radar-detect-target-inside-notch-bug/'],
  fF16LookDown: ['ED Forums, "Look Down Clutter Notch Question" (F-16, Jul 2022, correct as-is)', 'https://forum.dcs.world/topic/305634-look-down-clutter-notch-question/'],
  fAim120Datalink: ['ED Forums, "How is AIM-120 guided by the datalink in DCS?" (Dec 2021)', 'https://forum.dcs.world/topic/289429-how-is-aim-120-guided-by-the-datalink-in-dcs/'],
  fPitbull2014: ['ED Forums, "Can you program your pitbull range for the AIM-120?" (2014)', 'https://forum.dcs.world/topic/101273-can-you-program-your-quotpitbullquot-range-for-the-aim-120/'],
  fMig29aNotch: ['ED Forums, MiG-29A radar notch / COOP threads (2026)', 'https://forum.dcs.world/topic/391724-radar-radial-speed-limit-in-lock/'],
  mudspikeF15Tws: ['Mudspike, "DCS F-15C TWS Combat Questions" (Jun 2018)', 'https://forums.mudspike.com/t/dcs-f-15c-tws-combat-questions/6310'],
  steamF15Tws: ['Steam DCS discussions, "F-15 TWS Multiple Targets" (Jul 2021)', 'https://steamcommunity.com/app/223750/discussions/0/5190945662891130944/'],
  steamF16Pitbull: ['Steam DCS discussions, F-16 AIM-120 pitbull indication', 'https://steamcommunity.com/app/223750/discussions/0/2965020518357150156/'],
  hoggitRwr: ['Hoggit wiki, RWR', 'https://wiki.hoggitworld.com/view/RWR'],
  hoggitMissileAttack: ['Hoggit wiki, AI option Missile Attack', 'https://wiki.hoggitworld.com/view/DCS_option_missileAttack'],
  hoggitBrevity: ['Hoggit wiki, Brevity List', 'https://wiki.hoggitworld.com/view/Brevity_List'],
  bvrStrategyGuide: ['Ktulu2 et al., "DCS BVR Strategy Guide" (community, c. 2017–2018)', 'https://s3.amazonaws.com/hoggitworld-manuals/DCS+BVR+STRATEGY+GUIDE-FINAL.pdf'],
  su27CombatGuide: ['Community, "DCS FC3 Su-27 Complete Guide to Air to Air Combat" (3rd Wing)', 'https://server.3rd-wing.net/public/Bureau%2092nd/DCS%20Su27%20Combat%20Guide.pdf'],
  simtutsHornet: ['SimTuts, F/A-18C radar modes (secondary)', 'https://simtuts.com/guides/fa18-attack-radar-air-to-air'],
  stormbirdsMig29: ['Stormbirds, "Eagle Dynamics provide additional MiG-29 details" (Aug 2025)', 'https://stormbirds.blog/2025/08/23/eagle-dynamics-provide-additional-mig-29-details/'],
  stormbirdsHornet: ['Stormbirds, F/A-18C EW, AIM-120 and AIM-9X features (Aug 2018)', 'https://stormbirds.blog/2018/08/13/new-dcs-f-a-18c-update-details-ew-aim-120-and-aim-9x-features/'],
  stormbirdsApg70: ['Stormbirds, "Learn the DCS: F-15E Strike Eagle\'s APG-70 radar" (Jan 2023)', 'https://stormbirds.blog/2023/01/24/learn-the-dcs-f-15e-strike-eagles-apg-70-radar/'],
  fseliteRazbam: ['FSElite, "RAZBAM Modules Removed from Eagle Dynamics Store" (Apr 2025)', 'https://fselite.net/content/razbam-modules-removed-from-eagle-dynamics-store/'],
  sitrepEurofighter: ['DCS SITREP #11 2026, Eurofighter progress (video)', 'https://www.youtube.com/watch?v=M1Mw3_dfs2s'],
  userFilesBvr: ['DCS user files, v57th FW BVR Basics Manual (not opened by research)', 'https://www.digitalcombatsimulator.com/en/files/3308886/'],
  airgoonsAirDefences: ['Airgoons wiki, "DCS Reference: Air Defences" (Eastern systems, compiled from game files)', 'https://www.airgoons.com/w/DCS_Reference/Air_Defences/Eastern'],
  simtutsDefending: ['SimTuts, "DCS Missile Defense Guide: How to Defeat SAMs and Air-to-Air Missiles"', 'https://simtuts.com/guides/defending-against-missiles-dcs'],
  fThreatRingChart: ['ED Forums, "DCS World Mission Editor Threat Range Ring Chart" (not opened: access refused)', 'https://forum.dcs.world/topic/284720-dcs-world-mission-editor-threat-range-ring-chart/'],
} as const satisfies Record<string, readonly [string, string]>;

export type SourceKey = keyof typeof LIST;

const KEYS = Object.keys(LIST) as SourceKey[];

/** Every research source, deduplicated, ids 1..n. */
export const SOURCES: Source[] = KEYS.map((k, i) => ({ id: i + 1, title: LIST[k][0], url: LIST[k][1] }));

/** Source id for a key (stable within a build). */
export const SOURCE_ID = Object.fromEntries(KEYS.map((k, i) => [k, i + 1])) as Record<SourceKey, number>;

/** Mechanics and cross-cutting topics that have their own source lists. */
export type SourceTopic =
  | AircraftId | MissileId | RwrId
  | 'notch' | 'chaff' | 'rwr-logic' | 'datalink' | 'kinematics' | 'ai' | 'tactics' | 'binds-fc3' | 'fc3-tws' | 'sam';

const T: Record<SourceTopic, SourceKey[]> = {
  su27: ['edSu27Fc3Manual', 'edFc3Manual', 'dmN001', 'dmIrst', 'dmPlanes', 'edFc3Changelog', 'su27CombatGuide'],
  su33: ['edSu33Manual', 'edFc3Manual', 'dmN001', 'dmPlanes'],
  j11a: ['edSu27Fc3Manual', 'edFc3Manual', 'dmN001', 'dmPlanes', 'fR77'],
  mig29s: ['edMig29Manual', 'edFc3Manual', 'dmN019', 'dmPlanes', 'fTwsMulti', 'fR77'],
  f15c: ['edF15cManual', 'dmApg63', 'dmF15c', 'edFc3Changelog', 'edNews127', 'fSttTwsAz', 'fCyclingTws', 'mudspikeF15Tws', 'steamF15Tws', 'fF15Radar', 'joyproF15c', 'chucksF15e', 'stormbirdsApg70'],
  fa18c: ['edHornetGuide', 'chucksHornet', 'dmApg73', 'joyproHornet', 'stormbirdsHornet', 'simtutsHornet', 'fTwsCountdown'],
  f16c: ['edViperGuide', 'dmApg68', 'joyproViper', 'fF16LookDown', 'steamF16Pitbull'],
  f14b: ['hbF14Manual', 'hbRadarGeneral', 'hbRadarInterface', 'hbAcm', 'hbAim54', 'hbAim7', 'hbJester', 'hbJesterBU', 'chucksF14', 'fawRio'],
  jf17: ['chucksJf17', 'edShopThunder', 'fawKlj7Search', 'fawKlj7Track', 'dmKlj7', 'dmSd10'],
  m2000c: ['chucksM2000', 'dmMirage', 'fseliteRazbam'],

  r27r: ['dmNewMissiles', 'edSu27Manual', 'cl2_9_20', 'fawR27', 'cl2_9_27b'],
  r27er: ['dmNewMissiles', 'edSu27Manual', 'cl2_9_20', 'fawR27', 'cl2_9_27b'],
  r27t: ['dmNewMissiles', 'edSu27Manual', 'cl2_9_20'],
  r27et: ['dmNewMissiles', 'edSu27Manual', 'cl2_9_20'],
  r77: ['dmRockets', 'edMig29Manual', 'fawArh1', 'fawArh2', 'fR77'],
  r73: ['dmRockets', 'edSu27Fc3Manual'],
  aim120b: ['dmAim120b', 'luaModelData', 'fawArh2', 'cl2_7_1', 'cl2_7_14'],
  aim120c: ['dmAim120c', 'luaModelData', 'fawArh1', 'fawArh2', 'cl2_7_1', 'cl2_7_14', 'cl2_9_1', 'cl2_9_9', 'cl2_9_14', 'fPitbull2014', 'fTimeToActive'],
  aim7m: ['dmAim7', 'dmAim7mh', 'edF15cManual', 'cl2_9_27b'],
  aim9m: ['dmRockets', 'luaJas39Aim9'],
  aim9x: ['dmRockets'],
  aim54a: ['hbAim54', 'dmAim54', 'fawArh2'],
  aim54c: ['hbAim54', 'dmAim54', 'fawArh2'],
  sd10: ['dmSd10', 'chucksJf17', 'fawArh1'],
  pl5e: ['dmSd10', 'chucksJf17'],
  s530d: ['dmMirage', 'chucksM2000'],
  magic2: ['dmMirage', 'chucksM2000'],

  spo15: ['edFc3Manual', 'edSu27Fc3Manual', 'edMig29Manual', 'edNewsSpo15', 'fawSpo15', 'edNewsMig29a', 'edShopFulcrum', 'stormbirdsMig29'],
  alr56c: ['edF15cManual'],
  alr67: ['edHornetGuide', 'hbAlr67', 'chucksHornet', 'hoggitRwr', 'fRwrSymbol'],
  alr56m: ['edViperGuide'],
  jf17rwr: ['chucksJf17'],
  serval: ['chucksM2000'],

  notch: ['dmSensors', 'dmApg63', 'dmN001', 'dmN019', 'hbRadarGeneral', 'cl2_7_1', 'cl2_7_14', 'fNotchWidth', 'fNotchBug', 'fF16LookDown', 'fMig29aNotch'],
  chaff: ['luaJas39Aim9', 'dmRockets', 'dmAim120c', 'dmAim7mh', 'cl2_7_1', 'edF15cManual', 'fawArh2'],
  'rwr-logic': ['edF15cManual', 'fNoLaunchWarning', 'fTwsRwr', 'cl2_7_1'],
  datalink: ['edViperGuide', 'fAim120Datalink', 'cl2_8_7', 'fPitbull2014'],
  kinematics: ['edF15cManual', 'edSu27Manual', 'luaJas39Aim120', 'luaLegacyFields', 'luaExtractor', 'fawArh1', 'fawArh2'],
  ai: ['cl2_7_1', 'cl2_7_14', 'cl2_9_13', 'cl2_9_20', 'cl2_9_27a', 'fawAiGroup', 'fawAiThoughts', 'hoggitMissileAttack'],
  tactics: ['bvrStrategyGuide', 'hoggitBrevity', 'edViperGuide', 'edHornetGuide', 'userFilesBvr'],
  'binds-fc3': ['bindsFc3Mods', 'bindsF16aDemo', 'joyproF15c', 'edSu27Fc3Manual', 'edF15cManual'],
  sam: ['airgoonsAirDefences', 'simtutsDefending', 'fThreatRingChart', 'edHornetGuide'],
  'fc3-tws': ['edSu27Fc3Manual', 'edMig29Manual', 'edSu33Manual', 'edF15cManual', 'edFc3Changelog', 'fTwsMulti', 'fCyclingTws'],
};

/** Topic → source ids. */
export const SOURCE_TOPICS: Record<SourceTopic, number[]> = Object.fromEntries(
  (Object.keys(T) as SourceTopic[]).map(t => [t, T[t].map(k => SOURCE_ID[k])]),
) as Record<SourceTopic, number[]>;

/** Sources backing a topic, in citation order. Unknown topic → []. */
export function sourcesFor(topic: SourceTopic): Source[] {
  return (SOURCE_TOPICS[topic] ?? []).map(id => SOURCES[id - 1]);
}
