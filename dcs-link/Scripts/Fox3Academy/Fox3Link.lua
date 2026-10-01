-- Fox3 Academy DCS link: export script.
--
-- Sends own-ship telemetry to the Fox3 Academy bridge and answers its test commands, over UDP on this
-- computer only (127.0.0.1). It reads export data and changes nothing in the game.
--
-- Install: copy this folder to  Saved Games\DCS\Scripts\Fox3Academy\  and add this line to the end of
--   Saved Games\DCS\Scripts\Export.lua  (create the file if it does not exist):
--
--   local Fox3lfs = require('lfs'); dofile(Fox3lfs.writedir() .. [[Scripts\Fox3Academy\Fox3Link.lua]])
--
-- It chains the export callbacks already defined (Tacview, SRS, DCS-BIOS and others keep working), and every
-- step runs in pcall so an error here never breaks the other exports. Messages go to dcs.log, tag FOX3LINK.
--
-- Protocol v1 (docs/api/dcs-link.md):
--   DCS -> bridge  UDP 127.0.0.1:47781  one JSON object per datagram: hello, frame (10 Hz), pong, bye
--   bridge -> DCS  UDP 127.0.0.1:47782  text commands: "ping <id>", "dump 1" / "dump 0"

do
  local VERSION = '0.4.0'
  local HOST = '127.0.0.1'
  local BRIDGE_PORT = 47781  -- the bridge listens here
  local LISTEN_PORT = 47782  -- this script listens here for commands
  local FRAME_INTERVAL = 0.1 -- seconds of real time between frames (10 Hz)
  local MAX_COMMANDS_PER_FRAME = 16

  local function logInfo(msg)
    if log and log.write then pcall(log.write, 'FOX3LINK', log.INFO, msg) end
  end
  local function logError(msg)
    if log and log.write then pcall(log.write, 'FOX3LINK', log.ERROR, msg) end
  end

  package.path = package.path .. ';' .. lfs.currentdir() .. '/LuaSocket/?.lua'
  package.cpath = package.cpath .. ';' .. lfs.currentdir() .. '/LuaSocket/?.dll'
  local okSocket, socket = pcall(require, 'socket')

  -- Minimal JSON encoder: arrays (sequences), objects with string keys, strings, finite numbers, booleans.
  -- nil fields are omitted; an empty table is an object.
  local encode
  local function encodeString(s)
    return '"' .. s:gsub('[%c"\\]', function(c)
      if c == '\n' then return '\\n' elseif c == '"' then return '\\"' elseif c == '\\' then return '\\\\' elseif c == '\t' then return '\\t' end
      return string.format('\\u%04x', c:byte())
    end) .. '"'
  end
  encode = function(v)
    local t = type(v)
    if t == 'number' then
      if v ~= v or v == math.huge or v == -math.huge then return 'null' end
      return string.format('%.10g', v)
    elseif t == 'string' then
      return encodeString(v)
    elseif t == 'boolean' then
      return v and 'true' or 'false'
    elseif t == 'table' then
      local parts = {}
      if #v > 0 then
        for i = 1, #v do parts[i] = encode(v[i]) end
        return '[' .. table.concat(parts, ',') .. ']'
      end
      for k, val in pairs(v) do
        if type(k) == 'string' then parts[#parts + 1] = encodeString(k) .. ':' .. encode(val) end
      end
      return '{' .. table.concat(parts, ',') .. '}'
    end
    return 'null'
  end

  -- Call an export function if this DCS build has it; nil when it is missing or fails.
  local function get(name, ...)
    local f = _G[name]
    if type(f) ~= 'function' then return nil end
    local ok, a = pcall(f, ...)
    if ok then return a end
    return nil
  end
  -- Multiplayer servers choose what clients may export. nil = this build has no such check.
  local function allowed(name)
    local f = _G[name]
    if type(f) ~= 'function' then return nil end
    local ok, r = pcall(f)
    if ok then return r and true or false end
    return nil
  end
  local function num(v)
    if type(v) == 'number' then return v end
    return nil
  end

  -- Cockpit argument numbers per DCS unit type (docs/research/dcs-export.md, "Hornet cockpit").
  local COCKPIT_ARGS = {
    ['FA-18C_hornet'] = {
      -- switches: master arm, gear handle, launch bar, anti-skid, hook bypass, flaps, brake handle, brake
      -- rotation, hook handle, APU, crank, battery, generators
      49, 226, 233, 238, 239, 234, 240, 241, 293, 375, 377, 404, 402, 403,
      -- lamps: LOCK/SHOOT/strobe, AoA indexer, fire L, master caution, bleeds, SPD BRK, L BAR, fire APU/R,
      -- threat lights, master arm panel, flaps, gear, gear handle, LOW ALT, hook, FUEL LO, APU READY
      1, 2, 3, 4, 5, 6, 10, 13, 17, 18, 19, 21, 23, 26, 29, 38, 39, 40, 41, 44, 45, 47, 48,
      162, 163, 164, 165, 166, 167, 227, 290, 294, 304, 376,
    },
  }
  -- Text indicators: list_indication id and the element names to keep.
  local INDICATIONS = {
    ['FA-18C_hornet'] = { id = 5, keep = { txt_FUEL_UP = 'fuelUp', txt_FUEL_DOWN = 'fuelDown', txt_BINGO = 'bingo' } },
  }

  local function cockpitArgs(list)
    if type(GetDevice) ~= 'function' then return nil end
    local ok, dev = pcall(GetDevice, 0)
    if not ok or type(dev) ~= 'table' then return nil end
    pcall(function() dev:update_arguments() end)
    local out = {}
    for _, n in ipairs(list) do
      local okv, v = pcall(function() return dev:get_argument_value(n) end)
      if okv and type(v) == 'number' then out['a' .. n] = math.floor(v * 1000 + 0.5) / 1000 end
    end
    return out
  end

  local function indication(id, keep)
    if type(list_indication) ~= 'function' then return nil end
    local ok, text = pcall(list_indication, id)
    if not ok or type(text) ~= 'string' or text == '' then return nil end
    local out = {}
    for k, v in text:gmatch('%-+\n([^\n]+)\n([^\n]*)\n') do
      if keep[k] then out[keep[k]] = v:sub(1, 16) end
    end
    return out
  end

  -- Display name for a DCS type tuple, e.g. 'Su-27', 'AIM-120C'.
  local function typeName(t)
    if type(t) ~= 'table' then return nil end
    local n = get('LoGetNameByType', t.level1, t.level2, t.level3, t.level4)
    if type(n) == 'string' and n ~= '' then return n:sub(1, 32) end
    return nil
  end

  local function vec(v)
    if type(v) ~= 'table' then return nil end
    return { x = num(v.x), y = num(v.y), z = num(v.z) }
  end

  -- RWR emitters (LoGetTWSInfo): type, signal (scan / lock / missile_radio_guided / track_while_scan),
  -- azimuth (relative, unit to verify), power, priority. At most 16.
  local function rwr()
    local tws = get('LoGetTWSInfo')
    if type(tws) ~= 'table' then return nil end
    local list = {}
    if type(tws.Emitters) == 'table' then
      for _, e in ipairs(tws.Emitters) do
        if #list >= 16 then break end
        if type(e) == 'table' then
          list[#list + 1] = {
            id = num(e.ID), name = typeName(e.Type), signal = type(e.SignalType) == 'string' and e.SignalType or nil,
            az = num(e.Azimuth), power = num(e.Power), prio = num(e.Priority),
          }
        end
      end
    end
    return { mode = num(tws.Mode), emitters = list }
  end

  -- Radar targets (LoGetTargetInformation / LoGetLockedTargetInformation). At most max.
  local function targets(fn, max)
    local all = get(fn)
    if type(all) ~= 'table' then return nil end
    local list = {}
    for _, tg in ipairs(all) do
      if #list >= max then break end
      if type(tg) == 'table' then
        local p = type(tg.position) == 'table' and tg.position.p or nil
        list[#list + 1] = {
          id = num(tg.ID), name = typeName(tg.type), dist = num(tg.distance), closure = num(tg.convergence_velocity),
          mach = num(tg.mach), flags = num(tg.flags), jam = tg.isjamming == true or nil,
          course = num(tg.course), aspect = num(tg.delta_psi), pos = vec(p), vel = vec(tg.velocity),
        }
      end
    end
    return list
  end

  -- Selected weapon and stores (LoGetPayloadInfo): counts by name, the selected station's weapon, gun rounds.
  local function stores()
    local pl = get('LoGetPayloadInfo')
    if type(pl) ~= 'table' then return nil end
    local out = { counts = {} }
    local n = 0
    if type(pl.Stations) == 'table' then
      for i, st in ipairs(pl.Stations) do
        if type(st) == 'table' and type(st.weapon) == 'table' then
          local name = typeName(st.weapon)
          local count = num(st.count) or 0
          if name and count > 0 and n < 16 then
            if not out.counts[name] then n = n + 1 end
            out.counts[name] = (out.counts[name] or 0) + count
          end
          if i == pl.CurrentStation then out.sel = name end
        end
      end
    end
    if type(pl.Cannon) == 'table' then out.gun = num(pl.Cannon.shells) end
    return out
  end

  local udp = nil
  local seq = 0
  local dumpUntil, nextDump = 0, 0
  local DUMP_INTERVAL = 2      -- seconds between display-text dumps
  local DUMP_MAX_ID = 40       -- list_indication ids tried
  local DUMP_MAX_CHARS = 2400  -- per display, keeps each datagram under the bridge's 8 KiB
  local nextFrameAt = 0

  local function send(msg)
    if not udp then return end
    msg.v = 1
    msg.script = VERSION
    local ok, err = pcall(function() return udp:sendto(encode(msg), HOST, BRIDGE_PORT) end)
    if not ok then logError('send failed: ' .. tostring(err)) end
  end

  local function buildFrame()
    seq = seq + 1
    local own = allowed('LoIsOwnshipExportAllowed')
    local frame = {
      type = 'frame',
      seq = seq,
      t = num(get('LoGetModelTime')),
      allow = {
        ownship = own,
        sensor = allowed('LoIsSensorExportAllowed'),
        object = allowed('LoIsObjectExportAllowed'),
      },
    }
    if own == false then return frame end
    local s = get('LoGetSelfData')
    if type(s) == 'table' then
      local lla = type(s.LatLongAlt) == 'table' and s.LatLongAlt or {}
      frame.self = {
        name = type(s.Name) == 'string' and s.Name or nil,
        lat = num(lla.Lat), lon = num(lla.Long), alt = num(lla.Alt),
        hdg = num(s.Heading), pitch = num(s.Pitch), bank = num(s.Bank),
      }
      -- DCS world frame (x north, y up, z east, metres): for bearing and aspect to sensor targets.
      if type(s.Position) == 'table' then frame.self.x, frame.self.y, frame.self.z = num(s.Position.x), num(s.Position.y), num(s.Position.z) end
    end
    local pilot = get('LoGetPilotName')
    if type(pilot) == 'string' then frame.pilot = pilot end
    frame.ias = num(get('LoGetIndicatedAirSpeed'))
    frame.tas = num(get('LoGetTrueAirSpeed'))
    frame.mach = num(get('LoGetMachNumber'))
    frame.altMsl = num(get('LoGetAltitudeAboveSeaLevel'))
    frame.altAgl = num(get('LoGetAltitudeAboveGroundLevel'))
    frame.vv = num(get('LoGetVerticalVelocity'))
    frame.aoa = num(get('LoGetAngleOfAttack'))
    local acc = get('LoGetAccelerationUnits')
    if type(acc) == 'table' then frame.acc = { x = num(acc.x), y = num(acc.y), z = num(acc.z) } end

    -- Systems. Written for FC3 jets; full-fidelity modules may fill only part of these (nil fields are omitted).
    local mech = get('LoGetMechInfo')
    if type(mech) == 'table' then
      local function pos(m) if type(m) == 'table' then return num(m.value) end return nil end
      frame.mech = {
        gear = pos(mech.gear), flaps = pos(mech.flaps), hook = pos(mech.hook),
        speedbrakes = pos(mech.speedbrakes), wheelbrakes = pos(mech.wheelbrakes), canopy = pos(mech.canopy),
      }
    end
    local eng = get('LoGetEngineInfo')
    if type(eng) == 'table' then
      local rpm = type(eng.RPM) == 'table' and eng.RPM or {}
      local ff = type(eng.FuelConsumption) == 'table' and eng.FuelConsumption or {}
      frame.engine = {
        rpmL = num(rpm.left), rpmR = num(rpm.right),
        fuelInt = num(eng.fuel_internal), fuelExt = num(eng.fuel_external),
        ffL = num(ff.left), ffR = num(ff.right),
      }
    end
    -- Warning flags: only the ones that are set, as { MasterWarning = true, ... }.
    local mcp = get('LoGetMCPState')
    if type(mcp) == 'table' then
      local on = {}
      for k, v in pairs(mcp) do
        if type(k) == 'string' and v == true then on[k] = true end
      end
      frame.mcp = on
    end
    local snares = get('LoGetSnares')
    if type(snares) == 'table' then frame.cm = { chaff = num(snares.chaff), flare = num(snares.flare) } end
    frame.stores = stores()

    -- Own sensors: RWR and radar. Only what the jet itself knows, and only when the server allows sensor export.
    if frame.allow.sensor ~= false then
      frame.rwr = rwr()
      frame.lock = targets('LoGetLockedTargetInformation', 2)
      frame.tracks = targets('LoGetTargetInformation', 10)
    end

    -- Module cockpit: raw switch and lamp values, decoded by the app (src/copilot) so a wrong mapping is fixed
    -- there, not in this file. Only for modules listed in COCKPIT_ARGS.
    local name = frame.self and frame.self.name
    local args = name and COCKPIT_ARGS[name]
    if args then
      frame.args = cockpitArgs(args)
      local ind = INDICATIONS[name]
      if ind then frame.ind = indication(ind.id, ind.keep) end
    end
    return frame
  end

  local function readCommands()
    if not udp then return end
    for _ = 1, MAX_COMMANDS_PER_FRAME do
      local data = udp:receive()
      if not data then return end -- nothing waiting (timeout), or a Windows ICMP reset when no bridge runs
      local id = data:match('^ping (%d+)$')
      if id then
        send({ type = 'pong', id = tonumber(id), t = num(get('LoGetModelTime')) })
      end
      local on = data:match('^dump ([01])$')
      if on then
        -- Discovery: send every cockpit display's text for the next 90 s (the bridge renews it while wanted).
        dumpUntil = on == '1' and socket.gettime() + 90 or 0
        send({ type = 'dumpack', on = on == '1' })
      end
    end
  end

  local function start()
    if not okSocket then
      logError('LuaSocket not available: ' .. tostring(socket))
      return
    end
    udp = socket.udp()
    udp:settimeout(0)
    local ok, err = udp:setsockname(HOST, LISTEN_PORT)
    if not ok then
      -- Still send telemetry; only the test commands need the listening port.
      logError('cannot listen on ' .. HOST .. ':' .. LISTEN_PORT .. ' (' .. tostring(err) .. '), commands disabled')
      udp:close()
      udp = socket.udp()
      udp:settimeout(0)
    end
    seq = 0
    nextFrameAt = 0
    logInfo('v' .. VERSION .. ' started, sending to ' .. HOST .. ':' .. BRIDGE_PORT)
    send({ type = 'hello', t = num(get('LoGetModelTime')) })
  end

  -- Text of every cockpit display (list_indication 0..DUMP_MAX_ID), one datagram each. Read only.
  local function dumpIndications()
    if type(list_indication) ~= 'function' then return end
    for id = 0, DUMP_MAX_ID do
      local ok, text = pcall(list_indication, id)
      if ok and type(text) == 'string' and text ~= '' then
        send({ type = 'ind', id = id, len = #text, text = text:sub(1, DUMP_MAX_CHARS) })
      end
    end
  end

  local function afterFrame()
    if not udp then return end
    local now = socket.gettime()
    if now < dumpUntil and now >= nextDump then
      nextDump = now + DUMP_INTERVAL
      dumpIndications()
    end
    if now < nextFrameAt then return end
    nextFrameAt = now + FRAME_INTERVAL
    send(buildFrame())
  end

  local function stop()
    if not udp then return end
    send({ type = 'bye', t = num(get('LoGetModelTime')) })
    pcall(function() udp:close() end)
    udp = nil
    logInfo('stopped')
  end

  local function guarded(name, fn)
    return function()
      local ok, err = pcall(fn)
      if not ok then logError(name .. ': ' .. tostring(err)) end
    end
  end
  local onStart, onBefore, onAfter, onStop =
    guarded('start', start), guarded('commands', readCommands), guarded('frame', afterFrame), guarded('stop', stop)

  -- Chain the callbacks other export scripts defined before this one.
  local prevStart, prevBefore, prevAfter, prevStop =
    LuaExportStart, LuaExportBeforeNextFrame, LuaExportAfterNextFrame, LuaExportStop

  function LuaExportStart()
    onStart()
    if prevStart then prevStart() end
  end
  function LuaExportBeforeNextFrame()
    onBefore()
    if prevBefore then prevBefore() end
  end
  function LuaExportAfterNextFrame()
    onAfter()
    if prevAfter then prevAfter() end
  end
  function LuaExportStop()
    onStop()
    if prevStop then prevStop() end
  end
end
