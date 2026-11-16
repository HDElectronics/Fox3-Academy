/**
 * Pure rules of the 3D models page: the catalogue (manifest records grouped by what the app's data says each id is),
 * the URL state, and the size / count formatting. No DOM, no three.js.
 */
import { AIRCRAFT, AIRCRAFT_ORDER } from '../../data/aircraft';
import { AG_WEAPONS } from '../../data/agWeapons';
import { MISSILES } from '../../data/missiles';
import { SAMS } from '../../data/sams';
import type { AgWeaponId, AircraftId, MissileId, SamId } from '../../data/types';
import type { Units } from '../../app/format';
import { assetFileId, type AssetId } from '../../render/assetRegistry';
import { JET_DIMENSIONS } from '../../render/jets';

// ------------------------------------------------------------------------------------------------ manifest

/** A reference in the manifest: a bare URL or a URL with what it was used for. */
export type ManifestReference = string | { url: string; use?: string; role?: string; accessed?: string };
/** The fields of `src/assets/models/manifest.json` this page reads. */
export interface ManifestRecord {
  id: string;
  category: string;
  name: string;
  bytes: number;
  references?: ManifestReference[];
  authorship?: string;
  source_caveats?: string[];
}

export type CategoryId = 'aircraft' | 'aam' | 'ag' | 'ground' | 'sam' | 'other';
export interface CategoryDef { id: CategoryId; label: string; short: string }
/** Catalogue order. 'other' shows only when the manifest gains a kind the app's data does not name. */
export const CATEGORIES: readonly CategoryDef[] = [
  { id: 'aircraft', label: 'Aircraft', short: 'Aircraft' },
  { id: 'aam', label: 'Air-to-air missiles', short: 'A-A' },
  { id: 'ag', label: 'Air-to-ground stores', short: 'A-G' },
  { id: 'ground', label: 'Ground units', short: 'Ground' },
  { id: 'sam', label: 'SAM systems', short: 'SAM' },
  { id: 'other', label: 'Other', short: 'Other' },
];

export interface CatalogueItem {
  id: string;
  name: string;
  category: CategoryId;
  record: ManifestRecord;
  /** A GLB is bundled for this id. */
  hasFile: boolean;
  /** Other registry ids drawn with this file (AGM-65D/H/L share agm65.glb). */
  aliases: string[];
}
export interface Catalogue {
  /** Non-empty categories in CATEGORIES order. */
  groups: { def: CategoryDef; items: CatalogueItem[] }[];
  /** Every item, in group order: what Left / Right step through. */
  items: CatalogueItem[];
  byId: ReadonlyMap<string, CatalogueItem>;
}

const isSam = (id: string): id is SamId => Object.hasOwn(SAMS, id);
/** A-G weapon ids that have a store body (the guns draw tracers), resolved to their file id. */
const agFileIds = (): string[] => (Object.keys(AG_WEAPONS) as AgWeaponId[])
  .filter(id => AG_WEAPONS[id].kind !== 'gun').map(id => assetFileId(id as AssetId));

/** What the app's data says a manifest record is. */
export function categoryOf(r: Pick<ManifestRecord, 'id' | 'category'>): CategoryId {
  if (r.category === 'aircraft') return 'aircraft';
  if (isSam(r.id) || (r.id.endsWith('-missile') && isSam(r.id.slice(0, -'-missile'.length)))) return 'sam';
  if (r.category === 'ground') return 'ground';
  if (r.category === 'store' || agFileIds().includes(r.id)) return 'ag';
  if (r.category === 'missile') return 'aam';
  return 'other';
}

/** Data-catalogue order inside each category: the picker's jets, MISSILES, AG_WEAPONS, each SAM then its missile. */
function rankOrder(): string[] {
  return [
    ...AIRCRAFT_ORDER,
    ...Object.keys(MISSILES),
    ...agFileIds(),
    ...(Object.keys(SAMS) as SamId[]).flatMap(id => [id, `${id}-missile`]),
  ];
}

/** Group the manifest. Unknown ids keep manifest order after the ids the data catalogues list. */
export function buildCatalogue(records: readonly ManifestRecord[], hasFile: (id: string) => boolean): Catalogue {
  const rank = new Map<string, number>();
  rankOrder().forEach((id, i) => { if (!rank.has(id)) rank.set(id, i); });
  const aliases = new Map<string, string[]>();
  for (const id of Object.keys(AG_WEAPONS) as AgWeaponId[]) {
    const file = assetFileId(id as AssetId);
    if (file !== id) aliases.set(file, [...(aliases.get(file) ?? []), id]);
  }
  const all = records.map((record, index) => ({
    index,
    item: {
      id: record.id, name: record.name, category: categoryOf(record), record,
      hasFile: hasFile(record.id), aliases: aliases.get(record.id) ?? [],
    } satisfies CatalogueItem,
  }));
  const key = (x: typeof all[number]) => rank.get(x.item.id) ?? 10_000 + x.index;
  const groups = CATEGORIES.map(def => ({
    def, items: all.filter(x => x.item.category === def.id).sort((a, b) => key(a) - key(b)).map(x => x.item),
  })).filter(g => g.items.length > 0);
  const items = groups.flatMap(g => g.items);
  return { groups, items, byId: new Map(items.map(i => [i.id, i])) };
}

/** A-G weapons with no model at all (guns: rounds draw as tracers). Named under the A-G list. */
export function storesWithoutModel(): string[] {
  return (Object.keys(AG_WEAPONS) as AgWeaponId[]).filter(id => AG_WEAPONS[id].kind === 'gun').map(id => AG_WEAPONS[id].name);
}

// ------------------------------------------------------------------------------------------------ app figures

export const isAircraftId = (id: string): id is AircraftId => Object.hasOwn(AIRCRAFT, id);
export const isMissileId = (id: string): id is MissileId => Object.hasOwn(MISSILES, id);

/** The app builds a procedural stand-in for jets (JetMesh) and air-to-air missiles (createMissileMesh). */
export function hasFallback(id: string): boolean { return isAircraftId(id) || isMissileId(id); }

/** Dimensions the app's own code or data gives for an id, to set beside the measured file. */
export interface AppFigures {
  /** Where the figures come from, as a short name for the facts panel. */
  source: string;
  lengthM: number;
  /** Span for jets. */
  spanM?: number;
  /** Body diameter for missiles (the file's box includes the fins). */
  diameterM?: number;
}
export function appFigures(id: string): AppFigures | null {
  if (isAircraftId(id)) return { source: 'JET_DIMENSIONS', lengthM: JET_DIMENSIONS[id].length, spanM: JET_DIMENSIONS[id].span };
  if (isMissileId(id)) return { source: 'MISSILES', lengthM: MISSILES[id].lengthM, diameterM: MISSILES[id].diameterM };
  return null;
}

/** Signed difference of a measured value from the app's figure, in percent (rounded); null when there is no figure. */
export function deltaPercent(measured: number, app: number | undefined): number | null {
  if (app === undefined || !(app > 0) || !Number.isFinite(measured)) return null;
  return Math.round(((measured - app) / app) * 100);
}

// ------------------------------------------------------------------------------------------------ URL state

export type ViewId = 'three-quarter' | 'side' | 'top' | 'front';
export const VIEWS: readonly { id: ViewId; label: string; keys: string }[] = [
  { id: 'three-quarter', label: '3/4', keys: '1' },
  { id: 'side', label: 'Side', keys: '2' },
  { id: 'top', label: 'Top', keys: '3' },
  { id: 'front', label: 'Front', keys: '4' },
];
export type Shade = 'paint' | 'clay' | 'wire';
export const SHADES: readonly Shade[] = ['paint', 'clay', 'wire'];
export type Source = 'file' | 'fallback';

export interface ViewerState {
  id: string;
  compare: string | null;
  view: ViewId;
  shade: Shade;
  source: Source;
}

const oneOf = <T extends string>(list: readonly T[], v: string | null, fallback: T): T => (v !== null && (list as readonly string[]).includes(v) ? v as T : fallback);

/**
 * Read the page's query. Unknown or missing ids fall back to `defaultId` (the jet picked in the top bar) or the first
 * item; a compare id equal to the selection or unknown is dropped; `src=fallback` only where the app has one.
 */
export function parseState(params: URLSearchParams, cat: Pick<Catalogue, 'byId' | 'items'>, defaultId: string): ViewerState {
  const want = params.get('id');
  const id = want && cat.byId.has(want) ? want : cat.byId.has(defaultId) ? defaultId : cat.items[0]?.id ?? defaultId;
  const c = params.get('compare');
  const compare = c && c !== id && cat.byId.has(c) ? c : null;
  const source: Source = params.get('src') === 'fallback' && hasFallback(id) ? 'fallback' : 'file';
  return {
    id, compare, source,
    view: oneOf(VIEWS.map(v => v.id), params.get('view'), 'three-quarter'),
    shade: oneOf(SHADES, params.get('shade'), 'paint'),
  };
}

/** The canonical query for a state: `id` always, the rest only when not the default. Other keys are not kept. */
export function stateQuery(s: ViewerState): string {
  const q = new URLSearchParams({ id: s.id });
  if (s.compare) q.set('compare', s.compare);
  if (s.view !== 'three-quarter') q.set('view', s.view);
  if (s.shade !== 'paint') q.set('shade', s.shade);
  if (s.source !== 'file') q.set('src', s.source);
  return q.toString();
}

/** The item `step` places away in catalogue order, wrapping. */
export function stepItem(items: readonly { id: string }[], id: string, step: number): string {
  if (!items.length) return id;
  const i = items.findIndex(x => x.id === id);
  const n = items.length;
  return items[(((i < 0 ? 0 : i + step) % n) + n) % n]!.id;
}

// ------------------------------------------------------------------------------------------------ formatting

const M_PER_FT = 0.3048;

/** A length in the selected units as [value, unit]: metres with two decimals (1 cm), or feet with one; under 3 ft in inches. */
export function lengthParts(m: number, units: Units): [string, string] {
  if (!Number.isFinite(m)) return ['—', ''];
  if (units === 'metric') return [m.toFixed(2), 'm'];
  const ft = m / M_PER_FT;
  return ft < 3 ? [(ft * 12).toFixed(1), 'in'] : [ft.toFixed(1), 'ft'];
}
export function fmtLength(m: number, units: Units): string {
  const [v, u] = lengthParts(m, units);
  return u ? `${v} ${u}` : v;
}

/** File size in KB (1024 bytes), no thousands separator (B612 Mono draws a comma as a full cell). */
export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

/** Grid spacing for the scale grid: 1 m minor and 5 m major lines, 0.1 m and 0.5 m for anything under 5 m. */
export function gridSpacing(maxDimM: number): { minor: number; major: number } {
  return maxDimM < 5 ? { minor: 0.1, major: 0.5 } : { minor: 1, major: 5 };
}

/**
 * Grid line positions from `from` to `to` on whole multiples of `minor` (counted from 0, so lines stay on metre marks),
 * split into minor lines and major lines (every `major`).
 */
export function gridLines(from: number, to: number, minor: number, major: number): { minor: number[]; major: number[] } {
  const out = { minor: [] as number[], major: [] as number[] };
  if (!(minor > 0) || !(to >= from)) return out;
  const every = Math.max(1, Math.round(major / minor));
  for (let k = Math.ceil(from / minor - 1e-6); k <= Math.floor(to / minor + 1e-6); k++) {
    const v = Math.round(k * minor * 1e6) / 1e6 + 0; // + 0: no -0
    (k % every === 0 ? out.major : out.minor).push(v);
  }
  return out;
}

/** Short reference text: the URL's host and path, and what it was used for when the manifest says. */
export function referenceParts(ref: ManifestReference): { url: string; label: string; note: string } {
  const url = typeof ref === 'string' ? ref : ref.url;
  let label = url;
  try { const u = new URL(url); label = u.host.replace(/^www\./, '') + decodeURIComponent(u.pathname).replace(/\/$/, ''); } catch { /* keep the raw text */ }
  const note = typeof ref === 'string' ? '' : ref.use ?? ref.role ?? '';
  return { url, label, note };
}
