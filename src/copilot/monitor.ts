/**
 * CopilotMonitor: the copilot without a page. Feed it the DCS link snapshot on a timer; it keeps the situation,
 * the fuel trend, the active alerts and the recent calls, running the same rules and trackers as the copilot
 * page (src/pages/copilot). Used by the DCS MCP server (dcs-link/mcp) to answer "what is going on" questions.
 */
import type { LinkSnapshot } from '../dcs/client';
import type { DcsFrame } from '../dcs/protocol';
import { CopilotEngine, type ActiveAlert, type Callout } from './engine';
import { HORNET_DEFAULTS, HORNET_RULES, type HornetConfig } from './hornet';
import { HornetLockTracker, HornetThreatTracker, hornetLock, hornetThreats, type HornetLock, type HornetThreats } from './hornetSensors';
import { FuelTrend, situationOf, type Situation } from './situation';
import { LockTracker, ThreatTracker, lockOf, threatsOf, type LockPicture, type Threat } from './threats';

export interface MonitorState {
  live: boolean;
  frame: DcsFrame | null;
  situation: Situation;
  hornet: boolean;
  hornetThreats: HornetThreats | null;
  hornetLock: HornetLock | null;
  threats: Threat[];
  lock: LockPicture | null;
  active: ActiveAlert[];
}

export interface LoggedCall extends Callout {
  /** DCS model time of the call, seconds, when the frame had one. */
  modelT?: number;
}

const ORDER = { warning: 0, caution: 1, advisory: 2 } as const;
const MAX_LOG = 50;

export class CopilotMonitor {
  readonly cfg: HornetConfig;
  private engine: CopilotEngine<HornetConfig>;
  private fuel = new FuelTrend();
  private threatTracker = new ThreatTracker();
  private lockTracker = new LockTracker();
  private hornetThreatTracker = new HornetThreatTracker();
  private hornetLockTracker = new HornetLockTracker();
  private log: LoggedCall[] = [];
  private last: MonitorState = {
    live: false, frame: null, situation: situationOf(null), hornet: false,
    hornetThreats: null, hornetLock: null, threats: [], lock: null, active: [],
  };

  constructor(cfg: Partial<HornetConfig> = {}) {
    this.cfg = { ...HORNET_DEFAULTS, ...cfg };
    this.engine = new CopilotEngine(HORNET_RULES, this.cfg);
  }

  /** One evaluation at time t (seconds, any monotonic clock). Returns the calls made now. */
  update(snap: Pick<LinkSnapshot, 'dcs' | 'frame'>, t: number): Callout[] {
    const live = snap.dcs === 'live' && snap.frame !== null;
    const frame = live ? snap.frame : null;
    const s = situationOf(frame);
    s.fuelFlowLbH = live ? this.fuel.update(t, s.fuelLb) : undefined;
    const hornet = live && frame!.self?.name === 'FA-18C_hornet' && frame!.disp !== undefined;
    const hThreats = hornet ? hornetThreats(frame) : null;
    const hLock = hornet ? hornetLock(frame) : null;
    const threats = live && !hornet ? threatsOf(frame!.rwr?.emitters) : [];
    const lock = live && !hornet ? lockOf(frame) : null;
    const none = { active: [] as ActiveAlert[], calls: [] as Callout[] };
    const ruled = live ? this.engine.step(s, t) : none;
    const th = !live ? none : hornet ? this.hornetThreatTracker.update(hThreats, t) : this.threatTracker.update(threats, t);
    const lk = !live ? none : hornet ? this.hornetLockTracker.update(hLock, frame, t) : this.lockTracker.update(lock, t);
    const active = [...th.active, ...ruled.active, ...lk.active].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
    const calls = [...th.calls, ...ruled.calls, ...lk.calls].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
    for (const c of calls) this.log.push({ ...c, modelT: frame?.t });
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG);
    this.last = { live, frame, situation: s, hornet, hornetThreats: hThreats, hornetLock: hLock, threats, lock, active };
    return calls;
  }

  state(): MonitorState { return this.last; }

  /** Most recent calls first. */
  recent(n = 20): LoggedCall[] { return this.log.slice(-n).reverse(); }
}
