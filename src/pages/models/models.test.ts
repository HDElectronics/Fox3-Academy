import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import manifest from '../../assets/models/manifest.json';
import { AIRCRAFT_ORDER } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import { SAMS } from '../../data/sams';
import { assetUrl, bundledAssetIds, type AssetId } from '../../render/assetRegistry';
import { JET_DIMENSIONS } from '../../render/jets';
import {
  CATEGORIES, appFigures, buildCatalogue, categoryOf, deltaPercent, fmtBytes, fmtLength, gridLines, gridSpacing, hasFallback,
  parseState, referenceParts, stateQuery, stepItem, storesWithoutModel, type ManifestRecord,
} from './catalogue';
import { orbitBasis } from '../../render/cameras';
import { VIEW_ANGLES, frameBounds, pairLayout, placedBounds } from './framing';
import { CONSUMERS, consumersOf } from './usage';

const RECORDS = manifest as ManifestRecord[];
const cat = buildCatalogue(RECORDS, id => assetUrl(id as AssetId) !== undefined);
const ids = (c: string) => cat.groups.find(g => g.def.id === c)?.items.map(i => i.id) ?? [];

describe('catalogue from the manifest', () => {
  it('lists every manifest record once, each with its bundled file', () => {
    expect(cat.items).toHaveLength(RECORDS.length);
    expect(new Set(cat.items.map(i => i.id))).toEqual(new Set(bundledAssetIds()));
    expect(cat.items.every(i => i.hasFile)).toBe(true);
  });
  it('groups by what the app data says each id is, with no Other group today', () => {
    expect(cat.groups.map(g => g.def.id)).toEqual(['aircraft', 'aam', 'ag', 'ground', 'sam']);
    expect(ids('aircraft')).toEqual(AIRCRAFT_ORDER);
    expect(ids('aam')).toEqual([...Object.keys(MISSILES), 'r60']);
    for (const id of ['vikhr', 'kh25ml', 'kh29l', 'kh29t', 'kh58', 's8', 'gbu12', 'agm65', 'apkws', 'tgp', 'gbu38']) expect(ids('ag'), id).toContain(id);
    expect(ids('sam')).toEqual((Object.keys(SAMS)).flatMap(id => [id, `${id}-missile`]));
    // The generic SAM launcher is a ground unit kind, not one of the modelled SAM sites.
    expect(ids('ground')).toEqual(['tank', 'apc', 'truck', 'bunker', 'building', 'sam-site', 'aaa']);
  });
  it('names a manifest kind the data does not know as Other instead of hiding it', () => {
    expect(categoryOf({ id: 'ship', category: 'naval' })).toBe('other');
    const more = buildCatalogue([...RECORDS, { id: 'ship', category: 'naval', name: 'Ship', bytes: 1 }], () => false);
    expect(more.groups.at(-1)?.def.id).toBe('other');
    expect(more.byId.get('ship')?.hasFile).toBe(false);
    expect(CATEGORIES.map(c => c.id)).toContain('other');
  });
  it('records which registry ids share a file, and names the guns that have none', () => {
    expect(cat.byId.get('agm65')?.aliases).toEqual(['agm65d', 'agm65h', 'agm65l']);
    expect(cat.byId.get('gbu12')?.aliases).toEqual([]);
    expect(storesWithoutModel()).toHaveLength(2);
  });
});

describe('app figures beside the measured file', () => {
  it('gives JET_DIMENSIONS for jets and MISSILES for air-to-air missiles, nothing invented elsewhere', () => {
    expect(appFigures('su25t')).toEqual({ source: 'JET_DIMENSIONS', lengthM: JET_DIMENSIONS.su25t.length, spanM: JET_DIMENSIONS.su25t.span });
    expect(appFigures('aim120c')).toMatchObject({ source: 'MISSILES', lengthM: MISSILES.aim120c.lengthM, diameterM: MISSILES.aim120c.diameterM });
    for (const id of ['tank', 'sa10', 'sa10-missile', 'gbu12', 'r60', 'tgp']) expect(appFigures(id), id).toBeNull();
  });
  it('rounds the difference to a percent and stays quiet without a figure', () => {
    expect(deltaPercent(11.19, 12.3)).toBe(-9);
    expect(deltaPercent(15.3, 15.3)).toBe(0);
    expect(deltaPercent(4, undefined)).toBeNull();
    expect(deltaPercent(Number.NaN, 4)).toBeNull();
  });
  it('has a procedural fallback only where the app builds one', () => {
    expect(hasFallback('su25t')).toBe(true);
    expect(hasFallback('r27er')).toBe(true);
    expect(hasFallback('tank')).toBe(false);
    expect(hasFallback('r60')).toBe(false);
  });
});

describe('URL state', () => {
  it('defaults to the picked jet, then the first item, and drops what does not apply', () => {
    expect(parseState(new URLSearchParams(), cat, 'f15c')).toEqual({ id: 'f15c', compare: null, view: 'three-quarter', shade: 'paint', source: 'file' });
    expect(parseState(new URLSearchParams('id=nope'), cat, 'nope').id).toBe(cat.items[0]!.id);
    const s = parseState(new URLSearchParams('id=su25t&compare=su25t&view=sideways&shade=wire&src=fallback'), cat, 'f15c');
    expect(s).toEqual({ id: 'su25t', compare: null, view: 'three-quarter', shade: 'wire', source: 'fallback' });
    expect(parseState(new URLSearchParams('id=tank&src=fallback'), cat, 'f15c').source).toBe('file');
    expect(parseState(new URLSearchParams('id=su25t&compare=fa18c&view=side'), cat, 'f15c')).toMatchObject({ compare: 'fa18c', view: 'side' });
  });
  it('writes a canonical query that reads back the same state, defaults left out', () => {
    for (const q of ['id=su25t', 'id=su25t&compare=fa18c&view=top&shade=clay', 'id=aim54c&view=front&src=fallback']) {
      const s = parseState(new URLSearchParams(q), cat, 'f15c');
      expect(stateQuery(s)).toBe(q);
      expect(parseState(new URLSearchParams(stateQuery(s)), cat, 'f15c')).toEqual(s);
    }
  });
  it('steps through the whole catalogue and wraps', () => {
    const list = cat.items;
    expect(stepItem(list, list[0]!.id, -1)).toBe(list.at(-1)!.id);
    expect(stepItem(list, list.at(-1)!.id, 1)).toBe(list[0]!.id);
    expect(stepItem(list, 'm2000c', 1)).toBe('su25t');
    expect(stepItem(list, 'missing', 1)).toBe(list[0]!.id);
    expect(stepItem([], 'x', 1)).toBe('x');
  });
});

describe('formatting', () => {
  it('prints lengths in the selected units without thousands separators', () => {
    expect(fmtLength(15.3, 'metric')).toBe('15.30 m');
    expect(fmtLength(0.178, 'metric')).toBe('0.18 m');
    expect(fmtLength(15.3, 'imperial')).toBe('50.2 ft');
    expect(fmtLength(0.178, 'imperial')).toBe('7.0 in');
    expect(fmtBytes(363264)).toBe('355 KB');
    expect(fmtBytes(512)).toBe('512 B');
  });
  it('scales the grid to the model: 0.1 / 0.5 m under 5 m, 1 / 5 m for vehicles and jets', () => {
    expect(gridSpacing(3.66)).toEqual({ minor: 0.1, major: 0.5 });
    expect(gridSpacing(6.5)).toEqual({ minor: 1, major: 5 });
    expect(gridSpacing(21.9)).toEqual({ minor: 1, major: 5 });
  });
  it('places grid lines on whole steps from zero, major every fifth', () => {
    const g = gridLines(-10, 10, 1, 5);
    expect(g.major).toEqual([-10, -5, 0, 5, 10]);
    expect(g.minor).toHaveLength(16);
    const wall = gridLines(0, 1.5, 0.1, 0.5);
    expect(wall.major).toEqual([0, 0.5, 1, 1.5]);
    expect(wall.minor).toContain(0.3);
    expect(gridLines(0, -1, 1, 5)).toEqual({ minor: [], major: [] });
  });
  it('shortens references to host and path and keeps what they were used for', () => {
    expect(referenceParts('https://www.example.org/a/b/')).toEqual({ url: 'https://www.example.org/a/b/', label: 'example.org/a/b', note: '' });
    expect(referenceParts({ url: 'https://x.mil/f', use: 'outline' }).note).toBe('outline');
    expect(referenceParts('not a url').label).toBe('not a url');
  });
});

describe('placement and framing', () => {
  const jet = new Box3(new Vector3(-7.2, -0.73, -7.65), new Vector3(7.2, 3.4, 7.65));
  const other = new Box3(new Vector3(-5.6, -0.9, -8.65), new Vector3(5.6, 2.7, 8.65));
  it('rests models on the ground with the noses on one line, side by side or stacked', () => {
    const one = pairLayout(jet, null);
    expect(jet.clone().translate(one.a).min.y).toBeCloseTo(0, 6);
    expect(jet.clone().translate(one.a).min.z).toBeCloseTo(-7.65, 6); // centred on its own length
    expect(jet.clone().translate(one.a).getCenter(new Vector3()).x).toBeCloseTo(0, 6);
    const two = pairLayout(jet, other);
    const a = jet.clone().translate(two.a), b = other.clone().translate(two.b!);
    expect(a.min.z).toBeCloseTo(b.min.z, 6);
    expect(a.min.y).toBeCloseTo(0, 6);
    expect(b.min.y).toBeCloseTo(0, 6);
    expect(a.min.x).toBeGreaterThan(b.max.x); // a gap, no overlap
    const stacked = pairLayout(jet, other, true);
    const sb = other.clone().translate(stacked.b!), sa = jet.clone().translate(stacked.a);
    expect(sb.min.y).toBeGreaterThan(sa.max.y);
    expect(sb.min.z).toBeCloseTo(sa.min.z, 6);
  });
  it('fits every corner inside the view for each preset, a missile as tightly as a jet', () => {
    const missile = new Box3(new Vector3(-0.22, -0.22, -1.83), new Vector3(0.22, 0.22, 1.83));
    const vFov = 30, aspect = 1.5, pad = 1.25;
    const tanV = Math.tan((vFov * Math.PI) / 360), tanH = tanV * aspect;
    for (const box of [jet, missile, placedBounds([{ box: jet, offset: pairLayout(jet, other).a }, { box: other, offset: pairLayout(jet, other).b! }])]) {
      for (const view of Object.keys(VIEW_ANGLES) as (keyof typeof VIEW_ANGLES)[]) {
        const placed = placedBounds([{ box, offset: pairLayout(box, null).a }]);
        const f = frameBounds(placed, view, vFov, aspect, pad);
        const fwd = new Vector3(), right = new Vector3(), up = new Vector3();
        orbitBasis(VIEW_ANGLES[view].headingDeg, VIEW_ANGLES[view].elevationDeg, fwd, right, up);
        let fill = 0;
        for (let i = 0; i < 8; i++) {
          const c = new Vector3(i & 1 ? placed.max.x : placed.min.x, i & 2 ? placed.max.y : placed.min.y, i & 4 ? placed.max.z : placed.min.z).sub(f.position);
          const depth = c.dot(fwd);
          const x = Math.abs(c.dot(right)) / (depth * tanH), y = Math.abs(c.dot(up)) / (depth * tanV);
          expect(Math.max(x, y), view).toBeLessThanOrEqual(1 / pad + 1e-9);
          fill = Math.max(fill, x, y);
        }
        // Tight: the widest corner reaches the padded edge, whatever the model's size.
        expect(fill, view).toBeCloseTo(1 / pad, 3);
        expect(f.position.distanceTo(f.target)).toBeCloseTo(f.distance, 6);
      }
    }
  });
});

describe('where each file is drawn', () => {
  it('lists every AssetVisual consumer in the source tree', async () => {
    const root = new URL('../../../', import.meta.url);
    const found: string[] = [];
    const walk = async (dir: string) => {
      for (const e of await readdir(new URL(dir, root), { withFileTypes: true })) {
        const path = `${dir}/${e.name}`;
        if (e.isDirectory()) await walk(path);
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && (await readFile(new URL(path, root), 'utf8')).includes('new AssetVisual(')) found.push(path);
      }
    };
    await walk('src');
    expect(found.filter(f => f !== 'src/pages/models/viewer.ts').sort()).toEqual(CONSUMERS.map(c => c.file).sort());
  });
  it('flags the files no page draws', () => {
    const unused = cat.items.filter(i => consumersOf(i).length === 0).map(i => i.id);
    expect(unused.sort()).toEqual(['apkws', 'r60', 'tgp']);
    expect(consumersOf(cat.byId.get('su25t')!).map(c => c.file)).toEqual(['src/render/jets.ts']);
    expect(consumersOf(cat.byId.get('sa11')!).map(c => c.file)).toEqual(['src/render/samSites.ts', 'src/pages/harm/models.ts']);
  });
});
