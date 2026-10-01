# Copilot

The Copilot page (`#/copilot`, Reference → Copilot) is a second-screen helper for the F/A-18C while you fly in
DCS. It reads the [DCS link](dcs-link.md), shows the alerts that need you in large text, and speaks them.
Put it on a second monitor or a tablet next to your HOTAS.

## Use it

1. Set up the DCS link ([dcs-link.md](dcs-link.md)): export script v0.2.0 or later in `Saved Games\DCS\Scripts`,
   `npm run dcs-link` running.
2. Pick the F/A-18C in the top bar and open Reference → Copilot.
3. Turn **Voice** on (the browser needs a click before it may speak). **Test voice** checks the volume.
4. Choose **Field** or **Carrier**. **Bingo from IFEI** uses the BINGO you set on the IFEI when the script can read
   it; otherwise, or with **This setting**, the copilot uses the slider.

## What it calls

| Call | When | Spoken |
|---|---|---|
| MASTER WARNING | `LoGetMCPState` MasterWarning | "Master warning." |
| FIRE LEFT / RIGHT ENGINE, APU FIRE | fire light lit | No: the jet's warning voice already calls these |
| MASTER CAUTION | MASTER CAUTION light lit | "Master caution. Check the DDI cautions." |
| FUEL LO | FUEL LO light lit (a feed tank below 800 lb, guide p65) | No: the jet calls it |
| BINGO / JOKER | IFEI fuel total at or below bingo / bingo plus the joker margin, airborne | "Bingo fuel. Head home." / "Joker fuel." |
| IFEI BINGO NOT SET | airborne, IFEI BINGO reads 0; the slider value is used meanwhile | "Bingo is not set on the IFEI." |
| OVER G | load factor above 7.5 G (not verified: the guide gives no G limit) | "Over G." |
| GEAR UP, LOW AND SLOW | gear up below 1000 ft AGL, slower than 200 kt, descending | "Check gear." |
| GEAR OUT AT … KT | gear not up above 250 kt (guide p102) | "Gear speed." |
| … KT, CONFIGURE BELOW 150 | carrier, gear down, faster than 160 kt (guide p108) | "Fast for the gear." |
| HOOK UP | carrier, gear down, hook handle up | "Check hook." |
| FLAPS NOT FULL | gear down, flap switch not FULL | "Check flaps." |
| SPIKE … O'CLOCK, type | an RWR emitter goes to lock (sensor export) | "Spike, three o'clock, Su-27." |
| MISSILE LAUNCH … O'CLOCK | an RWR emitter shows a launch | "Missile launch, three o'clock. Defend." |
| LOCKED type, range, aspect | the radar locks a target | "Locked, Su-27, 25 miles, hot." |
| IN RANGE / NO ESCAPE / INSIDE MIN RANGE | the locked target crosses the selected missile's Rmax, Rne or Rmin (this app's launch-zone tables, src/sim/dlz.ts) | "In range." / "No escape." / "Too close." |
| LOCK LOST | the lock is gone for more than 1.5 s | "Lock lost." |
| SLOW / ON SPEED / FAST | gear down below 5000 ft AGL, AoA against the indexer band 7.4–8.8° (on speed 8.1°, guide p44-45) | "Slow." / "On speed." / "Fast." |

The Threats panel lists every RWR emitter (launch, lock, track, search) with its clock position; the Radar lock
panel shows the locked target's range, closure, aspect (HOT, FLANK 30–60°, BEAM, DRAG), altitude and bearing, and
a launch-zone bar for the selected missile. Both use only the jet's own sensors and stay empty when the server
blocks sensor export. The RWR bearing unit and sign are not verified yet.

Approach means airborne with the gear down below 5000 ft AGL. A call must hold for a moment before it is made, is
made once, repeats at an interval if it matters, and rearms after it has been clear for a few seconds.

## Where the numbers come from

- ED F/A-18C Early Access Guide (24 Mar 2024): [research/fa18c-copilot.md](research/fa18c-copilot.md).
- Export functions and Hornet cockpit arguments: [research/dcs-export.md](research/dcs-export.md).
- Checked in game (2026-10-01, one frame): AoA comes in degrees; `LoGetEngineInfo` fuel is a fraction for the
  Hornet, so fuel is the IFEI total and burn is measured from its trend; gear handle, flap switch, hook handle
  and master arm values match the community maps; IFEI BINGO reads 0 until set. Still to check: the other
  switch maps and the IFEI strings when the IFEI is off.

## Code

`src/copilot/`: `situation.ts` (frame → knots, feet, pounds, phase), `engine.ts` (rule timing), `voice.ts`
(speech queue, warnings interrupt), `hornet.ts` (facts and rules), `hornetCockpit.ts` (cockpit argument
decoding). Page: `src/pages/copilot/`, `?shot=approach|carrier|bingo|off` previews. Another jet needs a facts and
rules file like `hornet.ts`, its arguments in the export script's `COCKPIT_ARGS`, and a decoder.
