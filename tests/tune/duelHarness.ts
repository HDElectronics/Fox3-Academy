/**
 * AI-vs-AI duel harness (sim-ai review): flies two tactical AIs head-on and records what a DCS pilot
 * would check in a Tacview: who detected and committed when, first shots and their fraction of Rmax,
 * whether SARH shooters held STT, whether ARH shooters cranked and pumped, how defenders defended
 * (notch / drag / chaff), how the fight ended, and sanity (no NaN, no missile outliving its battery).
 */
import type { AiSkill, Aircraft, EntityId, Missile, SimEvent } from '../../src/sim/types';
import type { AircraftId, MissileId } from '../../src/data/types';
import { MISSILES } from '../../src/data/missiles';
import { World } from '../../src/sim/world';
import { configureAi, aiStatus, type AiConfig } from '../../src/sim/ai';
import { cruiseFor } from '../../src/sim/scenarios';
import { dlzFor } from '../../src/sim/dlz';
import { missileModel } from '../../src/sim/missileModel';
import { R2D, relBearing } from '../../src/sim/math';

export interface ShotRecord {
  t: number;
  shooter: 'blue' | 'red';
  missile: MissileId;
  range: number;
  rmax: number;
  rne: number;
  frac: number;
  radarMode: string;
  result: string;
  end: number | null;
  /** SARH: fraction of the missile's guided flight the shooter held STT on the target. */
  sttHeld: number | null;
  /** Largest target angle off the shooter's nose (deg) while the missile needed support. */
  maxOff: number;
  /** Did the shooter pump (turn the target past 90° off the nose) within 25 s after its missile went active? */
  pumped: boolean | null;
}

export interface DuelResult {
  label: string;
  seed: number;
  blue: AircraftId;
  red: AircraftId;
  skill: AiSkill;
  commitT: { blue: number | null; red: number | null };
  shots: ShotRecord[];
  defends: { side: 'blue' | 'red'; t: number; text: string }[];
  chaff: { blue: number; red: number };
  kills: { t: number; victim: 'blue' | 'red'; by: 'blue' | 'red' | null }[];
  endT: number;
  outcome: string;
  nan: boolean;
  longMissile: string[];
  stuck: string[];
  aiLog: string[];
  finalStates: { blue: string; red: string };
}

export interface DuelOptions {
  seconds?: number;
  range?: number;
  seed?: number;
  /** Blue is a non-AI straight-flying target when true (player autopilot, no radar tricks). */
  bluePassive?: boolean;
  cfg?: Partial<AiConfig>;
  dt?: number;
}

const sideOf = (w: World, id: EntityId | null | undefined): 'blue' | 'red' | null => (id ? w.get(id)?.side ?? null : null);

export function runDuel(blueType: AircraftId, redType: AircraftId, skill: AiSkill, o: DuelOptions = {}): DuelResult {
  const seed = o.seed ?? 1;
  const w = new World(seed);
  w.record = false;
  const range = o.range ?? 100_000;
  const bc = cruiseFor(blueType), rc = cruiseFor(redType);
  const blue = w.spawnAircraft({
    id: 'blue', side: 'blue', type: blueType, controller: o.bluePassive ? 'player' : 'ai', skill, callsign: 'Blue',
    pos: { x: 0, y: bc.alt, z: 0 }, heading: 0, speed: bc.speed,
  });
  const red = w.spawnAircraft({
    id: 'red', side: 'red', type: redType, controller: 'ai', skill, callsign: 'Red',
    pos: { x: 0, y: rc.alt, z: -range }, heading: Math.PI, speed: rc.speed,
  });
  if (!o.bluePassive) configureAi(w, 'blue', { gci: true, ...o.cfg });
  configureAi(w, 'red', { gci: true, ...o.cfg });
  const res: DuelResult = {
    label: `${blueType} vs ${redType} (${skill})${o.bluePassive ? ' passive' : ''}`, seed, blue: blueType, red: redType, skill,
    commitT: { blue: null, red: null }, shots: [], defends: [], chaff: { blue: 0, red: 0 }, kills: [], endT: 0,
    outcome: '', nan: false, longMissile: [], stuck: [], aiLog: [], finalStates: { blue: '', red: '' },
  };
  const shotOf = new Map<EntityId, ShotRecord>();
  const sttTicks = new Map<EntityId, { held: number; total: number }>();
  const activeAt = new Map<EntityId, number>();
  w.on((e: SimEvent) => {
    const s = (id: EntityId) => sideOf(w, id);
    switch (e.type) {
      case 'ai': {
        const side = s(e.ownerId);
        res.aiLog.push(`${e.t.toFixed(1).padStart(6)} ${side?.padEnd(4)} [${e.state}] ${e.text}`);
        if (e.state === 'commit' && side && res.commitT[side] === null) res.commitT[side] = e.t;
        if (e.state === 'defend' && side) res.defends.push({ side, t: e.t, text: e.text });
        break;
      }
      case 'launch': {
        const sh = w.get(e.shooterId), tg = w.get(e.targetId);
        const side = s(e.shooterId);
        if (!sh || !tg || !side) break;
        const d = dlzFor(sh.pos, sh.vel, tg.pos, tg.vel, e.missile);
        const rec: ShotRecord = {
          t: e.t, shooter: side, missile: e.missile, range: e.range ?? 0, rmax: d.rmax, rne: d.rne,
          frac: (e.range ?? 0) / d.rmax, radarMode: e.radarMode, result: 'in flight', end: null,
          sttHeld: MISSILES[e.missile].seeker === 'sarh' ? 0 : null, maxOff: 0, pumped: null,
        };
        shotOf.set(e.missileId, rec);
        res.shots.push(rec);
        break;
      }
      case 'pitbull': activeAt.set(e.missileId, e.t); res.aiLog.push(`${e.t.toFixed(1).padStart(6)}      <pitbull ${e.missileId} on ${e.targetId}>`); break;
      case 'lock': res.aiLog.push(`${e.t.toFixed(1).padStart(6)} ${s(e.ownerId)?.padEnd(4)} <lock ${e.what}${e.why ? ' ' + e.why : ''}>`); break;
      case 'seeker-lost': res.aiLog.push(`${e.t.toFixed(1).padStart(6)}      <seeker-lost ${e.missileId} ${e.why}>`); break;
      case 'datalink-lost': res.aiLog.push(`${e.t.toFixed(1).padStart(6)}      <datalink-lost ${e.missileId} ${e.why}>`); break;
      case 'hit': { const r = shotOf.get(e.missileId); if (r) { r.result = 'hit'; r.end = e.t; } break; }
      case 'miss': { const r = shotOf.get(e.missileId); if (r) { r.result = e.reason; r.end = e.t; } break; }
      case 'kill': {
        const v = s(e.targetId);
        if (v) res.kills.push({ t: e.t, victim: v, by: sideOf(w, e.by) });
        break;
      }
      case 'cm': { const side = s(e.ownerId); if (side && e.what === 'chaff') res.chaff[side]++; break; }
    }
  });
  const seconds = o.seconds ?? 360;
  const dt = o.dt ?? 0.1;
  const lastStateChange = new Map<EntityId, number>();
  let prevState = new Map<EntityId, string>();
  const prevBlock = new Map<EntityId, string>();
  let endT = seconds;
  for (let t = 0; t < seconds; t += dt) {
    w.step(dt);
    // sanity
    for (const a of w.aircraft.values()) {
      if (![a.pos.x, a.pos.y, a.pos.z, a.vel.x, a.vel.y, a.vel.z, a.heading].every(Number.isFinite)) res.nan = true;
      const st = a.ai?.state ?? 'player';
      if (prevState.get(a.id) !== st) lastStateChange.set(a.id, w.t);
      const blk = aiStatus(a)?.lastLaunchBlock ?? '';
      if (blk && blk !== prevBlock.get(a.id)) res.aiLog.push(`${w.t.toFixed(1).padStart(6)} ${a.side.padEnd(4)} <no launch: ${blk}>`);
      prevBlock.set(a.id, blk);
    }
    prevState = new Map([...w.aircraft.values()].map(a => [a.id, a.ai?.state ?? 'player']));
    for (const m of w.missiles.values()) {
      if (![m.pos.x, m.pos.y, m.pos.z].every(Number.isFinite)) res.nan = true;
      if (m.alive && w.t - m.launchedAt > missileModel(m.type).maxTimeS + 1) res.longMissile.push(`${m.id} ${m.type}`);
      if (!m.alive) continue;
      const rec = shotOf.get(m.id);
      const sh = w.get(m.shooterId);
      const tg = w.get(m.targetId);
      if (!rec || !sh || !tg) continue;
      const needs = m.guidance === 'sarh' || m.guidance === 'datalink' || m.guidance === 'inertial';
      if (sh.alive && tg.alive && needs) {
        const off = Math.abs(relBearing(sh.pos, sh.heading, tg.pos)) * R2D;
        if (w.t - m.launchedAt > 8) rec.maxOff = Math.max(rec.maxOff, off);
      }
      if (MISSILES[m.type].seeker === 'sarh' && m.guidance === 'sarh' && sh.alive) {
        const c = sttTicks.get(m.id) ?? { held: 0, total: 0 };
        c.total++;
        if (sh.radar.mode === 'stt' && sh.radar.stt.targetId === m.targetId) c.held++;
        sttTicks.set(m.id, c);
        rec.sttHeld = c.held / c.total;
      }
    }
    // pump check
    for (const [mid, at] of activeAt) {
      const rec = shotOf.get(mid);
      const m = w.missiles.get(mid);
      if (!rec || !m || rec.pumped) continue;
      const sh = w.get(m.shooterId), tg = w.get(m.targetId);
      if (!sh || !sh.alive || !tg) continue;
      if (w.t - at > 25) { if (rec.pumped === null) rec.pumped = false; continue; }
      const off = Math.abs(relBearing(sh.pos, sh.heading, tg.pos)) * R2D;
      if (off > 100) rec.pumped = true;
      else if (rec.pumped === null && !tg.alive) rec.pumped = null;
    }
    const alive = (side: 'blue' | 'red') => [...w.aircraft.values()].some(a => a.side === side && a.alive);
    const flying = [...w.missiles.values()].some(m => m.alive);
    const armed = (a: Aircraft) => a.alive && Object.values(a.stores).some(n => (n ?? 0) > 0);
    if (!alive('blue') || !alive('red')) { if (!flying) { endT = w.t; break; } }
    else if (!flying && !armed(blue) && !armed(red)) { endT = w.t; break; }
    else if (!flying && blue.ai?.state === 'rtb' && red.ai?.state === 'rtb') { endT = w.t; break; }
  }
  res.endT = endT;
  const bA = blue.alive, rA = red.alive;
  res.outcome = !bA && !rA ? 'both dead' : !bA ? 'red wins' : !rA ? 'blue wins'
    : endT < seconds ? 'both out / rtb' : 'unresolved';
  res.finalStates = { blue: blue.ai?.state ?? 'player', red: red.ai?.state ?? 'player' };
  // stuck: AI alive, same state > 120 s and not patrol/rtb/pump
  for (const a of [blue, red]) {
    if (!a.alive || !a.ai) continue;
    const since = w.t - (lastStateChange.get(a.id) ?? 0);
    if (since > 120 && !['rtb', 'patrol'].includes(a.ai.state)) res.stuck.push(`${a.id} in ${a.ai.state} for ${since.toFixed(0)} s (${aiStatus(a)?.lastLaunchBlock ?? ''})`);
  }
  return res;
}

export function formatDuel(r: DuelResult, verbose = false): string {
  const km = (m: number) => (m / 1000).toFixed(1);
  const lines = [
    `=== ${r.label} seed ${r.seed}: ${r.outcome} at ${r.endT.toFixed(0)} s; commit B ${r.commitT.blue?.toFixed(1) ?? '-'} R ${r.commitT.red?.toFixed(1) ?? '-'}; chaff B ${r.chaff.blue} R ${r.chaff.red}${r.nan ? ' NaN!' : ''}${r.longMissile.length ? ' LONG ' + r.longMissile.join(',') : ''}${r.stuck.length ? ' STUCK ' + r.stuck.join('; ') : ''}`,
  ];
  for (const s of r.shots) {
    lines.push(`  ${s.t.toFixed(1).padStart(6)} ${s.shooter.padEnd(4)} ${s.missile.padEnd(7)} ${s.radarMode.padEnd(3)} ${km(s.range).padStart(5)} km = ${(s.frac * 100).toFixed(0).padStart(3)}% Rmax (${km(s.rmax)}, Rne ${km(s.rne)}) → ${s.result}${s.end ? ' @' + s.end.toFixed(1) : ''}${s.sttHeld !== null ? ` stt ${(s.sttHeld * 100).toFixed(0)}%` : ''} off≤${s.maxOff.toFixed(0)}°${s.pumped === null ? '' : s.pumped ? ' pumped' : ' NO-PUMP'}`);
  }
  if (verbose) lines.push(...r.aiLog.map(l => '    ' + l));
  return lines.join('\n');
}
