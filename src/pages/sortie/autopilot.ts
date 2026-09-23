/**
 * A plain scripted pilot for the player's jet, used only to pre-roll screenshot states (?shot=fly,
 * ?shot=debrief) and by the end-to-end test. It flies the textbook: search, TWS (or lock where the
 * jet must), shoot inside 85 % of Rmax, crank 45° while guiding, beam and chaff when warned, recommit.
 * It uses the same World API the player's buttons use.
 */
import { AIRCRAFT } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import type { World } from '../../sim/world';
import type { Aircraft, EntityId } from '../../sim/types';
import { D2R, bearingTo, relBearing, wrap2Pi } from '../../sim/math';
import { fighterSpec } from '../../sim/jet';

export class ScriptedPilot {
  private nextThink = 0;
  private lastShot = -99;
  private crankSide = 1;
  private chaffAt = 0;

  constructor(private world: World, private meId: EntityId, private enemyIds: EntityId[]) {}

  step(): void {
    const w = this.world;
    const me = w.get(this.meId);
    if (!me || !me.alive || w.t < this.nextThink) return;
    this.nextThink = w.t + 0.25;
    const spec = fighterSpec(me);
    const r = me.radar;
    const enemies = this.enemyIds.map(id => w.get(id)).filter((a): a is Aircraft => !!a && a.alive);
    if (!enemies.length) return;
    const nearest = enemies.slice().sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos))[0];

    // Defend: an active missile or a launch warning.
    const threat = me.rwr.find(c => c.state === 'missile' || c.state === 'launch');
    if (threat) {
      const brg = wrap2Pi(me.heading + threat.bearing);
      const side = threat.bearing >= 0 ? -1 : 1;
      me.cmd.heading = wrap2Pi(brg + side * Math.PI / 2);
      me.cmd.altitude = Math.max(1500, Math.min(me.cmd.altitude, me.pos.y - 2500));
      me.cmd.afterburner = false;
      if (w.t - this.chaffAt > 0.8) { w.chaff(me.id); this.chaffAt = w.t; }
      return;
    }

    // Radar.
    if (spec.radar.tws && r.mode === 'rws') w.setRadarMode(me.id, 'tws');
    if (r.mode === 'tws' && !r.designated.length) {
      const firm = r.tracks.filter(t => t.firm && this.enemyIds.includes(t.targetId)).sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos))[0];
      if (firm) w.designate(me.id, firm.targetId);
    }
    if (!spec.radar.tws && r.mode === 'rws' && r.bricks.length) {
      const b = r.bricks.slice().sort((x, y) => x.range - y.range)[0];
      if (w.canLock(me.id, b.targetId).ok) w.lock(me.id, b.targetId);
    }

    // Shoot inside 85 % Rmax, one missile in the air per target.
    const chk = w.canLaunch(me.id);
    const inAir = [...w.missiles.values()].filter(m => m.alive && m.shooterId === me.id);
    if (chk.ok && chk.targetId && chk.dlz && chk.range !== null && chk.range < chk.dlz.rmax * 0.85 && w.t - this.lastShot > 4 &&
      !inAir.some(m => m.targetId === chk.targetId)) {
      w.launch(me.id);
      this.lastShot = w.t;
      this.crankSide = relBearing(me.pos, me.heading, (w.get(chk.targetId) ?? nearest).pos) >= 0 ? -1 : 1;
    }

    // Steer: crank while a missile needs us, else point at the nearest bandit, cruise high.
    const guiding = inAir.find(m => m.guidance === 'datalink' || m.guidance === 'sarh');
    const tgt = guiding ? w.get(guiding.targetId) ?? nearest : nearest;
    const brg = bearingTo(me.pos, tgt.pos);
    const crank = guiding ? Math.min(45, spec.radar.gimbalAzDeg - 12) * D2R : 0;
    me.cmd.heading = wrap2Pi(brg + this.crankSide * crank);
    me.cmd.altitude = Math.max(me.cmd.altitude, 9000);
    me.cmd.speed = Math.max(me.cmd.speed, 280);
    const fox1 = guiding && MISSILES[guiding.type].seeker === 'sarh';
    me.cmd.afterburner = !guiding && !fox1 && tgt.pos.distanceTo(me.pos) > 50000;
  }
}
