/** Reviewed, original exterior assets. Vite embeds these in the single-file build. */
import type { AircraftId, AgWeaponId, GroundUnitKind, MissileId, SamId } from '../data/types';

export type AssetId = AircraftId | MissileId | Exclude<AgWeaponId, 'gun25t'>
  | GroundUnitKind | SamId | `${SamId}-missile` | 'r60' | 'agm65' | 'tgp';

const files = import.meta.glob<string>('../assets/models/*.glb', {
  eager: true,
  query: '?url',
  import: 'default',
});
const urls = new Map(Object.entries(files).map(([path, url]) => [
  path.slice(path.lastIndexOf('/') + 1, -4), url,
]));

/** An absent asset deliberately leaves its consumer's procedural fallback in place. */
/** Maverick D/H/L share one simplified exterior file. */
export function assetFileId(id: AssetId): AssetId {
  return id === 'agm65d' || id === 'agm65h' || id === 'agm65l' ? 'agm65' : id;
}
export function assetUrl(id: AssetId): string | undefined { return urls.get(assetFileId(id)); }
