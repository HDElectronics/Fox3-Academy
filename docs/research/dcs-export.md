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
