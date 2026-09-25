/** Exterior-only missile replacement. The procedural mesh remains until the optional GLB is ready. */
import { Group, Vector3 } from 'three';
import type { MissileId } from '../data/types';
import { AssetVisual, type AssetId } from './assets';
import { createMissileMesh } from './jets';
import type { Palette } from './palette';

export class MissileVisual extends Group {
  private readonly exterior: AssetVisual;
  private disposed = false;

  constructor(fallbackId: MissileId, assetId: AssetId, palette: Palette, lengthM: number, onReady?: () => void) {
    super();
    this.name = 'missile:' + assetId;
    const fallback = createMissileMesh(fallbackId, palette);
    this.add(fallback);
    this.exterior = new AssetVisual(assetId, { onReady: visual => {
      const length = visual.bounds?.getSize(new Vector3()).z;
      if (!length || !Number.isFinite(length)) return;
      visual.scale.setScalar(lengthM / length);
      fallback.visible = false;
      onReady?.();
    } });
    this.exterior.setTint(palette.missile);
    this.add(this.exterior);
  }

  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.exterior.dispose();
    this.removeFromParent();
    super.dispose();
  }
}
