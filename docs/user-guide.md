# Fox3 Academy — pilot's guide

Fox3 Academy teaches beyond-visual-range (BVR) combat in DCS World the way the game models it. Everything
adapts to the jet you pick in the top bar: radar rules, cockpit display, missiles, RWR, key bindings, units.

## Getting started

Fox3 Academy runs in desktop and laptop browsers (tablets also work). Phones show a short panel with a
Copy link button instead of the app: the lessons fly the jet with a keyboard beside a 3D view, the cockpit
displays and the lesson steps, which a phone screen cannot show together.

1. Pick your jet in the **Jet** menu (top right). The app repaints itself in that jet's cockpit colour:
   turquoise for Flankers and Fulcrums, grey for Western jets.
2. Set units with the button next to it (km and m, or nm and ft). Russian jets start metric.
3. Open **Learn** and follow the lesson path: Radar, TWS, Missiles, Defense and RWR. Each lesson remembers
   when you finish it for that jet (stored in your browser only).
4. Open **Practice** for the manual TWS lab and configurable Radar, Missile and Defense experiments.
5. Open **Fly** for a sortie, or **Reference** for bindings, procedures and aircraft facts.

The 3D world remains the main lab surface. On narrow screens (tablets, small windows), **World**, **Displays** and **Controls** tabs show
one workspace at a time; switching tabs keeps the current simulation. The bottom action bar keeps the
main controls available. Expand settings, event logs and accuracy notes when needed.

Supported jets: Su-27, Su-33, J-11A, MiG-29S, F-15C (Flaming Cliffs 3), F/A-18C, F-16C, F-14B, JF-17, M-2000C.

## The modules

### Learn
What your jet can and cannot do in BVR: radar modes with the cockpit's own labels (for example ОБЗ, СНП, АТК
on the Su-27), how many tracks and how many targets can have missiles at once, whether you can launch from TWS,
detection range, RWR, chaff and flares, and one card per missile with its launch-zone ranges and the rule you
must obey to guide it. Use the Jet selector in the top bar to switch aircraft.

### Radar
The scan volume in 3D. Change azimuth width, bars, antenna elevation and range and watch what the radar can
see. Click any jet (in 3D, on your radar display, or in the side view) and the **Why** panel says why it is or
is not on your scope: outside the azimuth, above or below the bars, beyond detection range, or in the Doppler
notch. The side view shows the altitude your bars cover at the cursor range, the number that tells you where to
point the antenna. Five exercises walk through the classic ways to lose a contact.

Exercise 6, **Jammer and burn-through**, puts a jamming bandit in front of you. A jammer shows only a bearing
(the jet's own jam symbol: the F-15C column of boxes, the Su-27 flashing strobe and АП, the Hornet dugout, the Viper
chevrons, the Tomcat strobe), and the radar refuses a normal lock. Take a jam lock on the strobe (click it, or put
the cursor on it and press your lock key) and hold it: inside burn-through (about 19 nm in the F-15C, 25 km in the
Su-27) the lock turns into a normal STT with range, altitude and aspect. The coach lists which of your missiles
can home on the jam; a home-on-jam shot flies pure pursuit with no range and no loft (simplified).

Exercise 7, **Friend or foe**, puts a friend and a bandit side by side. The F-15C and the Su-27 family identify
friends by themselves (a circle on the VSD, a second row of dots on the HUD). The other jets show both as unknown
until you interrogate: TMS Left (`RCtrl + Left`) on the Viper (a green circle with 4 for 2 s), a designate or lock
on the Hornet, `I` on the JF-17 and F-14 (a trainer key for the RIO button there), `S` on the M-2000C. Then lock the
one that did not answer. No reply never proves hostile.

Exercise 8, **Datalink picture**, puts a friendly AWACS behind you (and, on the Hornet, Viper, F-14 and JF-17, a
wingman sharing his radar track). See the contact the datalink shows beyond your radar, bring your scan onto it
until it correlates, then lock it with your own radar: a datalink track cannot be fired on. The Su-27 family
switches the radar on first (its AWACS picture then stays). The F-15C and M-2000C have no datalink picture in DCS.

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

### Progress across jets

Open **Learn → Progress** to see saved completions for all eleven aircraft. Your selected jet appears first.
Each card shows completed goals, available lessons, saved RWR and winning Sortie best scores, and a
**Continue** link to the next incomplete lesson. That link selects the matching jet automatically.
Carrier and refuelling lessons appear only where supported; the Su-25T lists its strike lessons.
Progress is stored in this browser and does not sync across devices. Reference visits and incomplete
module drills do not count as completed goals.

### Missiles
Launch-zone lab. Choose missile, shooter altitude and Mach, target altitude, Mach and aspect, and what the
target does after launch (nothing, turn cold, beam, crank, notch with chaff). Fire and watch the shot in 3D
with plots of missile Mach, altitude and range. The slider shows Rmin, Rne and Rmax live. Presets show the
big lessons: shoot high and fast, a cold target shrinks your range, what "no escape" really means, loft.
IR launch requires acquisition. Opening, resetting or selecting an IR missile starts inside its simplified
lock range at the standard geometry. Manual ranges and comparison presets can exceed it: if the lab says
NO LAUNCH, move inside the displayed IR lock range or reduce the altitude gap. The support selector can use the shooter's radar to demonstrate loss of
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
landing mode, the glide-slope and localizer bars. On a wide screen the Pattern trace stays beside it; on a narrower
one the Nav display takes its place. The HUD adds a steering caret. Units follow the km / nm switch.

**Takeoff** (all ten jets): start on the runway. Hold W for the wheel brakes, set MIL (or full afterburner where
the jet's takeoff uses it; PgUp sets it in one press: a trainer key on the F/A-18C, F-16C, F-14B, JF-17 and M-2000C,
the FC3 default, not verified, on the others), release, steer with Left / Right, and pull with the Down
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

**Catapult and Ski-jump** (F/A-18C and F-14B on CVN catapults 1–4, Su-33 on Kuznetsov position 1 or 3): pick the
catapult or position and turn on Heavy for the heavy trainer weight. The Launch sequence strip under the view lists
each step with its key; the step to do now is outlined and done steps tick. Hornet: NWS HI (S), launch bar (L),
hook up (U), T/O trim by weight (T nose up, LShift+T nose down: 16°, 17° or 19°), MIL on PgUp (a trainer key; press again for
afterburner; the heavy jet needs it), wipe out (K), salute, hands off. Tomcat: hook up (U), MIL, salute (LShift+U).
The shooter refuses a salute with a step missing. Su-33: full afterburner against the deck stoppers, special
afterburner (LShift+E); the stoppers drop after 3 s and the jet runs up the 12° ramp. Leave the FOD screens (LAlt+I)
alone. Launch bar, wipe-out, trim and PgUp keys are trainer keys, the Hornet salute key conflicts between sources and the
Su-33 stopper release is not verified: the strip tags them. After the launch: gear and flaps up, the clearing turn (right from cats 1–2, left from 3–4), climb through
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

Time acceleration (1×, 2×, 4×, 8×, beside Pause, or the DCS keys LCtrl + Z faster, LAlt + Z slower, LShift + Z
normal) shortens the long transits: the rejoin to the tanker and the nav leg home. It drops back to 1× on its own
within 0.5 nm of the tanker, with the gear down, below 500 ft or on the ground, and the call line says why.

On a tablet, Fly mode shows on-screen controls: a stick pad (drag down to pull; it springs back), a
throttle slider and GEAR, FLAPS, BRAKES (hold), SPD BRK and NAV buttons, plus AB on jets that take off in
afterburner, HOOK and BALL on the carrier starts, and the launch sequence buttons (NWS HI, L-BAR, HOOK UP, TRIM,
WIPE OUT, SALUTE, SPEC AB, AB) on the launch starts. On the tanker starts only the stick, the throttle and the
refuelling buttons (PROBE or DOOR, LIGHTS, CALL) show. On a desktop, turn them on with Show on-screen controls.

### Merge & guns
Close-combat basics for all ten jets. You fly an arcade BFM mode:
the arrow keys roll the lift vector (← →) and pull or unload (↓ ↑, as in DCS), Space holds the trigger, 1 / 2 / 3
set idle, military or afterburner, B the speedbrake. Hands off the pitch keys, the jet holds a level turn at its
bank (a trainer aid). On a tablet the view shows a touch pad (roll, pull, unload, gun, throttle).
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
Lesson 8, Close-range lock and IR shot: pick your jet's close-combat mode in the Close combat panel (M cycles:
FC3 VS / BORE / HELMET / Fi0, F-15C VS / BORE / Auto Guns, Hornet BST / VACQ / WACQ / GACQ, F-16C 30×20 / 10×60 /
BORE, F-14 PLM / VSL HI / VSL LO / PAL, JF-17 VT / BS / HA, M-2000C boresight / vertical / HUD), lock him (automatic,
or Enter for FC3 BORE and HELMET), get the seeker tone and fire the IR missile (Space with the missile selected, W
swaps gun and missile). Hornet, Viper, F-15C, F-14 and JF-17 seekers growl first; uncage (C) for the high tone.
FC3 jets show ПР; Fi0 uses only the R-73 seeker and nothing reaches his RWR. The HUD draws each mode's cue (VS lines,
BORE circle, HELMET ring flashing for ПР with an X outside the gimbal, Hornet dashed circles, the dim scan area as a
trainer aid) and the seeker circle. The growl and lock tone play after your first key press or click; the Seeker
tone toggle mutes them. The bandit flares after your launch. Scored on time to lock, shots in the zone (tone, range
and the off-boresight limit, R-73 45°) and the result. IR shots also work in the Free fight. Mode areas, lock ranges
and tones not in the research notes say "not verified".
### Shkval & Vikhr (Su-25T)
Only for the Su-25T (pick it in the top bar; fighters see a panel that sends them back). The IT-23M shows the
black-and-white Shkval TV picture with its symbology: azimuth and elevation scales, КС / АС, zoom, target size in
metres, ЛД, slant range in km, time of flight and ПР. Beside it the HUD (ИЛС) shows the world ahead through the glass with ОПТ-ЗЕМЛЯ / ЗЕМЛЯ, the store label
(9А4172, С8, ВПУ), the launch range scale, the laser cursor, the CCIP pipper and the station boxes.
Four lessons: **Shkval** (7, O, slew with ; , . /, Enter to stabilise and lock, = / - to zoom, RCtrl+] / RCtrl+[
for target size; a 10 m frame will not lock the 60 m bunker), **Laser** (RShift+O, read the range, let the laser
cool), **Vikhr drill** (a tank platoon at 12–15 km: lock, lase, fire with Space at ПР and hold lock and laser to
impact; scored on kills, misses with their reason, and laser time) and **CCIP pass** (S-8 rockets or the cannon on a
truck column; you fly the dive yourself, as in DCS: Up pushes the nose down, Down pulls it up, Left / Right turn,
and a released key holds the dive angle; on a tablet the Nose ▼ / Nose ▲ pad buttons do the same. LCtrl + Space
(or the ПО Salvo button) sets how many rockets or bombs one press releases: ПО 1, ПО 2, ПО 4 or ВСЕ, shown in the
Store readout. Push over until the pipper reaches the trucks, fire a few rockets inside
about 2.5 km, and pull out; below 300 m in a dive the coach calls Pull up. A ground ring and a fading trail show
where the rockets would land now and where that point has been). Tap the TV picture to point the sight; on a tablet a slew pad, zoom and
size buttons and Fire / Lock / ЛД buttons appear. Launch ranges are community values and marked not verified.
Three more scored lessons. **Bombs**: select АБ with D, designate the tank platoon with the Shkval (Enter to
stabilise) and switch the laser on; the HUD shows the director circle and a time-to-release scale. Hold Space,
steer the keel of the aircraft symbol into the circle; the arrow starts 10 s out and the bomb releases itself.
Then a CCIP dive on the trucks with the Shkval off. Scored on miss distance and on getting the automatic release.
**Kh-58 SEAD**: select 58, press I (ПРГ), turn until the SA-15 is inside ±30° (a diamond with a type code), slew
the square with ; , . / and press Enter (the diamond becomes a circle), fire at ПР and turn away. Scored on the
kill, a launch from outside the 12 km ring, and time spent inside it. **SAM threat**: the platoon is covered by an
SA-15; the SPO-15 shows its search, lock and launch. Kill the SAM with a Kh-58 first, or fire Vikhrs from
beyond its ring; on a launch notch it (SAM at 3 or 9 o'clock) and descend. Add `?sa11=1` for an SA-11 as well.
The Kh-58 type codes and the CCRP tolerances are trainer values, marked not verified.
**Sortie** puts it together. The brief shows the area map (start, IP, the armour column and the bunker, the SA-15
ring and a ZSU-23-4 gun site) and a loadout picker: Vikhrs and rockets, laser missiles, TV weapons, bombs and
rockets, or the Kh-58 SEAD fit; switch on the SA-11 for a harder day. Fly low to the IP on the steering cue at the
top right (the jet follows the terrain at the height you set: Down raises it, Up lowers it), pop up past the IP to about 600 m,
find the column or the bunker with the Shkval and attack, then turn back, descend and fly out past the IP. Delete
drops flares (binding not verified; they do nothing against the radar SAMs here). The debrief replays the sortie
in plan view: drag the timeline, zoom to the target area, click an event to jump to it. It lists every weapon's
result and miss reason, the gimbal margin at each guided launch, laser-on bursts, time inside each SAM ring and the
gun envelope, a score out of 100 and coaching on each mistake.

### Targeting pod & Mavericks (A-10C II)
The A-10C II cockpit on its own, like Shkval & Vikhr for the Su-25T (the route takes only the A-10C II). Six
lessons, each with a checklist and a debrief: **SOI and SPI** (Coolie U / J / H / K moves the SOI between the HUD,
the TAD and the TGP; TMS Forward Long sets the SPI, China Hat Forward Long slaves everything to it, TMS Aft Long
resets it), **Targeting pod** (slew with ; . , /, WIDE / NARO, POINT with TMS Forward Short, AREA and INR),
**Laser and LSS** (lase with Insert on code 1688, then set the LSS code to 1511 and find a friendly unit's spot:
LSRCH, DETECT, LTRACK, make it the SPI), **Maverick D / H** (select the profile: SENSOR turns into the DLZ; slave to
the SPI, MAV page as SOI with Coolie Right, lock with TMS Forward Short, fire inside the DLZ, lock again for the second),
**Laser weapons** (GBU-12 in CCRP on your own laser, APKWS from about 5 nm, AGM-65L, keeping the laser on) and **Gun
strafe** (GUNS mode, the pipper on a truck inside 2 nm, Space). Weapon release (RAlt + Space) and the gun (Space) are
community keys, labelled not verified; the pod starts on and the Maverick aligned (trainer shortcuts).

### HARM & SEAD (F/A-18C)
The Hornet's AGM-88C HARM, as DCS presents it (the route takes only the F/A-18C). Seven lessons:
**Radars** (a 3D gallery of the SA-6, SA-8, SA-11, SA-15 and SA-10 batteries: which vehicle carries the radar, its
RWR symbol, TOO class and PB code), **Homing** (four films: a straight SP / TOO shot, the radar switching off
mid-flight so the HARM misses, a PB shot that lofts to the point and then listens, and an A/C pull-up),
**SP** (Master Arm `M`, A/G `2`, HARM on the stores page, HUD on the EW page, weapon release RAlt + Space),
**TOO** (TDC to the HARM display with RAlt + /, CLASS H2, box with `I`, hand off with `C`), **PB** (UFC, window 4 TGT,
code 107 for the SA-11 Snow Drift, HRM pull-up, WPDSG on the HSI, then hold release and raise the nose to the cue;
it opens with an animated explainer: pick the site at the waypoint (SA-11, SA-10 or SA-6 + SA-8), a code and a pull-up
and watch which radar the HARM chooses at the point),
**Pullback** (unbox HRM OVRD, let a live SA-6 lock you, shoot back and turn away) and **Live** (an SA-6 that goes
quiet when it sees a HARM and a live SA-11). Click the DDI pushbuttons and the UFC keys on screen; the "What that
did" log explains every press and points to the ED guide page. SP, Pullback and TOO open with their own animated guides too (cue and HARM Sequence, a lock
and the shot back, a radar going quiet; the field of view, CLASS, hand-off), and the Animated row in the lesson panel
replays any of them. Every command also has an on-screen button
(HOTAS and panel overlays on the 3D view), and Code appendix opens the guide's full ALIC code and RWR symbol table. Arrows fly the jet on a simple autopilot; time runs
×1, ×2 or ×4. The Fly it in DCS panel downloads two matching practice missions (safe ranges and live SEAD).
Trainer values (PB ranges, cue positions, most radar ranges) are listed under Simplified and not verified.

### CAS & JTAC (Su-25T, A-10C II)
For the attack jets: pick the Su-25T or the A-10C II. Work the built-in DCS JTAC before you fly it: the radio menu opens with \ (on screen: the
Radio button), F4 JTACs, then the JTAC (Axeman 1-1). Browsers keep F5, F11 and F12, so the digits 1–0 also pick
items. The flow follows the ED A-10C II manual: **Check-in** (the game sends your position, weapons and playtime),
the JTAC gives the control type, **Ready to copy**, the 9 lines (IP, heading, distance, elevation, target, grid,
mark, friendlies, egress), **Ready to copy remarks** (weapon, threats, final attack heading), **readback**, then
**IP Inbound**. Inside 10 nm the JTAC puts white smoke down ("mark is on the deck"); **Contact the Mark** starts
the talk-on from the smoke to the target. Turn onto the attack heading, call **In** and wait for **cleared hot**
before you release; call **Off** after the attack for BDA and a re-attack or departure.
Five lessons: **9-line** (type each line on the kneeboard card, then Check the card; IP, elevation, grid, mark and
friendlies must be right), **Talk-on** (find the smoke, follow the talk-on and lock a tank with the Shkval; the
smoke is a reference, not the target), **Cleared hot** (scored: release only when cleared, inside the briefed
attack headings), **Danger close** (friendlies inside 500 m: any friendly hit fails) and **Sortie** (check-in at
the holding point to egress, with the SA-15 and the ZSU-23-4). The Su-25T has no laser spot tracker, so a JTAC
laser does not help it: ask for smoke and use the talk-on. When the AI JTAC clears or aborts, its exact wording and
the talk-on are trainer versions, labelled simplified. Unit markers are off by default; switch them on in Controls.

In the **A-10C II** the page shows the HUD, the TAD (or the MSG page) on the left MFCD and the targeting pod on the
right MFCD, with the DCS default keys: TMS on LCtrl + arrows (long = held 1 s), DMS on Home / End / Delete / PageDown,
China Hat on V / C, Coolie on U / J / H / K for the SOI, slew on ; . , /, Insert fires the laser, M cycles the
master mode. Weapon release (RAlt + Space) and the gun (Space) are community keys, labelled not verified; LSS
(OSB 6), WILCO and CNTCO are buttons. Two lessons are added: **Datalink** (after the readback the JTAC sends the
digital 9-line: NEW TASKING, the red triangle on the TAD, the lines on the MSG page; WILCO, hook the triangle, make it
the SPI, slave the pod, point track, lase and drop a GBU-12 or fire an APKWS) and **JTAC laser** (IP Inbound, Laser
On: the JTAC lases on code 1688; LSS on the pod finds the spot, LTRACK, Spot, make it the SPI, cleared hot, then an
AGM-65L or GBU-12 on his spot). Talk-on, Cleared hot, Danger close and Sortie use the pod instead of the Shkval.
Readouts follow the nm / km toggle. CDU coordinate entry and markpoints are not modelled yet.

### Sortie
A full BVR fight: 1v1, 1v2, or 2v2 with an AI wingman, against AI that commits, locks, fires, cranks, notches and
drops chaff, scaled by skill (rookie to ace). The brief compares your launch zone with his. You fly a tactical
autopilot (turn, climb, speed keys), run your radar with your jet's keys, and use time acceleration. Afterwards
the debrief replays the fight in 3D with a timeline of launches, pitbulls and hits, per-shot stats (range vs
Rmax, F-pole, how long the target was warned) and coaching on what went right and wrong.

Under **SAM sites** the brief adds one or two SA-10, SA-11 or SA-15 sites on the bandits' side. They show in
the 3D view with their rings, the coach calls their lock and launch, and the debrief notes a SAM kill or a
broken track. Simplified: your AI wingman stays out of a ring once its RWR shows the site, and beams, descends and
drops chaff against a SAM fired at it (a trainer rule); the sites shoot only at your side.

Under **Bandit ECM** the brief sets the mission editor option for the bandits (Never use, Use if only lock by
radar, Use if detected by radar, Always use). A jamming bandit is a strobe on your scope until burn-through; lock
the strobe for a home-on-jam shot or close to burn-through. Your own jammer is on `E` where the jet has one (a
Jammer button on the F/A-18C, where `E` is chaff; the J-11A has none). The debrief marks jammer on/off and
home-on-jam shots.

Under **AWACS** the brief puts a friendly AWACS behind you: your datalink shows the bandits it sees, the coach points
your scan at a contact the datalink has and your radar does not, and a Link 16 wingman shares his tracks.

**IFF** works the same way in the Sortie: an IFF button on the jet's key, or a note on the jets where it is
automatic. What your radar calls friendly comes from your IFF, not from the game's truth, so with an AI wingman you
can fire at him if you never interrogated, as in DCS; once IFF says friend the jet refuses the shot. The coach asks
you to interrogate before shooting an unidentified contact, and the debrief flags a shot at the wingman as blue on
blue.

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

### Export a Sortie to Tacview

In the BVR Sortie debrief, select **Download ACMI**, then open the saved `.acmi` file in Tacview.
The file contains the recorded whole-fight truth, including aircraft, air-to-air missiles, SAM sites and
SAM missiles, regardless of the replay's Truth / Your radar setting. Export stays on your device.
The trainer uses a synthetic location and date; it does not reconstruct a DCS theater or include the new
exterior models. Sampling is every 0.25 seconds. See [export limits](api/tacview-export.md).
