/** Global app state: selected aircraft, units, and per-viewer progress (localStorage, best effort). */
import type { AircraftId } from '../data/types';
import { AIRCRAFT } from '../data/aircraft';
import type { Units } from './format';

type Listener = (s: AppStore, what: 'aircraft' | 'units' | 'progress') => void;
const KEY = 'fox3academy:v1';
const LEGACY_KEY = 'fox3school:v1'; // pre-rename key: read as a fallback, dropped on the next save

function load(): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY) ?? '{}') ?? {}; } catch { return {}; }
}
function save(data: Record<string, unknown>) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); localStorage.removeItem(LEGACY_KEY); } catch { /* storage blocked: fine */ }
}

export class AppStore {
  aircraft: AircraftId;
  units: Units;
  private progress: Record<string, number | boolean | string>;
  private unitsOverride: boolean;
  private listeners = new Set<Listener>();

  constructor() {
    const d = load();
    const ac = d.aircraft as AircraftId;
    this.aircraft = ac && AIRCRAFT[ac] ? ac : 'su27';
    this.unitsOverride = d.unitsOverride === true;
    this.units = this.unitsOverride && (d.units === 'metric' || d.units === 'imperial') ? d.units : AIRCRAFT[this.aircraft].units;
    this.progress = (d.progress as Record<string, number | boolean | string>) ?? {};
  }

  get spec() { return AIRCRAFT[this.aircraft]; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setAircraft(id: AircraftId) {
    if (id === this.aircraft || !AIRCRAFT[id]) return;
    this.aircraft = id;
    if (!this.unitsOverride) this.units = AIRCRAFT[id].units;
    this.persist(); this.fire('aircraft');
  }

  setUnits(u: Units) {
    if (u === this.units) return;
    this.units = u; this.unitsOverride = true;
    this.persist(); this.fire('units');
  }

  /** Progress flags, e.g. getProgress('tws:f15c:done'). */
  getProgress(key: string) { return this.progress[key]; }
  setProgress(key: string, value: number | boolean | string) {
    this.progress[key] = value; this.persist(); this.fire('progress');
  }

  private persist() {
    save({ aircraft: this.aircraft, units: this.units, unitsOverride: this.unitsOverride, progress: this.progress });
  }
  private fire(what: 'aircraft' | 'units' | 'progress') { for (const fn of this.listeners) fn(this, what); }
}
