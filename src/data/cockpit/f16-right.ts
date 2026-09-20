import type { CockpitControl, CockpitPanel, CockpitSourceRef } from './types';

const GUIDE_VERSION_NOTE = 'Status follows the Eagle Dynamics Early Access Guide updated 16 August 2026; later DCS versions may differ.';
const refs = (page: number, section: string): readonly CockpitSourceRef[] => [{ page, section }];

function caution(
  id: string,
  label: string,
  effect: string,
  page: 59 | 60,
  dcsStatus: CockpitControl['dcsStatus'] = 'documented',
): CockpitControl {
  return {
    id: `f16-right-aux-caution-${id}`,
    label,
    kind: 'indicator',
    summary: 'Caution-panel annunciator.',
    operation: 'Read the illuminated legend and check the related system or cockpit control.',
    effect,
    dcsStatus,
    notes: dcsStatus === 'not-implemented' ? GUIDE_VERSION_NOTE : undefined,
    sources: refs(page, 'Caution Light Panel'),
  };
}

const landingGearControls: readonly CockpitControl[] = [
  {
    id: 'f16-left-aux-emergency-stores-jettison', label: 'EMER STORES JETTISON', kind: 'button',
    summary: 'Starts the emergency external-stores jettison sequence.',
    operation: 'Hold for one second. On the ground, GND JETT ENABLE must also permit the release.',
    effect: 'Applies SMS power and jettisons eligible tanks, racks, and free-fall stores on stations 3–7; air-to-air missiles and their launchers remain.',
    dcsStatus: 'documented', sources: refs(56, 'Landing Gear Panel'),
  },
  {
    id: 'f16-left-aux-hook', label: 'HOOK', kind: 'switch',
    summary: 'Controls the emergency arresting hook.',
    operation: 'Select DN to drop and hold the hook down. Select UP after an arrestment to release holding pressure so the hook can pass over a wire.',
    effect: 'DN releases the hook from stowage; UP does not fully retract a deployed hook from the cockpit.',
    positions: [
      { label: 'UP', effect: 'Releases the pressure holding the hook down so it can rise over an arresting wire.' },
      { label: 'DN', effect: 'Drops the hook and applies pressure to hold it fully extended.' },
    ],
    dcsStatus: 'documented', sources: refs(56, 'Landing Gear Panel'),
  },
  ...([
    ['nose', 'Nose Gear Down Light', 'nose landing gear'],
    ['left-main', 'Left Main Gear Down Light', 'left main landing gear'],
    ['right-main', 'Right Main Gear Down Light', 'right main landing gear'],
  ] as const).map(([id, label, gear]): CockpitControl => ({
    id: `f16-left-aux-${id}-gear-down`, label, kind: 'indicator',
    summary: `Shows whether the ${gear} is down and locked.`,
    operation: 'Read the green light after commanding gear extension.',
    effect: `Green confirms the ${gear} is down and locked.`,
    dcsStatus: 'documented', sources: refs(56, 'Landing Gear Panel'),
  })),
  {
    id: 'f16-left-aux-landing-gear-handle', label: 'Landing Gear Handle', kind: 'lever',
    summary: 'Commands landing-gear retraction or extension.',
    operation: 'Move the handle up to retract or down to extend the landing gear.',
    effect: 'Commands the gear and doors toward the selected state.',
    positions: [
      { label: 'UP', effect: 'Commands landing-gear retraction.' },
      { label: 'DN', effect: 'Commands landing-gear extension.' },
    ],
    dcsStatus: 'documented', sources: refs(56, 'Landing Gear Panel'),
  },
  {
    id: 'f16-left-aux-landing-gear-handle-warning', label: 'Landing Gear Handle Warning Light', kind: 'indicator',
    summary: 'Warns that the landing gear is not safely in the commanded state.',
    operation: 'Check the light while the gear moves and after the command should be complete.',
    effect: 'Illuminates during gear or door travel, after a failure to lock as commanded, or with the TO/LDG CONFIG warning.',
    dcsStatus: 'documented', sources: refs(56, 'Landing Gear Panel'),
  },
  {
    id: 'f16-left-aux-ground-jettison-enable', label: 'GND JETT ENABLE', kind: 'switch',
    summary: 'Overrides ground and gear interlocks for release-system checks or emergency jettison.',
    operation: 'Leave OFF for normal operation; select ENABLE only when the ground release interlocks must be overridden.',
    effect: 'ENABLE permits arming and release conditions regardless of gear or weight-on-wheels state. OFF retains the normal inhibits.',
    positions: [
      { label: 'ENABLE', effect: 'Permits arming and release regardless of landing-gear or weight-on-wheels state.' },
      { label: 'OFF', effect: 'Keeps normal ground and gear-dependent jettison and weapons-release inhibits.' },
    ],
    dcsStatus: 'documented', sources: refs(56, 'Landing Gear Panel'),
  },
  {
    id: 'f16-left-aux-brakes-channel', label: 'BRAKES Channel', kind: 'switch',
    summary: 'Selects which brake channel responds to toe-brake input.',
    operation: 'Select CHAN 1 for normal use or CHAN 2 as the alternate channel.',
    effect: 'Routes toe-brake commands through the selected braking channel.',
    positions: [
      { label: 'CHAN 1', effect: 'Selects the normal brake channel.' },
      { label: 'CHAN 2', effect: 'Selects the alternate brake channel.' },
    ],
    dcsStatus: 'documented', sources: refs(56, 'Landing Gear Panel'),
  },
  {
    id: 'f16-left-aux-anti-skid-parking-brake', label: 'ANTI-SKID / PARKING BRAKE', kind: 'switch',
    summary: 'Selects anti-skid, parking-brake, or unassisted wheel-brake operation.',
    operation: 'Use ANTI-SKID for normal braking, PARKING BRAKE while stopped, or OFF to disable both functions.',
    effect: 'Changes how main-wheel brake pressure is controlled. Advancing the throttle beyond idle releases PARKING BRAKE.',
    positions: [
      { label: 'PARKING BRAKE', effect: 'Applies full main-wheel brake pressure on the ground while the throttle remains at OFF or IDLE.' },
      { label: 'ANTI-SKID', effect: 'Enables skid-control logic for powered toe-brake operation.' },
      { label: 'OFF', effect: 'Disables anti-skid and parking-brake functions.' },
    ],
    dcsStatus: 'documented', sources: refs(56, 'Landing Gear Panel'),
  },
  {
    id: 'f16-left-aux-down-lock-release', label: 'DN LOCK REL', kind: 'button',
    summary: 'Mechanically releases the landing-gear handle down lock.',
    operation: 'Press when the electrical handle lock cannot release or an intentional ground retraction command is required.',
    effect: 'Unlocks the LG handle mechanically and overrides the weight-on-wheels signal for a handle-up command.',
    dcsStatus: 'documented', sources: refs(56, 'Landing Gear Panel'),
  },
  {
    id: 'f16-left-aux-stores-config', label: 'STORES CONFIG', kind: 'switch',
    summary: 'Selects the flight-control limits appropriate to the carried stores.',
    operation: 'Select CAT I or CAT III to match the loadout shown by the mission and rearming screen.',
    effect: 'CAT III limits angle of attack and control onset for heavier or asymmetric configurations; a mismatch illuminates STORES CONFIG.',
    positions: [
      { label: 'CAT I', effect: 'Uses Category I limits for qualifying air-to-air configurations.' },
      { label: 'CAT III', effect: 'Uses the more restrictive limits required by air-to-ground, three-tank, specified AIM-120/tank, or asymmetric configurations.' },
    ],
    dcsStatus: 'documented', sources: refs(57, 'Landing Gear Panel'),
  },
  {
    id: 'f16-left-aux-horn-silencer', label: 'HORN SILENCER', kind: 'button',
    summary: 'Silences landing-gear or low-speed warning audio.',
    operation: 'Press after identifying the warning condition.',
    effect: 'Mutes the active landing-gear or low-speed warning tone.',
    dcsStatus: 'documented', sources: refs(57, 'Landing Gear Panel'),
  },
  {
    id: 'f16-left-aux-landing-taxi-lights', label: 'LANDING TAXI LIGHTS', kind: 'switch',
    summary: 'Selects the nose-gear landing or taxi lights.',
    operation: 'Choose LANDING, OFF, or TAXI. Raising the gear handle disables the lights.',
    effect: 'Energizes the selected nose-gear light assembly while the landing gear is down.',
    positions: [
      { label: 'LANDING', effect: 'Turns on the landing light.' },
      { label: 'OFF', effect: 'Turns off both landing and taxi lights.' },
      { label: 'TAXI', effect: 'Turns on the taxi light.' },
    ],
    dcsStatus: 'documented', sources: refs(57, 'Landing Gear Panel'),
  },
  {
    id: 'f16-left-aux-speed-brake-position', label: 'SPEED BRAKE Position', kind: 'indicator',
    summary: 'Shows whether the speed brakes are closed, open, or unpowered.',
    operation: 'Read the window after operating the speed-brake switch.',
    effect: 'CLOSED confirms full retraction; nine dots indicate any deployed angle; stripes indicate loss of power.',
    positions: [
      { label: 'CLOSED', effect: 'Speed brakes are fully retracted.' },
      { label: 'Nine dots', effect: 'Speed brakes are deployed at least partly.' },
      { label: 'Stripes', effect: 'The indicator has no electrical power.' },
    ],
    dcsStatus: 'documented', sources: refs(57, 'Landing Gear Panel'),
  },
];

const threatWarningAuxControls: readonly CockpitControl[] = [
  {
    id: 'f16-left-aux-rwr-search', label: 'SEARCH', kind: 'button',
    summary: 'Shows or suppresses non-lethal search and surveillance emitters on the RWR.',
    operation: 'Press to toggle Search mode.',
    effect: 'Enabled lights S and adds qualifying search emitters plus a centre S symbol; disabled hides those symbols while flashing S when such activity exists.',
    positions: [
      { label: 'Enabled', effect: 'Search-class emitters are shown and S is lit.' },
      { label: 'Disabled', effect: 'Search-class emitters are hidden; S flashes when the RWR detects one.' },
    ],
    dcsStatus: 'documented', sources: refs(696, 'Threat Warning Auxiliary Control Panel'),
  },
  {
    id: 'f16-left-aux-rwr-activity-power', label: 'ACT/PWR', kind: 'indicator',
    summary: 'Reports RWR power and higher-priority radar activity.',
    operation: 'Read the POWER and ACTIVITY legends.',
    effect: 'POWER lights while the ALR-56M is on; ACTIVITY lights for detected tracking or missile-guidance signals.',
    dcsStatus: 'documented',
    notes: 'The guide calls this assembly a button but documents only its annunciator behavior.',
    sources: refs(696, 'Threat Warning Auxiliary Control Panel'),
  },
  {
    id: 'f16-left-aux-rwr-altitude', label: 'ALTITUDE', kind: 'button',
    summary: 'Selects the high- or low-altitude RWR threat-priority table.',
    operation: 'Press to toggle between the two threat-table priorities.',
    effect: 'High mode prioritizes long-range/high-altitude systems; Low mode prioritizes short-range/low-altitude systems and adds an L centre cue.',
    positions: [
      { label: 'High altitude', effect: 'ALT is lit and the high-altitude threat table is used.' },
      { label: 'Low altitude', effect: 'ALT and LOW are lit and the low-altitude table is used.' },
    ],
    dcsStatus: 'documented', sources: refs(696, 'Threat Warning Auxiliary Control Panel'),
  },
  {
    id: 'f16-left-aux-rwr-power', label: 'SYSTEM POWER', kind: 'button',
    summary: 'Powers the ALR-56M radar warning receiver.',
    operation: 'Press to toggle RWR power.',
    effect: 'When powered, SYSTEM POWER and the ACT/PWR POWER legend illuminate and the RWR can display threats.',
    positions: [
      { label: 'On', effect: 'Powers the ALR-56M.' },
      { label: 'Off', effect: 'Removes power from the ALR-56M.' },
    ],
    dcsStatus: 'documented', sources: refs(696, 'Threat Warning Auxiliary Control Panel'),
  },
  {
    id: 'f16-left-aux-rwr-dim', label: 'RWR DIM', kind: 'rotary',
    summary: 'Sets Threat Warning panel light intensity.',
    operation: 'Rotate clockwise for brighter annunciators.',
    effect: 'Changes indicator-light brightness on both Threat Warning control panels.',
    dcsStatus: 'documented', sources: refs(696, 'Threat Warning Auxiliary Control Panel'),
  },
];

const cmdsControls: readonly CockpitControl[] = [
  ...([
    ['no-go', 'NO GO', 'Lights when CMDS is powered but a fault prevents dispensing.'],
    ['go', 'GO', 'Lights when CMDS is powered and ready to dispense.'],
    ['dispense-ready', 'DISPENSE RDY', 'Lights in SEMI when a threat-selected program awaits pilot consent.'],
  ] as const).map(([id, label, effect]): CockpitControl => ({
    id: `f16-left-aux-cmds-${id}`, label, kind: 'indicator',
    summary: 'CMDS status annunciator.', operation: 'Read the illuminated status before relying on countermeasures.', effect,
    dcsStatus: 'documented', sources: refs(697, 'CMDS Control Panel'),
  })),
  {
    id: 'f16-left-aux-cmds-quantity', label: 'CMDS Quantity Display', kind: 'display',
    summary: 'Shows remaining expendables and CMDS fault messages.',
    operation: 'Read each enabled countermeasure field; LO appears at or below its configured Bingo quantity.',
    effect: 'Displays inventory, LO warnings, and applicable system-failure messages.',
    dcsStatus: 'documented', sources: refs(698, 'CMDS Control Panel'),
  },
  {
    id: 'f16-left-aux-cmds-rwr', label: 'CMDS RWR', kind: 'switch',
    summary: 'Allows CMDS automatic logic to use ALR-56M threat indications.',
    operation: 'Set ON when SEMI or AUTO should select programs from RWR detections.',
    effect: 'Enables RWR-driven program selection in SEMI and AUTO modes.',
    positions: [
      { label: 'ON', effect: 'Feeds RWR threat indications to CMDS program-selection logic.' },
      { label: 'OFF', effect: 'Prevents CMDS from using RWR threats for program selection.' },
    ],
    dcsStatus: 'documented', sources: refs(698, 'CMDS Control Panel'),
  },
  ...([
    ['o1', 'O1', 'Other-1 expendables have no function in this F-16C.'],
    ['o2', 'O2', 'Other-2 expendables have no function in this F-16C.'],
  ] as const).map(([id, label, effect]): CockpitControl => ({
    id: `f16-left-aux-cmds-${id}`, label, kind: 'switch',
    summary: `Enables the ${label} expendable channel.`, operation: 'The switch is present but has no usable channel in this module.', effect,
    positions: [{ label: 'ON', effect: 'No function in the documented DCS F-16C.' }, { label: 'OFF', effect: 'Leaves the unused channel disabled.' }],
    dcsStatus: 'not-implemented', notes: GUIDE_VERSION_NOTE, sources: refs(698, 'CMDS Control Panel'),
  })),
  {
    id: 'f16-left-aux-cmds-chaff', label: 'CH', kind: 'switch',
    summary: 'Enables chaff dispensing and its inventory field.',
    operation: 'Set ON to make chaff available to CMDS.',
    effect: 'Allows chaff programs to dispense cartridges and shows chaff quantity above the switch.',
    positions: [{ label: 'ON', effect: 'Enables chaff.' }, { label: 'OFF', effect: 'Disables chaff dispensing.' }],
    dcsStatus: 'documented', sources: refs(698, 'CMDS Control Panel'),
  },
  {
    id: 'f16-left-aux-cmds-flare', label: 'FL', kind: 'switch',
    summary: 'Enables flare dispensing and its inventory field.',
    operation: 'Set ON to make flares available to CMDS.',
    effect: 'Allows flare programs to dispense cartridges and shows flare quantity above the switch.',
    positions: [{ label: 'ON', effect: 'Enables flares.' }, { label: 'OFF', effect: 'Disables flare dispensing.' }],
    dcsStatus: 'documented', sources: refs(698, 'CMDS Control Panel'),
  },
  ...([
    ['jmr', 'JMR'], ['mws', 'MWS'],
  ] as const).map(([id, label]): CockpitControl => ({
    id: `f16-left-aux-cmds-${id}`, label, kind: 'switch',
    summary: `${label} interface switch.`, operation: 'No usable operation is provided in the documented module.',
    effect: 'No function.', dcsStatus: 'not-implemented', notes: GUIDE_VERSION_NOTE,
    sources: refs(698, 'CMDS Control Panel'),
  })),
  {
    id: 'f16-left-aux-cmds-jettison', label: 'JETT', kind: 'switch',
    summary: 'Emergency-dispenses all onboard expendable countermeasures.',
    operation: 'Move the switch forward to command the jettison.',
    effect: 'Dispenses every expendable at once regardless of MODE knob position.',
    dcsStatus: 'documented', sources: refs(698, 'CMDS Control Panel'),
  },
  {
    id: 'f16-left-aux-cmds-program', label: 'PRGM', kind: 'rotary',
    summary: 'Chooses the manual CMDS program used by CMS Forward.',
    operation: 'Select program 1–4 before dispensing in MAN, SEMI, or AUTO.',
    effect: 'Changes which stored manual sequence CMS Forward commands.',
    positions: [
      { label: 'BIT', effect: 'Requests CMDS self-test; the 2026 guide marks this position N/I.' },
      { label: '1', effect: 'Selects Manual Program 1.' },
      { label: '2', effect: 'Selects Manual Program 2.' },
      { label: '3', effect: 'Selects Manual Program 3.' },
      { label: '4', effect: 'Selects Manual Program 4.' },
    ],
    dcsStatus: 'documented', notes: 'The program selections are documented; BIT is marked N/I in the 16 August 2026 guide.',
    sources: refs(698, 'CMDS Control Panel'),
  },
  {
    id: 'f16-left-aux-cmds-mode', label: 'MODE', kind: 'rotary',
    summary: 'Selects CMDS power and dispensing logic.',
    operation: 'Choose OFF, STBY, MAN, SEMI, AUTO, or BYP for the required level of pilot control and automation.',
    effect: 'Determines whether CMDS is powered and whether programs are manual, consented, automatic, or bypassed.',
    positions: [
      { label: 'OFF', effect: 'Powers CMDS off; only JETT remains available.' },
      { label: 'STBY', effect: 'Powers CMDS for setup but inhibits normal dispensing; JETT remains available.' },
      { label: 'MAN', effect: 'Allows manual programs selected by the pilot.' },
      { label: 'SEMI', effect: 'Selects a threat-matched automatic program but waits for pilot consent for each sequence.' },
      { label: 'AUTO', effect: 'With consent, repeatedly dispenses a threat-matched program while the qualifying threat remains.' },
      { label: 'BYP', effect: 'Provides degraded one-chaff/one-flare dispensing with CMS Forward.' },
    ],
    dcsStatus: 'documented', sources: [
      { page: 698, section: 'CMDS Control Panel' },
      { page: 699, section: 'CMDS Control Panel' },
    ],
  },
];

const rightAuxControls: readonly CockpitControl[] = [
  {
    id: 'f16-right-aux-magnetic-compass', label: 'Magnetic Compass', kind: 'indicator',
    summary: 'Standby magnetic-heading reference.',
    operation: 'Read it after primary power or navigation reliability is lost; use visual references because manoeuvring and magnetic variation reduce precision.',
    effect: 'Shows aircraft heading relative to magnetic north without relying on the main navigation system.',
    dcsStatus: 'documented', sources: refs(58, 'Magnetic Compass'),
  },
  {
    id: 'f16-right-aux-fuel-quantity', label: 'Fuel Quantity Indicator', kind: 'display',
    summary: 'Shows total fuel and the two tank-group quantities selected elsewhere.',
    operation: 'Read the digital pounds total and AL/FR needles; a red needle base warns of an imbalance.',
    effect: 'The totalizer shows all onboard fuel. The AL and FR needles show the groups selected by the FUEL QTY SEL knob.',
    dcsStatus: 'documented', sources: refs(58, 'Fuel Quantity Indicator'),
  },
  {
    id: 'f16-right-aux-pilot-fault-list', label: 'Pilot Fault List Display', kind: 'display',
    summary: 'Lists faults detected by the flight-control system and related aircraft systems.',
    operation: 'Read bracketed warning entries and unbracketed caution entries, then use F-ACK to acknowledge them.',
    effect: 'Shows fault mnemonics and accompanies the related caution light and MASTER CAUTION indication.',
    dcsStatus: 'documented', sources: refs(59, 'Pilot Fault List Display'),
  },
  caution('flcs-fault', 'FLCS FAULT', 'Lights for a dual FLCC electronics fault, locked leading-edge flaps, or failed FLCS BIT.', 59),
  caution('engine-fault', 'ENGINE FAULT', 'Lights for a detected engine fault and extinguishes when that fault is acknowledged.', 59),
  caution('avionics-fault', 'AVIONICS FAULT', 'Lights for an avionics fault or loss of MUX communication with the engine or FLCC.', 59),
  caution('seat-not-armed', 'SEAT NOT ARMED', 'Lights while the ejection-seat arming lever is in its upright, disarmed position.', 59),
  caution('elec-sys', 'ELEC SYS', 'Lights when an electrical fault also produces an indication on the ELEC control panel.', 59),
  caution('sec', 'SEC', 'Lights while the engine is operating in Secondary control mode.', 59),
  caution('equip-hot', 'EQUIP HOT', 'Warns of inadequate avionics cooling; the aircraft automatically interrupts FCR power.', 59),
  caution('nws-fail', 'NWS FAIL', 'Warns of a nose-wheel-steering failure.', 59),
  caution('probe-heat', 'PROBE HEAT', 'Warns of reduced probe airflow suggesting icing, or a probe-heater/monitoring fault.', 60),
  caution('fuel-oil-hot', 'FUEL/OIL HOT', 'Warns that engine fuel or oil temperature is excessive.', 60),
  caution('radar-alt', 'RADAR ALT', 'Warns that the radar altimeter has malfunctioned.', 60),
  caution('anti-skid', 'ANTI SKID', 'Lights when anti-skid is OFF or a braking-system fault is detected above 5 knots groundspeed.', 60),
  caution('cadc', 'CADC', 'Warns of a Central Air Data Computer malfunction.', 60),
  caution('inlet-icing', 'INLET ICING', 'Warns of detected inlet ice or an inlet ice-detector failure.', 60),
  caution('iff', 'IFF', 'Warns that a Mode 4 interrogation cannot be answered because replies are inhibited or Mode 4 data was zeroized.', 60),
  caution('hook', 'HOOK', 'Lights when the arresting hook is not up and locked in stowage.', 60),
  caution('stores-config', 'STORES CONFIG', 'Lights when the STORES CONFIG switch does not match the carried load.', 60),
  caution('overheat', 'OVERHEAT', 'Warns of an overheat in the engine bay, main-gear wheel wells, ECS bay, or EPU bay.', 60),
  caution('nuclear', 'NUCLEAR', 'The 2026 guide marks this annunciator not implemented.', 60, 'not-implemented'),
  caution('obogs', 'OBOGS', 'Warns when environmental-control-system air pressure is below 10 PSI.', 60),
  caution('atf-not-engaged', 'ATF NOT ENGAGED', 'The 2026 guide assigns this annunciator no function.', 60, 'not-implemented'),
  caution('eec', 'EEC', 'The 2026 guide assigns this annunciator no function.', 60, 'not-implemented'),
  caution('cabin-press', 'CABIN PRESS', 'Warns when cockpit pressure altitude exceeds 27000 feet.', 60),
  caution('fwd-fuel-low', 'FWD FUEL LOW', 'Warns when the forward reservoir contains less than 400 lb.', 60),
  caution('buc', 'BUC', 'The 2026 guide assigns this annunciator no function.', 60, 'not-implemented'),
  caution('aft-fuel-low', 'AFT FUEL LOW', 'Warns when the aft reservoir contains less than 250 lb.', 60),
  ...(['A', 'B'] as const).map((system): CockpitControl => ({
    id: `f16-right-aux-hydraulic-${system.toLowerCase()}`, label: `HYD PRESS ${system}`, kind: 'indicator',
    summary: `Shows hydraulic System ${system} pressure.`, operation: 'Read the gauge in 500 PSI increments.',
    effect: 'Displays 0–4000 PSI; the guide gives 2850–3250 PSI as normal.',
    dcsStatus: 'documented', sources: refs(61, 'Hydraulic Pressure Indicators'),
  })),
  {
    id: 'f16-right-aux-epu-fuel', label: 'EPU Fuel Quantity', kind: 'indicator',
    summary: 'Shows the remaining emergency-power-unit fuel as a percentage.',
    operation: 'Read the gauge in five-percent increments.',
    effect: 'Indicates the EPU fuel supply from 0 to 100 percent.',
    dcsStatus: 'documented', sources: refs(61, 'EPU Fuel Quantity Indicator'),
  },
  {
    id: 'f16-right-aux-cabin-pressure', label: 'Cabin Pressure', kind: 'indicator',
    summary: 'Shows cockpit pressure as an equivalent altitude.',
    operation: 'Read the pointer in thousands of feet.',
    effect: 'Displays cabin pressure altitude over a 0–50000-foot scale.',
    dcsStatus: 'documented', sources: refs(61, 'Cabin Pressure'),
  },
  ...([
    ['day', 'Day Hand', 'Completes one revolution in eight days.'],
    ['hour', 'Hour Hand', 'Shows hours on the inner 12-hour ring.'],
    ['minute', 'Minute Hand', 'Shows minutes on the outer 60-minute ring.'],
  ] as const).map(([id, label, effect]): CockpitControl => ({
    id: `f16-right-aux-clock-${id}`, label: `Clock ${label}`, kind: 'indicator',
    summary: 'Mechanical-clock time indication.', operation: 'Read the indicated time or elapsed days.', effect,
    dcsStatus: 'documented', sources: refs(61, 'Mechanical Clock'),
  })),
  {
    id: 'f16-right-aux-clock-knob', label: 'Clock Wind / Control Knob', kind: 'rotary',
    summary: 'Winds and sets the mechanical clock.',
    operation: 'Rotate clockwise to wind it; pull and rotate either direction to set the time.',
    effect: 'Changes the clock spring state or moves the displayed time. DCS initializes the clock to mission-local time.',
    dcsStatus: 'documented', sources: refs(61, 'Mechanical Clock'),
  },
];

const sensorPowerControls: readonly CockpitControl[] = [
  ...([
    ['left-hardpoint', 'LEFT HDPT', 'left chin-mounted sensor, normally the HARM Targeting System pod'],
    ['right-hardpoint', 'RIGHT HDPT', 'right chin-mounted sensor, normally the targeting pod'],
    ['fcr', 'FCR', 'AN/APG-68 fire-control radar'],
  ] as const).map(([id, label, system]): CockpitControl => ({
    id: `f16-right-sensor-power-${id}`, label, kind: 'switch', summary: `Controls power to the ${system}.`,
    operation: `Move from OFF to ${label} to power the system.`, effect: `Enables or removes power from the ${system}.`,
    positions: [{ label, effect: `Powers the ${system}.` }, { label: 'OFF', effect: `Removes power from the ${system}.` }],
    dcsStatus: 'documented', sources: refs(75, 'SNSR PWR Control Panel'),
  })),
  {
    id: 'f16-right-sensor-power-radar-altimeter', label: 'RDR ALT', kind: 'switch',
    summary: 'Controls radar-altimeter power and transmission.',
    operation: 'Select RDR ALT for operation, STBY for powered silence, or OFF.',
    effect: 'Determines whether the radar altimeter is off, warmed but not transmitting, or transmitting.',
    positions: [
      { label: 'RDR ALT', effect: 'Powers the radar altimeter and enables transmission.' },
      { label: 'STBY', effect: 'Keeps the radar altimeter powered without transmitting.' },
      { label: 'OFF', effect: 'Removes radar-altimeter power.' },
    ],
    dcsStatus: 'documented', sources: refs(75, 'SNSR PWR Control Panel'),
  },
];

const lightingControls: readonly CockpitControl[] = [
  ...([
    ['primary-consoles', 'PRIMARY – CONSOLES', 'panel backlighting on both side consoles and the left auxiliary console'],
    ['primary-instrument-panel', 'PRIMARY – INST PNL', 'panel backlighting on the instrument panel and right auxiliary console'],
    ['primary-data-entry-display', 'PRIMARY – DATA ENTRY DISPLAY', 'DED and PFLD brightness'],
    ['flood-consoles', 'FLOOD – CONSOLES', 'flood lighting on the side consoles and left auxiliary console'],
    ['flood-instrument-panel', 'FLOOD – INST PNL', 'flood lighting on the instrument panel and right auxiliary console'],
  ] as const).map(([id, label, effect]): CockpitControl => ({
    id: `f16-right-lighting-${id}`, label, kind: 'rotary', summary: `Sets ${effect}.`,
    operation: 'Rotate to the desired intensity.', effect: `Changes ${effect}.`,
    dcsStatus: 'documented', sources: refs(76, 'Interior LIGHTING Control Panel'),
  })),
  {
    id: 'f16-right-lighting-malfunction-indicator', label: 'MAL & IND LTS', kind: 'switch',
    summary: 'Selects bright or dim caution, indicator, and CMDS counter lighting.',
    operation: 'Select BRT or DIM; some flood/backlight and emergency-power conditions force BRT.',
    effect: 'Changes malfunction and indicator lights plus CMDS inventory counters between bright and dim.',
    positions: [{ label: 'BRT', effect: 'Uses bright annunciator and counter lighting.' }, { label: 'DIM', effect: 'Uses dim annunciator and counter lighting unless BRT is forced.' }],
    dcsStatus: 'documented', sources: refs(76, 'Interior LIGHTING Control Panel'),
  },
];

const rightConsoleControls: readonly CockpitControl[] = [
  ...sensorPowerControls,
  ...lightingControls,
  {
    id: 'f16-right-air-conditioning-temperature', label: 'TEMP', kind: 'rotary',
    summary: 'Cockpit-temperature control.', operation: 'No usable adjustment is provided in the documented module.',
    effect: 'The 2026 guide marks the control N/I.', dcsStatus: 'not-implemented', notes: GUIDE_VERSION_NOTE,
    sources: refs(76, 'AIR COND Control Panel'),
  },
  {
    id: 'f16-right-air-conditioning-source', label: 'AIR SOURCE', kind: 'rotary',
    summary: 'Selects ventilation and pressurization air source.',
    operation: 'Use NORM for automatic operation; select OFF, DUMP, or RAM for the corresponding abnormal configuration.',
    effect: 'Changes cockpit/avionics ventilation and pressure. OFF or RAM also prevents transfer from external fuel tanks.',
    positions: [
      { label: 'OFF', effect: 'Closes bleed-air valves and disables cooling and pressurization functions.' },
      { label: 'NORM', effect: 'Runs environmental control and pressurization automatically.' },
      { label: 'DUMP', effect: 'Dumps cabin pressure while conditioned bleed air ventilates cockpit and avionics.' },
      { label: 'RAM', effect: 'Dumps pressure, closes bleed-air valves, and uses ram air for ventilation.' },
    ],
    dcsStatus: 'documented', sources: refs(76, 'AIR COND Control Panel'),
  },
  {
    id: 'f16-right-ky58-panel', label: 'KY-58 Secure Voice Panel', kind: 'panel',
    summary: 'Panel-level placeholder for the unsupported secure-voice controls.',
    operation: 'Its individual selectors are not operable in the documented module.',
    effect: 'No secure-voice encryption function is implemented.',
    dcsStatus: 'not-implemented', notes: `Completeness gap: the guide marks the entire KY-58 system N/I and does not identify or describe its individual selectors, so they are not mapped as separate controls here. ${GUIDE_VERSION_NOTE}`,
    sources: refs(77, 'KY-58 Secure Voice Panel'),
  },
  {
    id: 'f16-right-plain-cipher', label: 'PLAIN / CIPHER', kind: 'switch',
    summary: 'Would select unencrypted or encrypted UHF/VHF voice.',
    operation: 'The switch is present but secure voice is not usable in the documented module.',
    effect: 'No implemented communications change.',
    positions: [{ label: 'PLAIN', effect: 'Would select unencrypted voice.' }, { label: 'CIPHER', effect: 'Would select encrypted voice.' }],
    dcsStatus: 'not-implemented', notes: GUIDE_VERSION_NOTE, sources: refs(77, 'PLAIN/CIPHER Switch'),
  },
  {
    id: 'f16-right-oxygen-flow', label: 'OXYGEN REGULATOR FLOW', kind: 'indicator',
    summary: 'Shows whether oxygen is flowing to the mask.',
    operation: 'Read the alternating white/black indication.',
    effect: 'White indicates flow; black indicates no flow.',
    positions: [{ label: 'White', effect: 'Oxygen is flowing.' }, { label: 'Black', effect: 'No oxygen flow is indicated.' }],
    dcsStatus: 'documented', sources: refs(77, 'OXYGEN Regulator Panel'),
  },
  {
    id: 'f16-right-oxygen-supply', label: 'OXYGEN SUPPLY', kind: 'indicator',
    summary: 'Shows oxygen-system pressure.', operation: 'Read the pressure indication.',
    effect: 'Displays oxygen pressure; the guide gives 10–55 PSI as normal.',
    dcsStatus: 'documented', sources: refs(77, 'OXYGEN Regulator Panel'),
  },
  {
    id: 'f16-right-oxygen-emergency', label: 'Oxygen EMERGENCY', kind: 'lever',
    summary: 'Positive-pressure oxygen mode selector.', operation: 'The lever positions are described but not implemented.',
    effect: 'No implemented oxygen-system change.',
    positions: [
      { label: 'EMERGENCY', effect: 'Would supply maximum oxygen under positive pressure.' },
      { label: 'NORMAL', effect: 'Would add positive pressure above 28000 feet cabin altitude.' },
      { label: 'TEST MASK', effect: 'Would supply maximum positive pressure for a mask leak test.' },
    ],
    dcsStatus: 'not-implemented', notes: GUIDE_VERSION_NOTE, sources: refs(77, 'OXYGEN Regulator Panel'),
  },
  {
    id: 'f16-right-oxygen-diluter', label: 'Oxygen Diluter', kind: 'lever',
    summary: 'Would select pure oxygen or an altitude-regulated air/oxygen mixture.',
    operation: 'The lever positions are described but not implemented.', effect: 'No implemented mixture change.',
    positions: [{ label: '100%', effect: 'Would supply the maximum oxygen concentration.' }, { label: 'NORM', effect: 'Would regulate the air/oxygen mixture with cabin altitude.' }],
    dcsStatus: 'not-implemented', notes: GUIDE_VERSION_NOTE, sources: refs(77, 'OXYGEN Regulator Panel'),
  },
  {
    id: 'f16-right-oxygen-supply-lever', label: 'Oxygen SUPPLY', kind: 'lever',
    summary: 'Selects oxygen supply and pressure-breathing mode.',
    operation: 'Select PBG, ON, or OFF.',
    effect: 'Controls mask oxygen supply and whether pressure breathing responds to high G.',
    positions: [
      { label: 'PBG', effect: 'Supplies the mask and enables pressure breathing above 4 G.' },
      { label: 'ON', effect: 'Supplies the mask without pressure breathing.' },
      { label: 'OFF', effect: 'Stops mask oxygen supply.' },
    ],
    dcsStatus: 'documented', sources: refs(77, 'OXYGEN Regulator Panel'),
  },
  {
    id: 'f16-right-engine-anti-ice', label: 'ENGINE ANTI-ICE', kind: 'switch',
    summary: 'Controls inlet anti-ice heating and ice detection.',
    operation: 'Use AUTO for detected-ice activation, ON for manual heating, or OFF to disable the system.',
    effect: 'Changes inlet heater activation and whether the inlet ice detector operates.',
    positions: [
      { label: 'ON', effect: 'Manually heats the inlet and strut while retaining ice-warning detection.' },
      { label: 'AUTO', effect: 'Automatically heats after detected ice and illuminates INLET ICING.' },
      { label: 'OFF', effect: 'Disables the detector and anti-ice heaters.' },
    ],
    dcsStatus: 'documented', sources: refs(78, 'ANTI ICE & ANT SEL Switches'),
  },
  ...([
    ['iff', 'ANT SEL – IFF', 'IFF replies', 'automatically chooses the antenna with the strongest received interrogation'],
    ['uhf', 'ANT SEL – UHF', 'UHF radio', 'cycles both antennas for broad transmission coverage'],
  ] as const).map(([id, label, system, normal]): CockpitControl => ({
    id: `f16-right-antenna-select-${id}`, label, kind: 'switch', summary: `Selects the upper, lower, or normal antenna mode for ${system}.`,
    operation: 'Select UPPER, NORM, or LOWER.', effect: `Routes ${system} through the selected antenna arrangement.`,
    positions: [
      { label: 'UPPER', effect: `Uses the upper antenna for ${system}.` },
      { label: 'NORM', effect: `The system ${normal}.` },
      { label: 'LOWER', effect: `Uses the lower antenna for ${system}.` },
    ],
    dcsStatus: 'documented', sources: refs(78, 'ANTI ICE & ANT SEL Switches'),
  })),
  ...([
    ['mmc', 'MMC', 'Modular Mission Computer', 'documented'],
    ['stores-stations', 'ST STA', 'underwing and centreline stores stations', 'documented'],
    ['mfd', 'MFD', 'both multifunction displays', 'documented'],
    ['ufc', 'UFC', 'ICP and DED upfront controls', 'documented'],
    ['map', 'MAP', 'Block 50 map system', 'not-implemented'],
    ['gps', 'GPS', 'GPS receiver', 'documented'],
    ['datalink', 'DL', 'Secure Modem Datalink', 'not-implemented'],
  ] as const).map(([id, label, system, status]): CockpitControl => ({
    id: `f16-right-avionics-power-${id}`, label, kind: 'switch', summary: `Controls power to the ${system}.`,
    operation: status === 'documented' ? `Set ON to power the ${system}; set OFF to remove power.` : 'The switch is present but the guide marks this function unavailable.',
    effect: status === 'documented' ? `Enables or disables the ${system}.` : 'No implemented function.',
    positions: [{ label: 'ON', effect: status === 'documented' ? `Powers the ${system}.` : 'No function in the documented module.' }, { label: 'OFF', effect: `Leaves the ${system} unpowered.` }],
    dcsStatus: status,
    notes: status === 'not-implemented' ? GUIDE_VERSION_NOTE : id === 'gps'
      ? 'The guide requires a mission date of 28 March 1994 or later and an eligible coalition for normal GPS precision, unless Unrestricted SATNAV mission/gameplay options override those limits.'
      : undefined,
    sources: refs(status === 'documented' && id === 'gps' ? 79 : 78, 'AVIONICS POWER Control Panel'),
  })),
  {
    id: 'f16-right-avionics-ins', label: 'INS', kind: 'rotary',
    summary: 'Selects inertial-navigation power, alignment, navigation, and degraded modes.',
    operation: 'Choose the alignment appropriate to the parked aircraft, then NAV after alignment; use the degraded modes only as required.',
    effect: 'Changes how the INS aligns and what navigation or attitude information it supplies.',
    positions: [
      { label: 'OFF', effect: 'Removes INS power.' },
      { label: 'ALIGN – STOR HDG', effect: 'Starts the faster stored-heading alignment using saved alignment data.' },
      { label: 'ALIGN – NORM', effect: 'Starts a normal gyrocompass alignment from entered position data.' },
      { label: 'NAV', effect: 'Selects normal navigation after successful alignment.' },
      { label: 'CAL', effect: 'No function in the documented module.' },
      { label: 'IN FLT ALIGN', effect: 'Starts in-flight alignment and initially supplies attitude mode.' },
      { label: 'ATT', effect: 'Supplies degraded pitch, roll, and heading only; TACAN remains available.' },
    ],
    dcsStatus: 'documented', notes: 'CAL is the only position marked as having no function in the 16 August 2026 guide.',
    sources: refs(79, 'AVIONICS POWER Control Panel'),
  },
  {
    id: 'f16-right-avionics-mids', label: 'MIDS LVT', kind: 'rotary',
    summary: 'Controls the MIDS datalink terminal.',
    operation: 'Select ON for datalink use, OFF to remove power, or ZERO only when stored data must be erased.',
    effect: 'Powers, disables, or zeroizes the MIDS terminal.',
    positions: [
      { label: 'ZERO', effect: 'Erases sensitive data in MIDS internal memory.' },
      { label: 'OFF', effect: 'Disables MIDS terminal power.' },
      { label: 'ON', effect: 'Powers the MIDS terminal.' },
    ],
    dcsStatus: 'documented', sources: refs(79, 'AVIONICS POWER Control Panel'),
  },
  {
    id: 'f16-right-voice-message', label: 'VOICE MESSAGE', kind: 'switch',
    summary: 'Silences aircraft voice messages.',
    operation: 'Select INHIBIT when a faulty voice message repeats continuously.',
    effect: 'INHIBIT mutes all aircraft voice messages.',
    dcsStatus: 'documented', sources: refs(80, 'VOICE MESSAGE Switch'),
  },
  {
    id: 'f16-right-zeroize', label: 'ZEROIZE', kind: 'switch',
    summary: 'Emergency erasure control for sensitive stored data.',
    operation: 'Operate only when the mission requires erasing protected data.',
    effect: 'Erases data such as secure-voice and GPS keys.',
    dcsStatus: 'documented', sources: refs(80, 'ZEROIZE Switch'),
  },
  {
    id: 'f16-right-seat-adjustment', label: 'SEAT ADJ', kind: 'switch',
    summary: 'Raises or lowers the pilot viewpoint and seat.',
    operation: 'Hold UP or DOWN; release to return the spring-loaded switch to OFF.',
    effect: 'Moves the seat for HUD eye alignment, comfort, or improved forward visibility during landing.',
    positions: [
      { label: 'UP', effect: 'Raises the seat while held.' },
      { label: 'OFF', effect: 'Stops seat movement.' },
      { label: 'DOWN', effect: 'Lowers the seat while held.' },
    ],
    dcsStatus: 'documented', sources: refs(80, 'SEAT ADJ Switch'),
  },
  {
    id: 'f16-right-nuclear-consent', label: 'NUCLEAR CONSENT', kind: 'switch',
    summary: 'Nuclear-consent selector.', operation: 'No usable operation is provided in the documented module.',
    effect: 'No function.', dcsStatus: 'not-implemented', notes: GUIDE_VERSION_NOTE,
    sources: refs(80, 'NUCLEAR CONSENT Switch'),
  },
  {
    id: 'f16-right-utility-light', label: 'Utility Light', kind: 'fixture',
    summary: 'Local cockpit light identified in the right-console overview.',
    operation: 'The assigned guide pages do not describe its switch or adjustment.',
    effect: 'Its exact interactive behavior is not established by the cited text.',
    dcsStatus: 'uncertain', notes: 'The guide labels the fixture on page 75 but provides no detailed entry on pages 75–81.',
    sources: refs(75, 'Right Console overview'),
  },
];

const seatControls: readonly CockpitControl[] = [
  {
    id: 'f16-seat-ejection-handle', label: 'Ejection Handle', kind: 'lever',
    summary: 'Physical emergency-ejection handle.',
    operation: 'The cockpit handle is not clickable in the documented DCS module; use the documented ejection command instead.',
    effect: 'The command initiates canopy jettison and pilot ejection.',
    binding: { command: 'Initiate ejection sequence', keys: 'LCtrl+E', verified: true },
    dcsStatus: 'not-implemented', notes: 'Only the clickable handle is N/I. The 16 August 2026 guide lists LCtrl+E but does not specify the repeated-input sequence; this is not a claim that one press completes ejection. Check the current DCS Controls command.',
    sources: refs(81, 'Ejection Handle'),
  },
  {
    id: 'f16-seat-arming-lever', label: 'Ejection Seat Arming Lever', kind: 'lever',
    summary: 'Arms or safes the ejection-seat mechanism.',
    operation: 'Rotate aft and down until flush to arm; raise it upright to disarm.',
    effect: 'Disarmed lights SEAT NOT ARMED. Armed extinguishes that caution and enables the seat mechanism.',
    positions: [
      { label: 'DISARMED (up)', effect: 'Safes the seat and illuminates SEAT NOT ARMED.' },
      { label: 'ARMED (aft/down)', effect: 'Arms the seat and extinguishes SEAT NOT ARMED.' },
    ],
    dcsStatus: 'documented', sources: refs(81, 'Ejection Seat Arming Lever'),
  },
  {
    id: 'f16-seat-emergency-manual-chute', label: 'EMERGENCY MANUAL CHUTE', kind: 'lever',
    summary: 'Would manually separate the pilot from the seat and deploy the parachute after ejection.',
    operation: 'The lever is present but not usable in the documented module.',
    effect: 'No implemented function.',
    dcsStatus: 'not-implemented', notes: GUIDE_VERSION_NOTE,
    sources: refs(82, 'Emergency Manual Chute Lever'),
  },
];

const rightControlsMatching = (...keys: readonly string[]): readonly CockpitControl[] =>
  rightConsoleControls.filter(control => keys.some(key => control.id === key || control.id.startsWith(`${key}-`)));

export const F16_RIGHT_PANELS: readonly CockpitPanel[] = [
  {
    id: 'f16-left-aux-landing-gear', label: 'Landing Gear Panel', region: 'front',
    summary: 'Left auxiliary controls for landing gear, hook, brakes, stores configuration, lighting, and emergency jettison.',
    controls: landingGearControls,
    sources: [
      { page: 55, section: 'Left Auxiliary Console overview' },
      { page: 56, section: 'Landing Gear Panel' },
      { page: 57, section: 'Landing Gear Panel' },
    ],
  },
  {
    id: 'f16-left-aux-hmcs', label: 'HMCS Control', region: 'front',
    summary: 'Helmet-mounted cueing symbology brightness control.',
    controls: [{
      id: 'f16-left-aux-hmcs-brightness', label: 'HMCS Brightness', kind: 'rotary',
      summary: 'Sets helmet-visor symbology brightness.', operation: 'Rotate clockwise to brighten; rotate to OFF to remove the symbology.',
      effect: 'Changes HMCS symbol intensity or turns the projected symbology off.',
      positions: [{ label: 'OFF', effect: 'Removes HMCS symbology from the visor.' }, { label: 'Clockwise', effect: 'Increases symbology brightness.' }],
      dcsStatus: 'documented', sources: refs(57, 'HMCS Control Panel'),
    }],
    sources: [{ page: 55, section: 'Left Auxiliary Console overview' }, { page: 57, section: 'HMCS Control Panel' }],
  },
  {
    id: 'f16-left-aux-alternate-gear', label: 'Alternate Gear', region: 'front',
    summary: 'Emergency landing-gear release.',
    controls: [{
      id: 'f16-left-aux-alternate-gear-handle', label: 'ALT GEAR', kind: 'lever',
      summary: 'Emergency-releases the landing gear.', operation: 'Pull when the normal gear handle cannot lower the gear because of hydraulic or control failure.',
      effect: 'Releases the landing gear through the alternate system.', dcsStatus: 'documented', sources: refs(57, 'ALT GEAR Handle'),
    }],
    sources: [{ page: 55, section: 'Left Auxiliary Console overview' }, { page: 57, section: 'ALT GEAR Handle' }],
  },
  {
    id: 'f16-left-aux-threat-warning', label: 'Threat Warning Auxiliary', region: 'front',
    summary: 'Left auxiliary ALR-56M power, display filtering, priority, and brightness controls.',
    controls: threatWarningAuxControls,
    sources: [{ page: 55, section: 'Left Auxiliary Console overview' }, { page: 696, section: 'Threat Warning Auxiliary Control Panel' }],
  },
  {
    id: 'f16-left-aux-cmds', label: 'CMDS Control Panel', region: 'front',
    summary: 'Left auxiliary countermeasure inventory, enable, program, and operating-mode controls.',
    controls: cmdsControls,
    sources: [
      { page: 55, section: 'Left Auxiliary Console overview' },
      { page: 697, section: 'CMDS Control Panel' },
      { page: 698, section: 'CMDS Control Panel' },
      { page: 699, section: 'CMDS Control Panel' },
    ],
  },
  {
    id: 'f16-right-aux-instruments', label: 'Right Auxiliary Instruments', region: 'front',
    summary: 'Standby heading, fuel, fault, caution, hydraulic, EPU, cabin-pressure, and clock indications.',
    controls: rightAuxControls,
    sources: [
      { page: 58, section: 'Right Auxiliary Console overview' },
      { page: 59, section: 'Pilot Fault List Display and Caution Light Panel' },
      { page: 60, section: 'Caution Light Panel' },
      { page: 61, section: 'Right Auxiliary gauges and Mechanical Clock' },
    ],
  },
  {
    id: 'f16-right-sensor-power', label: 'Sensor Power Panel', region: 'right',
    summary: 'Power controls for chin-mounted sensors, the fire-control radar, and radar altimeter.',
    controls: rightControlsMatching('f16-right-sensor-power'),
    sources: [{ page: 75, section: 'SNSR PWR Control Panel' }],
  },
  {
    id: 'f16-right-interior-lighting', label: 'Interior Lighting Panel', region: 'right',
    summary: 'Backlight, floodlight, and annunciator-intensity controls.',
    controls: rightControlsMatching('f16-right-lighting'),
    sources: [{ page: 76, section: 'Interior LIGHTING Control Panel' }],
  },
  {
    id: 'f16-right-air-conditioning', label: 'Air Conditioning Panel', region: 'right',
    summary: 'Cockpit environmental-control and pressurization selectors.',
    controls: rightControlsMatching('f16-right-air-conditioning'),
    sources: [{ page: 76, section: 'AIR COND Control Panel' }],
  },
  {
    id: 'f16-right-secure-voice', label: 'Secure Voice Controls', region: 'right',
    summary: 'KY-58 and plain/cipher controls, retained as explicitly unsupported cockpit equipment.',
    controls: rightControlsMatching('f16-right-ky58-panel', 'f16-right-plain-cipher'),
    sources: [{ page: 77, section: 'KY-58 Secure Voice Panel and PLAIN/CIPHER Switch' }],
  },
  {
    id: 'f16-right-oxygen-regulator', label: 'Oxygen Regulator Panel', region: 'right',
    summary: 'Oxygen flow and supply indications plus regulator mode levers.',
    controls: rightControlsMatching('f16-right-oxygen'),
    sources: [{ page: 77, section: 'OXYGEN Regulator Panel' }],
  },
  {
    id: 'f16-right-anti-ice-antenna', label: 'Anti-Ice and Antenna Select', region: 'right',
    summary: 'Engine anti-ice selection and upper/lower antenna routing for IFF and UHF.',
    controls: rightControlsMatching('f16-right-engine-anti-ice', 'f16-right-antenna-select'),
    sources: [{ page: 78, section: 'ANTI ICE & ANT SEL Switches' }],
  },
  {
    id: 'f16-right-avionics-power', label: 'Avionics Power Panel', region: 'right',
    summary: 'Power and operating-mode controls for mission avionics, navigation, and datalink equipment.',
    controls: rightControlsMatching('f16-right-avionics'),
    sources: [
      { page: 78, section: 'AVIONICS POWER Control Panel' },
      { page: 79, section: 'AVIONICS POWER Control Panel' },
    ],
  },
  {
    id: 'f16-right-voice-data', label: 'Voice Message and Zeroize', region: 'right',
    summary: 'Separate right-console switches for voice-message inhibition and emergency data erasure.',
    controls: rightControlsMatching('f16-right-voice-message', 'f16-right-zeroize'),
    sources: [{ page: 80, section: 'VOICE MESSAGE and ZEROIZE Switches' }],
  },
  {
    id: 'f16-right-seat-consent', label: 'Seat Adjustment and Consent', region: 'right',
    summary: 'Adjacent seat-height and unsupported nuclear-consent switches beside the pilot seat.',
    controls: rightControlsMatching('f16-right-seat-adjustment', 'f16-right-nuclear-consent'),
    sources: [{ page: 80, section: 'SEAT ADJ and NUCLEAR CONSENT Switches' }],
  },
  {
    id: 'f16-right-utility-light-panel', label: 'Utility Light', region: 'right',
    summary: 'Right-console local light, retained with an uncertainty caveat because the guide only labels it in the overview.',
    controls: rightControlsMatching('f16-right-utility-light'),
    sources: [{ page: 75, section: 'Right Console overview' }],
  },
  {
    id: 'f16-seat-controls', label: 'Ejection Seat Controls', region: 'seat',
    summary: 'Seat arming and emergency egress controls.',
    controls: seatControls,
    sources: [{ page: 81, section: 'Ejection Seat Controls' }, { page: 82, section: 'Emergency Manual Chute Lever' }],
  },
];
