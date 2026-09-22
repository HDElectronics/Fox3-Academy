# Fox3 Academy — pilot's guide

Fox3 Academy teaches beyond-visual-range (BVR) combat in DCS World the way the game models it. Everything
adapts to the jet you pick in the top bar: radar rules, cockpit display, missiles, RWR, key bindings, units.

## Getting started

1. Pick your jet in the **Jet** menu (top right). The app repaints itself in that jet's cockpit colour:
   turquoise for Flankers and Fulcrums, grey for Western jets.
2. Set units with the button next to it (km and m, or nm and ft). Russian jets start metric.
3. Open **Learn** and follow the lesson path: Radar, TWS, Missiles, Defense and RWR. Each lesson remembers
   when you finish it for that jet (stored in your browser only).
4. Open **Practice** for the manual TWS lab and configurable Radar, Missile and Defense experiments.
5. Open **Fly** for a sortie, or **Reference** for bindings, procedures and aircraft facts.

The 3D world remains the main lab surface. On phones, **World**, **Displays** and **Controls** tabs show
one workspace at a time; switching tabs keeps the current simulation. The bottom action bar keeps the
main controls available. Expand settings, event logs and accuracy notes when needed.

Supported jets: Su-27, Su-33, J-11A, MiG-29S, F-15C (Flaming Cliffs 3), F/A-18C, F-16C, F-14B, JF-17, M-2000C.

## The modules

### Learn
What your jet can and cannot do in BVR: radar modes with the cockpit's own labels (for example ОБЗ, СНП, АТК
on the Su-27), how many tracks and how many targets can have missiles at once, whether you can launch from TWS,
detection range, RWR, chaff and flares, and one card per missile with its launch-zone ranges and the rule you
must obey to guide it. Use the Jet selector in the top bar to switch aircraft.

### Cockpit explorer
Open **Cockpit** from Learn or **Cockpit explorer** from Reference. The first aircraft is the F-16C:
399 mapped items across 49 panels. Choose an area and panel, or search by label, system or function.
Select an item for its purpose, operation, positions, observable effects and a link to the DCS guide page.
On phones, **Back to panel** restores your previous selection. Open **Cockpit layout** for the region map.

These original schematics explain controls; they do not operate simulated aircraft systems. Progress counts
explanations opened, not mastery. Manual-unavailable and uncertain items are labelled, and unknown key
bindings are not invented. Other aircraft show an explicit coverage notice. See the
[coverage note](research/f16-cockpit.md) for omissions and current-game verification still needed.

### Radar
The scan volume in 3D. Change azimuth width, bars, antenna elevation and range and watch what the radar can
see. Click any jet (in 3D, on your radar display, or in the side view) and the **Why** panel says why it is or
is not on your scope: outside the azimuth, above or below the bars, beyond detection range, or in the Doppler
notch. The side view shows the altitude your bars cover at the cursor range, the number that tells you where to
point the antenna. Five exercises walk through the classic ways to lose a contact.

### TWS
Track-while-scan practice in 3D for every jet. Four bandits come at you. Switch between
RWS, TWS and STT, build track files, designate and shoot. The panel "What each bandit's RWR says" is the point:
in TWS a Fox 3 target hears only a search radar until the missile goes active. The checklist follows your jet's
real procedure (Su-27: designate in СНП and the radar locks by itself at 85 % Rmax; F-15C: up to four
designations and one AIM-120 per track; MiG-29S: the two-target СНП2 R-77 shot; M-2000C: no multi-target TWS).
The **Your jet** control lets you crank to keep the group in your gimbal.

Choose **Learn** for the checklist, or **Practice** for independent practice without a merge or time
limit. Guided cursor keys step between contacts. Free lab keys `,` / `/` slew left/right and `;` / `.` slew
up/down; click the radar to place the cursor, then use the aircraft's displayed Designate/Lock action.
Empty space does not select the nearest contact. Use Unlock to return to search. Arrow left/right command
heading and up/down command altitude; these are tactical trainer commands, not DCS stick inputs.

On FC3 Russian jets, **DCS СНП cursor snap** restores acquisition when slewing onto a firm track. With it
off, explicit designation is a trainer aid. The aircraft's 85 % Rmax automatic STT transition still applies
after designation.

### Missiles
Launch-zone lab. Choose missile, shooter altitude and Mach, target altitude, Mach and aspect, and what the
target does after launch (nothing, turn cold, beam, crank, notch with chaff). Fire and watch the shot in 3D
with plots of missile Mach, altitude and range. The slider shows Rmin, Rne and Rmax live. Presets show the
big lessons: shoot high and fast, a cold target shrinks your range, what "no escape" really means, loft.
IR launch requires acquisition. The support selector can use the shooter's radar to demonstrate loss of
support; perfect support remains available for range comparisons. Phoenix mode controls demonstrate the
DCS TWS, PD-STT, P-STT and PH ACT guidance differences.

### Defense
You are the target. Drills: break an R-27ER or AIM-7 by notching the shooter's radar, beat an active AIM-120 or
R-77 with notch and chaff at pitbull, drag a long shot out of energy, and see what a late defense costs. Your RWR,
a Doppler gate gauge ("keep the needle in the gate") and missile readouts guide you. Buttons or keys: notch left,
notch right, drag cold, crank, hot, chaff, flare, plus fine steering. You get a score and coaching after each run.

### RWR
Learn mode explains your jet's RWR part by part (the SPO-15 lamp panel, or the round scope on Western jets) with a
sandbox where you drag threats around your jet and set them to search, lock, launch or active. Quiz mode asks you
to read the display: who is locking you, where the launch is, which jet is at 2 o'clock, and what to do now.

### Sortie
A full BVR fight: 1v1, 1v2, or 2v2 with an AI wingman, against AI that commits, locks, fires, cranks, notches and
drops chaff, scaled by skill (rookie to ace). The brief compares your launch zone with his. You fly a tactical
autopilot (turn, climb, speed keys), run your radar with your jet's keys, and use time acceleration. Afterwards
the debrief replays the fight in 3D with a timeline of launches, pitbulls and hits, per-shot stats (range vs
Rmax, F-pole, how long the target was warned) and coaching on what went right and wrong.

Use **Truth / Your radar** below the playback controls to compare the complete fight with your recorded
sensor picture. Your radar shows ownship, echo squares and estimated track rings; dashed rings mean a
coasting track. It holds the last sensor sample between updates (about 0.25 s), including when you scrub
backward. Other aircraft and missiles are hidden. The timeline, coaching and shot cards still describe
the whole fight using truth. This is a simplified sensor replay, without recorded RWR or datalink.

### Reference
Your kneeboard: the jet's bindings (FC3 keyboard defaults, or HOTAS function names on full-fidelity modules),
step-by-step procedures, radar numbers, a missile table for all seventeen missiles, a comparison of all ten
jets, your RWR's symbols, a BVR glossary, and the research sources. The quick filter searches it all.

## Keys

Wherever the app lets you operate the radar or weapons it uses your jet's DCS keys where DCS has a default, and
shows them as key caps on the buttons. Everything is also clickable. Some full-fidelity functions have no
DCS keyboard default; the app then offers a clearly marked stand-in key.

## What is simplified

The app is a tactics trainer, not a flight simulator. You fly an autopilot, missiles are game mechanics tuned
to DCS's launch-zone numbers, and a few DCS behaviours are not documented anywhere. Labs keep their limitations under **Accuracy notes**; other pages have a
"Simplified here" note, and `docs/dcs-accuracy.md` lists everything in one place.
