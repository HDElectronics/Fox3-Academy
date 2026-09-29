/**
 * [OWNER: page-cas] Pure builders the page and the tests share: what the pilot's sensor is on (AimState, per jet) and
 * the lesson snapshot (CasSnap) the steps check. No DOM.
 */
import type { EntityId } from '../../sim/types';
import type { AimState, JtacController } from './jtac';
import type { A10cMilestone, CasSnap } from './lessons';
import type { CasScenario } from './scenario';
import { headingErrorDeg, type ImpactClass } from './safety';
import { ON_TARGET_M, type SpiSource } from './a10cHotas';

const NONE: ReadonlySet<A10cMilestone> = new Set();

/**
 * A-10C II: what the pilot is on. The pod's POINT track, else an SPI set from the pod; the TAD triangle or the
 * steerpoint is coordinates, not eyes on the target (trainer rule, page caveats).
 */
export function a10cAim(sc: CasScenario, spiSource: SpiSource): AimState {
  const w = sc.world, ag = sc.me.ag!, t = ag.tgp;
  if (t?.on && t.track === 'point' && t.trackedUnitId) {
    return sc.targets.includes(t.trackedUnitId) ? { kind: 'target', unitId: t.trackedUnitId } : { kind: 'other', unitId: t.trackedUnitId };
  }
  if (spiSource === 'tgp' && ag.spi) {
    let best: { id: EntityId; d: number } | null = null;
    for (const u of w.groundUnits.values()) {
      if (!u.alive || u.id === sc.jtac) continue;
      const d = Math.hypot(u.pos.x - ag.spi.x, u.pos.z - ag.spi.z);
      if (d <= ON_TARGET_M && (!best || d < best.d)) best = { id: u.id, d };
    }
    if (best) return sc.targets.includes(best.id) ? { kind: 'target', unitId: best.id } : { kind: 'other', unitId: best.id };
  }
  return { kind: 'none' };
}

export interface SnapInput {
  sc: CasScenario;
  jtac: JtacController;
  aim: AimState;
  menuOpen: boolean;
  cardPassed: boolean;
  impacts: Partial<Record<ImpactClass, number>>;
  /** A-10C II cockpit milestones (empty on the Su-25T). */
  milestones?: ReadonlySet<A10cMilestone>;
}

export function casSnap(o: SnapInput): CasSnap {
  const { sc, jtac, aim: a } = o;
  const me = sc.me, sh = me.ag!.shkval, t = me.ag!.tgp;
  const rel = [...jtac.releases.values()];
  // Su-25T: the Shkval lock. A-10C II: the pod's POINT track.
  const locked = t ? t.on && t.track === 'point' && !!t.trackedUnitId : !!sh.lockedUnitId;
  const hdg = ((me.heading * 180) / Math.PI % 360 + 360) % 360;
  const alive = sc.targets.filter(id => sc.world.groundUnits.get(id)?.alive).length;
  const tk = jtac.tasking;
  return {
    jet: sc.jet, jtac: jtac.state, menuOpen: o.menuOpen, cardPassed: o.cardPassed, shkvalOn: sh.on,
    lockedTarget: locked && a.kind === 'target', lockedOther: locked && a.kind === 'other',
    onAttackHeading: headingErrorDeg(hdg, sc.attackHdgDeg) === 0,
    releases: rel.length, clearedReleases: rel.filter(r => r.cleared).length, violations: jtac.violations.length,
    targetsKilled: sc.targets.length - alive, targets: sc.targets.length,
    fratricide: (o.impacts.fratricide ?? 0) > 0, attacks: jtac.attacks,
    tgpOn: !!t?.on, lss: t?.lss ?? 'off', laserFiring: !!t?.laserFiring, jtacLasing: jtac.laserId != null,
    tasking: tk ? tk.state : 'none', milestones: o.milestones ?? NONE,
  };
}
