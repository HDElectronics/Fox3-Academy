# DCS link

The DCS link page (`#/dcs`, Reference → DCS link) connects Fox3 Academy to DCS World running on the same
computer. This first version is a connection test: it shows own-ship telemetry arriving from the game and sends
a ping that the export script answers, which proves both directions work. Later features (live debriefs, a
kneeboard that follows your jet) will build on the same link.

```
DCS World                          this computer only (127.0.0.1)                     browser
Fox3Link.lua  ──UDP 47781──►  bridge (npm run dcs-link)  ──HTTP 47780, event stream──►  #/dcs page
Fox3Link.lua  ◄──UDP 47782──  bridge                     ◄──HTTP 47780, POST /command──  #/dcs page
```

A web page cannot open UDP sockets, so a small bridge process sits between the game and the page. It has no
dependencies beyond Node 24.

## Set up

1. Copy `dcs-link/Scripts/Fox3Academy/` from this repository to `Saved Games\DCS\Scripts\Fox3Academy\`.
2. Add this line to the end of `Saved Games\DCS\Scripts\Export.lua` (create the file if it is missing; keep the
   lines Tacview, SRS, DCS-BIOS and other tools put there):

   ```lua
   local Fox3lfs = require('lfs'); dofile(Fox3lfs.writedir() .. [[Scripts\Fox3Academy\Fox3Link.lua]])
   ```

3. In the repository folder, start the bridge and leave it running:

   ```bash
   npm run dcs-link
   ```

4. Open the DCS link page (the public site or `npm run dev`), start a mission and sit in the jet. The DCS lamp
   lights within a second. Press **Send ping**: the Ping lamp lights and the log shows the round trip.

No DCS at hand: `npm run dcs-link:fake` sends made-up frames to the bridge and answers pings.

## Troubleshooting

| Page shows | Check |
|---|---|
| Start the bridge | `npm run dcs-link` is running. "A port is already in use" means another bridge is running. |
| Bridge up, waiting for DCS | The Export.lua line is present, the folder name matches, and you restarted the mission after editing. `Saved Games\DCS\Logs\dcs.log` has `FOX3LINK` lines. |
| DCS went quiet | The game is paused, loading or closed. Frames resume on their own. |
| Server blocks own-ship export | The multiplayer server does not allow own-ship export. The link works; try single player. |
| Ping not answered | The export script logs `cannot listen on 127.0.0.1:47782` in dcs.log when another program holds that port. |

The browser console shows a failed request every few seconds while the bridge is not running. That is the page
retrying, not an error in the app.

Chrome may ask whether the site may reach devices on your local network: allow it. The single-file build opened
from disk has origin `null`; start the bridge with `npm run dcs-link -- --allow-origin null` to use it.

## What it does and does not do

- Everything stays on this computer. The bridge binds 127.0.0.1 only, accepts pages only from the public site,
  its preview deployments and local dev servers, and refuses requests that name another host.
- The export script only reads export data and answers pings. It sends no commands to the jet.
- Values are raw export API values, converted to your units. Units follow ED's reference Export.lua and have not
  been checked against cockpit gauges (see [research/dcs-export.md](research/dcs-export.md)).

Protocol, client API and how to extend the link: [api/dcs-link.md](api/dcs-link.md).
