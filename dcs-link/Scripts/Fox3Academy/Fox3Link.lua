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
--   bridge -> DCS  UDP 127.0.0.1:47782  text commands: "ping <id>"

do
  local VERSION = '0.1.0'
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

  -- Minimal JSON encoder: objects with string keys, strings, finite numbers, booleans. nil fields are omitted.
  local encode
  local function encodeString(s)
    return '"' .. s:gsub('[%c"\\]', function(c) return string.format('\\u%04x', c:byte()) end) .. '"'
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

  local udp = nil
  local seq = 0
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

  local function afterFrame()
    if not udp then return end
    local now = socket.gettime()
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
