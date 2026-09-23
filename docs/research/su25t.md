# Su-25T Frogfoot: what DCS shows the pilot

Researched 2026-09-23 for issue #37 (Su-25T with Shkval and air-to-ground). Game level only (AGENTS.md rule 1):
keys, displays, HUD labels and procedures as the DCS player meets them. No weapon engineering.

Primary source, read in full for this note: ED, *DCS World Su-25T Flight Manual* (EN, 68 pages)
[S1](https://www.digitalcombatsimulator.com/upload/iblock/61b/DCS%20World%20Su-25T%20Flight%20Manual%20EN.pdf).
Items marked **(research pass)** came from an earlier web research pass and were not found in S1; treat them as
not verified until checked in game.

## The module

- Free jet shipped with DCS World, FC3-level fidelity (keyboard-driven avionics, no clickable cockpit). S1 is the
  only ED document for it.
- Russian metric cockpit: HUD in Cyrillic, speed in km/h, altitude in metres, radar altimeter 0–1500 m (S1).
- No air-to-air radar. Air-to-air weapons are the R-60 and R-73 IR missiles, cued by the missile seeker only
  (S1, "R-73 and R-60 short range missiles").
- RWR: SPO-15 "Beryoza" (S1), same lamp panel as the FC3 Flankers and MiG-29. RWS filter [RShift-R].
- Defensive aids: 192 flare cartridges (S1), Sukhogruz IR jammer in the tail, jammer pods on wing stations.
  Chaff load is not stated in S1.
- Dimensions for the 3D model: length ~15.3 m, span ~14.4 m (public Su-25 figures, not in S1).

## Master modes (S1)

| Key | Mode | HUD label |
|---|---|---|
| [1] | Navigation | — |
| [2], [4], [6] | Air to air (R-60 / R-73 / gun funnel) | missile type "60" or "73", ПР when the seeker has locked |
| [7] | Air to ground | ОПТ-ЗЕМЛЯ (visual ground), ЗЕМЛЯ with Shkval |
| [8] | Fixed reticle (toggle, from any combat mode) | — |

Weapon select in [7]: [D] cycles stations, [C] selects the cannon (HUD ВПУ). Release: [Space] or the trigger.
Gun pods have ФИКС (fixed barrel depression) and ПРОГР (automatic barrel depression) with [RCtrl-[] / [RCtrl-]]
setting the depression angle (S1).

HUD weapon labels below the pitch scale (S1): АБ free-fall bombs and dispensers, С-5 / С-8 rockets
(shown as the rocket type), 9А4172 Vikhr, 25МЛ Kh-25ML, 29Л Kh-29L, 29Т Kh-29T, 500Кр KAB-500Kr, 58 Kh-58.
SEAD mode label ПРГ (anti-radiation seeker).

## Shkval and Mercury (S1)

- Shkval on/off [O]. Mercury night pod [RCtrl-O] (five-fold magnification, S1).
- The picture shows on the IT-23M TV monitor, upper right of the panel. The HUD shows a circular laser cursor at
  the centre of the optical field of view; it moves with the sensor.
- Slew [;] [,] [.] [/]. Ground-stabilise the sensor [Enter]. Zoom [=] in / [-] out in three steps: wide, 8x,
  23x (23x FOV 0.73 × 0.97°). S1 writes "[+] and [-]"; the Shkval bombing procedure writes [=] and [-] (same key).
- Target size (TV target frame) [RCtrl-]] larger / [RCtrl-[] smaller, shown upper left in metres. S1: armour about
  10 m, aircraft 10–60 m, ships and buildings usually 60 m. Auto-lock happens only when the object in the cursor is
  within 5 m of the set size; objects larger than 60 m can still be locked at the 60 m maximum.
  **(research pass)**: presets personnel 5 m, armour 10 m, aircraft 20 m, buildings 20–60 m, ships 60 m.
- Gimbal once locked: ±35° azimuth, +15° to −85° elevation. The IT-23M scales read −40..+40° azimuth and
  +20..−90° elevation.
- Laser rangefinder / designator [RShift-O]. Needed for Kh-25ML, Kh-29L and Vikhr: the target must stay
  illuminated for the whole time of flight.
- Laser limit **conflict**: S1 says the laser switches off at its temperature limit, needs cooling about as
  long as it was on, and should not be used for more than 20 minutes total per flight; ЛД flashes while it cools.
  **(research pass)**: 1 minute continuous illumination limit. Not verified which one DCS enforces.
- ID ranges through the optics (S1): a house 15 km, a tank 8–10 km, a helicopter 6 km.

### IT-23M symbology (S1)

- КС (manual steering, no lock) or АС (auto-tracking, target locked) at the top, next to the radar altitude.
- Magnification and target size upper left. Azimuth scale on top, elevation scale on the left, aircraft pitch
  next to it, aircraft datum in the centre.
- ЛД when the laser is on; slant range in km at the bottom; estimated time of flight (then time to impact) lower
  right; launch-authorised cue above the slant range. ПР is the HUD seeker-lock cue for IR missiles.

## Weapons procedures (game level)

- **Vikhr (9А4172)**: [7], Shkval [O], find and lock, laser [RShift-O], launch in range, hold lock and laser to
  impact (laser beam-riding). Can be rippled in pairs; usable against slow aircraft and helicopters.
- **Kh-25ML (25МЛ), Kh-29L (29Л)**: same flow as Vikhr: lock, laser on, launch, keep lasing to impact.
- **Kh-29T (29Т), KAB-500Kr (500Кр)**: TV guided. Lock with Shkval, launch or release, no laser needed.
- **Rockets**: [7], [D] to the rocket type, aim the pipper, fire at the range shown by the HUD range bar.
- **Bombs**: CCIP (visual pipper). CCRP / "invisible zone" (H3): designate with Shkval and laser, hold release,
  fly the tail of the aircraft symbol into the steering circle; the range bar becomes a time-to-release scale,
  the arrow starts 10 s before release and bombs release automatically.
- **Gun conflict**: S1 names "GSh-20 30-mm twin-barrel cannon with a 200 round magazine" (sic);
  **(research pass)**: GSh-30 with 150 rounds vs GSh-301 with 200. Not verified. Guns are out of scope for this slice.
- **Kh-58 / Kh-25MPU**: need the L-081 Fantasmagoria pod on station 6. [7], passive radar detection [I], steer by
  the SPO-15, a diamond appears when the emitter is inside the ±30° zone, slew with [;] [,] [.] [/], lock [Enter],
  launch. HUD shows 58 and ПРГ.

## Not in the manual

S1 gives no launch ranges for guided air-to-ground weapons, only "observe the maximum launch range scale in the
HUD". Community range tables stay **not verified** until checked in game. The R-60 / R-73 guidance in S1: R-60
1500–2000 m, R-73 3000–4000 m against a 700 km/h target (tutorial advice, not zones).
