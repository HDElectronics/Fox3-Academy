/**
 * Which render code draws an asset, read from the code (models.test.ts checks that every AssetVisual consumer in
 * src is listed here, so a new consumer cannot slip in unnoticed). Component level, not scenario level: which jets
 * a lesson spawns is the lesson's choice.
 */
import { AG_WEAPONS } from '../../data/agWeapons';
import type { AgWeaponId } from '../../data/types';
import { assetFileId, type AssetId } from '../../render/assetRegistry';
import { isAircraftId, isMissileId, type CatalogueItem } from './catalogue';

export interface Consumer {
  /** Source file that creates the AssetVisual (or the class that does). */
  file: string;
  /** What it is, as the facts panel prints it. */
  text: string;
  draws: (item: Pick<CatalogueItem, 'id' | 'category'>) => boolean;
}

const samMissile = (id: string) => id.endsWith('-missile');
/** A-G weapons that AgStoreVisual draws with their exterior (APKWS rockets keep procedural bodies; guns are tracers). */
const agStoreFiles = (): string[] => (Object.keys(AG_WEAPONS) as AgWeaponId[])
  .filter(id => AG_WEAPONS[id].kind !== 'gun' && id !== 'apkws').map(id => assetFileId(id as AssetId));

export const CONSUMERS: readonly Consumer[] = [
  { file: 'src/render/jets.ts', text: 'JetMesh: jets in the 3D world views, the Learn hero, Pattern & landing; scaled to the app length', draws: i => isAircraftId(i.id) },
  { file: 'src/render/missileVisual.ts', text: 'MissileVisual: missiles in flight in the 3D world views; scaled to the app length', draws: i => isMissileId(i.id) || samMissile(i.id) },
  { file: 'src/render/samSites.ts', text: 'SAM site vehicle in the 3D world views', draws: i => i.category === 'sam' && !samMissile(i.id) },
  { file: 'src/pages/harm/models.ts', text: 'HARM & SEAD battery gallery', draws: i => ['sa10', 'sa11', 'sa15'].includes(i.id) },
  { file: 'src/render/attack/groundUnits.ts', text: 'Ground units in the attack scenes (Shkval & Vikhr, CAS & JTAC, Targeting pod)', draws: i => i.category === 'ground' },
  { file: 'src/pages/atflir/range.ts', text: 'ATFLIR and JDAM target range', draws: i => i.id === 'truck' },
  { file: 'src/render/attack/attackScene.ts', text: 'AgStoreVisual: stores in flight in the attack scenes', draws: i => agStoreFiles().includes(i.id) },
  { file: 'src/render/attack/deliveryVisual.ts', text: 'Delivery view: the falling bomb on the ATFLIR and JDAM pages', draws: i => i.id === 'gbu12' || i.id === 'gbu38' },
];

/** The consumers that draw this item; empty means the file ships but no page draws it. */
export function consumersOf(item: Pick<CatalogueItem, 'id' | 'category'>): Consumer[] {
  return CONSUMERS.filter(c => c.draws(item));
}
