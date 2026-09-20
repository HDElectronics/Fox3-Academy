/**
 * [OWNER: data] Key bindings and step-by-step BVR procedures per aircraft (docs/research/*.md).
 *
 * Conventions (see docs/api/data.md):
 * - FC3 jets: KeyBind.keys is the DCS keyboard default ('RAlt + I'); KeyBind.note holds the controls-menu
 *   name in quotes plus caveats.
 * - Full-fidelity jets: KeyBind.keys is the HOTAS/cockpit function as the DCS controls menu names it;
 *   KeyBind.note starts with 'Keyboard: …' when a default key exists.
 * - ProcedureStep.keys = keyboard keys; ProcedureStep.hotas = HOTAS/cockpit function; note = caveat.
 * - Procedure ids used on every jet: 'search', 'stt-shot', 'support', 'defend'. 'tws-multi' only where the
 *   jet can engage several targets. Extra ids: 'tws-designate' (FC3 Russian single-target СНП),
 *   'dt-sam' (F-16C two-target SAM).
 */
import type { AircraftId, AircraftProcedures, KeyBind, Procedure, ProcedureStep } from './types';

const s = (text: string, x: Omit<ProcedureStep, 'text'> = {}): ProcedureStep => ({ text, ...x });

// ---------------------------------------------------------------------------------------------------------
// FC3 Russian jets: Su-27, Su-33, J-11A, MiG-29S
// ---------------------------------------------------------------------------------------------------------

function ruBinds(id: 'su27' | 'su33' | 'j11a' | 'mig29s'): KeyBind[] {
  const ecm = {
    su27: 'Needs L005 Sorbtsiya pods on stations 1 and 10.',
    su33: 'Jammer fit on the Su-33 is not in research.',
    j11a: 'The datamine shows no jammer for the J-11A.',
    mig29s: 'Internal Gardenia jammer.',
  }[id];
  return [
    { action: 'BVR mode', keys: '2', note: '"(2) Beyond Visual Range Mode"' },
    { action: 'Radar on / off', keys: 'I', note: '"Radar On/Off". ИЗЛ shows on the HUD while it transmits.' },
    {
      action: id === 'mig29s' ? 'RWS / TWS (ОБЗ / СНП / СНП2)' : 'RWS / TWS (ОБЗ / СНП)', keys: 'RAlt + I',
      note: id === 'mig29s' ? '"Radar RWS/TWS Mode Select". Press twice from ОБЗ for СНП2.' : '"Radar RWS/TWS Mode Select"',
    },
    { action: 'PRF ППС / ЗПС / АВТ', keys: 'RShift + I', note: '"Radar Pulse Repeat Frequency Select". СНП needs ППС or ЗПС.' },
    { action: 'Designate / lock (STT)', keys: 'Enter', note: '"Target Lock"' },
    { action: 'Unlock', keys: 'Backspace', note: '"Target Unlock". Medium confidence: taken from mod copies of the FC3 bindings.' },
    { action: 'Cursor slew', keys: '; , . /', note: '"Target Designator Up / Left / Down / Right"' },
    { action: 'Cursor to centre', keys: 'RCtrl + I', note: '"Target Designator To Center"' },
    { action: 'Display range in / out', keys: '= / -', note: '"Display Zoom In/Out"' },
    { action: 'Scan zone left / right (three 60° positions)', keys: 'RShift + , / RShift + /', note: '"Scan Zone Left/Right"' },
    { action: 'Scan elevation (height difference)', keys: 'RShift + ; / RShift + .', note: '"Scan Zone Up/Down"' },
    { action: 'Expected target range (range-angle aiming)', keys: 'RCtrl + = / RCtrl + -', note: 'Listed as "Radar Scan Zone Increase/Decrease"' },
    { action: 'IRST on / off', keys: 'O', note: '"Electro-Optical System On/Off". No RWR warning for the target.' },
    { action: 'Weapon cycle / gun', keys: 'D / C', note: '"Weapon Change" / "Cannon"' },
    { action: 'Launch (hold at least 1 s)', keys: 'Space', note: 'Hold for at least 1 s. The F-15C manual lists missiles on RAlt + Space ("Weapon Release"); the Russian FC3 manuals use Space.' },
    { action: 'Launch permission override', keys: 'LAlt + W', note: '"Launch Permission Override"' },
    { action: 'Chaff', keys: 'Insert', note: '"Countermeasures Chaff Dispense"' },
    { action: 'Flares', keys: 'Delete', note: '"Countermeasures Flares Dispense"' },
    { action: 'Countermeasure program / continuous', keys: 'Q / LShift + Q', note: '"Countermeasures Release" / "Countermeasures Continuously Dispense"' },
    { action: 'ECM jammer', keys: 'E', note: `"ECM". ${ecm}` },
    { action: 'Close combat: vertical scan / bore / helmet / Fi0', keys: '3 / 4 / 5 / 6', note: 'VS, BORE and HELMET default to the IRST and an IR missile.' },
    { action: 'RWR mode / volume', keys: 'RShift + R / RAlt + , and RAlt + .', note: '"RWR/SPO Mode Select" / "RWR/SPO Sound Signals Volume Down/Up"' },
  ];
}

function ruProcedures(id: 'su27' | 'su33' | 'j11a' | 'mig29s'): Procedure[] {
  const r77 = id === 'j11a' || id === 'mig29s';
  const wpn = r77 ? '77 (or 27ЭР)' : '27ЭР (or 27Р)';
  const search: Procedure = {
    id: 'search', title: 'Search (ОБЗ)',
    steps: [
      s('Select BVR mode and switch the radar on; ИЗЛ appears on the HUD.', { keys: '2, I' }),
      s(`Press D until ${wpn} shows at lower right.`, { keys: 'D' }),
      s('Pick the PRF: ППС for a closing target, ЗПС for a tail chase, АВТ if the aspect is unknown (about 25 % less range).', { keys: 'RShift + I' }),
      s('Set the HUD range scale.', { keys: '= / -' }),
      s('Point the 60° scan left, centre or right at the threat axis.', { keys: 'RShift + , / RShift + /' }),
      s('Aim the scan in elevation: enter the expected range and the height difference. Target 80 km out, 5 km above you: enter 80 and +5.', { keys: 'RCtrl + = / RCtrl + -, RShift + ; / RShift + .' }),
      s('Wait one or two frames (about 5 s each) for the dot rows to appear. Two dots is a fighter.'),
    ],
  };
  const twsDesignate: Procedure = {
    id: 'tws-designate', title: 'СНП: designate one track',
    steps: [
      s('From ОБЗ press RAlt + I; check СНП ДВБ at lower left. PRF must be ППС or ЗПС.', { keys: 'RAlt + I' }),
      s('Slew the cursor onto the contact until it snaps to it and follows it. That is your one designated track; he hears no lock yet.', { keys: '; , . /' }),
      s('Keep closing. At 85 % of Rmax the radar locks him by itself (АТК ДВБ, STT) and his RWR shows a lock.', {
        note: 'Su-27 manual: Enter forces an earlier lock. MiG-29 and Su-33 manuals: a lock above 85 % will not happen.',
      }),
      s('Carry on with the STT shot. If STT is lost the radar falls back to СНП, not ОБЗ.'),
    ],
  };
  const sttShot: Procedure = {
    id: 'stt-shot', title: r77 ? 'STT shot (R-77 or R-27ER)' : 'STT shot (R-27ER)',
    steps: [
      s('Cursor on the contact and Enter from ОБЗ, or let СНП lock at 85 % Rmax. АТК ДВБ shows; he gets a lock warning.', { keys: 'Enter' }),
      s('Read the left range scale: top tick Rmax, middle Rtr (no escape against a manoeuvring target), bottom Rmin. The caret is his range.'),
      s('Shoot at or inside Rtr for a kill, or at Rmax to force him defensive.'),
      s('When ПР shows, hold Space for at least 1 s.', { keys: 'Space (hold)' }),
      s(`After launch the lock symbol flashes at 2 Hz. Call ${r77 ? 'Fox 3 (R-77) or Fox 1 (R-27ER)' : 'Fox 1'}.`),
    ],
  };
  const support: Procedure = r77
    ? {
      id: 'support', title: 'Support the missile',
      steps: [
        s('Keep the STT: the R-77 flies on your radar\'s updates until its own seeker takes over.'),
        s('Crank toward 50–60° off his nose to slow the closure, never past the ±60° gimbal.'),
        s('Once the missile is within about 15 km of him you may unlock and take the next target. There is no HUD cue: judge it from time of flight.', {
          keys: 'Backspace', note: 'What the R-77 does if you drop lock earlier is not verified.',
        }),
        s('An R-27ER shot needs the lock to impact, as in the Su-27.'),
      ],
    }
    : {
      id: 'support', title: 'Support the missile',
      steps: [
        s('Keep the STT until impact: the R-27R/ER homes on your illumination the whole way, and his RWR shows the launch.'),
        s('To cut closure, crank toward about 50° off his nose, never past the ±60° gimbal.'),
        s('If the lock breaks, relock at once; the missile continues if you are quick.', { keys: 'Enter' }),
        s('If he beams you low he can slip into your notch: watch for the lock dropping.'),
        s('After impact or a miss, unlock or let the radar fall back to СНП.', { keys: 'Backspace' }),
      ],
    };
  const defend: Procedure = {
    id: 'defend', title: 'Defend: notch and chaff',
    steps: [
      s('Read the SPO-15. Yellow azimuth lamp and П: a fighter. Steady red lamp and steady high tone: lock. Flashing red and an intermittent high tone: SARH launch.'),
      s('SARH launch: put the shooter on the 90° lamp (3 or 9 o\'clock) within a few degrees, and descend so he looks down at you.'),
      s('Chaff while you are in the beam: single bundles, or the program.', { keys: 'Insert / Q' }),
      s('Active missile: no warning until its seeker goes active, then the power ring jumps. Beam the missile and chaff at once.'),
      s('If you still have time and range, turn cold and drag at full burner, descending.'),
      s('The jammer denies him range out to about 25 km but gives his missiles a home-on-jam beacon.', { keys: 'E' }),
      s('The SPO never shows IR missiles: flare early when you are inside R-27ET, R-73 or AIM-9 range.', { keys: 'Delete' }),
    ],
  };
  const snp2: Procedure = {
    id: 'tws-multi', title: 'СНП2: two R-77s at two targets',
    steps: [
      s('Press D until 77 shows.', { keys: 'D' }),
      s('From ОБЗ press RAlt + I twice; the HUD shows СНП2.', { keys: 'RAlt + I, RAlt + I' }),
      s('Slew onto the lead target without locking. The radar picks the second target itself; it must be within 8° of azimuth.', { keys: '; , . /' }),
      s('The radar tracks both: diamond = primary, cross = secondary.'),
      s('When Ц1 / Ц2 and ПР show, hold the trigger: two R-77s leave, one per target.', { keys: 'Space (hold)' }),
      s('Support until each missile is within about 15 km of its target. A target pulling over 3 g, jamming, or Ц2 leaving coverage drops the radar to one track.', {
        note: 'Community reports about 10 s for the radar to build the two-target solution.',
      }),
    ],
  };
  return id === 'mig29s' ? [search, twsDesignate, snp2, sttShot, support, defend] : [search, twsDesignate, sttShot, support, defend];
}

// ---------------------------------------------------------------------------------------------------------
// F-15C (FC3)
// ---------------------------------------------------------------------------------------------------------

const F15C_BINDS: KeyBind[] = [
  { action: 'Radar on / off', keys: 'I', note: '"Radar On/Off"' },
  { action: 'BVR search (LRS)', keys: '2', note: '"(2) Beyond Visual Range Mode"' },
  { action: 'RWS / TWS', keys: 'RAlt + I', note: '"Radar RWS/TWS Mode Select". The manual quick reference says RCtrl + I, which is really Target Designator To Center.' },
  { action: 'PRF HI / MED / interleaved', keys: 'RShift + I', note: '"Radar Pulse Repeat Frequency Select"' },
  { action: 'Designate / lock (Enter again on a designated target = STT)', keys: 'Enter', note: '"Target Lock"' },
  { action: 'Unlock / drop all designations', keys: 'Backspace', note: '"Radar - Return To Search/NDTWS"' },
  { action: 'Remove one TWS designation', keys: 'No default key', note: '"Unlock TWS Target": bind it yourself.' },
  { action: 'Cursor (TDC) slew', keys: '; , . /', note: '"Target Designator Up / Left / Down / Right"' },
  { action: 'Cursor to centre', keys: 'RCtrl + I', note: '"Target Designator To Center"' },
  { action: 'Range scale', keys: '= / -', note: '"Display Zoom In/Out". Bumping the TDC at the top or bottom of the VSD also works.' },
  { action: 'Scan width ±60° / ±30°', keys: 'RCtrl + = / RCtrl + -', note: '"Radar Scan Zone Increase/Decrease"' },
  { action: 'Antenna elevation', keys: 'RShift + ; / RShift + .', note: '"Scan Zone Up/Down"' },
  { action: 'Scan zone left / right (TWS window)', keys: 'RShift + , / RShift + /', note: '"Scan Zone Left/Right"' },
  { action: 'Vertical scan / boresight', keys: '3 / 4', note: '"(3) Close Air Combat Vertical Scan Mode" / "(4) Close Air Combat Bore Mode"' },
  { action: 'FLOOD (AIM-7) / VISUAL (AIM-120)', keys: '6', note: '"(6) Longitudinal Missile Aiming Mode/FLOOD mode"' },
  { action: 'Weapon cycle / gun', keys: 'D / C', note: '"Weapon Change" / "Cannon"' },
  { action: 'Launch missile', keys: 'RAlt + Space', note: '"Weapon Release". Space ("Weapon Fire") is the gun trigger; it is reported to launch missiles too (unverified).' },
  { action: 'Chaff', keys: 'Insert', note: '"Countermeasures Chaff Dispense"' },
  { action: 'Flares', keys: 'Delete', note: '"Countermeasures Flares Dispense"' },
  { action: 'ECM (AN/ALQ-135)', keys: 'E', note: '"ECM". Open X in the TEWS centre: flashing = warming up, steady = on.' },
  { action: 'RWR mode / volume', keys: 'RShift + R / RAlt + , and RAlt + .', note: '"RWR/SPO Mode Select" / "RWR/SPO Sound Signals Volume Down/Up"' },
];

const F15C_PROCEDURES: Procedure[] = [
  {
    id: 'search', title: 'Search (LRS)',
    steps: [
      s('Radar on and LRS.', { keys: 'I, 2' }),
      s('PRF: interleaved by default; HI for long-range hot targets, MED for tail or beam targets.', { keys: 'RShift + I' }),
      s('Set the range and the scan width (±60° or ±30°).', { keys: '= / -, RCtrl + = / RCtrl + -' }),
      s('Put the TDC at the expected range and read the two coverage altitudes on the VSD left scale. Tilt the antenna until the target altitude sits between them.', { keys: 'RShift + ; / RShift + .' }),
      s('Wait a frame or two (about 5 s) for bricks.'),
    ],
  },
  {
    id: 'tws-multi', title: 'TWS: up to four AIM-120 targets',
    steps: [
      s('Press RAlt + I and check TWS at lower left. The scan becomes a ±30° window; slew it with RShift + , and RShift + /.', { keys: 'RAlt + I' }),
      s('Wait one or two scans for bricks to get altitude numbers and aspect sticks.'),
      s('TDC on the most threatening track, Enter: PDT (star).', { keys: 'Enter' }),
      s('Enter on up to three more tracks, in the order you want to shoot them: SDTs (hollow bricks).', { keys: 'Enter' }),
      s('Select AIM-120: the HUD shows A#C or A#B.', { keys: 'D' }),
      s('Steering dot in the ASE circle, range caret against Rpi and Rtr, wait for the flashing star.'),
      s('Fire: the first AIM-120 goes to the PDT. Fire again for each SDT in order; after the fourth it cycles back to the PDT. Space the shots 1–2 s apart.', { keys: 'RAlt + Space' }),
      s('Do not press Enter twice on any target now: STT drops the other tracks and their missiles lose updates.'),
    ],
  },
  {
    id: 'stt-shot', title: 'STT shot (AIM-120 or AIM-7)',
    steps: [
      s('Enter in LRS, or Enter twice on a designated track in TWS: STT. He gets a lock warning.', { keys: 'Enter' }),
      s('Wait for the flashing star (AIM-120) or flashing triangle (AIM-7) under the TD box.'),
      s('Fire on the cue.', { keys: 'RAlt + Space' }),
      s('AIM-7: hold STT to impact; he sees lock and launch the whole time.'),
      s('Inside 10 nm, FLOOD guides an AIM-7 without a lock: keep him in the 12° circle.', { keys: '6' }),
    ],
  },
  {
    id: 'support', title: 'Support the missile',
    steps: [
      s('Stay in TWS and keep every target inside the ±30° window; crank toward about 50° off, inside the ±60° gimbal.'),
      s('Watch the HUD lower left: "T tta tti" flashes while the PDT missile is on datalink, then "M tti" once it is active.'),
      s('After "M" you may turn away. After an STT AIM-120 shot, break lock and defend or go cold.', { keys: 'Backspace' }),
      s('AIM-7: no turning away. Hold STT until impact.'),
    ],
  },
  {
    id: 'defend', title: 'Defend: notch and chaff',
    steps: [
      s('Read the TEWS. ^ hat = fighter, diamond = primary, continuous chirp = lock, flashing circle and launch tone = SARH or command launch, "M" in a diamond = active missile: react now.'),
      s('SARH: beam the shooter (3 or 9 o\'clock) within a few degrees, go low for look-down clutter, and chaff.', { keys: 'Insert' }),
      s('Active missile: beam the missile, chaff, use altitude and terrain; drag cold if you have time.', { keys: 'Insert' }),
      s('IR missile: flares.', { keys: 'Delete' }),
      s('ECM denies him range but gives his missiles home-on-jam: use with care.', { keys: 'E' }),
      s('Re-commit only once you are no longer defending.', { keys: '2, RAlt + I' }),
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------
// F/A-18C Hornet
// ---------------------------------------------------------------------------------------------------------

const TDC_DEPRESS = 'Throttle Designator Controller - DEPRESS';
const UNDESIGNATE = 'Undesignate/Nose Wheel Steer Switch';
const SCS_RIGHT = 'Sensor Control Switch - Right';

const FA18C_BINDS: KeyBind[] = [
  { action: 'Radar on / off', keys: 'RADAR knob: OPR / STBY / OFF', note: 'Sensor panel knob. The controls-menu name and key were not in research.' },
  { action: 'TDC to the radar DDI; in TWS: STT on the L&S; with no target under the TDC: AACQ', keys: SCS_RIGHT, note: 'Keyboard: RAlt + /. "Toward the radar DDI", normally the right DDI.' },
  { action: 'Radar mode RWS / VS / TWS', keys: `${TDC_DEPRESS} on the PB5 mode legend`, note: 'Keyboard: Enter, with the TDC over the mode legend.' },
  { action: 'Cursor slew', keys: 'Throttle Designator Controller - Up / Down / Left / Right', note: 'Keyboard: ; . , /' },
  { action: 'Designate: L&S, then DT2 (hold > 1 s = SPOT)', keys: TDC_DEPRESS, note: 'Keyboard: Enter' },
  { action: 'Undesignate: step L&S, swap L&S and DT2, leave STT or ACM', keys: UNDESIGNATE, note: 'Keyboard: S' },
  { action: 'RAID / SCAN RAID', keys: 'RAID/FLIR FOV Select Button', note: 'Keyboard: I' },
  { action: 'Antenna elevation', keys: 'Radar Elevation Control - Up / Down', note: 'Keyboard: = / -' },
  { action: 'Range scale', keys: `${TDC_DEPRESS} on the range arrows`, note: 'In TWS the range steps up by itself to keep the targets on scale.' },
  { action: 'Azimuth / bars / PRF', keys: 'DDI pushbuttons by the azimuth ("140"), bar ("4B") and PRF legends', note: 'Exact pushbutton numbers are not in research.' },
  { action: 'Weapon select AMRAAM / Sparrow / Sidewinder / gun', keys: 'Select AMRAAM / Select Sparrow / Select Sidewinder / Select Gun', note: 'Keyboard: LShift + D / LShift + W / LShift + S / LShift + X' },
  { action: 'Master Arm', keys: 'Master Arm Switch - ARM/SAFE', note: 'Keyboard: M' },
  { action: 'Launch A/A missile', keys: 'Trigger', note: 'Keyboard: Space. A/A missiles fire on the trigger, not the Weapon Release button (RAlt + Space).' },
  { action: 'AIM-9 cage / uncage (AIM-7: STT on the L&S)', keys: 'Cage/Uncage Button', note: 'Keyboard: C' },
  { action: 'ACM: boresight (BST) / vertical (VACQ) / wide (WACQ)', keys: 'Sensor Control Switch - Fwd / Aft / Left', note: 'Keyboard: RAlt + ; / RAlt + . / RAlt + , (the manual prints LAlt + , for Left)' },
  { action: 'Chaff: MAN program 5 or consent (BYPASS: single chaff)', keys: 'Dispense Switch - Forward', note: 'Keyboard: E' },
  { action: 'Flares: EW-page MAN program (BYPASS: single flare)', keys: 'Dispense Switch - Aft', note: 'Keyboard: D' },
];

const FA18C_PROCEDURES: Procedure[] = [
  {
    id: 'search', title: 'Search (RWS)',
    steps: [
      s('RADAR knob to OPR, Master Arm ARM, select AMRAAM (the A/A master mode comes with it). Check "AC" on the SMS and set target SIZE and RCS.', { hotas: 'Master Arm Switch - ARM/SAFE; Select AMRAAM', keys: 'M, LShift + D' }),
      s('Attack radar on the right DDI; give it the TDC (diamond top right).', { hotas: SCS_RIGHT, keys: 'RAlt + /' }),
      s('RWS at 40–80 nm, 140° or 80°, 2–4 bars, INTL PRF (HI for long-range hot targets).'),
      s('Set the antenna so the TDC altitude numbers bracket the target altitude.', { hotas: 'Radar Elevation Control - Up / Down', keys: '= / -' }),
      s('LTWS shows trackfile HAFUs while in RWS, but cannot launch. VS finds nose-on targets far out, with closure only and no range.'),
    ],
  },
  {
    id: 'tws-multi', title: 'TWS: L&S and DT2, one AIM-120 each',
    steps: [
      s('TDC over the mode legend (PB5), depress, select TWS. Choose 2B/80°, 4B/40° or 6B/20°. Start in MAN and slew onto the group.', { hotas: TDC_DEPRESS, keys: 'Enter' }),
      s('Split tight groups with RAID or EXP.', { hotas: 'RAID/FLIR FOV Select Button', keys: 'I' }),
      s('Check the automatic L&S (star). TDC over a second track and depress: DT2 (diamond). Box AUTO to keep the scan on the L&S.', { hotas: TDC_DEPRESS, keys: 'Enter' }),
      s('Steering dot in the ASE circle. SHOOT is steady inside RMAX and flashes inside RNE.'),
      s('Fire at the L&S.', { hotas: 'Trigger', keys: 'Space' }),
      s('Undesignate: DT2 becomes L&S (or the L&S steps to the next ranked track). Re-steer and fire again.', { hotas: UNDESIGNATE, keys: 'S' }),
      s('Do not bump the SCS toward the radar DDI now: it puts the L&S in STT and drops every other trackfile.'),
    ],
  },
  {
    id: 'stt-shot', title: 'STT shot',
    steps: [
      s('STT: TDC on a hit in RWS and depress, or designate an LTWS track twice, or SCS toward the radar DDI in TWS. He gets a lock warning.', { hotas: `${TDC_DEPRESS} / ${SCS_RIGHT}`, keys: 'Enter / RAlt + /' }),
      s('Firing an AIM-7 at a TWS L&S also puts the radar in STT.', { hotas: 'Select Sparrow', keys: 'LShift + W' }),
      s('Wait for SHOOT, then fire.', { hotas: 'Trigger', keys: 'Space' }),
      s('AIM-7: hold STT to impact. AIM-120: hold until "ACT" runs out, then Undesignate if you must leave.', { hotas: UNDESIGNATE, keys: 'S' }),
    ],
  },
  {
    id: 'support', title: 'Support the missile',
    steps: [
      s('Stay in TWS and keep every target in the scan. The steering dot flashes within 15° (azimuth) or 5° (elevation) of the gimbal limit: crank just short of that.'),
      s('Watch the HUD "xx ACT" count down to 0, then "xx TTG". On the radar format the fly-out pyramid shows seconds to active, then "A".'),
      s('After "A" you may turn cold or defend.'),
      s('If a trackfile drops, its missile flies on to the last intercept point and goes active there, with a lower chance of a hit.'),
    ],
  },
  {
    id: 'defend', title: 'Defend: notch and chaff',
    steps: [
      s('ALR-67: the outer ring is critical. AI light steady = lock. A flashing symbol in the critical band with CW and the fast tone, or an "M", = missile.'),
      s('Beam the shooter (SARH) or the missile (active) within a few degrees; descend so there is ground behind you.'),
      s('Chaff in the beam: Dispense Forward = MAN program 5 or consent, Aft = the EW-page program.', { hotas: 'Dispense Switch - Forward / Aft', keys: 'E / D' }),
      s('If you still have time, drag cold.'),
      s('ASPJ to XMIT only once he already has you: jamming invites home-on-jam.'),
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------
// F-16C Viper
// ---------------------------------------------------------------------------------------------------------

const TMS_UP = 'Target Management Switch - Up';
const TMS_RIGHT = 'Target Management Switch - Right';
const TMS_DOWN = 'Target Management Switch - Down';
const WPN_REL = 'WPN REL Button - Depress';

const F16C_BINDS: KeyBind[] = [
  { action: 'Radar on / off', keys: 'FCR switch (sensor power panel)', note: 'Not in research; cockpit switch. Check the controls menu.' },
  { action: 'FCR as sensor of interest', keys: 'Display Management Switch - Down', note: 'Keyboard: RAlt + .' },
  { action: 'Radar mode RWS / VSR / TWS', keys: 'FCR OSB 2', note: 'Cockpit pushbutton. Holding TMS Right 1 s also toggles TWS.' },
  { action: 'TWS on / off (hold 1 s); upgrade all and bug closest; step bug', keys: TMS_RIGHT, note: 'Keyboard: RCtrl + Right' },
  { action: 'Upgrade / bug; on the bug: STT; hold: Spotlight', keys: TMS_UP, note: 'Keyboard: RCtrl + Up' },
  { action: 'Reject, downgrade, unlock, back to RWS', keys: TMS_DOWN, note: 'Keyboard: RCtrl + Down' },
  { action: 'IFF (short) / NCTR (long)', keys: 'Target Management Switch - Left', note: 'Keyboard: RCtrl + Left' },
  { action: 'Cursor slew', keys: 'RDR CURSOR Switch - Up / Down / Left / Right', note: 'Keyboard: ; . , /' },
  { action: 'Range scale', keys: 'FCR OSB 19 / OSB 20, or bump the cursor', note: 'Cockpit pushbuttons.' },
  { action: 'Azimuth / bars', keys: 'FCR OSB 18 (A6 / A3 / A1) / OSB 17 (4B / 2B / 1B)', note: 'A2 and 3B come only with a bug in TWS.' },
  { action: 'Antenna elevation', keys: 'ANT ELEV Knob - CW / CCW', note: 'Keyboard: = / -' },
  { action: 'AIM-120 (missile override)', keys: 'DOGFIGHT/Missile Override Switch - MISSILE OVERRIDE/CENTER', note: 'Keyboard: 4' },
  { action: 'Dogfight (ACM)', keys: 'DOGFIGHT/Missile Override Switch - DOGFIGHT/CENTER', note: 'Keyboard: 3' },
  { action: 'Missile step (short: station, long: type)', keys: 'NWS A/R DISC MSL STEP Button', note: 'Keyboard: S' },
  { action: 'Launch (press and hold)', keys: WPN_REL, note: 'Keyboard: RAlt + Space' },
  { action: 'Uncage AIM-9', keys: 'UNCAGE Switch', note: 'Keyboard: C' },
  { action: 'Countermeasures: manual 1–4 / manual 6 / ECM off / auto consent', keys: 'Countermeasures Management Switch - Fwd / Left / Right / Aft', note: 'No default key found (Nov 2023 clean profile).' },
  { action: 'Manual program 5', keys: 'CHAFF/FLARE Dispense button', note: 'Left cockpit wall. No default key found.' },
];

const F16C_PROCEDURES: Procedure[] = [
  {
    id: 'search', title: 'Search (CRM RWS)',
    steps: [
      s('Missile override for AIM-120. SMS: AAM, A120C, SLAVE; Master Arm; check RDY.', { hotas: 'DOGFIGHT/Missile Override Switch - MISSILE OVERRIDE/CENTER', keys: '4' }),
      s('FCR on an MFD and make it the SOI.', { hotas: 'Display Management Switch - Down', keys: 'RAlt + .' }),
      s('CRM RWS, or VSR for long-range hot targets. A6/4B for the wide picture (8 s frame), A3/2B toward a known group (2 s).', { hotas: 'FCR OSB 2, OSB 18, OSB 17' }),
      s('Set ANT ELEV so the cursor altitudes bracket the target.', { hotas: 'ANT ELEV Knob - CW / CCW', keys: '= / -' }),
      s('Faint target: hold TMS Up for a Spotlight (±10° 4-bar on the cursor); release over it to designate.', { hotas: TMS_UP, keys: 'RCtrl + Up' }),
    ],
  },
  {
    id: 'tws-multi', title: 'TWS: shoot list, up to six AIM-120s',
    steps: [
      s('Hold TMS Right 1 s: TWS. Wait for search targets to become tracks.', { hotas: TMS_RIGHT, keys: 'RCtrl + Right (hold)' }),
      s('Short TMS Right: every track becomes a System Track and the closest is bugged. Or cursor on a track and TMS Up to upgrade or bug it.', { hotas: `${TMS_RIGHT} / ${TMS_UP}`, keys: 'RCtrl + Right / RCtrl + Up' }),
      s('With a bug the scan becomes ±25° 3-bar around it.'),
      s('Centre the ASC in the ASEC. Shoot inside RPI (inside RTR against a manoeuvring target), or loft 40° at RAERO / 20° at ROPT.'),
      s('Press and hold WPN REL.', { hotas: WPN_REL, keys: 'RAlt + Space (hold)' }),
      s('Short TMS Right steps the bug to the next System Track. Re-steer and fire. Up to six missiles at six targets.', { hotas: TMS_RIGHT, keys: 'RCtrl + Right' }),
      s('TMS Up on the bug now would go STT and lose the other tracks.'),
    ],
  },
  {
    id: 'dt-sam', title: 'Two targets without TWS (DT SAM / DTT)',
    steps: [
      s('In RWS, TMS Up on target 1: SAM (A3, periodic dwell on it).', { hotas: TMS_UP, keys: 'RCtrl + Up' }),
      s('TMS Up on target 2: DT SAM.', { hotas: TMS_UP, keys: 'RCtrl + Up' }),
      s('Short TMS Right swaps the primary. Shoot, swap, shoot.', { hotas: TMS_RIGHT, keys: 'RCtrl + Right' }),
      s('Inside 10 nm the radar goes DTT by itself; inside 3 nm it goes STT on the closest.'),
    ],
  },
  {
    id: 'stt-shot', title: 'STT shot',
    steps: [
      s('RWS: cursor on the target, TMS Up = SAM; TMS Up again = STT. In TWS, TMS Up on the bug = STT. He gets a lock warning.', { hotas: TMS_UP, keys: 'RCtrl + Up' }),
      s('At or below RPI, keep the ASC inside the ASEC, then press and hold WPN REL. The Viper has no SHOOT text cue.', { hotas: WPN_REL, keys: 'RAlt + Space (hold)' }),
      s('TMS Aft steps back out of STT.', { hotas: TMS_DOWN, keys: 'RCtrl + Down' }),
    ],
  },
  {
    id: 'support', title: 'Support the missile',
    steps: [
      s('Stay in TWS and keep the targets inside the scan. Crank toward the ±60° gimbal limit.'),
      s('Watch the DLZ "A xx" (seconds to active) for the missile of interest. Each target\'s rectangular tail flashes when its missile goes active.'),
      s('Once "A" has run out and "T xx" remains, you may turn cold. The × over a target marks the last 8 s.'),
      s('Tracks drop after 13 s without data; a dropped track leaves its missile flying on memory.'),
    ],
  },
  {
    id: 'defend', title: 'Defend: notch and chaff',
    steps: [
      s('ALR-56M: a box = tracking you; a symbol inside the inner circle with a flashing circle and MISSILE LAUNCH = guidance. Hard turns can hide threats in the ±45° elevation blind zone.'),
      s('Beam the shooter (SARH) or the missile (active) within a few degrees; descend so there is ground behind you.'),
      s('Chaff in the beam: CMS Forward = manual program 1–4, Left = program 6, Aft = auto program or consent.', { hotas: 'Countermeasures Management Switch - Fwd / Left / Aft', note: 'No default keyboard keys found.' }),
      s('If you still have time, drag cold.'),
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------
// F-14B Tomcat (pilot with Jester)
// ---------------------------------------------------------------------------------------------------------

const TRIGGER_F14 = 'Trigger (Second Detent)';

const F14B_BINDS: KeyBind[] = [
  { action: 'Jester menu', keys: 'Toggle Menu', note: 'Keyboard: A (1st press context menu, 2nd main menu, 3rd close); items LCtrl + 1 … LCtrl + 8.' },
  { action: 'Radar on, mode, range, scan (through Jester)', keys: 'Jester: Beyond Visual Range – Radar', note: 'Mode RWS / TWS / PD / pulse, scan range 25–400 nm, elevation, azimuth. Petal wording is not verified.' },
  { action: 'Lock / unlock (through Jester)', keys: 'Jester: lock closest / at azimuth and range / from the TWS list', note: 'Unlock petal wording is not verified.' },
  { action: 'Cursor, hook, manual lock (RIO seat)', keys: 'HCU half-action / full-action', note: 'The pilot has no radar cursor; a human RIO hooks and locks with the HCU.' },
  { action: 'Weapon select GUN / SW / SP-PH', keys: 'Weapon Selector UP / DOWN' },
  { action: 'Sparrow ↔ Phoenix', keys: 'Weapon Selector Press' },
  { action: 'Launch', keys: TRIGGER_F14, note: 'Default key not verified (candidate: Space). About 3 s from trigger to missile away.' },
  { action: 'ACM lock: PAL (±20°, 8-bar, 15 nm)', keys: 'Target Designate Forward / PAL' },
  { action: 'ACM lock: VSL HI / VSL LO (5 nm)', keys: 'Target Designate UP / VSL HI; Target Designate DOWN / VSL LO' },
  { action: 'ACM lock: PLM (5 nm on the ADL)', keys: 'PLM Button' },
  { action: 'Missile prep / Master Arm', keys: 'MSL PREP switch; Master Arm switch (ACM panel)', note: 'MSL PREP about 2 min before the fight.' },
  { action: 'Phoenix options (RIO)', keys: 'DDD TGTS switch; MSL OPTIONS NORM / SP PD / PH ACT', note: 'RIO controls. PH ACT must be set before launch.' },
  { action: 'Countermeasures', keys: 'DLC Toggle / Countermeasure Dispense', note: 'Pilot control with flaps up; FLARE MODE determines flare/chaff release. Default keyboard key for the classic F-14B remains not verified. See verification-status.md.' },
];

const F14B_PROCEDURES: Procedure[] = [
  {
    id: 'search', title: 'Search (with Jester)',
    steps: [
      s('Before the fight: MSL PREP ON (about 2 min until the status windows turn white), Master Arm ON.', { hotas: 'MSL PREP switch; Master Arm switch' }),
      s('Weapon Selector to SP/PH; press it until PH shows.', { hotas: 'Weapon Selector UP / DOWN; Weapon Selector Press' }),
      s('Press A, pick Beyond Visual Range – Radar: set the TID range (e.g. 100 nm), the elevation band and the mode. TWS for Phoenix, RWS or PD SRCH for pure search.', { keys: 'A, LCtrl + 1 … 8', hotas: 'Toggle Menu' }),
      s('PD SRCH sees furthest but shows closure only: no range and no TID tracks.'),
    ],
  },
  {
    id: 'tws-multi', title: 'TWS: up to six Phoenix',
    steps: [
      s('Stay in TWS: ±20° 4-bar or ±40° 2-bar. Keep the targets inside it.'),
      s('The WCS numbers up to six targets 1–6 on the TID. A human RIO can force a target in, keep one out, or set NEXT LAUNCH.'),
      s('Fly the HUD/VDI steering to the centroid. Inside the launch zone, press and hold the trigger: about 3 s to missile away. The first shot forces TWS AUTO.', { hotas: TRIGGER_F14 }),
      s('Press again for the next target: one missile per press, up to six.', { hotas: TRIGGER_F14 }),
      s('TGTS NORM sets the go-active distance to 10 nm (SMALL 6, LARGE 13); the AIM-54C ignores the switch.', { note: 'RIO control.' }),
    ],
  },
  {
    id: 'stt-shot', title: 'STT shot (PD-STT Phoenix or AIM-7)',
    steps: [
      s('Ask Jester to lock the contact (PD-STT). He gets a lock warning.', { keys: 'A', hotas: 'Toggle Menu' }),
      s('A Phoenix from PD-STT is semi-active all the way and never goes active; he gets a launch warning at once. Hold the lock.', { hotas: TRIGGER_F14 }),
      s('AIM-7: needs PD-STT or P-STT; hold the lock to impact. If the lock drops the WCS goes to flood: keep him on the nose.'),
      s('P-STT, PH ACT or a target inside 10 nm: the Phoenix leaves the rail active, with no loft and short range. Fire and forget.'),
    ],
  },
  {
    id: 'support', title: 'Support the missile',
    steps: [
      s('Keep TWS targets inside the scan until their TTI numbers blink: the active command has gone (about 16 s to impact, ~10 nm with TGTS NORM).'),
      s('Only then crank hard or turn cold.'),
      s('Engaged tracks stay bright until TTI + 15 s; the breakaway X appears 15 s after the last TTI.'),
      s('PD-STT and AIM-7 shots: support to impact.'),
    ],
  },
  {
    id: 'defend', title: 'Defend: notch and chaff',
    steps: [
      s('ALR-67: the outer ring is critical. Slow warble = critical, fast warble = he is engaging you, four descending tones = a new threat that can shoot from TWS without a lock warning.'),
      s('Beam the threat within a few degrees, low with ground behind you, and chaff in the beam.', { hotas: 'DLC Toggle / Countermeasure Dispense', note: 'Classic F-14B default keyboard key not verified.' }),
      s('If you still have time, turn cold and drag.'),
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------
// JF-17 Thunder
// ---------------------------------------------------------------------------------------------------------

const JF_TDC_PRESS = 'TDC (T5) - PRESS';
const JF_S2_LEFT = 'Sensor Control (S2) - LEFT';
const JF_REL = 'Weapon Release (S3)';

const JF17_BINDS: KeyBind[] = [
  { action: 'Master mode A/A (INTC)', keys: 'Master Mode Switch (T1) - UP / FWD', note: 'Controls-menu wording not in research.' },
  { action: 'Radar on / off', keys: 'Radar MFCD OSB "STBY"', note: '"STBY" crossed out = radar on.' },
  { action: 'Radar as sensor of interest', keys: 'Sensor Selection (S1) - AFT', note: 'The radar MFCD gets the "*".' },
  { action: 'Mode RWS / TWS / VS; swap HPT and SPT; ASM / NAM', keys: JF_S2_LEFT },
  { action: 'Range up / down', keys: 'Sensor Control (S2) - FWD / AFT' },
  { action: 'Azimuth width', keys: 'Sensor Control (S2) - RIGHT' },
  { action: 'Unlock / MFCD refresh', keys: 'Sensor Control (S2) - PRESS' },
  { action: 'Cursor slew', keys: 'TDC (T5)', note: 'Keyboard default not in research.' },
  { action: 'Bug HPT (1st press) / STT (2nd press)', keys: JF_TDC_PRESS, note: 'Keyboard: Enter' },
  { action: 'Antenna elevation', keys: 'Antenna Elevation (T6)' },
  { action: 'ACM entry; then VT / BS / HA', keys: 'Sensor Selection (S1) - FWD; then S2 AFT / FWD / RIGHT' },
  { action: 'Missile type / missile step', keys: 'Missile Type Selection (S8) / Missile Step (S5)' },
  { action: 'Launch', keys: JF_REL, note: 'Keyboard: RAlt + Space' },
  { action: 'PL-5 uncage', keys: 'T2 - PRESS' },
  { action: 'IFF interrogate', keys: 'T4 - PRESS' },
  { action: 'Countermeasures', keys: 'T2 switch - AFT', note: 'Deka manual: pull T2 aft to dispense chaff/flares. English Controls-menu wording and default keyboard key not verified.' },
];

const JF17_PROCEDURES: Procedure[] = [
  {
    id: 'search', title: 'Search',
    steps: [
      s('Master mode INTC (TWS is the default), radar ON ("STBY" crossed out), radar MFCD as SOI ("*").', { hotas: 'Master Mode Switch (T1) - UP / FWD; Sensor Selection (S1) - AFT' }),
      s('Set range (e.g. 40 nm), azimuth, PRF (HI for long range) and bars.', { hotas: 'Sensor Control (S2) - FWD / AFT / RIGHT' }),
      s('Set antenna elevation so the TDC altitude numbers bracket the target.', { hotas: 'Antenna Elevation (T6)' }),
      s('RWS or VS (closure only, no range) help detection. Bugging a contact in RWS enters SAM.', { hotas: JF_S2_LEFT }),
    ],
  },
  {
    id: 'tws-multi', title: 'TWS: HPT and SPT, one SD-10 each',
    steps: [
      s('Build tracks in TWS (up to 10).'),
      s('TDC on a track and press once: HPT (circle). It is not a lock: he sees only your search radar.', { hotas: JF_TDC_PRESS, keys: 'Enter' }),
      s('TDC on a second track and press: SPT (DTT).', { hotas: JF_TDC_PRESS, keys: 'Enter' }),
      s('Select SD-10 and wait for "SD10 ON"; Master Arm on.', { hotas: 'Missile Type Selection (S8)' }),
      s('Target in the ASE circle with the steering dot centred; SHOOT shows inside the NEZ. Fire.', { hotas: JF_REL, keys: 'RAlt + Space' }),
      s('S2 LEFT swaps HPT and SPT. Re-steer and fire at the second target.', { hotas: JF_S2_LEFT }),
    ],
  },
  {
    id: 'stt-shot', title: 'STT shot',
    steps: [
      s('Press the TDC a second time on the HPT: STT. The other tracks drop and he gets a lock warning.', { hotas: JF_TDC_PRESS, keys: 'Enter' }),
      s('Fire inside the NEZ.', { hotas: JF_REL, keys: 'RAlt + Space' }),
      s('S2 press unlocks.', { hotas: 'Sensor Control (S2) - PRESS' }),
    ],
  },
  {
    id: 'support', title: 'Support the missile',
    steps: [
      s('Keep the track (stay inside the scan) until TOA reaches 0: pitbull.'),
      s('Crank to keep the target near the edge of your gimbal while you close more slowly.'),
      s('After TOA 0 you may turn cold.'),
      s('Maddog: with no lock the SD-10 takes the first target it sees within about 10 nm inside the dashed HUD circle.'),
    ],
  },
  {
    id: 'defend', title: 'Defend: notch and chaff',
    steps: [
      s('HSD RWR: a red symbol in the inner ring = lock; flashing = launch, with "MSL LCH" on the HUD. MAWS gives the missile bearing, reliably only inside about 5 km.'),
      s('Beam within a few degrees, descend, and chaff in the beam.', { hotas: 'T2 switch - AFT', note: 'English Controls-menu wording and default keyboard key not verified.' }),
      s('Then drag cold if you have the time.'),
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------
// M-2000C
// ---------------------------------------------------------------------------------------------------------

const M2K_BINDS: KeyBind[] = [
  { action: 'Radar emission', keys: 'Radar EM (emission) switch', note: 'Cockpit switch; the controls-menu name is not in research.' },
  { action: 'Preselect PIC (STT) / PID (single-target TWS)', keys: 'STT/TWS Toggle', note: 'No default key.' },
  { action: 'Cursor (alidade) slew', keys: 'TDC UP / DOWN / LEFT / RIGHT', note: 'Keyboard: ; . , /' },
  { action: 'Lock (PSIC)', keys: 'TDC DEPRESS (LOCK TARGET)', note: 'No default key.' },
  { action: 'Unlock', keys: 'Weapons System CMD Depressed', note: 'No default key.' },
  { action: 'Close combat vertical / horizontal; Pointé in PSIC Super 530', keys: 'Weapons System CMD FWD', note: 'No default key.' },
  { action: 'Close combat boresight', keys: 'Weapons System CMD AFT', note: 'No default key.' },
  { action: 'Antenna elevation', keys: 'Radar Antenna UP / DOWN / CENTER', note: 'No default key.' },
  { action: 'Range, azimuth, bars, PRF', keys: 'Radar control panel', note: 'Not in research: check the controls menu.' },
  { action: 'Weapon: Super 530 / Magic / gun', keys: 'CNM switch: PCA Select (centre) / MAGIC SELECT (right) / AA Gun SELECT (left)', note: 'Keyboard: C for the gun. PCA 530 button to select the 530.' },
  { action: 'Launch (hold at least 2 s for the 530)', keys: 'MiCRoB / Trigger 2nd Stage', note: 'Keyboard: Space' },
  { action: 'Countermeasure program / panic', keys: 'Decoy Program release / Decoy PANIC', note: 'Keyboard: Delete / Insert' },
  { action: 'Jammer', keys: 'Jammer toggle', note: 'Keyboard: E' },
  { action: 'IFF interrogate', keys: 'Nosewheel steering / IFF Interrogate', note: 'Keyboard: S' },
  { action: 'Magic slave to radar / Magic unlock', keys: 'Magic Slave / AG Designate / INS Position Update; NAV Update / Magic Unlock', note: 'No default key.' },
];

const M2K_PROCEDURES: Procedure[] = [
  {
    id: 'search', title: 'Search (RECH)',
    steps: [
      s('PPA panel: check the 530 "P" is steady (it blinks for about 30 s after power-up). Pick the side (G / I / R), TOT or PAR, AUT or manual.'),
      s('Master Arm ARME, PCA 530 button ("S" = selected, "P" = ready), radar EM, PRF HFR, bars and azimuth as needed.'),
      s('Search in RECH: "V" contacts are closing, "Λ" contacts opening. Use the alidade altitude numbers to set the antenna.', { hotas: 'Radar Antenna UP / DOWN / CENTER' }),
    ],
  },
  {
    id: 'stt-shot', title: 'PSIC shot (Super 530D)',
    steps: [
      s('Preselect PIC; the VTB shows PIC.', { hotas: 'STT/TWS Toggle' }),
      s('Alidade on the contact and depress: PSIC. Target box on the HUD, data block on the VTB. He gets a lock warning.', { hotas: 'TDC DEPRESS (LOCK TARGET)', keys: '; . , / to slew' }),
      s('IFF check.', { hotas: 'Nosewheel steering / IFF Interrogate', keys: 'S' }),
      s('Fly the director circle onto the box. A doubled circle = long limit; "TIR" = shoot.'),
      s('Hold the trigger at least 2 s: there is a deliberate delay. From PID the radar switches to PIC first.', { hotas: 'MiCRoB / Trigger 2nd Stage', keys: 'Space (hold ≥ 2 s)' }),
    ],
  },
  {
    id: 'support', title: 'Support the missile',
    steps: [
      s('The radar stays in PSIC Super 530 for 50 s. Keep him inside ±60° and do not let him notch you.'),
      s('If the lock drops, the radar tries to reacquire for 8 s, then keeps illuminating along the extrapolated path.'),
      s('Pointé illuminates by hand along the boresight.', { hotas: 'Weapons System CMD FWD' }),
      s('The 530D battery lasts about 45 s: past that, the shot is over.'),
      s('Unlock when done.', { hotas: 'Weapons System CMD Depressed' }),
    ],
  },
  {
    id: 'defend', title: 'Defend: notch and chaff',
    steps: [
      s('Serval: nearer the centre = more dangerous. D2M launch warnings show on the display.'),
      s('Beam the threat within a few degrees, descend, and dispense.', { hotas: 'Decoy Program release / Decoy PANIC', keys: 'Delete / Insert' }),
      s('The Sabre jammer can deny him range but invites home-on-jam.', { keys: 'E' }),
      s('If you still have time, drag cold.'),
    ],
  },
];

export const PROCEDURES: Record<AircraftId, AircraftProcedures> = {
  su27: { aircraft: 'su27', binds: ruBinds('su27'), procedures: ruProcedures('su27') },
  su33: { aircraft: 'su33', binds: ruBinds('su33'), procedures: ruProcedures('su33') },
  j11a: { aircraft: 'j11a', binds: ruBinds('j11a'), procedures: ruProcedures('j11a') },
  mig29s: { aircraft: 'mig29s', binds: ruBinds('mig29s'), procedures: ruProcedures('mig29s') },
  f15c: { aircraft: 'f15c', binds: F15C_BINDS, procedures: F15C_PROCEDURES },
  fa18c: { aircraft: 'fa18c', binds: FA18C_BINDS, procedures: FA18C_PROCEDURES },
  f16c: { aircraft: 'f16c', binds: F16C_BINDS, procedures: F16C_PROCEDURES },
  f14b: { aircraft: 'f14b', binds: F14B_BINDS, procedures: F14B_PROCEDURES },
  jf17: { aircraft: 'jf17', binds: JF17_BINDS, procedures: JF17_PROCEDURES },
  m2000c: { aircraft: 'm2000c', binds: M2K_BINDS, procedures: M2K_PROCEDURES },
};

/** A procedure by id for a jet, or undefined (e.g. 'tws-multi' on the Su-27). */
export function procedureFor(aircraft: AircraftId, id: string): Procedure | undefined {
  return PROCEDURES[aircraft].procedures.find(p => p.id === id);
}
