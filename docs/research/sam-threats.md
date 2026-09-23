# SAM threats: ranges, rings and defences as the DCS player meets them

Scope: gameplay only (ARCHITECTURE.md "Scope"). This note records what a DCS pilot sees and uses against three
representative surface-to-air sites: the engagement envelope the Mission Editor threat ring stands for, the RWR
symbol, the pilot-level guidance rule, and which defences work in the game. It contains no radar, seeker, fuze,
warhead or motor detail. Sources were checked on 23 September 2026. No DCS build was available, so nothing here
was observed in game; every number is marked with its confidence.

The three sites match the RWR trainer's existing classes (`src/data/rwr.ts`): `sam-long` = SA-10, `sam-medium`
= SA-11, `sam-short` = SA-15. RWR symbols and lamp behaviour are already researched in `rwr-surface-threats.md`
and are reused, not repeated.

## Engagement envelopes

The Airgoons "DCS Reference: Air Defences" page (Eastern systems) lists the envelope for each system from the
game's own data (source 1):

| Site | Range | Altitude | Guidance (as listed) |
|---|---|---|---|
| SA-10 S-300PS | 2.7–64.8 nm / 5–120 km | 82–88600 ft / 25–27000 m | semi-active / active missiles |
| SA-11 Buk-M1 | 1.8–18.9 nm / 3.3–35 km | 49–72100 ft / 15–22000 m | command, then semi-active |
| SA-15 Tor | 0.8–6.5 nm / 1.5–12 km | 32–19700 ft / 10–6000 m | radar command |

Confidence:

- **Not verified in the Mission Editor.** The ED forum "Mission Editor Threat Range Ring Chart" (source 3) shows
  the rings the ME draws, but the page refused access, so the ring radii above are taken as the maximum range from
  source 1. The trainer uses them as the threat-ring radius and flags them as not verified.
- SA-10: older community material quotes a smaller ring for the S-300PS; 120 km is kept because it is the only
  figure found with a stated game-data origin.
- SA-15: the dcsworld.pro threat page lists 6.5 nm and a 26000 ft ceiling, which disagrees with 6000 m above.
  The trainer keeps 6000 m and flags the ceiling as uncertain.

## Guidance rule used by the trainer

Source 1 lists a mix of command and semi-active guidance. At gameplay level all three behave the same way for the
pilot: **the missile needs the site's track radar on you until impact.** If the site loses the track (notch plus
chaff, terrain, leaving the envelope) the missile loses guidance. The trainer models this single rule
(`guidance: 'track-to-impact'`) and says "simplified" for the terminal phase of the SA-10.

## Defences that work in the game

SimTuts' DCS missile-defence guide (source 2) and the ED forum SA-11 tactics thread give the pilot-facing list:

- **Notch / beam:** put the site at 3 or 9 o'clock so your speed toward it is near zero, ideally descending
  toward terrain. Works against the SA-11 and SA-15; the S-300 is described as "extremely difficult to defeat
  kinematically" and the guide recommends terrain, anti-radiation missiles or saturation instead.
- **Chaff:** bundles of two or three at one-second intervals *while beaming*. Chaff alone, not beaming, is not
  the recommended defence.
- **Terrain masking:** ridges block radar line of sight; low level shortens the radar horizon.
- **Speed and altitude:** stay fast; avoid the band too high to mask but too low to out-range the missile.
- **Out of range:** turning away near the edge of the ring lets the missile run out of energy.

## How the trainer turns this into rules

- Search radar paints anything in line of sight inside 1.25 × the ring (RWR "search"); the track radar locks
  inside the ring (RWR "lock"); a launch shows as the RWR launch cue for as long as the site guides a missile.
- Line of sight: the 4/3-earth radar horizon (4.12 × (√h_site + √h_target) km, heights in m) plus a
  scenario-set terrain mask height around the site. Both are gameplay stand-ins for DCS terrain.
- Notch and chaff reuse the air-to-air rule: a Doppler gate on radial speed, a short memory before the track
  drops, and a per-bundle chaff chance scaled by notch depth. The SA-10 gets the narrowest gate and lowest chaff
  chance. All values are arcade tuning, not verified in game.

## Sources

1. Airgoons wiki, "DCS Reference: Air Defences", Eastern systems:
   https://www.airgoons.com/w/DCS_Reference/Air_Defences/Eastern
2. SimTuts, "DCS Missile Defense Guide: How to Defeat SAMs and Air-to-Air Missiles":
   https://simtuts.com/guides/defending-against-missiles-dcs
3. ED Forums, "DCS World Mission Editor Threat Range Ring Chart" (not opened, HTTP 403):
   https://forum.dcs.world/topic/284720-dcs-world-mission-editor-threat-range-ring-chart/
4. ED Forums, "SA11 Tactics" (F-16C forum): https://forum.dcs.world/topic/294476-sa11-tactics/
5. dcsworld.pro, SA-15 threat page (ceiling disagreement): https://dcsworld.pro/threats/SA-15
6. RWR symbols and SAM lamp: `rwr-surface-threats.md` (ED Hornet guide pp. 414, 419–420; Heatblur ALR-67).
