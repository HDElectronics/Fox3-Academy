/**
 * Global app state: selected jet, units, and per-viewer progress (localStorage, best effort).
 * `jet` is the picker selection (any role). `aircraft` is the fighter BVR pages fly: the jet when it is a
 * fighter, otherwise the last fighter picked. Routes that do not accept the jet's role show a gate panel.
 */
import type { AircraftId, FighterId, JetSpec } from '../data/types';
import { AIRCRAFT, isFighter } from '../data/aircraft';
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
  jet: AircraftId;
  aircraft: FighterId;
  units: Units;
  private progress: Record<string, number | boolean | string>;
  private unitsOverride: boolean;
  private listeners = new Set<Listener>();

  constructor() {
    const d = load();
    const known = (v: unknown): v is AircraftId => typeof v === 'string' && Object.hasOwn(AIRCRAFT, v);
    this.jet = known(d.aircraft) ? d.aircraft : 'su27';
    this.aircraft = isFighter(this.jet) ? this.jet : known(d.fighter) && isFighter(d.fighter) ? d.fighter : 'su27';
    this.unitsOverride = d.unitsOverride === true;
    this.units = this.unitsOverride && (d.units === 'metric' || d.units === 'imperial') ? d.units : AIRCRAFT[this.jet].units;
    this.progress = (d.progress as Record<string, number | boolean | string>) ?? {};
  }

  /** The fighter spec BVR pages use. */
  get spec() { return AIRCRAFT[this.aircraft]; }
  /** The selected jet's spec, any role. */
  get jetSpec(): JetSpec { return AIRCRAFT[this.jet]; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setAircraft(id: AircraftId) {
    if (id === this.jet || !Object.hasOwn(AIRCRAFT, id)) return;
    this.jet = id;
    if (isFighter(id)) this.aircraft = id;
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
    save({ aircraft: this.jet, fighter: this.aircraft, units: this.units, unitsOverride: this.unitsOverride, progress: this.progress });
  }
  private fire(what: 'aircraft' | 'units' | 'progress') { for (const fn of this.listeners) fn(this, what); }
}
