# DCS export API (for the DCS link)

What the DCS link relies on. Checked 2026-10-01 against web copies of ED's reference `Export.lua` and community
documentation; not yet observed in the current game build. Each item is labelled.

## Facts used

| Fact | Status | Source |
|---|---|---|
| User export scripts go in `Saved Games\DCS\Scripts\Export.lua`; the file in the install folder is reference only. | Source | ED reference Export.lua header [1] |
| Callbacks: `LuaExportStart`, `LuaExportBeforeNextFrame`, `LuaExportAfterNextFrame`, `LuaExportStop`, `LuaExportActivityNextEvent`. | Source | [1], [2] |
| LuaSocket loads by extending `package.path` / `package.cpath` with `lfs.currentdir() .. '/LuaSocket/?.lua'` / `?.dll`, then `require('socket')`. | Source | [1] |
| `LoIsOwnshipExportAllowed`, `LoIsSensorExportAllowed`, `LoIsObjectExportAllowed` report what a multiplayer server allows clients to export. | Source | [1], [3] |
| `LoGetSelfData`: `Name`, `Heading`, `Pitch`, `Bank` (radians), `LatLongAlt = { Lat, Long, Alt }` (degrees, degrees, metres), `Position` (DCS internal metres). | Source | [1] |
| `LoGetIndicatedAirSpeed`, `LoGetTrueAirSpeed`, `LoGetVerticalVelocity`: m/s. `LoGetAltitudeAboveSeaLevel`, `LoGetAltitudeAboveGroundLevel`: metres. `LoGetMachNumber`: Mach. `LoGetModelTime`: seconds. | Source | [1] |
| `LoGetAccelerationUnits`: table `{ x, y, z }` in G. | Source | [1] |
| `LoGetAngleOfAttack`: radians. | Source, **not verified** | [1]. Community scripts disagree in places; check against the HUD AoA in game. |
| Several exporters share Export.lua by each saving the previous callbacks and calling them (`dofile` per tool). | Common practice | Tacview, SRS [4] and DCS-BIOS install this way. |

## Not verified in game (check and record here)

- `LoGetAngleOfAttack` unit (radians or degrees) and sign.
- Whether `LoGetSelfData().Heading` is true or magnetic. The page labels it "Heading" without either.
- Which `acc` axis matches the cockpit G meter (the page shows `y`).
- Whether `LoGetIndicatedAirSpeed` matches the cockpit IAS on each module (some modules have their own airspeed
  systems).
- Whether `LuaExportAfterNextFrame` keeps running while the game is paused (the page shows "DCS went quiet" if not).
- `LoIs*ExportAllowed` behaviour on a server with own-ship export disabled.

## Sources

1. ED reference `Export.lua` (copy): https://pastebin.com/Hq6bvJqz
2. Hoggit wiki, DCS export: https://wiki.hoggitworld.com/view/DCS_export
3. DCS control API notes: https://github.com/ArkYk/DCS_API/blob/master/DCS_ControlAPI.md
4. SRS Export.lua: https://github.com/ciribob/DCS-SimpleRadioStandalone/blob/master/Scripts/Export.lua

## Export data for the F/A-18C copilot

Checked 2026-10-01 by reading the files of the local DCS install (read only). Paths:
`Export.lua` = `DCSWorld\Scripts\Export.lua` (ED reference copy, 1505 lines; its header, lines 1-3, says it is for
reference only). `HC\` = `DCSWorld\Mods\aircraft\FA-18C\Cockpit\Scripts\`. All Hornet cockpit scripts listed
below are plain-text Lua (not encrypted or compiled); the device logic itself is native code
(`HC\device_init.lua:400-402` creates the IFEI as `"F18::avIFEI_F18"`), so the Lua shows argument numbers and
names but not how the device computes them. Labels: **File** = stated in the file at the cited line;
**Community** = taken from an open-source exporter (sources at the end of this section); **Inferred** = my
reading, not stated anywhere; **Not verified** = must be observed in game before the UI relies on it.

### Permission categories

Multiplayer servers set three checkboxes: `allow_object_export`, `allow_ownship_export` ("Allow player export"),
`allow_sensor_export` ("Allow sensor export") (`DCSWorld\MissionEditor\modules\mul_advanced.lua:24-26, 176-178`).
The export side reads them with `LoIsObjectExportAllowed` ("world objects data"), `LoIsSensorExportAllowed`
("radar/targets data"), `LoIsOwnshipExportAllowed` ("ownship data") (`Export.lua:433-435`). Export.lua does not
say which function falls in which category; the only per-function notes are:

- `LoGetSelfData` "return the same result as LoGetObjectById but only for your aircraft and not depended on
  anti-cheat setting" (`Export.lua:647`). **Conflict:** the Hoggit wiki [5] and [3] list it under Ownship.
  Treat it as ownship-gated until observed on a server with player export off.
- `LoGetPlayerSeat` "requires ownship export allowed" (`Export.lua:1451`).

The grouping below is **Community** ([5] and [3] give identical lists):

- Object: `LoGetObjectById`, `LoGetWorldObjects`.
- Sensor: `LoGetTWSInfo`, `LoGetTargetInformation`, `LoGetLockedTargetInformation`, `LoGetF15_TWS_Contacts`,
  `LoGetSightingSystemInfo`, `LoGetWingTargets`.
- Ownship: everything else used here (`LoGetMechInfo`, `LoGetEngineInfo`, `LoGetMCPState`, `LoGetPayloadInfo`,
  `LoGetSnares`, `LoGetRadarAltimeter`, `LoGetGlideDeviation`, `LoGetSideDeviation`, `LoGetNavigationInfo`,
  `LoGetAngleOfAttack`, `LoGetSelfData`, `LoGetCameraPosition`, plus the flight parameters already sent).
- Cockpit arguments and indications (`GetDevice(0):get_argument_value`, `list_indication`) are in none of these
  lists. Whether a server can block them is **not verified**.

### Export functions

| Function | Fields | Units | Permission | Source line |
|---|---|---|---|---|
| `LoGetMechInfo()` | `gear = {status, value, main = {left = {rod}, right = {rod}, nose = {rod}}}`; `flaps`, `speedbrakes`, `refuelingboom`, `airintake`, `noseflap`, `parachute`, `wheelbrakes`, `hook`, `wing`, `canopy` each `{status, value}`; `controlsurfaces = {elevator = {left,right}, eleron = {left,right}, rudder = {left,right}}` | control surfaces "relative values (-1,1)"; nothing stated for `status`/`value` | Ownship | `Export.lua:782-797` |
| | No launch-bar field exists in the structure. Meaning of `status` vs `value` is **not documented** in the file. **Inferred** (community usage): `status` is the commanded/locked state (0 or 1), `value` the 0..1 position of the part in transit. **Not verified** for the Hornet. | | | `Export.lua:785-795` |
| `LoGetEngineInfo()` | `RPM = {left, right}`, `Temperature = {left, right}`, `HydraulicPressure = {left, right}`, `FuelConsumption = {left, right}`, `fuel_internal`, `fuel_external` | RPM %; temperature °C; hydraulic kg/cm²; fuel consumption **kg per sec**; fuel quantities **kg** | Ownship | `Export.lua:478-488` |
| | The Hornet IFEI shows pounds (**Inferred**, NATOPS layout); convert kg × 2.20462. Whether `fuel_external` counts only drop tanks is **not verified**. | | | |
| `LoGetMCPState()` | Table of booleans, keys: `LeftEngineFailure`, `RightEngineFailure`, `HydraulicsFailure`, `ACSFailure`, `AutopilotFailure`, `AutopilotOn`, `MasterWarning`, `LeftTailPlaneFailure`, `RightTailPlaneFailure`, `LeftAileronFailure`, `RightAileronFailure`, `CanopyOpen`, `CannonFailure`, `StallSignalization`, `LeftMainPumpFailure`, `RightMainPumpFailure`, `LeftWingPumpFailure`, `RightWingPumpFailure`, `RadarFailure`, `EOSFailure`, `MLWSFailure`, `RWSFailure`, `ECMFailure`, `GearFailure`, `MFDFailure`, `HUDFailure`, `HelmetFailure`, `FuelTankDamage` | boolean | Ownship | `Export.lua:581-610` |
| | The key set is FC3-style; which keys the Hornet populates is **not verified**. Prefer the Hornet caution lamps (below). | | | |
| `LoGetTWSInfo()` | `Mode` (0 all, 1 lock only, 2 launch only); `Emitters[]` of `{ID, Type = {level1..4}, Power, Azimuth, Priority (int), SignalType}`; `SignalType` is one of `"scan"`, `"lock"`, `"missile_radio_guided"`, `"track_while_scan"` | `Azimuth` unit not stated (**Inferred** radians, like every other angle in the file) | Sensor | `Export.lua:751-765` |
| `LoGetTargetInformation()` / `LoGetLockedTargetInformation()` | Array of `{ID, type = {level1..4}, country, position = {x,y,z,p}, velocity {x,y,z}, distance, convergence_velocity, mach, delta_psi, fim, fin, flags, reflection, course, isjamming, start_of_lock, forces {x,y,z}, updates_number, jammer_burned}`. `flags` bits: `0x0002` radar view (BVR), `0x0004` EOS view, `0x0008` radar lock (STT), `0x0010` EOS lock, `0x0020` radar track (TWS), `0x0040` EOS track, `0x0200` net human plane, `0x0400` EasyRadar autolock, `0x0800` HOJ | velocity m/s; distance m; closing speed m/s; aspect and view angles rad; course rad; RCS m²; `start_of_lock` time | Sensor | `Export.lua:663-701` |
| | First is "current targets", second "current locked targets" (`Export.lua:663-664`). Whether the Hornet radar fills these is **not verified**. | | | |
| `LoGetSnares()` | `{chaff, flare}` | counts | Ownship | `Export.lua:859` |
| `LoGetPayloadInfo()` | `CurrentStation` (0 if none), `Stations[]` of `{container (bool), weapon = {level1..4}, count}`, `Cannon = {shells}`; names via `LoGetNameByType(l1,l2,l3,l4)` | counts | Ownship | `Export.lua:766-781`, `661`, example `152-164` |
| `LoGetRadarAltimeter()` | one number | m | Ownship | `Export.lua:466` |
| `LoGetGlideDeviation()` / `LoGetSideDeviation()` | one number each | "-1 < result < 1"; sign and full-scale meaning **not documented**; whether the Hornet's ICLS/ILS drives them is **not verified** | Ownship | `Export.lua:462-463` |
| `LoGetRadioBeaconsStatus()` | `airfield_near`, `airfield_far`, `course_deviation_beacon_lock`, `glideslope_deviation_beacon_lock` | flags | Ownship | `Export.lua:799-805` |
| `LoGetNavigationInfo()` | `SystemMode = {master, submode}` (master `"NAV"`, `"BVR"`, `"CAC"`, `"LNG"`, `"A2G"`, `"OFF"`; BVR submodes `"GUN"`, `"RWS"`, `"TWS"`, `"STT"`, `"OFF"`, others listed), `Requirements = {roll, pitch, speed, vertical_speed, altitude}`, `ACS = {mode, autothrust}` | strings; requirement units not stated | Ownship | `Export.lua:505-580` |
| | Modes "depend of plane type"; the list is FC3-shaped. Hornet output **not verified**. | | | |
| `LoGetAngleOfAttack()` | one number | rad | Ownship | `Export.lua:454` |
| `LoGetSelfData()` / `LoGetObjectById(id)` | `Name`, `Type = {level1..4}`, `Country`, `Coalition`, `CoalitionID` (1 or 2), `LatLongAlt = {Lat, Long, Alt}`, `Heading`, `Pitch`, `Bank`, `Position = {x,y,z}`, units only: `UnitName`, `GroupName`, `Flags = {RadarActive, Human, Jamming, IRJamming, Born, AI_ON, Invisible, Static}` | angles rad; Position internal metres | see above (SelfData disputed; ById = Object) | `Export.lua:611-637`, `647` |
| | The Hornet's type string is `"FA-18C_hornet"` (`DCSWorld\Mods\aircraft\FA-18C\entry.lua:38`). That `LoGetSelfData().Name` returns this type string is **Inferred** (community practice); use it to switch the Hornet argument export on. | | | |
| `LoGetCameraPosition()` | `{x = {x,y,z}, y = {x,y,z}, z = {x,y,z}, p = {x,y,z}}` orientation vectors and point | m | Ownship | `Export.lua:651-658` |
| `LoGetAircraftDrawArgumentValue(arg)` | external-model draw argument of own aircraft | number | not listed by [3]/[5]; **not verified** | `Export.lua:862` |
| `LoGetFMData()` | `G_factor`, `speed`, `acceleration` (body axis), `angular_speed`, `angular_acceleration`, `yaw`, `pitch`, `roll`, `master` | rad, rad/s | Ownship | `Export.lua:1457-1469` |

### GetDevice, get_argument_value and list_indication in Export.lua

The reference file contradicts itself:

- `Export.lua:1249-1254` says the avDevice API (`GetDevice(device_id)`) is available "in cockpit device Lua
  scripts (not in the external Saved Games `Export.lua`)", and `Export.lua:1268-1270` says the same of the
  trigger-system API, which includes `list_indication(indicator_id) -> string` (`Export.lua:1315`).
- The file's own export callback example uses `GetIndicator(1)` and `local mainpanel = GetDevice(0)` inside
  `LuaExportOnHumanStart` (`Export.lua:71-78`).
- DCS-BIOS, which runs from `Saved Games\DCS\Scripts\Export.lua`, reads every Hornet control with
  `dev0:get_argument_value(arg)` / `GetDevice(0):get_argument_value(arg)` and the IFEI with
  `list_indication(5)` [6], [7]. **Community**, widely used, so both work in the export environment in practice.

Conclusion: `GetDevice(0):get_argument_value(n)` (device 0 = main panel, `Export.lua:76`) and
`list_indication(i)` are usable from Fox3Link.lua; call them in `pcall`, as the existing `get()` helper does.
`list_indication` returns one string of blocks separated by a line of dashes, each block an element name then
its text (DCS-BIOS `Module.parse_indication` [7]).

Hornet indicator ids for `list_indication` (**Inferred** from creation order, 0-based):
0 Controls indicator, 1 HUD, 2 left DDI, 3 right DDI, 4 AMPCD, 5 IFEI, 6 UFC, 7 RWR
(`HC\device_init.lua:796-873`; `writeParameter("HUD_INDICATOR_INDEX", #indicators)` at line 803 runs when one
indicator exists, so the HUD is index 1 and the list is 0-based). IFEI = 5 is **Community**-confirmed by
DCS-BIOS `parse_indication(5)` [6]. Helmet and baked indicators are appended after the RWR (lines 875-899), so
ids above 7 change with options.

### Hornet cockpit controls and lights

Value conventions from `HC\clickable_defs.lua`: a 2-position toggle (`default_2_position_tumb`, lines 144-161)
steps by -1/+1 inside `{0,1}`, so it reads 0 or 1; a 3-position toggle (`default_3_position_tumb`, 198-225)
reads -1, 0 or 1; `default_button2` (622-640) reads 0 or 1; `springloaded_3_pos_tumb` (301-323) puts command 1
at -1, rest 0, command 2 at +1. Lamps (`HC\MainPanel\lamps.lua:1-11`) are gauges with range -1..1 driven by the
warning/caution controller; **Inferred**: lit = 1, off = 0, use `> 0.5`. Which end of a toggle is which label
is not in the ED files; the "Values" column gives the Helios mapping [8] (**Community**) unless marked **File**.

| Control/indicator | Device or arg | Values | Source file:line |
|---|---|---|---|
| Master Arm switch | SMS (dev 23), arg 49 | 1 ARM, 0 SAFE (Community [8]) | `HC\clickabledata.lua:233`; `HC\devices.lua:33` |
| Master mode A/A, A/G lights | args 47, 48 | lamp | `HC\MainPanel\lamps.lua:165-166` |
| Master arm READY, DISCH lights | args 44, 45 | lamp | `lamps.lua:167-168` |
| Landing gear handle | GEAR_INTERFACE (dev 5), arg 226 | 1 UP, 0 DOWN (Community [8]; consistent with the hint "(RMB)UP/(LMB)DOWN" and the -1/+1 steps in `clickable_defs.lua:542-566`, Inferred) | `clickabledata.lua:83` |
| Emergency gear down handle | arg 228 | 0..1 pull | `clickabledata.lua:83`; `HC\mainpanel_init.lua:185` |
| Gear handle warning light | arg 227 | lamp | `lamps.lua:172` |
| Gear position lights NOSE, LEFT, RIGHT | args 166, 165, 167 | lamp (green) | `lamps.lua:154-156` |
| FLAP switch AUTO/HALF/FULL | CONTROL_INTERFACE (dev 2), arg 234 | 1 AUTO, 0 HALF, -1 FULL (Community [8]) | `clickabledata.lua:19` |
| HALF FLAPS, FULL FLAPS, FLAPS lights | args 163, 164, 162 | lamp (FLAPS is yellow per [6]) | `lamps.lua:157-159` |
| Arresting hook handle | GEAR_INTERFACE, arg 293 | 1 UP, 0 DOWN (Community [8]) | `clickabledata.lua:110` |
| Hook light | arg 294 | lamp | `lamps.lua:170` |
| Hook bypass switch FIELD/CARRIER | CPT_LIGHTS (dev 9), arg 239 | 1 FIELD, 0 CARRIER (Community [8]) | `clickabledata.lua:167` |
| Launch bar switch EXTEND/RETRACT | GEAR_INTERFACE, arg 233 | 1 EXTEND, 0 RETRACT (Community [8]); electrically held, `updatable` (File) | `clickabledata.lua:108-109` |
| Launch bar L BAR red / green lights | args 21, 23 | lamp | `lamps.lua:129, 131` |
| Anti-skid switch | GEAR_INTERFACE, arg 238 | 1 ON, 0 OFF (Community [8]) | `clickabledata.lua:86` |
| Emergency/parking brake handle | GEAR_INTERFACE: arg 240 pull/stow, arg 241 rotate PARK/EMERG | 240: 1 pulled, 0 stowed (Community [8]). 241: steps 0.333 / -0.666 within 0..0.999 (File); which value is PARK is **not verified** | `clickabledata.lua:88-106`; `mainpanel_init.lua:186` |
| APU control switch | ENGINES_INTERFACE (dev 12), arg 375 | 1 ON, 0 OFF (Community [8]); electrically held, drops to 0 when the APU stops (`updatable`, File; "electrically held" per [6]) | `clickabledata.lua:74-75` |
| APU READY light | arg 376 | lamp (green) | `lamps.lua:174` |
| APU ACC caution | arg 299 | lamp | `lamps.lua:109` |
| Engine crank switch LEFT/OFF/RIGHT | ENGINES_INTERFACE, arg 377 | -1 LEFT, 0 OFF, +1 RIGHT (File: command 1 is `EngineCrankLSw` at -1, `clickabledata.lua:76` with `clickable_defs.lua:301-314`; matches [8]) | `clickabledata.lua:76` |
| Battery switch ON/OFF/ORIDE | ELEC_INTERFACE (dev 3), arg 404 | 1 ON, 0 OFF, -1 ORIDE (Community [8]) | `clickabledata.lua:47` |
| Left / right generator switch NORM/OFF | ELEC_INTERFACE, args 402, 403 | 1 NORM, 0 OFF (Community [8]) | `clickabledata.lua:48-49` |
| L GEN, R GEN, BATT SW, GEN TIE cautions | args 307, 308, 300, 302 | lamp | `lamps.lua:117-118, 110, 112` |
| Voltmeters U, E | args 400, 401 | 0..1 maps 16..30 (volts, Inferred) | `mainpanel_init.lua:153-163` |
| Hydraulic pressure L, R | args 310, 311 | 0..1 maps 0..5000 (psi, Inferred) | `mainpanel_init.lua:166-176` |
| Brake pressure | arg 242 | non-linear table over 0..5000 (psi, Inferred) | `mainpanel_init.lua:178-182` |
| Canopy | cockpit arg 181 (from external arg 38) | 0..1 | `mainpanel_init.lua:122` |
| MASTER CAUTION light | arg 13 | lamp | `lamps.lua:121` |
| MASTER CAUTION reset button | CPT_LIGHTS, arg 14 | button | `clickabledata.lua:166` |
| FUEL LO caution | arg 304 | lamp | `lamps.lua:114` |
| SPD BRK advisory | arg 19 | lamp | `lamps.lua:127` |
| L BLEED, R BLEED | args 17, 18 | lamp | `lamps.lua:125-126` |
| FIRE LEFT, FIRE RIGHT, FIRE APU lights | args 10, 26, 29 | lamp (red) | `lamps.lua:122, 136, 135` |
| Fire push-buttons (not the lights) | L arg 11 (cover 12), R arg 27 (cover 28), APU arg 30 | 0/1 | `clickabledata.lua:256-259` |
| AoA indexer HIGH / CENTER / LOW | args 4, 5, 6 | lamp; DCS-BIOS colours: high green, normal yellow, low red [6] | `lamps.lua:182-184` |
| LOCK, SHOOT, SHOOT STROBE | args 1, 2, 3 | lamp | `lamps.lua:161-163` |
| Threat lights SAM, AI, AAA, CW | args 38, 39, 40, 41 | lamp | `lamps.lua:139-142` |
| Radar altimeter LOW ALT warning | arg 290 | lamp | `lamps.lua:180`; `mainpanel_init.lua:288` |
| Radar altimeter pointer | arg 286 | non-linear table over -10..5100 (feet, Inferred) | `mainpanel_init.lua:281-285` |
| IFEI fuel, upper window | `list_indication(5)` element `txt_FUEL_UP` | display string | `HC\IFEI\indicator\IFEI_MAIN_page.lua:16` |
| IFEI fuel, lower window | element `txt_FUEL_DOWN` | display string | `IFEI_MAIN_page.lua:17` |
| IFEI BINGO | element `txt_BINGO` | display string | `IFEI_MAIN_page.lua:15` |
| IFEI RPM, TEMP, FF, OIL L/R | `txt_RPM_L/R`, `txt_TEMP_L/R`, `txt_FF_L/R`, `txt_OilPress_L/R` | display strings | `IFEI_MAIN_page.lua:3-13` |

IFEI notes: upper window = total fuel, lower = internal (**Inferred** from the real IFEI layout; the file only
names them UP/DOWN). Values are display strings in pounds, possibly with a trailing letter and blank when the
IFEI is off or on another page; parse defensively. **Not verified** in game. DCS-BIOS exports the same three
names [6].

Not found: the HOTAS speed brake switch has no active clickable (`clickabledata.lua:219` is commented out); use
`LoGetMechInfo().speedbrakes` and the SPD BRK light instead.

### Observed in game (F/A-18C, 2026-10-01)

One live frame from export script v0.2.0, single player, during a 4.3 G pull at about 370 KIAS, IFEI showing
6930 lb. These override the reference file and the inferred values above for the Hornet.

| Item | Observed | Consequence |
|---|---|---|
| `LoGetAngleOfAttack` | `9.07` | **Degrees**, not radians as `Export.lua:454` says (9.07 rad would be 519°). |
| `LoGetEngineInfo` `fuel_internal` / `fuel_external` | `0.658` / `0` | A 0..1 **fraction**, not kg, for the Hornet. Fuel comes from the IFEI total instead. |
| `LoGetEngineInfo` `FuelConsumption` | `3.57` each at 100 % RPM | Unit unclear (kg/s would be 28000 lb/h per engine); not used. The copilot measures burn from the IFEI trend. |
| `LoGetMechInfo` | `gear 0`, `flaps 0.246`, `speedbrakes 0`, no `hook` | Gear and flaps filled; **hook absent**: use cockpit arg 293. Flaps move in AUTO, so the position is not the switch. |
| `LoGetMCPState` | `{}` | Nothing set; not filled for the Hornet or nothing was failing. |
| IFEI `txt_FUEL_UP` / `txt_FUEL_DOWN` / `txt_BINGO` | `6930T` / `6930I` / `0` | Total and internal as inferred; BINGO reads `0` until set. |
| Args 226, 234, 293, 49 | `1`, `1`, `1`, `1` with gear up, flaps AUTO, hook up, master arm ARM | Matches the community value maps. |
| Permissions | ownship, sensor, object all `true` | Single player allows everything. |

### Hornet displays (observed in game, 2026-10-02)

Two recorded flights in the copilot test mission (export script v0.4.0 and v0.4.1, display dumps every 2 s). The
FC3 sensor functions `LoGetTWSInfo`, `LoGetLockedTargetInformation` and `LoGetTargetInformation` returned
nothing for the Hornet, even while locked and firing, and `LoGetPayloadInfo().CurrentStation` was never set.
What the jet displays is available as text through `list_indication(id)`:

| id | Display | Elements the copilot uses | Observed values |
|---|---|---|---|
| 1 | HUD | `HUD_AA_targetRange_FLOOD`, `HUD_AA_targetRangeRate`, `HUD_AA_TD_box_IN_LAR_cue`, `TOF_TTG_VAL` + `AA_MSL_label`, `MEM_RMEM_Label`, `HUD_TargetAngleReadout`, `HUD_EW_ThreatSymbol<n>`, `HUD_EW_SpecialSymbolsStt<n>` | `31.3RNG`, ` 870V` (closure, kt), `IN LAR`, `56` + `ACT`/`TTG`, `MEM 7`, ` 16`..` 63`, `29`; the STT special symbol appears while the AI light is lit |
| 2 | Left DDI, stores | station labels, `Master_Arm_Status`, `Gun_Data_Rounds` | `9X`, `AC`, `SEL`, `ARM`, `578` |
| 3 | Right DDI, radar attack format | `Radar_mode`, `RadarRange_VS_scaleMax`, `TUC_PlaceholderTUC_Altitude`, `ASPECT_DDI`, `TargetHeading`, `IN_LAR_DDI`, `TOF_DDI`, `MissileTTG<n>` + `AA_MSL_Symb_Mode<n>`, `MEM_RMEM_JAM_RJAM_Label` | `RWS`, `40`, `19` (thousands of ft), `0`..`6`, ` 83°`, `IN LAR`, `16`, `TTA` then `A` |
| 4 | AMPCD, HSI | compass and HSI text | |
| 5 | IFEI | fuel, BINGO, RPM, TEMP, FF, oil, clock | `11600T`, `0`, `98`, `818`, `86` |
| 6 | UFC | option and scratchpad text, comm channels | |
| 7 | RWR display | `RWR_ThreatSymbol<n>`, `RWR_ThreatFlasher<n>`, `RWR_PrioritySetting` | `29` for the Su-27; the symbol blinks off in some reads while CW is lit |

Lights: the AI light (arg 39) lit when the Su-27 locked the player; the CW light (arg 41) lit about one second
later, during the R-27ER shot. ED guide p414: AI = hostile AI radar lock, CW = CW radar, probably guiding a
missile.

Not in the text: threat bearings (the RWR and HUD draw them as graphics, `RWR_ThreatPlacer<n>` carries no value),
and the target type (no NCTR in the text). `ASPECT_DDI` and `HUD_TargetAngleReadout` meanings are not verified.
### Recommended export set for the copilot

In priority order. Every item is a read; none sends a command to the aircraft.

1. **Fuel and limits (ownship).** `LoGetEngineInfo()`: `fuel_internal`, `fuel_external` (kg),
   `FuelConsumption` (kg/s), `RPM` (%). Enough for fuel state, burn rate and time to bingo without any
   Hornet-specific code. Add `LoGetFMData()` only if `LoGetAccelerationUnits` proves wrong for the G limit.
2. **Landing configuration (ownship).** `LoGetMechInfo()`: `gear`, `flaps`, `hook`, `speedbrakes`,
   `wheelbrakes`, `canopy` as `{status, value}`; `LoGetRadarAltimeter()`; `LoGetGlideDeviation()`,
   `LoGetSideDeviation()`, `LoGetRadioBeaconsStatus()` for the landing coach (all three need an in-game check
   on the Hornet before the coach trusts them). AoA is already sent.
3. **Hornet cockpit arguments**, only when `LoGetSelfData().Name == 'FA-18C_hornet'`, via
   `GetDevice(0):get_argument_value(n)` in `pcall`, 2-5 Hz is enough:
   - checklist switches: 49, 226, 234, 293, 233, 238, 239, 240, 241, 375, 377, 404, 402, 403;
   - lights: 13 (MASTER CAUTION), 304 (FUEL LO), 10, 26, 29 (FIRE), 376 (APU READY), 165, 166, 167 (gear),
     162, 163, 164 (flaps), 227 (gear handle), 294 (hook), 19 (SPD BRK), 21, 23 (L BAR), 4, 5, 6 (AoA indexer),
     1, 2, 3 (LOCK/SHOOT), 290 (LOW ALT), 47, 48, 44, 45 (master arm panel).
   Send raw numbers and decode in the app, so a wrong value mapping is fixed in TypeScript, not in the script
   the user installed.
4. **IFEI strings.** `list_indication(5)`, keep `txt_FUEL_UP`, `txt_FUEL_DOWN`, `txt_BINGO`, at 1-2 Hz. Gives
   the BINGO the pilot actually set, which the export functions do not provide.
5. **Stores and countermeasures (ownship).** `LoGetSnares()`, `LoGetPayloadInfo()` (counts and
   `Cannon.shells`; send `LoGetNameByType` names rather than raw type tuples).
6. **Threat helper (needs sensor export in multiplayer).** `LoGetTWSInfo()` (emitters: `SignalType`, `Azimuth`,
   `Priority`, `Type` name) and `LoGetLockedTargetInformation()` (distance, closing speed, aspect, `flags`).
   Send only when `LoIsSensorExportAllowed()` is true and tell the user when the server forbids it. Keep this
   at RWR-picture level: emitter, bearing, lock or launch, nothing about missile internals (rule 1).
7. **Do not add** `LoGetWorldObjects` / `LoGetObjectById` (object export, truth data the pilot does not have) or
   `LoGetMCPState` / `LoGetNavigationInfo` until an in-game check shows the Hornet fills them.

Needs multiplayer permission: items 1, 2 and 5 need player (ownship) export, which the script already checks
(`own == false` returns an empty frame); item 6 needs sensor export. Items 3 and 4 are not covered by any
documented permission (**not verified**); gate them behind the ownship flag as well so the script never sends
more than a server allows.

Checks to run in game: LoGetMechInfo `status`/`value` while the gear cycles; the toggle values in the table
(especially gear 226, flaps 234, parking brake 241); IFEI strings with the IFEI off and on the SP page;
`LoGetGlideDeviation` on an ICLS approach; whether `LoGetTWSInfo` lists Hornet RWR contacts.

### Sources for this section

5. Hoggit wiki, DCS export (permission groups): https://wiki.hoggitworld.com/view/DCS_export
6. DCS-BIOS F/A-18C module: https://github.com/DCS-Skunkworks/dcs-bios/blob/main/Scripts/DCS-BIOS/lib/modules/aircraft_modules/FA-18C_hornet.lua
7. DCS-BIOS `Module.lua` (`parse_indication`, `get_argument_value`): https://github.com/DCS-Skunkworks/dcs-bios/blob/main/Scripts/DCS-BIOS/lib/modules/Module.lua
8. Helios F/A-18C interface (switch position values): https://github.com/edowson/Helios/blob/master/Helios/Interfaces/DCS/FA18C/FA18CInterface.cs
   (an older fork; values corroborate argument numbers but are not re-checked against the current Helios).
