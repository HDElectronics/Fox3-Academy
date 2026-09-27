/**
 * Forward view for see-through HUDs: a second camera at the pilot's eye looking along the HUD boresight, rendered
 * into a small WebGLRenderTarget, read back and copied in colour into a 2D canvas (`image`) that a HUD display draws
 * under its symbology. Same pipeline as the Shkval TV (attack/shkvalTv.ts), in colour.
 *
 * Each page gives the pose in the frame its HUD draws in (the Su-25T ИЛС: heading and pitch, no roll; the landing and
 * gun HUDs: with bank), the HUD's vertical field of view, and where the boresight sits on the HUD. The boresight is
 * placed with the camera's view offset, so it is exact at any bank and anywhere on the glass.
 */
import { PerspectiveCamera, Vector3, WebGLRenderTarget, type Object3D, type Quaternion } from 'three';
import type { Stage } from './stage';

export interface ForwardViewOptions {
  /** Picture size (default 192 × 192; give the HUD's aspect, e.g. 224 × 168 for a 4:3 HUD). Small is enough: the glass is tinted. */
  width?: number;
  height?: number;
  /** Render every n-th call (default 3). */
  every?: number;
  /** Near plane in scene units (default 0.02 = 20 m; landing HUDs need about 0.5 m, 0.0005). */
  near?: number;
  /** Objects hidden during the pass (symbology overlays, the own jet, clouds). */
  hidden?: () => Object3D[];
}

/** 256-entry sRGB transfer for one linear render-target channel. */
export function srgbLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const l = i / 255;
    lut[i] = Math.round((l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055) * 255);
  }
  return lut;
}

/** RGBA read-back (GL rows bottom-up) → sRGB RGBA image rows top-down. */
export function toColourImage(src: ArrayLike<number>, w: number, h: number, lut: ArrayLike<number>, out: Uint8ClampedArray): void {
  for (let y = 0; y < h; y++) {
    const si = (h - 1 - y) * w * 4, di = y * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      out[di + x] = lut[src[si + x]!]!; out[di + x + 1] = lut[src[si + x + 1]!]!; out[di + x + 2] = lut[src[si + x + 2]!]!;
      out[di + x + 3] = 255;
    }
  }
}

/** Vertical field of view (deg) of a picture `aspect` = width / height wide that spans `hFovDeg` horizontally. */
export function vFovDeg(hFovDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((hFovDeg * Math.PI) / 360) / aspect) * 180) / Math.PI;
}

/**
 * Point `cam` so its boresight (the camera axis) lands at (`boreX`, `boreY`) of the picture (0..1 from the top left):
 * a view offset of the full frame. Pure camera setup, for tests and for ForwardView.render.
 */
export function placeBoresight(cam: PerspectiveCamera, w: number, h: number, boreX: number, boreY: number): void {
  cam.setViewOffset(w, h, w * (0.5 - boreX), h * (0.5 - boreY), w, h);
}

export class ForwardView {
  /** The latest picture (width × height). */
  readonly image: HTMLCanvasElement;
  readonly camera: PerspectiveCamera;
  /** Increments on each new picture. */
  version = 0;
  private readonly rt: WebGLRenderTarget;
  private readonly buf: Uint8Array;
  private readonly img: ImageData;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly lut = srgbLut();
  private readonly w: number;
  private readonly h: number;
  private readonly every: number;
  private n = 0;
  private readonly skyPos = new Vector3();

  constructor(private readonly stage: Stage, private readonly opts: ForwardViewOptions = {}) {
    this.w = opts.width ?? 192;
    this.h = opts.height ?? 192;
    this.every = Math.max(1, opts.every ?? 3);
    this.rt = new WebGLRenderTarget(this.w, this.h, { depthBuffer: true });
    this.buf = new Uint8Array(this.w * this.h * 4);
    this.image = document.createElement('canvas');
    this.image.width = this.w; this.image.height = this.h;
    this.ctx = this.image.getContext('2d')!;
    this.img = this.ctx.createImageData(this.w, this.h);
    this.camera = new PerspectiveCamera(20, this.w / this.h, opts.near ?? 0.02, 90);
  }

  /**
   * Render from `position` (scene units) with orientation `quaternion` (the camera looks down its −z), vertical field
   * of view `fovVDeg`, boresight at (`boreX`, `boreY`) of the picture. Returns true on a new picture.
   */
  render(position: Vector3, quaternion: Quaternion, fovVDeg: number, boreX = 0.5, boreY = 0.5, force = false): boolean {
    if (!force && (this.n++ % this.every) !== 0) return false;
    const cam = this.camera;
    cam.aspect = this.w / this.h;
    cam.fov = fovVDeg;
    placeBoresight(cam, this.w, this.h, boreX, boreY);
    cam.updateProjectionMatrix();
    cam.position.copy(position);
    cam.quaternion.copy(quaternion);
    cam.updateMatrixWorld();

    const r = this.stage.renderer;
    const hidden = this.opts.hidden?.() ?? [];
    const was = hidden.map(o => o.visible);
    for (const o of hidden) o.visible = false;
    const sky = this.stage.env?.sky;
    if (sky) { this.skyPos.copy(sky.position); sky.position.copy(cam.position); sky.updateMatrixWorld(); }
    const prev = r.getRenderTarget();
    try {
      r.setRenderTarget(this.rt);
      r.clear();
      r.render(this.stage.scene, cam);
      r.readRenderTargetPixels(this.rt, 0, 0, this.w, this.h, this.buf);
    } finally {
      r.setRenderTarget(prev);
      hidden.forEach((o, i) => { o.visible = was[i]!; });
      if (sky) { sky.position.copy(this.skyPos); sky.updateMatrixWorld(); }
    }
    toColourImage(this.buf, this.w, this.h, this.lut, this.img.data);
    this.ctx.putImageData(this.img, 0, 0);
    this.version++;
    return true;
  }

  dispose(): void {
    this.rt.dispose();
  }
}
