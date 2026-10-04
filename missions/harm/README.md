# HARM practice missions (F/A-18C, Caucasus)

Two single-player missions to practise the `#/harm` lessons in DCS. The same guide, with a to-scale map, is the
Missions view of the HARM & SEAD page. Facts and sources: [fa18c-harm.md](../../docs/research/fa18c-harm.md).

| File | What it is |
|---|---|
| `Fox3_HARM_1_Ranges.miz` | **Safe ranges.** Radars on, weapons hold, never switch off for a HARM, never move. |
| `Fox3_HARM_2_Live.miz` | **Live SEAD.** The SA-6 and SA-11 shoot back and may go quiet when a HARM comes. |

Copy them into `Saved Games\DCS\Missions` (or `DCS.openbeta`) and open them from Mission. Download from the page or
from `public/missions/`; rebuild with `python missions/harm/harm_training.py public/missions` (pydcs, Python 3.12).

## Your jet

Weasel 1, airborne over the Black Sea, 25000 ft, 450 kt true airspeed, heading 090, 51 nm west of Range 1.
4 × AGM-88C (stations 2, 3, 7, 8), 2 × AIM-9X, centreline tank. No enemy aircraft, clear weather, no wind.

## Route

| WP | Name | Leg | Notes |
|---|---|---|---|
| 0 | Start | — | 25000 ft, 450 kt, heading 090 |
| 1 | FENCE | 090 · 33.5 nm | Coast in. Range 1 is 17.6 nm further east. |
| 2 | R1 SA-6 | 088 · 17.6 nm | Exactly on the Straight Flush: your range ruler in SP, your PB point for code 108. |
| 3 | R2 SA-8/15 | 133 · 12.6 nm | Midway between the two Range 2 radars. |
| 4 | R3 SA-11 | 045 · 16.2 nm | Exactly on the Snow Drift: PB point for code 107. 38 nm from the fence. |
| 5 | Kobuleti | 247 · 33.5 nm | Home. Landing waypoint. |

Legs are true courses from the mission grid, rounded.

## Sites

| Site | Where | RWR | Class | PB code | Mission 1 | Mission 2 |
|---|---|---|---|---|---|---|
| SA-6, 1S91 Straight Flush | WP2, on the radar | 6 | H1 | 108 | On at start | Live |
| SA-8, Land Roll | Near WP3 | 8 | H1 | 117 | F10: Range 2 ON | — |
| SA-15, Scrum Half | Near WP3, 5.4 nm NE of the SA-8 | 15 | H2 | 119 | F10: Range 2 ON | — |
| SA-11, 9S18M1 Snow Drift | WP4, on the radar | SD | H2 | 107 | F10: Range 3 ON | Live |

The SA-11 launchers carry their own Fire Dome radars (RWR 11, code 115). Positions were placed by hand on open
ground in the Mission Editor.

## Mission 1: safe ranges

- F10 › Other: Range 2 ON, Range 3 ON, Reset Range 1 / 2 / 3 (once each, a fresh copy at the same place), Repeat
  briefing. A message confirms every radar you kill.
- Range 1 → fly the **SP** lesson first: let the HARM cue itself to the 6 and fire between 30 and 25 nm to WP2
  (practice suggestion). Reset it and try TOO, or PB with code 108.
- Range 2 → **TOO**: TDC to the HARM display, CLASS H2 for the 15, hand off with Cage/Uncage, fire; then H1 for the 8.
- Range 3 → **PB**: UFC, option 4 TGT, 107, ENT; HRM pull-up; WPDSG on WP4; hold release and fly the cue. Reset it
  and try the A/C pull-up.

## Mission 2: live SEAD

- Weapons free, default "Evasion of ARM": a radar may switch off when your HARM comes; the HARM then loses guidance
  (ED guide p367). Wait for it to come back and shoot again. Options › Gameplay › Immortal helps the first tries.
- **Pullback**: unbox HRM OVRD, let the SA-6 lock you, pickle when HARM shows without an X, then turn away.
- **Live run**: TOO on the SA-6 from 30–25 nm before the fence, PB on the SA-11 from stand-off, home to WP5.

## Not verified in game

Whether the weapons-hold SAMs ever lock you; when the RWR first shows each site on this route; launch distances
marked as suggestions.
