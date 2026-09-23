# How close to DCS is this?

The app's value is that it behaves like DCS World. This page says, area by area, what follows DCS, what is a
deliberate simplification, and what could not be verified. The full list of uncertain values, with sources,
is in `docs/api/data.md` ("Uncertain values"); the research behind every fact is in `docs/research/`.

## Where the facts come from

- Eagle Dynamics manuals (Flaming Cliffs 3 Su-27, MiG-29, Su-33 and F-15C guides; F/A-18C and F-16C early access
  guides), the Heatblur F-14 manual, the Deka JF-17 manual, Razbam's M-2000C manual.
- The DCS Lua datamine (sensor tables, launch-zone reference tables) for numbers the manuals do not give.
- Chuck's Guides, the Hoggit wiki and ED forum threads, dated, for behaviour that changed with patches.

108 sources in total, listed in the app's Cockpit page and in `src/data/sources.ts`.

## Follows DCS closely

- **Radar modes and labels** per jet, including the Russian HUD labels (ОБЗ ДВБ, СНП ДВБ, АТК ДВБ) and PRF names.
- **Scan patterns and frame times**: FC3 jets 5 s, Viper and Tomcat patterns, TWS scan limits per jet (F-15C ±30°,
  Hornet 2B ±40° / 4B ±20° / 6B ±10°, F-14 ±20° 4B and ±40° 2B, JF-17 options).
- **TWS rules**: FC3 Russian jets designate one track and the radar locks it by itself at 85 % of Rmax; the
  MiG-29S СНП2 two-target R-77 mode; F-15C primary plus up to three secondary designations and ripple order;
  Hornet L&S and DT2; Viper bugged target; F-14 up to six Phoenix in TWS; M-2000C has no multi-target TWS.
- **What the target hears**: a TWS Fox 3 gives no lock and no launch warning until the missile goes active; STT
  gives a lock; a semi-active shot gives a launch warning for the whole flight.
- **Guidance rules**: semi-active missiles need the lock until impact; active missiles use datalink while the
  shooter keeps a track, fly to the last estimate if it is lost, and go active near the target. Phoenix
  launch mode is captured at launch: PD-STT stays semi-active; P-STT, PH ACT, and close shots start active.
- **Launch-zone ranges**: missile ranges are tuned to ED's own launch-zone reference tables and community tests;
  every missile lands within 5 % of the reference at the tuning conditions.
- **RWR displays**: SPO-15 lamp panel with its type letters (П З Х Н F С); ALR-56C, ALR-67, ALR-56M, JF-17 and
  Serval scopes with per-RWR ring meaning (priority, not distance).
- **Key bindings**: FC3 keyboard defaults and HOTAS function names as named in the DCS controls menu.

## Deliberately simplified

- **Flight**: you fly a tactical autopilot (commanded heading, altitude, speed), not a stick. All jets share the
  same handling limits apart from their performance numbers.
- **Missiles**: game mechanics (a speed-over-time curve, a turn-rate cap, steering to the intercept point) tuned
  to DCS outcomes. There is no kill probability: a missile that passes close enough kills.
- **Notch and chaff**: modelled as DCS plays them (a radial-speed gate, chaff that works in or near the notch),
  with trainer-chosen timings and odds, because ED does not publish them.
- **AI skill**: launch range, reaction time and notch accuracy per skill level are this trainer's choices shaped
  by documented DCS behaviour.
- **Not modelled**: jamming and burn-through, terrain masking, PRF choices (explained, not simulated), fuel,
  guns, IFF and datalink pictures (the Sortie uses a simple GCI picture for AI steering only).
- **Phoenix controls**: launch-mode guidance is represented, but TGTS remains NORM; pulse acquisition and
  full cockpit controls are not modelled.
- **Launch displays**: the Viper ASC/ASEC geometry and Tomcat TID launch-zone vectors remain simplified.
  The trainer no longer invents SHOOT on the Viper or IN RNG on the classic Tomcat.
- **Free lab inputs**: cursor speed, acquisition gate, and arrow-key heading/altitude commands are trainer
  controls. Optional DCS СНП cursor snap is separate from the manual designation aid.
- **Jamming constraint**: СНП2 checks a scenario flag; this is not an electronic-warfare model.
- **SAM sites**: three sites (SA-10, SA-11, SA-15) stand for the long, medium and short range classes. The site
  holds a track and its missile needs that track to impact; notch plus chaff, terrain (the radar horizon plus a
  scenario ridge height) or leaving the ring breaks it. Missile timing is arcade tuning. AI jets ignore SAMs.

## Not verified (the app labels these)

The [manual/web verification review](research/verification-status.md) separates sourced corrections from
items that still require a current DCS installation. No in-game validation is implied.

- Whether an R-77 or AIM-120 fired from STT gives a launch warning or only the lock until pitbull.
- Whether pressing Enter in the Su-27's СНП forces a lock before 85 % of Rmax (the Su-27 manual says yes; the
  MiG-29 and Su-33 manuals say no). The app follows the Su-27 manual.
- Active-radar pitbull distances for the AIM-120B/C and SD-10 (read from Lua fields whose meaning is disputed).
- Whether the FC3 player radars use the datamined AI detection tables (68 km head-on for the N001), and whether
  the FC3 notch applies when looking up.
- SAM threat-ring radii and altitude bands (community figures from the game files, not checked in the Mission
  Editor); the SA-15 ceiling disagrees between references.
- Default keys for the F-14B Phoenix trigger and for countermeasures on the F-16C, F-14B and JF-17.
- Several scan speeds, bar spacings and beam widths, chaff and flare counts on full-fidelity jets, and most
  radar cross-sections (only the F-15C value comes from DCS).

If you know DCS behaves differently, fix the value in `src/data`, cite the source in `docs/research`, and run
the tests; the pages read everything from the data layer.
