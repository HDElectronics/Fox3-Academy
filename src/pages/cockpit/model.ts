import type { CockpitDefinition, CockpitPanel, CockpitControl } from '../../data/cockpit';
export interface ControlMatch { panel: CockpitPanel; control: CockpitControl }
export function allControls(cockpit: CockpitDefinition): ControlMatch[] {
  return cockpit.panels.flatMap(panel => panel.controls.map(control => ({ panel, control })));
}
export function searchControls(cockpit: CockpitDefinition, query: string): ControlMatch[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return allControls(cockpit).filter(({ panel, control }) => {
    const text = [panel.label, panel.region, control.label, control.summary, control.operation, control.effect,
      control.binding?.command, control.binding?.keys, ...control.positions?.map(p => `${p.label} ${p.effect}`) ?? []].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}
export function findControl(cockpit: CockpitDefinition, id: string | null): ControlMatch | undefined {
  return id ? allControls(cockpit).find(match => match.control.id === id) : undefined;
}
export function sourceUrl(cockpit: CockpitDefinition, page: number): string {
  return cockpit.source.url.split('#')[0] + '#page=' + page;
}

/** OSB numbering follows the guide's clockwise bezel order, starting at the top left. */
export function mfdButtonPosition(number: number): { row: number; column: number } {
  if (!Number.isInteger(number) || number < 1 || number > 20) throw new RangeError('MFD button must be 1–20');
  if (number <= 5) return { row: 1, column: number + 1 };
  if (number <= 10) return { row: number - 4, column: 7 };
  if (number <= 15) return { row: 7, column: 17 - number };
  return { row: 22 - number, column: 1 };
}
