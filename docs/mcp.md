# DCS MCP server

`fox3-dcs` is an MCP server that lets an AI assistant (Claude Desktop, Claude Code or any MCP client) read your
jet live in DCS and answer from Fox3 Academy's sourced notes: "what's my fuel?", "am I in range?", "what is on my
RWR?", "talk me through the Case I break". It is read-only: it never presses a switch or sends anything to DCS.

```
DCS ──export script──► bridge (npm run dcs-link) ──event stream──► fox3-dcs MCP server ◄──stdio──► Claude
```

## Set up

1. Have the [DCS link](dcs-link.md) working: export script installed, `npm run dcs-link` running.
2. Build the server once (and again after pulling changes):

   ```bash
   npm run dcs-mcp:build
   ```

3. Add it to your client. The client starts the server itself; you do not run it.

   **Claude Code**, from any folder (use your own path to the repository):

   ```bash
   claude mcp add fox3-dcs -- node C:/path/to/Fox3-Academy/dcs-link/mcp/dist/fox3-dcs-mcp.mjs
   ```

   **Claude Desktop**: Settings → Developer → Edit Config, then add to `claude_desktop_config.json`:

   ```json
   { "mcpServers": { "fox3-dcs": { "command": "node", "args": ["C:/path/to/Fox3-Academy/dcs-link/mcp/dist/fox3-dcs-mcp.mjs"] } } }
   ```

   Restart Claude Desktop.

4. Check it without a client: `node dcs-link/mcp/smoke.mjs` lists the tools and calls a few.

## Tools

| Tool | Answers |
|---|---|
| `dcs_status` | Is the bridge up, is DCS live, export script version, aircraft, what the server allows |
| `flight_state` | Speeds, altitude, attitude, G, AoA, phase, gear, flaps, hook, position, mission time |
| `fuel_state` | Fuel (IFEI total in the Hornet), bingo and where it came from, joker, burn rate, minutes to bingo |
| `threats` | What your RWR shows: Hornet RWR symbols and the AI, CW, SAM, AAA lights; FC3 RWR types and clock |
| `radar_lock` | Your lock: range, closure, IN LAR, missiles in flight and time to active, radar memory |
| `weapons` | Stores left, gun rounds, master arm, chaff and flares |
| `cockpit_switches` | F/A-18C switch positions, lit lamps, IFEI fuel and BINGO |
| `copilot_alerts` | The copilot's active alerts and recent calls (spike, in LAR, pitbull, bingo...) |
| `search_notes` | Sections of the sourced research notes for a question, with file and heading to cite |

The server runs the same copilot as the Copilot page (`src/copilot/monitor.ts`), so both say the same thing.

## Limits

- Only your own jet: own-ship data, your RWR and your radar, within what the server's export settings allow. No
  positions of other aircraft.
- The Hornet's displays give no threat bearing as text, so threats have no clock position.
- Values marked not verified in the notes stay not verified; the server's instructions ask the assistant to say so.

## Code

`dcs-link/mcp/`: `server.ts` (stdio entry, connects to the bridge, runs the monitor at 10 Hz), `tools.ts` (the
reports and their registration, MCP TypeScript SDK v2), `notes.ts` (search over `docs/research/*.md` and
`docs/copilot.md`), `nodeEventSource.ts` (event stream client for Node), `vite.config.ts` (bundle to
`dist/fox3-dcs-mcp.mjs`), `smoke.mjs`. Tests: `tests/dcs-mcp.test.ts` runs a real bridge with recorded F/A-18C
frames and calls every tool through the SDK client.
