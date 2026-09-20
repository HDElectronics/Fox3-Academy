/** Pilot-facing foot controls, described from the official DCS F-16C guide.
 * These records explain gameplay inputs; they do not implement a flight or brake model.
 */
import type { CockpitPanel } from './types';

export const F16_PEDAL_PANELS: readonly CockpitPanel[] = [{
  id: 'f16-floor-pedals',
  label: 'Rudder pedals and toe brakes',
  region: 'seat',
  summary: 'Foot controls below the instrument panel: a linked yaw/steering input and two independent wheel-brake inputs.',
  sources: [
    { page: 25, section: 'Flight Control' },
    { page: 56, section: 'Landing Gear Panel — brakes' },
    { page: 142, section: 'Taxi — brakes and nosewheel steering' },
    { page: 154, section: 'Crosswind Landing — differential wheel braking' },
  ],
  controls: [
    {
      id: 'f16-floor-rudder-axis',
      label: 'Rudder pedal axis',
      kind: 'axis',
      summary: 'Commands yaw in flight and nosewheel steering on the ground when NWS is enabled.',
      operation: 'Push the left pedal forward for a left command or the right pedal forward for a right command. Return the linked pedals toward center to remove the directional input.',
      effect: 'Changes the aircraft yaw input; with ground steering engaged, it also commands the nosewheel direction.',
      positions: [
        { label: 'Left', effect: 'Commands left yaw or left nosewheel steering, according to the aircraft state.' },
        { label: 'Center', effect: 'Removes the pedal directional command.' },
        { label: 'Right', effect: 'Commands right yaw or right nosewheel steering, according to the aircraft state.' },
      ],
      dcsStatus: 'documented',
      notes: 'Nosewheel steering is enabled with the stick NWS/MSL STEP button; it is not enabled just by moving the pedals. The cited sections do not identify pedal reach-adjustment hardware or its DCS interaction, so no adjustment control is asserted here.',
      sources: [
        { page: 25, section: 'Flight Control — rudder pedals' },
        { page: 142, section: 'Taxi — NWS engagement' },
      ],
    },
    ...(['left', 'right'] as const).map(side => ({
      id: `f16-floor-${side}-toe-brake`,
      label: `${side === 'left' ? 'Left' : 'Right'} toe brake`,
      kind: 'axis' as const,
      summary: `Applies the ${side} main-wheel brake independently of the other toe brake.`,
      operation: `Press the toe portion of the ${side} pedal progressively; release it to remove that toe-brake command.`,
      effect: `Slows the aircraft through the ${side} wheel brake. Different left/right inputs provide the differential braking described for ground directional control.`,
      positions: [
        { label: 'Released', effect: 'No brake application is requested by this toe axis; the parking brake is a separate control.' },
        { label: 'Increasing pressure', effect: `Requests progressively more ${side} wheel braking, subject to the selected brake/anti-skid mode.` },
      ],
      dcsStatus: 'documented' as const,
      notes: 'The guide documents toe-brake operation and differential wheel braking. Exact Controls-menu axis names, hardware calibration and keyboard defaults are not asserted. BRAKES and ANTI-SKID/PARKING BRAKE selectors are on the landing-gear panel.',
      sources: [
        { page: 56, section: 'Landing Gear Panel — BRAKES and ANTI-SKID/PARKING BRAKE' },
        { page: 142, section: 'Taxi — toe brakes' },
        { page: 154, section: 'Crosswind Landing — differential wheel braking' },
      ],
    })),
  ],
}];
