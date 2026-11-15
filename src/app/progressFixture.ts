/**
 * Dev-only progress fixtures for screenshots: '#/learn?progress=mid' shows the app as if the first lessons were
 * done, without touching saved progress (AppStore.previewProgress). main.ts applies it in `npm run dev` only, so a
 * production build ignores the parameter. Combine with `ac=` to pick the jet.
 *   start     nothing done
 *   mid       fighters: Radar, TWS and Missiles done; attack jets: their cockpit page done
 *   complete  every lesson and sortie done
 */
import type { ProgressReader } from './learningProgress';
import type { AppStore } from './store';

export type ProgressFixture = 'start' | 'mid' | 'complete';
const MID = /^(radar|radar-lab|tws|missiles|missile-lab|strike|tgp):/;
/** Keys that hold true/false completions; others (best scores, saved sortie setup, drill scores) stay unset. */
const COMPLETE = /^(harm|atflir|jdam|strike|tgp|cas):|^flight-ops:[^:]+:(done|takeoff|carrier|launch|aar)$|^[a-z-]+:[a-z0-9]+:done$/;

export function fixtureReader(name: string | null): ProgressReader | null {
  if (name === 'start') return () => undefined;
  if (name === 'mid') return key => (MID.test(key) && !/:best$|:setup$/.test(key) ? true : undefined);
  if (name === 'complete') return key => (COMPLETE.test(key) ? true : undefined);
  return null;
}

/** Read `progress=<fixture>` from the hash once, remove it from the URL, and show that progress. */
export function applyProgressFixture(app: AppStore): void {
  try {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path = '', query = ''] = raw.split('?');
    const params = new URLSearchParams(query);
    const read = fixtureReader(params.get('progress'));
    if (!params.has('progress')) return;
    params.delete('progress');
    const qs = params.toString();
    history.replaceState(history.state, '', '#/' + path + (qs ? '?' + qs : ''));
    if (read) app.previewProgress(read);
  } catch { /* sandboxed history: no fixture */ }
}
