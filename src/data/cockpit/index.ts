import type { AircraftId } from '../types';
import { SOURCES, SOURCE_ID } from '../sources';
import type { CockpitPanel, CockpitRegion } from './types';
import { F16_FRONT_PANELS } from './f16-front';
import { F16_LEFT_PANELS } from './f16-left';
import { F16_RIGHT_PANELS } from './f16-right';
import { F16_PEDAL_PANELS } from './f16-pedals';
export type { CockpitPanel, CockpitControl, CockpitRegion } from './types';

export const COCKPIT_REGIONS: readonly { id: CockpitRegion; label: string }[] = [
  { id: 'front', label: 'Front panel' }, { id: 'left', label: 'Left console' },
  { id: 'right', label: 'Right console' }, { id: 'hotas', label: 'Stick / throttle' }, { id: 'seat', label: 'Seat & pedals' },
];
export interface CockpitDefinition {
  aircraft: AircraftId;
  name: string;
  source: { title: string; url: string };
  panels: readonly CockpitPanel[];
}
const source = SOURCES.find(s => s.id === SOURCE_ID.edViperGuide)!;
export const F16_COCKPIT: CockpitDefinition = {
  aircraft: 'f16c', name: 'F-16C Viper', source,
  panels: [...F16_FRONT_PANELS, ...F16_LEFT_PANELS, ...F16_RIGHT_PANELS, ...F16_PEDAL_PANELS],
};
export function cockpitFor(aircraft: AircraftId): CockpitDefinition | null {
  return aircraft === 'f16c' ? F16_COCKPIT : null;
}
export const COCKPIT_CAVEATS = [
  'Original 2D schematics group controls by cockpit region. Spacing, shapes and scale are teaching aids, not a traced cockpit or an exact geometric model.',
  'Descriptions follow the cited DCS guide. Manual statements about unavailable functions are not a current in-game verification.',
  'Selecting a control explains it; this explorer does not operate aircraft systems or simulate a startup.',
  'The KY-58 is represented as an unavailable panel overview: its individual selectors are not mapped. HOTAS mode-dependent effects are summaries, not an exhaustive avionics interaction matrix.',
  'The guide lists an ejection key chord but does not state its repeated-input sequence. That interaction still needs a current DCS Controls check.',
  'Keyboard defaults are shown only when explicitly verified. Otherwise use the module Controls menu; cockpit labels are not key bindings.',
  ...F16_COCKPIT.panels.flatMap(panel => panel.controls.filter(control => control.dcsStatus === 'uncertain')
    .map(control => `${panel.label} / ${control.label}: ${control.notes ?? control.effect}`)),
] as const;
