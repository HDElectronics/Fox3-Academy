/**
 * [OWNER: page-harm] The ED F/A-18C guide's "ALIC Codes & RWR Symbols Appendix" (pp420-422), row by row: air defence
 * radars, naval radars, airborne RWR symbols and the other threat symbol. Rebuilt from the word positions on the PDF
 * pages, because the plain text export misaligns columns; RWR symbols printed half a line off belong to the row next to
 * them. Names are as printed, except the guide's typo "GUIDLELINE" (Guideline). null = blank in the guide (no ID: the
 * radar cannot be programmed for PB). See docs/research/fa18c-harm.md.
 */
import type { HarmClass } from './types';

export interface AdRow { id: number | null; cls: HarmClass | null; rwr: string; nato: string; system: string; radar: string; type: string }
export interface NavalRow { id: number | null; cls: HarmClass | null; rwr: string; ship: string; type: string; designation: string }

/** What the guide says each column is for (p420). */
export const APPENDIX_USE = {
  id: 'ID (ALIC code): programs the HARM in Pre-Briefed (PB) mode.',
  cls: 'CLASS: filters emitter types for the HARM in Target of Opportunity (TOO) mode.',
  rwr: 'RWR: how the radar appears on the ALR-67 azimuth indicator, and on the DDI in TOO.',
} as const;

/** Radar type abbreviations (p420). */
export const RADAR_TYPES: Record<string, string> = {
  CWAR: 'Continuous-Wave Acquisition Radar', EWR: 'Early Warning Radar', FCR: 'Fire Control Radar', RR: 'Ranging Radar',
  SR: 'Surveillance Radar', STR: 'Search and Tracking Radar', TAR: 'Target Acquisition Radar', TI: 'Target Illumination',
  TTR: 'Target Tracking Radar',
};

export const AIR_DEFENCE: AdRow[] = [
  { id: null, cls: null, rwr: '', nato: '', system: '', radar: '1L13 "Box Spring"', type: 'SR / EWR' },
  { id: null, cls: null, rwr: '', nato: '', system: '', radar: '5G66 "Tall Rack"', type: 'SR / EWR' },
  { id: 122, cls: 'H1', rwr: 'S', nato: 'SA-2 / SA-3 / SA-5', system: 'S-75 / S-125 / S-200', radar: 'P-19 "Flat Face B"', type: 'SR / TAR' },
  { id: 126, cls: null, rwr: '2', nato: 'SA-2 "Guideline"', system: 'S-75', radar: 'SNR-75 "Fan Song"', type: 'TTR' },
  { id: null, cls: null, rwr: 'U', nato: 'SA-2 "Guideline"', system: 'S-75', radar: 'RD-75 Amazonka', type: 'RR' },
  { id: 123, cls: 'H1', rwr: '3', nato: 'SA-3 "Goa"', system: 'S-125', radar: 'SNR-125 "Low Blow"', type: 'TTR' },
  { id: 130, cls: null, rwr: 'TS', nato: 'SA-5 "Gammon"', system: 'S-200', radar: 'ST-68U "Tin Shield"', type: 'TAR' },
  { id: 129, cls: null, rwr: '5', nato: 'SA-5 "Gammon"', system: 'S-200', radar: '5N62 "Square Pair"', type: 'TTR / TI' },
  { id: 108, cls: 'H1', rwr: '6', nato: 'SA-6 "Gainful"', system: '2K12 Kub', radar: '1S91 "Straight Flush"', type: 'TAR / TI' },
  { id: 117, cls: 'H1', rwr: '8', nato: 'SA-8 "Gecko"', system: '9K33 Osa', radar: '"Land Roll"', type: 'TAR / TTR' },
  { id: 104, cls: 'H2', rwr: 'BB', nato: 'SA-10 "Grumble"', system: 'S-300PS', radar: '64N6E "Big Bird"', type: 'TAR' },
  { id: 103, cls: 'H2', rwr: 'CS', nato: 'SA-10 "Grumble"', system: 'S-300PS', radar: '5N66M "Clam Shell"', type: 'TAR' },
  { id: 110, cls: 'H2', rwr: '10', nato: 'SA-10 "Grumble"', system: 'S-300PS', radar: '30N6E "Flap Lid"', type: 'TTR' },
  { id: 107, cls: 'H2', rwr: 'SD', nato: 'SA-11 "Gadfly"', system: '9K37M Buk-M1', radar: '9S18M1 "Snow Drift"', type: 'TAR' },
  { id: 115, cls: 'H2', rwr: '11', nato: 'SA-11 "Gadfly"', system: '9K37M Buk-M1', radar: '9S35 "Fire Dome"', type: 'TTR' },
  { id: 109, cls: 'HS', rwr: 'DE', nato: '', system: 'PPRU-M1', radar: '9S80M1 "Dog Ear"', type: 'TAR' },
  { id: 118, cls: null, rwr: '13', nato: 'SA-13 "Gopher"', system: '9K35 Strela-10M3', radar: '9S86 "Snap Shot"', type: 'RR' },
  { id: 119, cls: 'H2', rwr: '15', nato: 'SA-15 "Gauntlet"', system: '9K331 Tor-M1', radar: '"Scrum Half"', type: 'TAR / TTR' },
  { id: 120, cls: 'H2', rwr: '19', nato: 'SA-19 "Grison"', system: '2S6M Tunguska', radar: '1RL144 "Hot Shot"', type: 'TAR / TTR' },
  { id: 121, cls: 'HAA', rwr: 'A', nato: '', system: 'ZSU-23-4 Shilka', radar: 'RPK-2 "Gun Dish"', type: 'FCR' },
  { id: 131, cls: null, rwr: 'FC', nato: '', system: 'S-60 / KS-19', radar: 'SON-9 "Fire Can"', type: 'FCR' },
  { id: 128, cls: null, rwr: 'HQ', nato: 'CSA-7 / HQ-7B', system: 'Hóng Qí-7', radar: 'HQ-7 ACU', type: 'TAR' },
  { id: 127, cls: null, rwr: '7', nato: 'CSA-7 / HQ-7B', system: 'Hóng Qí-7', radar: 'Type 345', type: 'TTR' },
  { id: null, cls: null, rwr: '', nato: '', system: '', radar: 'AN/FPS-117 "Seek Igloo"', type: 'SR / EWR' },
  { id: 203, cls: 'H1', rwr: 'HK', nato: 'MIM-23B I-Hawk', system: '', radar: 'AN/MPQ-50', type: 'TAR' },
  { id: 204, cls: 'H1', rwr: 'HK', nato: 'MIM-23B I-Hawk', system: '', radar: 'AN/MPQ-46', type: 'TTR' },
  { id: 206, cls: 'H1', rwr: 'HK', nato: 'MIM-23B I-Hawk', system: '', radar: 'AN/MPQ-55', type: 'CWAR' },
  { id: 202, cls: 'H2', rwr: 'P', nato: 'MIM-104C Patriot PAC-2', system: '', radar: 'AN/MPQ-53', type: 'STR' },
  { id: 209, cls: null, rwr: 'NS', nato: 'NASAMS 2', system: '', radar: 'AN/MPQ-64F1 Sentinel', type: 'STR' },
  { id: 208, cls: 'HAA', rwr: 'A', nato: 'M163 Vulcan ADS', system: '', radar: 'AN/VPS-2', type: 'RR' },
  { id: 124, cls: null, rwr: 'RP', nato: 'Rapier FSA', system: '', radar: 'DN 181 Blindfire', type: 'TTR' },
  { id: 125, cls: null, rwr: 'RT', nato: 'Rapier FSA', system: '', radar: 'Rapier PU', type: 'SR' },
  { id: 205, cls: 'H1', rwr: 'RO', nato: 'Roland TÜR', system: '', radar: 'MPDR-3002S', type: 'SR' },
  { id: 201, cls: 'H1', rwr: 'RO', nato: 'Marder Roland', system: '', radar: 'MPDR-16 / DOMINO-30', type: 'TAR / TTR' },
  { id: 207, cls: 'HAA', rwr: 'A', nato: 'Flakpanzer Gepard', system: '', radar: 'MPDR-12 / Albis', type: 'TAR / FCR' },
];

export const NAVAL: NavalRow[] = [
  { id: 301, cls: 'HN', rwr: 'SW', ship: 'Kuznetsov class', type: 'Heavy Aircraft Cruiser', designation: 'Project 1143.5 (Admiral Kuznetsov)' },
  { id: 320, cls: 'HN', rwr: 'SW', ship: 'Kuznetsov class', type: 'Heavy Aircraft Cruiser', designation: 'Project 1143.5 [2017 SC revision]' },
  { id: 313, cls: 'HN', rwr: 'HN', ship: 'Kirov class', type: 'Guided Missile Cruiser', designation: 'Project 1144.2 (Piotr Velikiy)' },
  { id: 303, cls: 'HN', rwr: 'T2', ship: 'Slava class', type: 'Guided Missile Cruiser', designation: 'Project 1164 (Moskva)' },
  { id: 319, cls: 'HN', rwr: 'TP', ship: 'Neutrashimy class', type: 'Guided Missile Frigate', designation: 'Project 11540 (Neutrashimy)' },
  { id: 309, cls: 'HN', rwr: 'TP', ship: 'Krivak II class', type: 'Frigate / Guard Ship', designation: 'Project 1135M (Rezky)' },
  { id: 306, cls: 'HN', rwr: 'HP', ship: 'Grisha class', type: 'Anti-Submarine Corvette', designation: 'Project 1124.4 (Grisha)' },
  { id: 312, cls: 'HN', rwr: 'PS', ship: 'Tarantul III class', type: 'Missile Corvette', designation: 'Project 1241.1 (Molniya)' },
  { id: 321, cls: 'HN', rwr: 'SC', ship: 'Ropucha I class', type: 'Large Landing Ship', designation: 'Project 775' },
  { id: 410, cls: 'HN', rwr: 'HN', ship: 'Luyang II class', type: 'Guided Missile Destroyer', designation: 'Type 052C (PLAN)' },
  { id: 409, cls: 'HN', rwr: 'MR', ship: 'Luyang I class', type: 'Guided Missile Destroyer', designation: 'Type 052B (PLAN)' },
  { id: 411, cls: 'HN', rwr: 'MR', ship: 'Jiangkai II class', type: 'Guided Missile Frigate', designation: 'Type 054A (PLAN)' },
  { id: 408, cls: 'HN', rwr: 'PS', ship: 'Yuzhao class', type: 'Amphibious Transport Dock', designation: 'Type 071 (PLAN)' },
  { id: 403, cls: 'HN', rwr: 'SS', ship: 'Nimitz class', type: 'Aircraft Carrier', designation: 'CVN-71 (USS Theodore Roosevelt)' },
  { id: 404, cls: 'HN', rwr: 'SS', ship: 'Nimitz class', type: 'Aircraft Carrier', designation: 'CVN-72 (USS Abraham Lincoln)' },
  { id: 405, cls: 'HN', rwr: 'SS', ship: 'Nimitz class', type: 'Aircraft Carrier', designation: 'CVN-73 (USS George Washington)' },
  { id: 406, cls: 'HN', rwr: 'SS', ship: 'Nimitz class', type: 'Aircraft Carrier', designation: 'CVN-74 (USS John C. Stennis)' },
  { id: 413, cls: 'HN', rwr: 'SS', ship: 'Nimitz class', type: 'Aircraft Carrier', designation: 'CVN-75 (USS Harry S. Truman)' },
  { id: null, cls: 'HN', rwr: 'U', ship: 'Forrestal class', type: 'Aircraft Carrier', designation: 'CV-59 (USS Forrestal)' },
  { id: 407, cls: 'HN', rwr: '49', ship: 'Tarawa class', type: 'Amphibious Assault Ship', designation: 'LHA-1 (USS Tarawa)' },
  { id: 315, cls: 'HN', rwr: 'AE', ship: 'Ticonderoga class', type: 'Guided Missile Cruiser', designation: 'CG (USS)' },
  { id: 412, cls: 'HN', rwr: 'AE', ship: 'Arleigh Burke class', type: 'Guided Missile Destroyer', designation: 'DDG (USS)' },
  { id: 401, cls: 'HN', rwr: '49', ship: 'Oliver Hazard Perry class', type: 'Guided Missile Frigate', designation: 'FFG (USS)' },
  { id: null, cls: 'HN', rwr: 'U', ship: 'Invincible class', type: 'Light Aircraft Carrier', designation: 'R05 (HMS)' },
  { id: null, cls: 'HN', rwr: 'U', ship: 'Leander class', type: 'Frigate', designation: 'F12, F57, F72 (HMS)' },
  { id: null, cls: 'HN', rwr: 'U', ship: 'Castle class', type: 'Patrol Class', designation: 'P258, P265 (HMS)' },
  { id: null, cls: 'HN', rwr: 'U', ship: 'Condell class', type: 'Frigate', designation: 'PFG-06, PFG-07 (CNS)' },
];

/** Airborne radars: RWR symbol only (no ALIC code, so not PB targets). */
export const AIRBORNE: [string, string][] = [
  ['19', 'MiG-19'], ['21', 'MiG-21'], ['23', 'MiG-23'], ['24', 'Su-24'], ['25', 'MiG-25'], ['29', 'MiG-29'], ['29', 'Su-27'],
  ['29', 'Su-33'], ['30', 'Su-30'], ['31', 'MiG-31'], ['34', 'Su-34'], ['50', 'A-50'],
  ['JF', 'JF-17'], ['29', 'J-11'], ['50', 'KJ-2000'], ['F1', 'Mirage F1'], ['M2', 'Mirage 2000'], ['F2', 'Tornado GR4'],
  ['U', 'Tornado IDS'], ['U', 'AJS37'],
  ['F4', 'F-4'], ['F5', 'F-5'], ['14', 'F-14'], ['15', 'F-15'], ['16', 'F-16'], ['18', 'F/A-18'], ['E2', 'E-2'], ['E3', 'E-3'],
];

/** Other threat symbols (p422). */
export const OTHER_SYMBOLS: [string, string, string][] = [['M', 'Missile radar seeker detected', 'Active radar-homing missiles (ARH)']];
