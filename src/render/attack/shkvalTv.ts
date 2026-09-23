/**
 * Shkval TV picture: a second camera at the jet looking along the Shkval line of sight with the zoom's field of
 * view, rendered into a small WebGLRenderTarget, read back and converted to a black-and-white image in a 2D canvas
 * (`image`), which the IT-23M display draws under its symbology. Cheap enough for phones: 320 × 240 by default,
 * one render every `every` frames. Symbology, the tactical layer (own jet, tags) and clouds are hidden for the pass.
 */
import { PerspectiveCamera, Vector3, WebGLRenderTarget, type Object3D } from 'three';
import type { Stage } from '../stage';
import { UNIT_PER_M, type XYZ } from '../units';

export interface ShkvalTvOptions {
  width?: number;
  height?: number;
  /** Render every n-th call (default 2). */
  every?: number;
  /** Objects hidden while the TV renders (see AttackScene.tvHidden). */
  hidden?: () => Object3D[];
}

/**
 * 256-entry lookup from linear render-target luma to the TV grey level: sRGB transfer, then a contrast stretch
 * (TV pictures read darker vehicles against lighter ground). Monotonic, 0..255.
 */
export function tvLut(contrast = 1.35, black = 0.1): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const l = i / 255;
    const s = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
    lut[i] = Math.round(Math.max(0, Math.min(1, (s - black) * contrast)) * 255);
  }
  return lut;
}

/** RGBA read-back (GL rows bottom-up) → greyscale RGBA image rows top-down. */
export function toGreyImage(src: ArrayLike<number>, w: number, h: number, lut: ArrayLike<number>, out: Uint8ClampedArray): void {
  for (let y = 0; y < h; y++) {
    const si = (h - 1 - y) * w * 4, di = y * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      const l = (src[si + x]! * 54 + src[si + x + 1]! * 183 + src[si + x + 2]! * 19) >> 8;
      const g = lut[l]!;
      out[di + x] = g; out[di + x + 1] = g; out[di + x + 2] = g; out[di + x + 3] = 255;
    }
  }
}

export class ShkvalTv {
  /** The latest black-and-white picture (width × height). */
  readonly image: HTMLCanvasElement;
  readonly camera: PerspectiveCamera;
  /** Increments on each new picture. */
  version = 0;
  private readonly rt: WebGLRenderTarget;
  private readonly buf: Uint8Array;
  private readonly img: ImageData;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly lut = tvLut();
  private readonly w: number;
  private readonly h: number;
  private readonly every: number;
  private n = 0;
  private readonly look = new Vector3();
  private readonly skyPos = new Vector3();

  constructor(private readonly stage: Stage, private readonly opts: ShkvalTvOptions = {}) {
    this.w = opts.width ?? 320;
    this.h = opts.height ?? 240;
    this.every = Math.max(1, opts.every ?? 2);
    this.rt = new WebGLRenderTarget(this.w, this.h, { depthBuffer: true });
    this.buf = new Uint8Array(this.w * this.h * 4);
    this.image = document.createElement('canvas');
    this.image.width = this.w; this.image.height = this.h;
    this.ctx = this.image.getContext('2d')!;
    this.img = this.ctx.createImageData(this.w, this.h);
    this.camera = new PerspectiveCamera(20, this.w / this.h, 0.02, 90);
  }

  /**
   * Render the picture from `pos` (sim metres) along the unit vector `dir`, vertical field of view `fovVDeg`.
   * Returns true when a new picture was made (every `every` calls, or always with `force`).
   */
  render(pos: XYZ, dir: XYZ, fovVDeg: number, force = false): boolean {
    if (!force && (this.n++ % this.every) !== 0) return false;
    const cam = this.camera;
    cam.fov = fovVDeg;
    cam.aspect = this.w / this.h;
    cam.updateProjectionMatrix();
    cam.position.set(pos.x * UNIT_PER_M, pos.y * UNIT_PER_M - 0.002, pos.z * UNIT_PER_M);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look.set(cam.position.x + dir.x, cam.position.y + dir.y, cam.position.z + dir.z));
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
    toGreyImage(this.buf, this.w, this.h, this.lut, this.img.data);
    this.ctx.putImageData(this.img, 0, 0);
    this.version++;
    return true;
  }

  dispose(): void {
    this.rt.dispose();
  }
}
