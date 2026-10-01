# DCS link (`dcs-link/`, `src/dcs/`) — API

Connection between DCS World and the app on the same computer. User setup: [../dcs-link.md](../dcs-link.md).
Sources for the export API: [../research/dcs-export.md](../research/dcs-export.md).

| File | Runs in | Role |
|---|---|---|
| `dcs-link/Scripts/Fox3Academy/Fox3Link.lua` | DCS export environment (Lua 5.1) | Sends telemetry, answers commands. |
| `dcs-link/bridge.ts` | Node 24 (`npm run dcs-link`) | UDP ↔ HTTP relay, origin and host checks. |
| `dcs-link/fake-dcs.ts` | Node 24 (`npm run dcs-link:fake`) | Stand-in for DCS and the export script. |
| `src/dcs/protocol.ts` | Browser | Ports, message types, `parse*()` for untrusted input. |
| `src/dcs/client.ts` | Browser | `DcsLink`: event stream, state, pings. |
| `src/pages/dcs-link/` | Browser | The `#/dcs` test page. |

`tests/dcs-link.test.ts` runs the bridge on real loopback sockets and checks that the ports agree across the
bridge, fake DCS, page, export script and the CSP in `public/_headers`.

## Ports

All on 127.0.0.1. `DCS_LINK_PORTS` in `protocol.ts`, `DEFAULT_PORTS` in `bridge.ts`, constants in the Lua file.

| Port | Protocol | Direction |
|---|---|---|
| 47780 | HTTP | page ↔ bridge. Fixed: the public site's CSP allows only `http://127.0.0.1:47780`. |
| 47781 | UDP | export script → bridge |
| 47782 | UDP | bridge → export script |

## Protocol v1: DCS → bridge

One JSON object per datagram, at most 8 KiB, always with `v: 1`, `type` and `script` (export script version).
The bridge drops anything else and counts it as rejected. Fields the export API cannot supply are omitted.

| `type` | When | Fields |
|---|---|---|
| `hello` | `LuaExportStart` | `t` |
| `frame` | Every 0.1 s of real time, from `LuaExportAfterNextFrame` | below |
| `pong` | Answer to `ping <id>`, read in `LuaExportBeforeNextFrame` | `id`, `t` |
| `bye` | `LuaExportStop` | `t` |

Frame fields (units as the export API returns them):

| Field | Source | Unit |
|---|---|---|
| `seq` | counter since mission start | |
| `t` | `LoGetModelTime` | s |
| `allow.ownship`, `.sensor`, `.object` | `LoIsOwnshipExportAllowed` etc. | boolean, omitted when the function is missing |
| `self.name`, `.lat`, `.lon`, `.alt`, `.hdg`, `.pitch`, `.bank` | `LoGetSelfData` | unit type name, deg, deg, m, rad, rad, rad |
| `pilot` | `LoGetPilotName` | |
| `ias`, `tas` | `LoGetIndicatedAirSpeed`, `LoGetTrueAirSpeed` | m/s |
| `mach` | `LoGetMachNumber` | |
| `altMsl`, `altAgl` | `LoGetAltitudeAboveSeaLevel`, `LoGetAltitudeAboveGroundLevel` | m |
| `vv` | `LoGetVerticalVelocity` | m/s |
| `aoa` | `LoGetAngleOfAttack` | rad (not verified) |
| `acc.x`, `.y`, `.z` | `LoGetAccelerationUnits` | G |

When own-ship export is blocked, a frame carries only `seq`, `t` and `allow`.

## Protocol v1: bridge → DCS

Text datagrams, one command each. Only `ping <id>` (`id` a non-negative 31-bit integer) exists; the export
script ignores anything else and reads at most 16 commands per frame.

## Bridge HTTP API

| Request | Answer |
|---|---|
| `GET /events` | `text/event-stream`. `event: status` (on connect, then every second) and `event: dcs` (each datagram, JSON re-serialised). `retry: 2000`. |
| `GET /status` | The same status object as JSON. |
| `POST /command` | Body `{"type":"ping","id":n}`, `content-type: application/json` (forces a CORS preflight). 202 `{ok:true}`; 400 unknown command; 415 other content type. |
| `OPTIONS *` | CORS preflight, including `Access-Control-Allow-Private-Network` for Chrome. |

Status: `{ v: 1, type: 'status', bridge, ports, dcs: { packets, rejected, lastPacketAgeMs, script }, commands, clients }`.

Every request must name a loopback `Host` (DNS-rebinding guard). A request with an `Origin` outside
`DEFAULT_ORIGINS` (the public site, `*.fox3-academy.pages.dev` previews, `http://localhost:*`,
`http://127.0.0.1:*`) gets 403, so a page from another site cannot read telemetry or send commands even with
a no-CORS request. `--allow-origin <o>` adds origins.

`createBridge(options)` returns `{ start(), stop(), status() }`; port 0 picks a free port (tests).
`parseCommand`, `parseDatagram`, `originAllowed`, `hostAllowed` and `parseArgs` are exported for tests.

## Page client: `DcsLink` (`src/dcs/client.ts`)

```ts
const link = new DcsLink();                 // { base?, eventSource?, fetch?, now? } for tests
const off = link.on(event => ...);          // LinkEvent: bridge | dcs | hello | bye | ping | pong | ping-lost | error
link.start();
link.snapshot();                            // LinkSnapshot, cheap: call at ~10 Hz
await link.ping();                          // pong event carries rttMs; lost after PING_TIMEOUT_MS (3 s)
link.stop(); off();
```

- `bridge`: `off` → `connecting` → `up` / `down`. The browser's EventSource retries on its own; when it gives up
  (the bridge refused the stream) the client reopens it after 5 s.
- `dcs`: `none` → `live` (frames arriving) → `stale` (none for `STALE_AFTER_MS`, 2 s) or `stopped` (bye).
- Snapshot: `status`, last `frame`, `frames`, `rateHz` (2 s window), `lastFrameAgeMs`, `script`, `pings`.
- `parseDcsMessage` and `parseBridgeStatus` keep only known, finite, correctly typed fields.

## Extending

- **A new telemetry field:** read it in `buildFrame()` in the Lua file, add it to `DcsFrame` and
  `parseDcsMessage`, show it in the page model, document it here with its source and unit. Add it to
  `docs/research/dcs-export.md` with a source. Keep rule 1: gameplay-level data only.
- **A new command:** add it to `parseCommand`/`commandLine` in the bridge, the Lua command loop, the client and
  this table. Anything that changes the game (for example `LoSetCommand`) needs an explicit opt-in on the
  page and must stay limited to the allow-listed origins.
- **Protocol changes:** bump `v` in all four places and keep the page tolerant of the older version.
- Keep every Lua step inside `pcall` and never block the DCS frame (sockets use `settimeout(0)`).
