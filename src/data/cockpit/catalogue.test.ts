import { describe, expect, it } from 'vitest';
import { F16_FRONT_PANELS } from './f16-front';
import { F16_LEFT_PANELS } from './f16-left';
import { F16_RIGHT_PANELS } from './f16-right';
import { F16_PEDAL_PANELS } from './f16-pedals';
import { cockpitFor, F16_COCKPIT } from './index';
import type { CockpitPanel, CockpitSourceRef } from './types';

const panels = [...F16_FRONT_PANELS, ...F16_LEFT_PANELS, ...F16_RIGHT_PANELS, ...F16_PEDAL_PANELS];
const controls = panels.flatMap(panel => panel.controls);
function panel(id: string): CockpitPanel {
  const found = panels.find(candidate => candidate.id === id);
  expect(found, `Missing independently selectable panel: ${id}`).toBeDefined();
  return found!;
}
function checkSources(refs: readonly CockpitSourceRef[], id: string): void {
  expect(refs.length, `${id} must cite the guide`).toBeGreaterThan(0);
  for (const ref of refs) {
    expect(Number.isInteger(ref.page), `${id} has a non-integer PDF page`).toBe(true);
    expect(ref.page, `${id} PDF page`).toBeGreaterThanOrEqual(1);
    expect(ref.page, `${id} exceeds the 774-page guide`).toBeLessThanOrEqual(774);
  }
}

describe('F-16 cockpit catalogue integrity', () => {
  it('combines every regional inventory without colliding deep-link identifiers', () => {
    expect(F16_COCKPIT.panels).toEqual(panels);
    const ids = [...panels.map(p => p.id), ...controls.map(c => c.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('provides purpose, operation, effect and valid source pages for every item', () => {
    for (const p of panels) {
      expect(p.label.trim(), p.id).not.toBe('');
      expect(p.summary.trim(), p.id).not.toBe('');
      expect(p.controls.length, `${p.id} is empty`).toBeGreaterThan(0);
      checkSources(p.sources, p.id);
    }
    for (const c of controls) {
      for (const property of ['label', 'summary', 'operation', 'effect'] as const) {
        expect(c[property].trim(), `${c.id}.${property}`).not.toBe('');
      }
      checkSources(c.sources, c.id);
      expect(['documented', 'not-implemented', 'uncertain'], `${c.id} has no explicit verification status`).toContain(c.dcsStatus);
      if (c.positions) {
        expect(c.positions.length, `${c.id} empty position list`).toBeGreaterThan(0);
        expect(new Set(c.positions.map(p => p.label)).size, `${c.id} repeats a position`).toBe(c.positions.length);
        for (const position of c.positions) {
          expect(position.label.trim(), c.id).not.toBe('');
          expect(position.effect.trim(), `${c.id}: ${position.label}`).not.toBe('');
        }
      }
    }
  });

  it('never presents a keyboard default unless its binding is explicitly verified', () => {
    for (const c of controls) {
      if (!c.binding) continue;
      expect(c.binding.command.trim(), c.id).not.toBe('');
      if (c.binding.keys !== undefined) {
        expect(c.binding.keys.trim(), c.id).not.toBe('');
        expect(c.binding.verified, `${c.id} exposes an unverified keyboard default`).toBe(true);
      }
    }
  });

  it('covers every cockpit region and keeps essential controls in their physical region', () => {
    expect([...new Set(panels.map(p => p.region))].sort()).toEqual(['front', 'hotas', 'left', 'right', 'seat']);
    const essential: Record<string, CockpitPanel['region']> = {
      'front-icp': 'front', 'front-left-mfd': 'front', 'front-right-mfd': 'front',
      'front-flight-instruments': 'front', 'front-ehsi': 'front', 'front-misc': 'front',
      'front-fuel-quantity-select': 'front', 'front-threat-warning': 'front',
      'f16-left-aux-landing-gear': 'front', 'f16-left-aux-cmds': 'front',
      'f16-left-aux-threat-warning': 'front', 'f16-right-aux-instruments': 'front',
      'f16-left-electrical': 'left', 'f16-left-engine': 'left', 'f16-left-fuel': 'left',
      'f16-left-flight-control': 'left', 'f16-left-trim': 'left', 'f16-left-uhf': 'left',
      'f16-left-audio1': 'left', 'f16-left-audio2': 'left', 'f16-left-canopy': 'left',
      'front-hud-controls': 'right', 'f16-right-sensor-power': 'right',
      'f16-right-interior-lighting': 'right', 'f16-right-air-conditioning': 'right',
      'f16-right-oxygen-regulator': 'right', 'f16-right-avionics-power': 'right',
      'f16-hotas-stick': 'hotas', 'f16-hotas-throttle': 'hotas', 'f16-seat-controls': 'seat',
      'f16-floor-pedals': 'seat',
    };
    for (const [id, region] of Object.entries(essential)) expect(panel(id).region, id).toBe(region);
  });

  it.each(['left', 'right'] as const)('maps all 20 %s MFD buttons individually and in bezel order', side => {
    const mfd = panel(`front-${side}-mfd`);
    const osbs = mfd.controls.filter(c => /^OSB \d+$/.test(c.label));
    expect(osbs.map(c => c.label)).toEqual(Array.from({ length: 20 }, (_, i) => `OSB ${i + 1}`));
    for (let number = 1; number <= 20; number++) {
      const c = osbs.find(c => c.label === `OSB ${number}`)!;
      expect(c.id).toBe(`front-${side}-mfd-osb-${number}`);
      expect(c.kind).toBe('button');
      expect(c.sources.some(ref => ref.page === 122)).toBe(true);
      const location = number <= 5 ? `top edge, position ${number} from the left`
        : number <= 10 ? `right edge, position ${number - 5} from the top`
          : number <= 15 ? `bottom edge, position ${number - 10} from the right`
            : `left edge, position ${number - 15} from the bottom`;
      expect(c.operation).toContain(location);
    }
    for (const label of ['GAIN', 'SYM', 'BRT', 'CON']) {
      const rocker = mfd.controls.find(c => c.label === label);
      expect(rocker, `${side} MFD ${label}`).toBeDefined();
      expect(rocker!.positions?.map(p => p.label)).toEqual(['Increase', 'Decrease']);
    }
  });

  it('retains every ICP digit, override and multiway data-entry control', () => {
    const icp = panel('front-icp');
    for (let digit = 0; digit <= 9; digit++) {
      const key = icp.controls.find(c => c.id === `front-icp-key-${digit}`);
      expect(key, `ICP digit ${digit}`).toBeDefined();
      expect(key!.kind).toBe('button');
      expect(key!.label.split(' / ')[0]).toBe(String(digit));
    }
    for (const label of ['COM 1', 'COM 2', 'IFF', 'LIST', 'A-A', 'A-G', 'RCL', 'ENTR']) {
      expect(icp.controls.filter(c => c.label === label && c.kind === 'button'), label).toHaveLength(1);
    }
    expect(icp.controls.find(c => c.id === 'front-icp-dobber')?.positions?.map(p => p.label)).toEqual(['Up', 'Down', 'RTN / left', 'SEQ / right']);
    expect(icp.controls.find(c => c.id === 'front-icp-increment')?.positions?.map(p => p.label)).toEqual(['Up', 'Down']);
    for (const id of ['front-icp-brt', 'front-icp-cont', 'front-icp-tfr-wx', 'front-icp-flir-rocker', 'front-icp-flir-mode']) {
      expect(icp.controls.find(c => c.id === id)?.dcsStatus, id).toBe('not-implemented');
    }
  });

  it('keeps overlapping instrument roles distinct and does not duplicate the HUD switch panel', () => {
    const idsByPanel = (id: string) => panel(id).controls.map(c => c.id);
    expect(idsByPanel('front-fuel-quantity-select')).toContain('front-fuel-quantity');
    expect(idsByPanel('f16-right-aux-instruments')).toContain('f16-right-aux-fuel-quantity');
    expect(idsByPanel('front-threat-warning')).toContain('front-rwr-brightness');
    expect(idsByPanel('f16-left-aux-threat-warning')).toContain('f16-left-aux-rwr-dim');
    expect(panels.filter(p => p.controls.some(c => c.id === 'front-hud-scales'))).toHaveLength(1);
    expect(idsByPanel('front-hud-controls')).toEqual(expect.arrayContaining([
      'front-hud-scales', 'front-hud-fpm', 'front-hud-data', 'front-hud-reticle',
      'front-hud-velocity', 'front-hud-altitude', 'front-hud-brightness', 'front-hud-test',
    ]));
  });

  it('separates rudder steering from the two independent toe-brake axes', () => {
    const pedals = panel('f16-floor-pedals');
    for (const id of ['f16-floor-rudder-axis', 'f16-floor-left-toe-brake', 'f16-floor-right-toe-brake']) {
      const axis = pedals.controls.find(c => c.id === id);
      expect(axis, id).toBeDefined();
      expect(axis!.kind, id).toBe('axis');
      expect(axis!.dcsStatus, id).toBe('documented');
    }
    expect(pedals.controls.find(c => c.id === 'f16-floor-rudder-axis')?.positions?.map(p => p.label))
      .toEqual(['Left', 'Center', 'Right']);
    for (const side of ['left', 'right']) {
      const brake = pedals.controls.find(c => c.id === `f16-floor-${side}-toe-brake`)!;
      expect(brake.summary).toContain(`${side} main-wheel brake`);
      expect(brake.sources.some(ref => ref.page === 154)).toBe(true);
    }
  });

  it('does not substitute F-16 controls when another aircraft has no catalogue', () => {
    expect(cockpitFor('f16c')).toBe(F16_COCKPIT);
    expect(cockpitFor('fa18c')).toBeNull();
    expect(cockpitFor('su27')).toBeNull();
    expect(new URL(F16_COCKPIT.source.url).hostname).toBe('www.digitalcombatsimulator.com');
  });
});
