/** Original descriptions of the F-16C's pilot-facing controls, mapped to the ED guide.
 * Page numbers refer to the 16 August 2026 English PDF. No default keyboard bindings
 * are inferred from cockpit labels. Software pages and aircraft systems are not simulated.
 */
import type { CockpitControl, CockpitControlKind, CockpitPanel } from './types';

type Options = Partial<Pick<CockpitControl, 'positions' | 'dcsStatus' | 'notes'>>;
const sources = (page: number, section: string) => [{ page, section }];
function control(id: string, label: string, kind: CockpitControlKind, summary: string,
  operation: string, effect: string, page: number, options: Options = {}): CockpitControl {
  return { id, label, kind, summary, operation, effect, dcsStatus: 'documented', sources: sources(page, label), ...options };
}
const positions = (...items: readonly [string, string][]) => items.map(([label, effect]) => ({ label, effect }));
function indicator(id: string, label: string, summary: string, page: number, options: Options = {}): CockpitControl {
  return control(id, label, 'indicator', summary, 'Read the indication; this is not an operating switch.', summary, page, options);
}
function display(id: string, label: string, summary: string, page: number, notes?: string): CockpitControl {
  return control(id, label, 'display', summary, 'Read the display. Its controls are listed separately.', summary, page, notes ? { notes } : {});
}
const inactive = (notes: string): Options => ({ dcsStatus: 'not-implemented', notes });
const manualInactive = 'The cited guide marks this control as not implemented or unused in the modeled Block 50. This records the manual status, not a fresh DCS build test.';
function panel(id: string, label: string, summary: string, page: number, controls: readonly CockpitControl[], region: CockpitPanel['region'] = 'front'): CockpitPanel {
  return { id, label, region, summary, controls, sources: sources(page, label) };
}

const indexers = panel('front-hud-indexers', 'HUD and indexers', 'Head-up flight information, approach angle of attack, refueling and steering lights.', 44, [
  display('front-hud-display', 'Head-Up Display (HUD)', 'Places flight, navigation and selected-mode cues in the forward view.', 91,
    'The explorer identifies the physical display. It does not recreate every HUD page or tactical symbol.'),
  control('front-aoa-dimmer', 'AoA indexer dimming lever', 'lever', 'Sets the brightness of the approach angle-of-attack lights.', 'Move the lever downward to dim the lights.', 'Changes indexer brightness.', 44),
  indicator('front-aoa-high', 'AoA upper light', 'Shows that the approach angle of attack is above the on-speed band.', 44),
  indicator('front-aoa-onspeed', 'AoA center light', 'Shows the on-speed angle-of-attack band for approach.', 44),
  indicator('front-aoa-low', 'AoA lower light', 'Shows that the approach angle of attack is below the on-speed band.', 44),
  control('front-ar-dimmer', 'AR/NWS dimming lever', 'lever', 'Sets the brightness of the refueling and steering lights.', 'Move the lever downward to dim the lights.', 'Changes AR/NWS indicator brightness.', 45),
  indicator('front-ar-ready', 'RDY light', 'The refueling door is open and ready for contact.', 45),
  indicator('front-ar-nws', 'AR/NWS light', 'In flight, indicates a latched refueling boom. On the ground, indicates enabled nosewheel steering.', 45),
  indicator('front-ar-disconnect', 'DISC light', 'Signals a refueling disconnect before the system returns to ready.', 45),
]);
const leftEyebrow = panel('front-left-eyebrow', 'Left eyebrow', 'Caution acknowledgement, fault acknowledgement and identification.', 45, [
  control('front-master-caution', 'MASTER CAUTION', 'button', 'Alerts the pilot to a caution condition.', 'Press the illuminated pushbutton to acknowledge the alert.', 'Resets the master caution light; the underlying condition may remain.', 45),
  indicator('front-tf-fail', 'TF-FAIL light', 'Terrain-following failure annunciator, unused in this Block 50.', 45, inactive(manualInactive)),
  control('front-fack', 'F-ACK', 'button', 'Acknowledges a fault shown on the Pilot Fault List Display.', 'Press after reading the fault.', 'Acknowledges the PFLD message; whether it clears depends on the fault.', 45),
  control('front-iff-ident', 'IFF IDENT', 'button', 'Sends an identification response for non-Mode-4 interrogations.', 'Press when an identification response is needed in DCS.', 'Temporarily highlights the responding aircraft to the interrogator.', 45),
]);
const rightEyebrow = panel('front-right-eyebrow', 'Right eyebrow', 'Prominent warning annunciators.', 46, [
  control('front-eng-fire', 'ENG FIRE warning pushbutton', 'button', 'Warns of a detected engine-compartment fire.', 'Read the illuminated warning. The overview identifies a pushbutton but does not describe a separate press action.', 'The light signals the fire condition; no press effect is asserted here.', 46, { dcsStatus: 'uncertain', notes: 'Warning meaning is documented. Pushbutton behavior requires a DCS control audit.' }),
  indicator('front-engine-warning', 'ENGINE warning', 'Warns of an engine operating fault, such as a flameout or overtemperature.', 46),
  indicator('front-hyd-warning', 'HYD warning', 'Warns that hydraulic pressure is low.', 46),
  indicator('front-oil-warning', 'OIL PRESS warning', 'Warns that engine oil pressure is low.', 46),
  indicator('front-flcs-warning', 'FLCS warning', 'Warns of a flight-control system fault or failed test.', 46),
  indicator('front-dbu-warning', 'DBU ON warning', 'Shows that the flight-control system is using digital backup mode.', 46),
  indicator('front-config-warning', 'TO/LDG CONFIG warning', 'Warns of a landing configuration mismatch under the conditions described by the guide.', 46),
  indicator('front-canopy-warning', 'CANOPY warning', 'The canopy is not closed and locked.', 47),
  indicator('front-oxygen-warning', 'OXY LOW warning', 'Warns of low backup oxygen or an oxygen-system test/fault indication.', 47),
]);
const misc = panel('front-misc', 'MISC panel', 'Emission controls, arm controls and autopilot selectors.', 47, [
  control('front-rf', 'RF', 'switch', 'Selects the aircraft emission policy.', 'Select NORM, QUIET or SILENT.', 'Restricts sensor and communications transmissions according to the selected policy.', 47, { positions: positions(
    ['NORM', 'Allows normal transmissions.'], ['QUIET', 'Limits transmissions; some tracking and manually enabled functions remain available.'], ['SILENT', 'Applies further transmission restrictions, with documented exceptions.']), notes: 'QUIET and SILENT are not a universal power-off switch. The detailed exceptions are listed on manual page 48.' }),
  indicator('front-ecm-enable', 'ECM light', 'Lights while an installed, powered ECM pod is transmitting.', 47),
  control('front-laser-arm', 'LASER ARM', 'switch', 'Permits or inhibits the targeting pod laser in DCS.', 'Select LASER ARM or OFF.', 'Changes permission for pod laser operation; it does not itself command firing.', 47, { positions: positions(['LASER ARM', 'Permits laser operation when other conditions allow it.'], ['OFF', 'Inhibits laser operation.']) }),
  control('front-alt-rel', 'ALT REL', 'button', 'Provides an alternate cockpit command for weapon release.', 'Press the button as the alternate release control.', 'Duplicates the release command normally provided by the stick.', 47),
  control('front-master-arm', 'MASTER ARM', 'switch', 'Selects live, inhibited or simulated stores operation in DCS.', 'Choose MASTER ARM, OFF or SIMULATE.', 'Changes release permission and the availability of employment cues.', 47, { positions: positions(['MASTER ARM', 'Enables normal release permissions and cues.'], ['OFF', 'Inhibits normal release.'], ['SIMULATE', 'Shows employment cues but inhibits normal release.']), notes: 'The guide lists emergency jettison as available in all three positions.' }),
  control('front-adv-mode', 'ADV MODE', 'button', 'Unused terrain-following advanced-mode control.', 'Identify its location; no functional action is described for this variant.', 'No modeled Block 50 function is claimed.', 47, inactive(manualInactive)),
  control('front-ap-roll', 'Autopilot ROLL', 'switch', 'Selects the lateral mode used when the autopilot is engaged.', 'Set HDG SEL, ATT HOLD or STRG SEL.', 'Holds the selected heading, roll attitude or steerpoint course when PITCH enables the autopilot.', 131, { positions: positions(['HDG SEL', 'Uses the heading selected on the EHSI.'], ['ATT HOLD', 'Maintains the captured roll attitude.'], ['STRG SEL', 'Steers toward the selected steerpoint.']) }),
  control('front-ap-pitch', 'Autopilot PITCH', 'switch', 'Engages the autopilot and selects its vertical mode.', 'Set ALT HOLD, A/P OFF or ATT HOLD.', 'Enables altitude or pitch-attitude hold, or disengages the autopilot.', 131, { positions: positions(['ALT HOLD', 'Captures barometric altitude.'], ['A/P OFF', 'Disengages the autopilot.'], ['ATT HOLD', 'Captures pitch attitude.']) }),
]);
const flight = panel('front-flight-instruments', 'Flight instruments', 'Standby attitude, airspeed, altitude, angle of attack and vertical-speed instruments.', 49, [
  display('front-sai', 'Standby Attitude Indicator', 'Shows pitch and roll independently of the main attitude display; an OFF flag warns when caged or unpowered.', 49),
  control('front-sai-cage', 'PULL TO CAGE', 'rotary', 'Cages the standby attitude indicator and adjusts its aircraft reference.', 'Rotate to adjust the reference. Pull to cage; pull and turn counterclockwise to latch it caged.', 'Changes the reference alignment or holds the attitude sphere in its caged position.', 49, { positions: positions(['Rotate', 'Adjusts the aircraft reference in relation to the sphere.'], ['Pull', 'Cages the sphere and displays OFF.'], ['Pull and rotate counterclockwise', 'Locks the instrument in its caged position.']), notes: 'Caging alignment matters in DCS. This explorer explains the control without operating a gyro model.' }),
  display('front-airspeed', 'Airspeed/Mach indicator', 'Shows indicated airspeed and Mach, with a pilot-adjustable reference index.', 51),
  control('front-speed-index', 'SET INDEX', 'rotary', 'Moves the airspeed reference marker.', 'Rotate the knob.', 'Repositions the reference index without changing aircraft speed.', 51),
  display('front-altimeter', 'Altimeter', 'Shows barometric altitude and the selected pressure setting. PNEU indicates the pneumatic mode.', 51),
  control('front-altimeter-pressure', 'Altimeter barometric setting', 'rotary', 'Sets the pressure reference used by the altimeter.', 'Rotate while reading the pressure window.', 'Changes the indicated pressure setting and corresponding altitude indication.', 51),
  control('front-altimeter-mode', 'Altimeter mode', 'switch', 'Selects the electrical or pneumatic altimeter mode.', 'Momentarily hold the switch toward ELEC or PNEU.', 'Changes the instrument operating mode.', 51, { positions: positions(['ELEC', 'Selects the primary electrical mode.'], ['PNEU', 'Selects pneumatic operation.']) }),
  display('front-aoa-gauge', 'Angle-of-attack indicator', 'Shows angle of attack on a moving scale with colored approach reference regions.', 52),
  display('front-vvi', 'Vertical Velocity Indicator', 'Shows climb or descent rate.', 52),
  display('front-adi', 'Attitude Director Indicator', 'Shows pitch, roll, slip, turn rate and approach guidance. OFF and AUX flags signal unavailable or degraded attitude data.', 53),
  control('front-adi-trim', 'ADI pitch trim', 'rotary', 'Adjusts the attitude instrument reference.', 'Rotate the knob to reposition the attitude reference.', 'Changes the displayed reference; it does not trim the aircraft flight controls.', 54),
]);
const engine = panel('front-engine-instruments', 'Engine instruments', 'Readouts for engine operation and fuel consumption.', 50, [
  display('front-fuel-flow', 'FUEL FLOW', 'Shows the current engine fuel consumption in pounds per hour.', 50),
  display('front-oil-pressure', 'OIL pressure', 'Shows engine oil pressure.', 50),
  display('front-nozzle-position', 'NOZ POS', 'Shows engine nozzle position as a percentage.', 50),
  display('front-engine-rpm', 'RPM', 'Shows engine speed as a percentage.', 50),
  display('front-engine-ftit', 'FTIT', 'Shows the engine temperature indication used for operation checks in DCS.', 50),
]);
const fuel = panel('front-fuel-quantity-select', 'Fuel quantity selection', 'Selects fuel indications and external fuel transfer priority.', 54, [
  control('front-fuel-quantity', 'FUEL QTY SEL', 'rotary', 'Selects the tanks represented by the fuel quantity pointers.', 'Turn to the tank group or TEST position.', 'Changes which fuel group the analog pointers report.', 54, { positions: positions(
    ['TEST', 'Commands the documented fuel indication and low-fuel-light test.'], ['NORM', 'Shows forward and aft fuselage fuel groups.'], ['RSVR', 'Shows the forward and aft reservoir tanks.'], ['INT WING', 'Shows the internal wing tanks.'], ['EXT WING', 'Shows the external wing tanks.'], ['EXT CTR', 'Shows the external centerline tank on the FR pointer.']) }),
  control('front-external-fuel-transfer', 'EXT FUEL TRANS', 'switch', 'Sets the order used to transfer fuel from external tanks.', 'Select NORM or WING FIRST.', 'Changes whether the centerline or wing tanks transfer first.', 54, { positions: positions(['NORM', 'Centerline tank transfers before external wing tanks.'], ['WING FIRST', 'External wing tanks transfer before the centerline tank.']) }),
]);
const ehsi = panel('front-ehsi', 'Electronic HSI', 'Navigation direction, course and mode controls.', 230, [
  display('front-ehsi-display', 'EHSI display', 'Shows heading, bearing, distance, selected course and course deviation around the ownship symbol.', 230,
    'Range and CDI flags warn of missing navigation information. INU/ATT messages identify unavailable or degraded inertial data; see pages 232–233.'),
  control('front-ehsi-heading', 'Heading set', 'rotary', 'Sets the heading marker; has a heading adjustment function in INS ATT mode.', 'Rotate for the heading marker. Press and rotate in ATT mode to adjust the compass reference.', 'Moves the selected heading marker, or adjusts the degraded-mode heading reference.', 231, { positions: positions(['Rotate', 'Moves the heading marker used by autopilot HDG SEL.'], ['Press and rotate in ATT', 'Adjusts magnetic heading while ADJ HDG is displayed.']) }),
  control('front-ehsi-course', 'Course set / brightness', 'rotary', 'Sets the desired course and adjusts display brightness.', 'Rotate for course; press and rotate for brightness.', 'Moves the course pointer, or changes EHSI brightness while BRT is displayed.', 232, { positions: positions(['Rotate', 'Sets the selected course.'], ['Press and rotate', 'Adjusts the display brightness.']) }),
  control('front-ehsi-mode', 'Instrument mode selector', 'button', 'Cycles the EHSI navigation source and approach mode.', 'Press to advance through the mode sequence.', 'Selects steerpoint or TACAN navigation, with optional ILS localizer precedence.', 232, { positions: positions(['NAV', 'Steerpoint navigation.'], ['NAV/PLS', 'Steerpoint navigation with ILS localizer precedence when received.'], ['TCN', 'TACAN navigation.'], ['TCN/PLS', 'TACAN navigation with ILS localizer precedence when received.']) }),
]);
const threat = panel('front-threat-warning', 'Threat warning display and prime panel', 'Radar warning display controls and annunciators.', 694, [
  display('front-rwr-display', 'Threat Warning Azimuth Indicator', 'Shows the direction and type of detected radar threats; symbol distance reflects threat priority rather than physical range.', 694),
  control('front-rwr-brightness', 'RWR brightness', 'rotary', 'Adjusts the radar-warning display intensity.', 'Rotate the knob at the upper left of the display.', 'Brightens or dims the display.', 694),
  control('front-rwr-handoff', 'HANDOFF', 'button', 'Controls which threat receives the diamond and associated attention cues.', 'Tap to toggle floating/off. Hold to cycle threats, then release to latch the selection.', 'Changes the highlighted threat or removes the diamond.', 695, { positions: positions(['Short press', 'Toggles floating priority selection and off.'], ['Hold', 'Cycles the selected threat.'], ['Release after hold', 'Latches the selected threat.']) }),
  control('front-rwr-mode', 'MODE', 'button', 'Changes the number of threats shown on the warning display.', 'Press to toggle OPEN and PRIORITY.', 'Shows a broader threat set or a smaller priority set.', 695, { positions: positions(['OPEN', 'Displays up to 16 priority-ranked threats.'], ['PRIORITY', 'Displays the five highest-priority threats.']) }),
  control('front-rwr-launch', 'MISSILE LAUNCH', 'button', 'Flashes when a detected radar is in a missile-guidance state.', 'Read the warning. The cited section identifies a button but does not document a press function.', 'Provides a launch warning; no additional press effect is claimed.', 695, { dcsStatus: 'uncertain', notes: 'Indicator behavior is documented. A distinct clickable press action is not verified.' }),
  control('front-rwr-separate', 'TGT SEP', 'button', 'Temporarily separates overlapping threat symbols.', 'Press to spread the symbols.', 'Separates symbols for five seconds to make their labels easier to read.', 695),
  control('front-rwr-unknown', 'UNKNOWN', 'button', 'Includes or suppresses unidentified radar symbols.', 'Press to toggle UNKNOWN mode.', 'Shows unknown threats as U symbols when enabled; the button can flash to indicate hidden unknown signals.', 695),
  control('front-rwr-test', 'SYS TEST', 'button', 'Runs the warning-system display, light and audio test.', 'Hold for one second to start; press again to abort.', 'Temporarily presents test lights, symbols and tones before returning to normal indications.', 696),
]);

const icpKeys: readonly [string, string, string][] = [
  ['1', '1 / T-ILS', 'Opens the TACAN/ILS page from CNI, or enters 1 in a data field.'],
  ['2', '2 / ALOW', 'Opens the low-altitude warning settings from CNI, or enters 2.'],
  ['3', '3', 'Enters 3 or selects the option numbered 3 on the current page.'],
  ['4', '4 / STPT', 'Opens steerpoint data from CNI, or enters 4.'],
  ['5', '5 / CRUS', 'Opens cruise information from CNI, or enters 5.'],
  ['6', '6 / TIME', 'Opens the time page from CNI, or enters 6.'],
  ['7', '7 / MARK', 'Opens markpoint functions from CNI, or enters 7.'],
  ['8', '8 / FIX', 'Opens navigation-fix functions from CNI, or enters 8.'],
  ['9', '9 / A-CAL', 'Opens altitude-calibration functions from CNI, or enters 9.'],
  ['0', '0 / M-SEL', 'Enters zero or a negative value where applicable, or changes a selected setting or mode.'],
];
const icp = panel('front-icp', 'Integrated Control Panel', 'Individual keys, wheels and switches for upfront data entry and HUD adjustments.', 99, [
  ...([
    ['com1', 'COM 1', 'UHF radio'], ['com2', 'COM 2', 'VHF radio'], ['iff', 'IFF', 'IFF'], ['list', 'LIST', 'LIST menu'],
  ] as const).map(([id, label, destination]) => control(`front-icp-${id}`, label, 'button', `Selects the ${destination} DED page.`, 'Press to open; press the same override again to return to the previous page.', `Overrides the current DED page with the ${destination} page.`, 99,
    id === 'iff' ? { dcsStatus: 'uncertain', notes: 'The 2026 guide still marks the IFF DED page as not implemented on page 105. The physical button is documented; current-build page behavior needs verification.' } : {})),
  ...(['A-A', 'A-G'] as const).map(label => control(`front-icp-${label.toLowerCase()}`, label, 'button', `Selects the ${label === 'A-A' ? 'air-to-air' : 'air-to-ground'} master mode.`, 'Press to select; press the selected master-mode button again to return to NAV.', 'Changes the avionics master mode and its displayed cues.', 99)),
  control('front-icp-sym', 'SYM wheel', 'rotary', 'Sets HUD symbol brightness.', 'Roll the wheel up or down.', 'Brightens or dims the HUD symbols.', 99),
  control('front-icp-ret-depr', 'RET DEPR wheel', 'rotary', 'Moves the manual HUD reticle vertically.', 'Rotate while the manual reticle is displayed.', 'Adjusts the reticle depression setting shown in the HUD.', 99),
  ...icpKeys.map(([id, label, effect]) => control(`front-icp-key-${id}`, label, 'button', effect, 'Press with the relevant DED page or data field selected.', effect, id === '0' ? 100 : id === '3' ? 99 : 101,
    id === '3' ? { notes: 'No dedicated priority-page label is shown for key 3; do not confuse its menu-selection function with a fixed home-page shortcut.' } : {})),
  control('front-icp-rcl', 'RCL', 'button', 'Corrects or rejects an unfinished data entry.', 'Press once to remove the previous digit; press again to reject the new entry.', 'Restores the original data when the entry is rejected.', 99),
  control('front-icp-entr', 'ENTR', 'button', 'Accepts an edited DED data field.', 'Press after entering the intended data.', 'Commits the new value in the selected field.', 99),
  control('front-icp-brt', 'BRT wheel', 'rotary', 'Unused HUD raster-brightness control.', 'Identify the wheel; no active function is described for this variant.', 'No Block 50 raster-brightness action is claimed.', 100, inactive(manualInactive)),
  control('front-icp-cont', 'CONT wheel', 'rotary', 'Unused HUD raster-contrast control.', 'Identify the wheel; no active function is described for this variant.', 'No Block 50 raster-contrast action is claimed.', 100, inactive(manualInactive)),
  control('front-icp-increment', 'DED increment / decrement', 'switch', 'Steps the DED value marked by the increment/decrement symbol.', 'Press the rocker upward or downward.', 'Increases or decreases the selected value, such as a steerpoint or preset channel.', 100, { positions: positions(['Up', 'Steps the selected value upward.'], ['Down', 'Steps the selected value downward.']) }),
  control('front-icp-dobber', 'Data Control Switch (Dobber)', 'switch', 'Moves between DED fields, sequences pages and returns to CNI.', 'Move up/down to select fields, left to RTN or right to SEQ.', 'Changes the editing focus or DED page according to the active context.', 100, { positions: positions(['Up', 'Moves to the previous applicable field.'], ['Down', 'Moves to the next applicable field.'], ['RTN / left', 'Returns to CNI and discards an unaccepted entry.'], ['SEQ / right', 'Sequences the current page or its context-specific setting.']), notes: 'Direction effects can vary with the active DED page; CNI operation is shown on page 103.' }),
  control('front-icp-drift', 'DRIFT C/O / WARN RESET', 'switch', 'Cages HUD drift or acknowledges HUD warnings.', 'Select DRIFT C/O, NORM, or momentarily WARN RESET.', 'Changes HUD flight-path presentation or resets warnings and the maximum-G readout.', 100, { positions: positions(['DRIFT C/O', 'Horizontally cages the flight-path marker and attitude references.'], ['NORM', 'Allows the displayed flight path to drift with the actual path.'], ['WARN RESET', 'Acknowledges HUD/voice warnings and resets the maximum-G indication; spring-returns to NORM.']) }),
  control('front-icp-tfr-wx', 'TFR WX', 'button', 'Unused terrain-following/weather control.', 'Identify the button; no active action is described for this variant.', 'No functional effect is claimed.', 100, inactive(manualInactive)),
  control('front-icp-flir-rocker', 'FLIR increment / decrement', 'switch', 'Unused forward-looking infrared adjustment rocker.', 'Identify the up/down rocker.', 'No functional effect is claimed.', 100, { ...inactive(manualInactive), positions: positions(['Up', 'Unused in the cited Block 50 configuration.'], ['Down', 'Unused in the cited Block 50 configuration.']) }),
  control('front-icp-flir-mode', 'FLIR GAIN / LVL / AUTO', 'switch', 'Unused forward-looking infrared adjustment selector.', 'Identify its three labeled positions.', 'No functional effect is claimed.', 100, { ...inactive(manualInactive), positions: positions(['GAIN', 'Unused in this configuration.'], ['LVL', 'Unused in this configuration.'], ['AUTO', 'Unused in this configuration.']) }),
]);
const ded = panel('front-ded', 'Data Entry Display', 'Upfront control pages and editable data.', 101, [
  display('front-ded-display', 'DED', 'Shows radio, navigation and system information selected through the ICP. CNI is the usual home page.', 101,
    'Use the ICP controls to select and edit pages. This explorer describes the display and controls; it does not implement the complete DED page tree.'),
]);

function mfd(side: 'left' | 'right'): CockpitPanel {
  const prefix = `front-${side}-mfd`;
  return panel(prefix, `${side === 'left' ? 'Left' : 'Right'} MFD`, 'Twenty individually numbered option buttons, display and four adjustment rockers.', 122, [
    display(`${prefix}-display`, `${side === 'left' ? 'Left' : 'Right'} MFD screen`, 'Shows the chosen sensor or avionics format. Each button acts on the label beside it in the current format.', 122,
      'Software-page labels change with the selected format. This cockpit explorer does not treat one page layout as a universal button function.'),
    ...Array.from({ length: 20 }, (_, i) => {
      const n = i + 1;
      const edge = n <= 5 ? `top edge, position ${n} from the left` : n <= 10 ? `right edge, position ${n - 5} from the top` : n <= 15 ? `bottom edge, position ${n - 10} from the right` : `left edge, position ${n - 15} from the bottom`;
      return control(`${prefix}-osb-${n}`, `OSB ${n}`, 'button', `Selects the current on-screen option beside button ${n}.`, `Press the button on the ${edge}.`, 'Selects a page, changes a setting or performs the adjacent labeled command; the effect depends on the displayed format.', 122);
    }),
    ...([
      ['gain', 'GAIN', 'sensor-video intensity', 'Adjusts the sensor image independently of the symbols; the exact effect depends on the displayed sensor format.'],
      ['sym', 'SYM', 'symbol intensity', 'Changes symbol intensity independently of the sensor image.'],
      ['brt', 'BRT', 'overall brightness', 'Changes the overall display brightness.'],
      ['con', 'CON', 'overall contrast', 'Changes the overall display contrast.'],
    ] as const).map(([id, label, property, effect]) => control(`${prefix}-${id}`, label, 'switch', `Adjusts ${property} on this MFD.`, 'Press either end to adjust; hold for continuous adjustment.', effect, 123, { positions: positions(['Increase', `Increases ${property}.`], ['Decrease', `Decreases ${property}.`]) })),
  ]);
}
const hudControls = panel('front-hud-controls', 'HUD control panel', 'Right-console switches that tailor the head-up presentation.', 94, [
  control('front-hud-scales', 'SCALES', 'switch', 'Selects which flight-data scales appear.', 'Choose VV/VAH, VAH or OFF.', 'Adds or removes analog scales while retaining digital flight data.', 95, { positions: positions(['VV/VAH', 'Shows vertical velocity, velocity, altitude and heading scales.'], ['VAH', 'Shows velocity, altitude and heading scales.'], ['OFF', 'Removes the scales.']) }),
  control('front-hud-fpm', 'ATT/FPM', 'switch', 'Selects attitude and flight-path presentation.', 'Choose ATT/FPM, FPM or OFF.', 'Shows or hides attitude bars, the flight-path marker and steering cue.', 95, { positions: positions(['ATT/FPM', 'Shows attitude bars, flight-path marker and steering cue.'], ['FPM', 'Shows flight-path marker and steering cue without attitude bars.'], ['OFF', 'Removes those elements.']) }),
  control('front-hud-data', 'DED DATA / PFL / OFF', 'switch', 'Repeats upfront or fault-list text on the HUD.', 'Select DED DATA, PFL or OFF.', 'Shows the selected text repeater or returns to the normal roll indication.', 96, { positions: positions(['DED DATA', 'Repeats DED text on the HUD.'], ['PFL', 'Repeats the pilot fault list.'], ['OFF', 'Removes the text repeater.']) }),
  control('front-hud-reticle', 'DEPR RET', 'switch', 'Selects the manual reticle presentation.', 'Choose STBY, PRI or OFF.', 'Changes the manual reticle and which other HUD symbols remain visible.', 96, { positions: positions(['STBY', 'Shows the standby reticle and setting, removing other HUD elements.'], ['PRI', 'Adds the primary reticle while retaining the other HUD symbols.'], ['OFF', 'Removes the manual reticle and its setting.']) }),
  control('front-hud-velocity', 'Velocity', 'switch', 'Selects the HUD speed reference.', 'Choose CAS, TAS or GND SPD.', 'Changes the displayed speed reference; some DCS modes force calibrated airspeed.', 97, { positions: positions(['CAS', 'Displays calibrated airspeed.'], ['TAS', 'Displays true airspeed.'], ['GND SPD', 'Displays ground speed and ground track on the heading scale.']), notes: 'The overview labels the ground-speed position GND SPD; the explanatory text calls it GS.' }),
  control('front-hud-altitude', 'ALT', 'switch', 'Labeled altitude-reference selector.', 'Identify the RADAR, BARO and AUTO positions.', 'The cited manual marks this switch as not implemented; no working altitude-source change is asserted.', 97, { ...inactive(manualInactive), positions: positions(['RADAR', 'Labeled radar position; implementation not documented.'], ['BARO', 'Labeled barometric position; implementation not documented.'], ['AUTO', 'Labeled automatic position; implementation not documented.']), notes: `${manualInactive} Position labels are visible in the panel figure on page 94.` }),
  control('front-hud-brightness', 'DAY / AUTO BRT / NIGHT', 'switch', 'Selects the HUD brightness range.', 'Choose DAY, AUTO BRT or NIGHT.', 'Selects day or night intensity; automatic adjustment is marked unimplemented by the guide.', 97, { positions: positions(['DAY', 'Uses the day brightness range.'], ['AUTO BRT', 'Automatic adjustment is marked not implemented.'], ['NIGHT', 'Uses the night brightness range.']), notes: 'Only AUTO BRT is marked N/I in the cited description. The SYM wheel remains the separate intensity control.' }),
  control('front-hud-test', 'TEST', 'switch', 'Labeled HUD test selector.', 'Identify TEST/STEP, ON and OFF.', 'The manual marks the test switch as not implemented.', 97, { ...inactive(manualInactive), positions: positions(['TEST/STEP', 'Test position; no functional behavior asserted.'], ['ON', 'Labeled on position; no functional behavior asserted.'], ['OFF', 'Labeled off position; no functional behavior asserted.']), notes: `${manualInactive} Position labels are visible in the panel figure on page 94.` }),
], 'right');

export const F16_FRONT_PANELS: readonly CockpitPanel[] = [
  indexers, leftEyebrow, rightEyebrow, misc, flight, engine, fuel, ehsi, threat, icp, ded,
  mfd('left'), mfd('right'), hudControls,
];
