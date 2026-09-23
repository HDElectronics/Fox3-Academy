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

The **SA-10**, **SA-11** and **SA-15** drills put one SAM site ahead of you. The brief gives its threat ring,
altitude band, RWR symbol and what defeats it in the game; the 3D view draws the ring and band. Your RWR goes
search, lock, then launch. Beam the site (1 or 2) and drop chaff while you beam, get under the optional ridge,
or turn out of the ring (3). The debrief says why the track broke or held. Pick your start altitude and the
ridge in the brief. Ring sizes and altitude bands are community figures from the game files, not verified in
the Mission Editor.

### RWR
Learn mode explains your jet's RWR part by part (the SPO-15 lamp panel, or the round scope on Western jets) with a
sandbox where you drag threats around your jet and set them to search, lock, launch or active. Quiz mode asks you
to read the display: who is locking you, where the launch is, which jet is at 2 o'clock, and what to do now.

### Pattern & landing
All ten jets. Watch the demo fly the overhead pattern (initial, break, downwind, abeam, final turn,
groove) or fly it yourself from the initial, downwind or final: arrows for the stick, Num+ / Num- for the throttle,
G gear, F flaps, B speed brake (the M-2000C has no flap selector; the F-16C flaps follow the gear). The HUD, AoA
indexer and a top-down trace guide you; the 3D gate rings sit where you actually passed each gate, green or red.
The debrief grades each gate, the glide path, lineup, on-speed time and the touchdown zone. A score of 70 or more
in Fly mode completes it.

**Return to base** (Su-27, J-11A, Su-33, MiG-29S, F-15C): start 40 km out and navigate home. On the Russian jets
press 1 to cycle МРШ, ВЗВ, ПОС: ВЗВ steers you to the glide-slope intercept point, then ПОС comes up and the tower
calls above, below or on glide path. On the F-15C, NAV steers to the IAF; press 1 for ILSN and fly the GSUP / GSDN
cue. The Nav (HSI) display shows the mode, steer point, bearing pointer, distance, command altitude and, in the
landing mode, the glide-slope and localizer bars. The HUD adds a steering caret. Units follow the km / nm switch.

**Takeoff** (all ten jets): start on the runway. Hold W for the wheel brakes, set MIL (or full afterburner where
the jet's takeoff uses it; PgUp sets it in one press), release, steer with Left / Right, and pull with the Down
arrow at the jet's rotation speed (the F-16C pulls 10 kt before Vr). Hold the nose in the pitch bracket below the
red tail-strike line, raise the gear with a positive climb before the gear limit, then the flaps (AUTO on the
Hornet; the F-16C flaps follow the gear; the M-2000C has no flap control). The HUD speed tape carries a VR bug
and, where the jet pulls early, a PULL mark. The takeoff strip lights BRAKES, POWER, RELEASE, ROTATE, GEAR UP and
FLAPS as you do them. The debrief grades brake release, rotation, liftoff pitch, gear up and the 1000 ft climb,
and flags a tail strike; 70 or more in Fly mode completes the takeoff lesson. W also brakes the landing rollout.

**Case I and In the groove** (F/A-18C and F-14B on the Supercarrier, Su-33 on the Kuznetsov): the ship steams on
its BRC. Case I starts 3 nm astern at the initial; In the groove starts ¾ nm out, configured. Break left ahead of
the ship, drop the hook (H; LAlt+G on the Su-33), gear and flaps on downwind, fly the 180 and roll out on the
angled deck's centreline. Call the ball with Y (a trainer key: in DCS it is a radio-menu call) when the prompt
shows. The IFLOLS close-up shows the amber ball against the green datum bars (red in the bottom cells), the
waveoff and cut lights; the Su-33 gets the Luna-3 colour light (green on glide slope, yellow high, red low). The LSO
panel logs the calls ("Roger ball", "Power", "Right for lineup", "Wave off", "Bolter"). The debrief gives the DCS
grade (_OK_, OK, (OK), ---, C, B, WO, OWO) with the comment codes in plain words, the wire, the gates and a score;
70 or more in Fly mode completes the carrier lesson. The LSO camera views the groove from the platform. Kuznetsov
LSO calls and grades are not verified: the trainer grades the pass itself.

**Catapult and Ski-jump** (F/A-18C and F-14B on CVN catapult 1 or 2, Su-33 on Kuznetsov position 1 or 3): pick the
catapult or position and turn on Heavy for the heavy trainer weight. The Launch sequence strip under the view lists
each step with its key; the step to do now is outlined and done steps tick. Hornet: NWS HI (S), launch bar (L),
hook up (U), T/O trim by weight (T nose up, LShift+T nose down: 16°, 17° or 19°), MIL on PgUp (press again for
afterburner; the heavy jet needs it), wipe out (K), salute, hands off. Tomcat: hook up (U), MIL, salute (LShift+U).
The shooter refuses a salute with a step missing. Su-33: full afterburner against the deck stoppers, special
afterburner (LShift+E); the stoppers drop after 3 s and the jet runs up the 12° ramp. Leave the FOD screens (LAlt+I)
alone. Launch bar, wipe-out and trim keys are trainer keys, and the Hornet salute key conflicts between sources:
the strip tags them. After the launch: gear and flaps up, the clearing turn (right from cats 1–2), climb through
1000 ft. The debrief gives the outcome (good launch, sequence error, cold cat, short run), the gates and a score;
70 or more in Fly mode completes the launch lesson. The Deck camera is the shooter's view beside the jet.

**Tanker rejoin and Pre-contact** (Su-33 on the IL-78M; F-15C and F-16C on the KC-135 boom; F/A-18C, F-14B,
JF-17 and M-2000C on the KC-135 MPRS or KC-130 hose, picked under Start): Tanker rejoin starts 2 nm behind the
tanker; Pre-contact starts stable behind the basket or boom, already cleared pre-contact. Call the tanker with `\`
(a trainer key: in DCS it is the radio menu), probe out (Su-33 LCtrl+R, refuelling lights LAlt+R) or door open
(F-16C below 400 kt / M0.85). Close behind the tanker; inside the pre-contact zone the throttle sets closure and
the stick moves the jet up, down, left and right. Hold still for 3 s and the tanker clears you to contact; close
at 2–3 kt (probe) or slowly to the boom. The Position box shows the probe tip or receptacle against the limits;
the Su-33's Hose gauge shows the UPAZ bands (yellow 3–13 m, yellow+green 13–16, green 16–22, green+red 22–24,
red 24–26 cone to pod: hold green, 3–6 m below the pod); boom jets get simplified up/down and forward/back cues
(the KC-135 director lights are not modelled). Fuel flows in the green band or inside the boom limits; the Radio
panel logs every call, bounce and disconnect. The debrief grades rejoin, pre-contact, closure at contact, time in
the envelope and a clean disconnect; 70 or more in Fly mode completes the refuelling lesson. Cameras: Chase, Wing
(from the tanker's wing), Receiver (behind your jet, looking at the basket or boom) and Cockpit. The Su-27, J-11A
and MiG-29S have no refuelling lesson.

On a phone or tablet, Fly mode shows on-screen controls: a stick pad (drag down to pull; it springs back), a
throttle slider and GEAR, FLAPS, BRAKES (hold), SPD BRK and NAV buttons, plus AB on jets that take off in
afterburner, HOOK and BALL on the carrier starts, and the launch sequence buttons (NWS HI, L-BAR, HOOK UP, TRIM,
WIPE OUT, SALUTE, SPEC AB, AB) on the launch starts. On a desktop, turn them on with Show on-screen controls.

### Merge & guns
Close-combat basics for all ten jets. You fly an arcade BFM mode:
the arrow keys roll the lift vector (← →) and pull or unload (↓ ↑, as in DCS), Space holds the trigger, 1 / 2 / 3
set idle, military or afterburner, B the speedbrake. Hands off the pitch keys, the jet holds a level turn at its
bank (a trainer aid). On a phone the view shows a touch pad (roll, pull, unload, gun, throttle).
Lessons: Corner speed (hold your jet's corner speed in a turn of 3 g or more), Pursuit (lead, pure, then lag
pursuit for 10 s each against a turning bandit), The merge (lead turn toward his side as he nears your wing line,
pass close, then go nose high or nose low; scored on angles gained by the second pass), One vs two circle (turn
toward him for a rate fight or away for a radius fight, with the trainer's advice for your jet against his;
scored on angle off his tail and range 30 s after the pass), High yo-yo (you start fast inside his hard turn: go
out of plane before you overshoot; scored on no overshoot and range held), Guns tracking (get in his plane, frame
the wingspan, short bursts), Guns defence (he is behind you with guns: break, unload and roll out of his plane),
and a Free fight from a head-on merge (also under Practice). The drill bandits are scripted. The free fight is
against a rule-based fighting AI at three trainer levels, Rookie, Regular and Veteran: it lead turns, picks one or
two circle for its jet, flies lag then lead pursuit, yo-yos when it overshoots, guns you, and jinks when your sight
comes on. The debrief lists the moves it flew. A gun kill needs about 2 s of fire in the solution at 600 m, less
closer (an arcade rule). The page counts as done for a jet once every drill scores 50 or more.
The HUD panel shows your jet's own gun sight: the FC3 Russian funnel and LCOS with the 1200 m range scale, the
F-15C LCOS and locked reticle, the Hornet funnel and director with SHOOT, the F-16C EEGS Level II and V, the F-14
RTGS pipper and diamond, the JF-17 SS / SSLC / LCOS and the M-2000C CCLT tracer line. The Cockpit camera (F1) draws
it over the 3D view. Radar lock Auto locks inside 5 nm and 20° of the nose (simplified). The 3D aids show your lift
vector, both turn circles on the ground, the bandit's plane of motion, the line of sight coloured by pursuit (amber
lead, green pure, blue lag), tracers and hit sparks; each can be switched off. Every drill ends with a debrief and
a score. Sight geometry and hits are simplified; unverified sight and gun values say "not verified".

### Sortie
A full BVR fight: 1v1, 1v2, or 2v2 with an AI wingman, against AI that commits, locks, fires, cranks, notches and
drops chaff, scaled by skill (rookie to ace). The brief compares your launch zone with his. You fly a tactical
autopilot (turn, climb, speed keys), run your radar with your jet's keys, and use time acceleration. Afterwards
the debrief replays the fight in 3D with a timeline of launches, pitbulls and hits, per-shot stats (range vs
Rmax, F-pole, how long the target was warned) and coaching on what went right and wrong.

Under **SAM sites** the brief adds one or two SA-10, SA-11 or SA-15 sites on the bandits' side. They show in
the 3D view with their rings, the coach calls their lock and launch, and the debrief notes a SAM kill or a
broken track. Simplified: the AI jets ignore the sites, and the sites shoot only at your side.

Use **Truth / Your radar** below the playback controls to compare the complete fight with your recorded
sensor picture. Your radar shows ownship, echo squares and estimated track rings; dashed rings mean a
coasting track. It holds the last sensor sample between updates (about 0.25 s), including when you scrub
backward. Other aircraft and missiles are hidden. The timeline, coaching and shot cards still describe
the whole fight using truth. This is a simplified sensor replay, without recorded RWR or datalink.

### Reference
Your kneeboard: the jet's bindings (FC3 keyboard defaults, or HOTAS function names on full-fidelity modules),
step-by-step procedures, radar numbers, a missile table for all seventeen missiles, a comparison of all ten
jets, your RWR's symbols and the three SAM sites (ring and altitude band), a BVR glossary, and the research sources. The quick filter searches it all.

## Keys

Wherever the app lets you operate the radar or weapons it uses your jet's DCS keys where DCS has a default, and
shows them as key caps on the buttons. Everything is also clickable. Some full-fidelity functions have no
DCS keyboard default; the app then offers a clearly marked stand-in key.

## What is simplified

The app is a tactics trainer, not a flight simulator. You fly an autopilot, missiles are game mechanics tuned
to DCS's launch-zone numbers, and a few DCS behaviours are not documented anywhere. Labs keep their limitations under **Accuracy notes**; other pages have a
"Simplified here" note, and `docs/dcs-accuracy.md` lists everything in one place.
