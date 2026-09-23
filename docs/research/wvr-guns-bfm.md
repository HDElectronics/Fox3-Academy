# WVR: guns and BFM (issue #11)

Gameplay facts for the close-combat lessons: how each of the ten fighters selects and fires the gun, what the
HUD gun sight shows, the gun ranges and round counts the manuals give. Game-tutorial scope only (AGENTS.md
rule 1): no ballistics, no gun or flight-model engineering. Values live in `src/data/wvr.ts`.

Checked 23 Sep 2026 against the manuals below (PDF text extracted). "Verified" = the manual says it.

## Summary

- **FC3 Russian jets (Su-27, Su-33, J-11A, MiG-29S):** `C` selects the cannon, `Space` fires. With no lock the
  HUD shows a gun funnel sized by the Target Size setting (`RAlt+-` / `RAlt+=`, default 20 m). With a lock, a
  lead-computing sight with range. The aiming crosshair appears inside 1200 m. GSh-30-1, 150 rounds,
  1500 rounds per minute (MiG-29 manual). The Su-33 and J-11A use the Su-27 text (no own gun text checked).
- **F-15C:** `C` selects the M61 and Auto Guns (AACQ): 60° wide × 20° tall scan centred on the gun reticle,
  lock within 10 nm, then STT. HUD shows 940 rounds. Rate of fire and gun range are not in the FC3 manual.
- **F/A-18C:** `LShift+X` (Weapon Select Aft) selects A/A GUNS and GACQ. Radar not tracking: funnel with a
  fixed 2000 ft lead range and 1000 / 2000 ft cues, adjustable wingspan (default 40 ft; fixed stadia sized
  for 25 ft). Radar tracking: director reticle with range arc; SHOOT when predicted miss < 20 ft, off above
  30 ft. Max firing range: the lesser of 1.5 s bullet time of flight or a minimum impact velocity. 578 rounds,
  HI 6000 / LO 4000 rounds per minute.
- **F-16C:** EEGS Level II funnel (fire when the wingtips touch the funnel; top about 600 ft) and Level V pipper
  with a lock. The ED guide could not be reached: funnel bottom 2500–3000 ft, 33 ft default wingspan and 510
  rounds are **not verified**.
- **F-14B:** RTGS, no track: bullets at 1000 ft (pipper) and 2000 ft (diamond). With STT the pipper shows the
  bullets at target range out to 4000 ft. 676 rounds, 4000 or 6000 rounds per minute.
- **JF-17:** GSh-23-2 with SS (snapshot), LCOS and SSLC sights; 180 rounds; burst limiter shown at 0.5 s
  (a 0.2 s setting was not found).
- **M-2000C:** CCLT (Calcul Continu de la Ligne de Traceurs) tracer line to 1000 m, wingspan marks at 300 m and
  600 m; with a radar lock a target distance meter inside 1200 m. 2 × DEFA 554, 125 rounds each.

## Table

| Jet | Fact | Verified | Source |
|---|---|---|---|
| Su-27 | `C` cannon, `Space` fire, funnel by Target Size (default 20 m, `RAlt+-`/`RAlt+=`), crosshair inside 1200 m, 150 rounds GSh-30-1 | yes | 1 (Gun Employment, p. 63–64) |
| Su-33, J-11A | Same as Su-27 | no (Su-27 text) | 1 |
| MiG-29S | Same sight, 150 rounds, 1500 rounds per minute | yes (generic MiG-29 text) | 2 (Gun Employment, p. 58) |
| F-15C | `C` gun + Auto Guns 60° × 20°, 10 nm; 940 rounds; LCOS / locked reticle | yes | 3 (Gunnery Modes p. 49, AUTO GUNS p. 72) |
| F-15C | Rate of fire, gun max range | no (trainer picks 6000 rpm, 4000 ft) | — |
| F/A-18C | `LShift+X`, funnel 2000 ft with 1000/2000 ft cues, 40 ft wingspan, director + SHOOT 20/30 ft, max range 1.5 s TOF or min impact velocity, 578 rounds, 6000/4000 rpm | yes | 4 (M61A1 Gun A/A, p. 262–266) |
| F-16C | EEGS Level II funnel / Level V pipper; top of funnel about 600 ft | partly (community summary of 5) | 5 |
| F-16C | Funnel bottom 2500–3000 ft, 33 ft wingspan, 510 rounds | no | — |
| F-14B | RTGS 1000 / 2000 ft, STT to 4000 ft, 676 rounds, 4000/6000 rpm | yes | 6 (M61A1 Vulcan) |
| JF-17 | SS / LCOS / SSLC, 180 rounds, GSh-23-2, limiter 0.5 s | yes | 7 (3.3.1–3.3.3) |
| JF-17 | Limiter 0.2 s | no | — |
| M-2000C | CCLT to 1000 m, wingspan marks 300 / 600 m, distance meter inside 1200 m, 2 × 125 rounds DEFA 554 | yes | 8 (2.3.1–2.3.2) |

Keys already in the repo research: `docs/research/ru-fc3.md` (Cannon `C`, Weapon Fire `Space`, Target Specified
Size `RAlt+=`/`RAlt+-`), `docs/research/f15c-fc3.md` (Cannon `C`, Weapon Fire `Space`),
`docs/research/hornet-viper.md` (Select Gun `LShift+X`, Trigger `Space`; the Viper gun trigger has no default key).

## Trainer simplifications (not DCS facts)

- **Turn performance:** sustained g at full afterburner at 5000 ft and 20000 ft vs Mach is a trainer estimate
  (shared shape scaled per jet). Simplified, not verified. The existing `perf.maxG` and `perf.cornerKts` still
  set the instantaneous limit.
- **Gun hits:** arcade rule, time with the gun line on the lead point inside the jet's max range. One bullet
  speed for every gun, straight-line flight, no gravity drop. Damage by time in the solution (about 2 s dead on
  at 600 m, 1.25 s inside 300 m, 4 s at max range), the same for every gun: a gameplay target.
- **Sight geometry:** pipper and funnel points displaced against the jet's own turn rate × time of flight. A
  teaching approximation of the lead-computing idea, not any jet's sight law.

## Sources

1. ED, DCS: Su-27 Flanker Flight Manual (FC3, EN). https://www.digitalcombatsimulator.com/upload/iblock/ed7/Su-27%20DCS%20Flaming%20Cliffs%20Flight%20Manual%20EN.pdf
2. ED, DCS: MiG-29 Fulcrum Flight Manual (EN). https://www.digitalcombatsimulator.com/upload/iblock/463/DCS%20MIG-29%20Flight%20Manual%20EN.pdf
3. ED, DCS: F-15C Flaming Cliffs Flight Manual (EN). https://www.digitalcombatsimulator.com/upload/iblock/1ad/F-15C%20DCS%20Flaming%20Cliffs%20Flight%20Manual%20EN.pdf
4. ED, DCS F/A-18C Hornet Early Access Guide (EN). https://www.digitalcombatsimulator.com/upload/iblock/ea9/lxf69u2uk1fhqq7ndb55z9egzabe8hdg/DCS%20FA-18C%20Early%20Access%20Guide%20EN.pdf
5. ED, DCS F-16C Viper Early Access Guide (EN), EEGS (not reached this pass). https://www.digitalcombatsimulator.com/upload/iblock/e78/33zl8132hi71d3tv0194vvkzpzl3mrr6/DCS%20F-16C%20Early%20Access%20Guide%20EN.pdf
6. Heatblur, DCS F-14 manual, M61A1 Vulcan. https://f14.manual.heatblur.se/
7. Chuck's Guides, DCS JF-17 Thunder, 3.3 GSH-23-2 Cannon (Air-to-Air). https://www.chucksguides.com/
8. Chuck's Guides, DCS M-2000C, 2.3 Air-to-Air Guns Tutorial. https://www.chucksguides.com/
