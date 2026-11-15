import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from './router';
import { ROUTES } from './routes';
import { AppStore } from './store';
import type { PageContext } from './page';

vi.mock('../ui/dom', () => ({ h: (...args: unknown[]) => ({ args }) }));

describe('router deep links and remounts', () => {
  let app: AppStore;
  let router: Router;
  let outlet: HTMLElement;
  const mounted: PageContext[] = [];
  const unmount = vi.fn();
  beforeEach(() => {
    mounted.length = 0;
    unmount.mockClear();
    const location = { hash: '#/tws' };
    vi.stubGlobal('location', location);
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    vi.stubGlobal('history', { state: null, replaceState: vi.fn((_state, _unused, hash: string) => { location.hash = hash; }) });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    for (const route of ROUTES) vi.spyOn(route, 'load').mockResolvedValue({ default: () => ({ mount: ctx => { mounted.push(ctx); }, unmount }) });
    app = new AppStore();
    outlet = { replaceChildren: vi.fn(), dataset: {} } as unknown as HTMLElement;
    router = new Router(outlet, app);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('remounts a same-route query change between guided and free TWS', async () => {
    router.onChange = vi.fn();
    await router.resolve();
    router.navigate('tws?lab=free');
    await router.resolve(); // browser hashchange
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(mounted.map(ctx => ctx.params.get('lab'))).toEqual([null, 'free']);
    expect(vi.mocked(router.onChange).mock.calls.at(-1)?.[1].get('lab')).toBe('free');
    location.hash = '#/tws';
    await router.resolve();
    expect(mounted.at(-1)?.params.has('lab')).toBe(false);
    expect(unmount).toHaveBeenCalledTimes(2);
  });
  it('lets a page apply a same-route query change in place, and remounts when it declines', async () => {
    const update = vi.fn((params: URLSearchParams) => params.get('lab') !== 'free');
    vi.mocked(ROUTES.find(route => route.path === 'merge')!.load).mockResolvedValue({ default: () => ({ mount: ctx => { mounted.push(ctx); }, update, unmount }) });
    router.onChange = vi.fn();
    location.hash = '#/merge?lesson=corner';
    await router.resolve();
    location.hash = '#/merge?lesson=pursuit';
    await router.resolve();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0].get('lesson')).toBe('pursuit');
    expect(mounted).toHaveLength(1);
    expect(unmount).not.toHaveBeenCalled();
    expect(vi.mocked(router.onChange).mock.calls.at(-1)?.[1].get('lesson')).toBe('pursuit');
    // Back to the first lesson: in place again, because the router now knows the page is on pursuit.
    location.hash = '#/merge?lesson=corner';
    await router.resolve();
    expect(update).toHaveBeenCalledTimes(2);
    expect(mounted).toHaveLength(1);
    location.hash = '#/merge?lab=free';
    await router.resolve();
    expect(mounted).toHaveLength(2);
    expect(unmount).toHaveBeenCalledTimes(1);
  });
  it('replaces the history entry and resolves at once for navigate with replace', async () => {
    const update = vi.fn(() => true);
    vi.mocked(ROUTES.find(route => route.path === 'radar')!.load).mockResolvedValue({ default: () => ({ mount: ctx => { mounted.push(ctx); }, update, unmount }) });
    router.onChange = vi.fn();
    location.hash = '#/radar?ex=free';
    await router.resolve();
    router.navigate('radar?lab=free&ex=free', { replace: true });
    await Promise.resolve();
    expect(history.replaceState).toHaveBeenLastCalledWith(null, '', '#/radar?lab=free&ex=free');
    expect(update).toHaveBeenCalledTimes(1);
    expect(mounted).toHaveLength(1);
    expect(vi.mocked(router.onChange).mock.calls.at(-1)?.[1].get('lab')).toBe('free');
  });
  it('remounts on a units change, except a route that re-renders units live (Pattern & landing keeps its flight)', async () => {
    await router.resolve();
    app.setUnits(app.units === 'metric' ? 'imperial' : 'metric');
    await Promise.resolve();
    expect(mounted).toHaveLength(2);
    expect(unmount).toHaveBeenCalledTimes(1);
    location.hash = '#/flight-ops';
    await router.resolve();
    expect(mounted).toHaveLength(3);
    app.setUnits(app.units === 'metric' ? 'imperial' : 'metric');
    await Promise.resolve();
    expect(mounted).toHaveLength(3);
    expect(unmount).toHaveBeenCalledTimes(2);
    // A jet change still remounts it.
    app.setAircraft('f14b');
    await Promise.resolve();
    expect(mounted).toHaveLength(4);
  });
  it('does not remount an unchanged route with reordered query keys', async () => {
    location.hash = '#/radar?lab=free&ex=free';
    await router.resolve();
    location.hash = '#/radar?ex=free&lab=free';
    await router.resolve();
    expect(mounted).toHaveLength(1);
  });
  it('strips initial aircraft selection before mounting and permits later picker changes', async () => {
    location.hash = '#/tws?ac=f15c&lab=free';
    await router.resolve();
    await Promise.resolve();
    expect(app.aircraft).toBe('f15c');
    expect(location.hash).toBe('#/tws?lab=free');
    expect(mounted).toHaveLength(1);
    expect(mounted[0]?.params.has('ac')).toBe(false);
    app.setAircraft('f14b');
    await Promise.resolve();
    expect(mounted).toHaveLength(2);
    expect(app.aircraft).toBe('f14b');
    expect(mounted.at(-1)?.params.get('lab')).toBe('free');
  });
  it('strips same-aircraft and invalid aircraft parameters without losing the page', async () => {
    location.hash = '#/learn?ac=su27';
    await router.resolve();
    expect(mounted).toHaveLength(1);
    expect(location.hash).toBe('#/learn');
    location.hash = '#/practice?ac=unknown';
    await router.resolve();
    expect(mounted).toHaveLength(2);
    expect(app.aircraft).toBe('su27');
    expect(location.hash).toBe('#/practice');
  });
  it('only mounts the newest route when lazy loads finish out of order', async () => {
    let release!: (mod: Awaited<ReturnType<typeof ROUTES[number]['load']>>) => void;
    vi.mocked(ROUTES.find(route => route.path === 'tws')!.load).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const old = router.resolve();
    location.hash = '#/practice';
    await router.resolve();
    const staleMount = vi.fn();
    release({ default: () => ({ mount: staleMount, unmount }) });
    await old;
    expect(staleMount).not.toHaveBeenCalled();
    expect(mounted).toHaveLength(1);
  });
  function restoreAttackSelection() {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ aircraft: 'su25t', fighter: 'f15c' }),
      setItem: vi.fn(), removeItem: vi.fn(),
    });
    app = new AppStore();
    router = new Router(outlet, app);
  }
  it('renders the fighter gate when a deep link repeats the stored attack jet', async () => {
    restoreAttackSelection();
    location.hash = '#/tws?ac=su25t';
    await router.resolve();
    expect(app.jet).toBe('su25t');
    expect(location.hash).toBe('#/tws');
    expect(mounted).toHaveLength(0);
    expect(outlet.dataset.page).toBe('tws');
    expect(outlet.replaceChildren).toHaveBeenCalledWith(expect.objectContaining({
      args: expect.arrayContaining([expect.objectContaining({ class: 'role-gate' })]),
    }));
  });
  it('leaves the stored attack jet gate when a deep link selects the saved fighter', async () => {
    restoreAttackSelection();
    await router.resolve();
    expect(mounted).toHaveLength(0);
    location.hash = '#/tws?ac=f15c&lab=free';
    await router.resolve();
    expect(app.jet).toBe('f15c');
    expect(location.hash).toBe('#/tws?lab=free');
    expect(mounted).toHaveLength(1);
    expect(mounted[0]?.params.get('lab')).toBe('free');
    expect(mounted[0]?.params.has('ac')).toBe(false);
  });
  it('shows the role gate instead of a BVR page for the Su-25T, then mounts once a fighter is picked', async () => {
    location.hash = '#/tws?ac=su25t';
    await router.resolve();
    await Promise.resolve();
    expect(app.jet).toBe('su25t');
    expect(app.aircraft).toBe('su27');
    expect(mounted).toHaveLength(0);
    type Fake = { args: [string, Record<string, unknown> | null, ...unknown[]] };
    const shown = vi.mocked(outlet.replaceChildren).mock.calls.at(-1)?.[0] as unknown as Fake;
    expect(shown.args[1]?.class).toBe('role-gate');
    app.setAircraft('f15c');
    await Promise.resolve();
    expect(mounted).toHaveLength(1);
    expect(app.aircraft).toBe('f15c');
  });
  it('shows a retryable error when a page chunk fails to load', async () => {
    const tws = ROUTES.find(route => route.path === 'tws')!;
    vi.mocked(tws.load).mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await router.resolve();
    expect(mounted).toHaveLength(0);
    type Fake = { args: [string, Record<string, unknown> | null, ...unknown[]] };
    const shown = vi.mocked(outlet.replaceChildren).mock.calls.at(-1)?.[0] as unknown as Fake;
    expect(shown.args[1]?.class).toBe('page-error');
    const actions = shown.args[3] as Fake;
    const retry = actions.args[2] as Fake;
    expect(retry.args[2]).toBe('Retry');
    await (retry.args[1]!.onclick as () => Promise<void>)();
    expect(mounted).toHaveLength(1);
  });
});
