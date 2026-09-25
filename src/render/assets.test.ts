import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Texture, Vector3 } from 'three';

const mock = vi.hoisted(() => ({ load: vi.fn(), url: vi.fn() }));
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class { loadAsync = mock.load; },
}));
vi.mock('./assetRegistry', () => ({ assetUrl: mock.url }));
import { AssetVisual } from './assets';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const scene = new Group();
  const geometry = new BoxGeometry(4, 2, 8);
  const texture = new Texture();
  const paint = new MeshStandardMaterial({ color: new Color(0.4, 0.5, 0.6), map: texture });
  paint.name = 'airframe paint';
  const canopy = new MeshStandardMaterial({ color: new Color(0.02, 0.08, 0.1) });
  canopy.name = 'canopy glass';
  const dark = new MeshStandardMaterial({ color: new Color(0.01, 0.01, 0.01) });
  dark.name = 'nozzle titanium';
  const nav = new MeshStandardMaterial({ color: new Color(0.8, 0.01, 0.01) });
  nav.name = 'port navigation lens';
  const body = new Mesh(geometry, [paint, canopy, dark, nav]);
  body.name = 'body';
  scene.add(body);
  const pivot = new Group();
  pivot.name = 'wing_swing_port';
  pivot.add(new Mesh(geometry, paint));
  scene.add(pivot);
  return { scene, geometry, texture, paint, canopy, dark, nav };
}
const visuals: AssetVisual[] = [];
function visual(options?: ConstructorParameters<typeof AssetVisual>[1]): AssetVisual {
  const v = new AssetVisual('fa18c', options);
  visuals.push(v);
  return v;
}
async function flush(): Promise<void> { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function body(v: AssetVisual): Mesh { return v.content!.getObjectByName('body') as Mesh; }

beforeEach(() => {
  mock.load.mockReset();
  mock.url.mockReset().mockReturnValue('/model.glb');
  vi.stubGlobal('window', {});
});
afterEach(() => {
  for (const v of visuals.splice(0)) v.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AssetVisual ownership and optional loading', () => {
  it('deduplicates pending loads, clones pivots and materials, and keeps shared resources alive until the last user leaves', async () => {
    const model = fixture();
    const pending = deferred<{ scene: Group }>();
    mock.load.mockReturnValueOnce(pending.promise);
    const disposeGeometry = vi.spyOn(model.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(model.paint, 'dispose');
    const disposeTexture = vi.spyOn(model.texture, 'dispose');
    const onReady = vi.fn();
    const a = visual({ onReady }), b = visual();
    await flush();
    expect(mock.load).toHaveBeenCalledExactlyOnceWith('/model.glb');
    expect(a.ready).toBe(false);
    pending.resolve({ scene: model.scene });
    await flush();
    expect(onReady).toHaveBeenCalledExactlyOnceWith(a);
    expect(a.ready).toBe(true);
    expect(body(a).geometry).toBe(body(b).geometry);
    expect(body(a).material).not.toBe(body(b).material);
    const firstPaint = (body(a).material as MeshStandardMaterial[])[0];
    const disposeOwn = vi.spyOn(firstPaint, 'dispose');
    a.content!.getObjectByName('wing_swing_port')!.rotation.y = 0.8;
    expect(b.content!.getObjectByName('wing_swing_port')!.rotation.y).toBe(0);
    a.dispose();
    expect(a.content).toBeNull();
    expect(a.children).toHaveLength(0);
    expect(disposeOwn).toHaveBeenCalledTimes(1);
    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(disposeMaterial).not.toHaveBeenCalled();
    expect(disposeTexture).not.toHaveBeenCalled();
    const disposeObject = vi.fn();
    b.addEventListener('dispose', disposeObject);
    b.dispose();
    b.dispose();
    expect(disposeObject).toHaveBeenCalledTimes(1);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(disposeTexture).toHaveBeenCalledTimes(1);
  });

  it('disposes a late result after every consumer unmounts, without attaching or calling observers', async () => {
    const model = fixture();
    const pending = deferred<{ scene: Group }>();
    mock.load.mockReturnValueOnce(pending.promise);
    const disposed = vi.spyOn(model.geometry, 'dispose');
    const onReady = vi.fn();
    const a = visual({ onReady });
    a.dispose();
    pending.resolve({ scene: model.scene });
    await flush();
    expect(a.ready).toBe(false);
    expect(a.children).toHaveLength(0);
    expect(onReady).not.toHaveBeenCalled();
    expect(disposed).toHaveBeenCalledTimes(1);
    mock.load.mockResolvedValueOnce({ scene: fixture().scene });
    const b = visual();
    await flush();
    expect(mock.load).toHaveBeenCalledTimes(2);
    expect(b.ready).toBe(true);
  });

  it('retains a pending load if another consumer mounts before it finishes', async () => {
    const model = fixture();
    const pending = deferred<{ scene: Group }>();
    mock.load.mockReturnValueOnce(pending.promise);
    const a = visual();
    a.dispose();
    const b = visual();
    pending.resolve({ scene: model.scene });
    await flush();
    expect(a.ready).toBe(false);
    expect(b.ready).toBe(true);
    expect(mock.load).toHaveBeenCalledTimes(1);
  });

  it('leaves the fallback available on failure and permits a later independent retry', async () => {
    mock.load.mockRejectedValueOnce(new Error('network failed'));
    const failedReady = vi.fn();
    const a = visual({ onReady: failedReady });
    await flush();
    expect(a.ready).toBe(false);
    expect(a.content).toBeNull();
    expect(failedReady).not.toHaveBeenCalled();
    mock.load.mockResolvedValueOnce({ scene: fixture().scene });
    const b = visual();
    await flush();
    a.dispose();
    expect(b.ready).toBe(true);
    expect(mock.load).toHaveBeenCalledTimes(2);
  });

  it('does not fetch absent assets or run browser loads in node-side simulations', async () => {
    vi.stubGlobal('window', undefined);
    const a = visual();
    vi.stubGlobal('window', {});
    mock.url.mockReturnValueOnce(undefined);
    const b = visual();
    await flush();
    expect(a.ready).toBe(false);
    expect(b.ready).toBe(false);
    expect(mock.load).not.toHaveBeenCalled();
  });
});

describe('AssetVisual materials and transforms', () => {
  it('applies an early tint without changing contrast details, another instance, or the template', async () => {
    const model = fixture();
    mock.load.mockResolvedValueOnce({ scene: model.scene });
    const a = visual(), b = visual();
    const tint = new Color(0.8, 0.1, 0.1);
    a.setTint(tint);
    const expected = model.paint.color.clone().lerp(tint, 0.65);
    tint.setRGB(0, 1, 0);
    await flush();
    const mats = body(a).material as MeshStandardMaterial[];
    expect(mats[0].color).toEqual(expected);
    expect(mats[1].color).toEqual(model.canopy.color);
    expect(mats[2].color).toEqual(model.dark.color);
    expect(mats[3].color).toEqual(model.nav.color);
    expect((body(b).material as MeshStandardMaterial[])[0].color).toEqual(model.paint.color);
    a.setTint(null);
    expect(mats[0].color).toEqual(model.paint.color);
  });

  it('borrows an early ghost override, restores current tint and never disposes the borrowed material', async () => {
    mock.load.mockResolvedValueOnce({ scene: fixture().scene });
    const ghost = new MeshBasicMaterial();
    const disposeGhost = vi.spyOn(ghost, 'dispose');
    const a = visual();
    a.setMaterial(ghost);
    await flush();
    expect(body(a).material).toBe(ghost);
    a.setTint(new Color(1, 0, 0));
    expect(body(a).material).toBe(ghost);
    a.setMaterial(null);
    const normal = body(a).material as MeshStandardMaterial[];
    expect(normal[0].color.r).toBeGreaterThan(normal[0].color.b);
    a.setMaterial(ghost);
    a.dispose();
    expect(disposeGhost).not.toHaveBeenCalled();
    ghost.dispose();
  });

  it('reports immutable intrinsic bounds independent of wrapper and parent transforms', async () => {
    mock.load.mockResolvedValueOnce({ scene: fixture().scene });
    const a = visual();
    const parent = new Group();
    parent.scale.setScalar(100);
    parent.position.set(50, 100, 500);
    parent.add(a);
    a.scale.setScalar(0.001);
    a.rotation.y = 0.8;
    expect(a.bounds).toBeNull();
    await flush();
    expect(a.bounds!.getSize(new Vector3())).toEqual(new Vector3(4, 2, 8));
    a.bounds!.min.setScalar(-1000);
    expect(a.bounds!.getSize(new Vector3())).toEqual(new Vector3(4, 2, 8));
    a.dispose();
    expect(a.bounds).toBeNull();
  });
});
