# Flight operations in DCS: pattern, approach, nav and return to base

Scope: the gameplay facts behind the Pattern & landing page (`src/data/flightOps.ts`, issues #18, #19, #22):
overhead-break numbers, on-speed AoA and indexer colours, gear and flap limits, and FC3 return-to-base
navigation. Game-level only (AGENTS.md rule 1): what the player sees, selects and flies.

Research date: 23 Sep 2026. Web and manual reading only; no DCS session. Nothing below is in-game verified.
Values the data file marks `verified: false` are listed in `docs/api/data.md` ("Uncertain values", Flight ops).

## Sources

1. ED, *DCS: F/A-18C Hornet Early Access Guide*, "Airfield VFR Landing" and "Case 1".
2. ED, *DCS: F-15C Flaming Cliffs Flight Manual* (2014), "Landing" and "Quick Start".
3. ED, *DCS: Su-27 Flanker Flight Manual* (2014) and *DCS: Su-33 FC3 Flight Manual* (2021): navigation modes,
   ISM-1 indexer, landing.
4. Heatblur, *F-14 Tomcat Manual*, Landing Procedures (github.com/Heatblur-Simulations/f-14-manual).
5. Chuck's Guides: *DCS F-16C Viper*, *DCS JF-17 Thunder*, *DCS Mirage 2000C*.
6. ED, *DCS Supercarrier Operations Guide* (carrier pattern, LSO thresholds; for later carrier work).

## Pattern and approach by jet

| Jet | On speed | Indexer colours | Pattern numbers | Source |
|---|---|---|---|---|
| F/A-18C | 8.1° (on-speed 7.4–8.8°) | guide calls on-speed a yellow circle; chevrons not given | initial 350 kt / 800 ft AGL; break 5–10 s past the runway end at 1 % of airspeed in g; downwind 600 ft, 1.2 nm abeam; gear and FULL flaps below 250 kt | 1 |
| F-16C | 11° (green doughnut 11–14°) | red above 14°, green 11–14°, yellow below 11° | initial 300 kt / 1500 ft AGL; break ~70° bank, 3–4 g, speedbrake out; downwind 200–220 kt; final 300 ft AGL at 1 nm on the 2.5° line; touchdown ≤ 13° | 5 |
| F-15C | 20–22 units | not given | NAV then ILSN on `1`; HUD GSUP / GSDN; at least 180 kt on final (quick start says ~150 kt at the outer beacon: conflict) | 2 |
| F-14B | 15 units | not given | carrier break 800 ft, 300–350 KIAS, 15–17 s interval; field pattern not published | 4 |
| JF-17 | about 10° | not given | flight path marker in the E-bracket | 5 |
| M-2000C | about 14° | not given | gear below 230 kt | 5 |
| Su-33 | not given | ISM-1: yellow low AoA (fast), green optimal, red high AoA (slow) | history section quotes 240 km/h approach (background only) | 3 |
| Su-27, J-11A, MiG-29S | not given | not given | Su-33 manual history quotes 270 km/h for the Su-27 (background only) | 3 |

Conflicts to settle in game: F-15C final speed; Hornet gear speed (250 kt field section, 150 KIAS carrier
section); the Viper target (11°) versus its band (11–14°).

## FC3 navigation and return to base

- **Russian FC3 jets:** `1` cycles the navigation modes МРШ (route), ВЗВ (return) and ПОС (landing).
  `LCtrl+~` cycles waypoints or airfields (not verified). ВЗВ steers to the glide-slope intercept point on
  the extended centreline, then the system switches to ПОС and the tower gives glide-path instructions
  (source 3; the automatic switch is not verified in game).
- **Tower calls** tell the pilot to correct toward the glide path (above / below / on glide path). Exact
  wording in the current game is not verified.
- **F-15C:** `1` selects NAV, then ILSN; the HUD shows GSUP / GSDN glide-slope cues (source 2). The meaning
  the trainer draws (fly up / fly down beyond a small deviation) is a simplification.
- The intercept-point distance and altitude are not published; the trainer uses 12 km and 600 m.

## Keys

Gear `G`, flaps `F` and airbrake `B` are used for every jet in the trainer. `src/data/procedures.ts` does not
carry these binds and no manual in this pass confirmed them per module: not verified. The stick and
throttle keys on the page are trainer keys, not DCS defaults.
