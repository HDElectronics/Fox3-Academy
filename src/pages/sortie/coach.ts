/**
 * Sortie debrief analysis: pure functions over what the recorder captured (events, per-shot records,
 * player-centred samples, the player's radar actions). No DOM, no World: tested in coach.test.ts.
 *
 * Every rule is a DCS lesson:
 * - support: a Fox 3 needs your track until pitbull, a Fox 1 your lock to impact (locking someone else,
 *   switching modes or cranking past the gimbal cuts it);
 * - shot range: inside Rne he cannot escape; a long shot at a cold or beaming target dies of energy or notch;
 * - crank: keep the target 40–50° off the nose while the missile flies (F-pole, closure);
 * - defence: beam (notch) at once with chaff, below the missile; drag if there is time;
 * - timeline: do not sit hot inside the bandit's Rne; do not hold STT long before the shot.
 */
import type { AircraftId, MissileId, RadarModeId, SeekerKind } from '../../data/types';
import { MISSILES } from '../../data/missiles';
import type { AiSkill, EntityId, MissReason, SimEvent, Side } from '../../sim/types';
import { fmtRange, fmtTime, type Units } from '../../app/format';

// ───────────────────────────────────────────────────────────── recorded data

export interface ShotRecord {
  id: EntityId;                 // missile id
  label: string;                // 'M1' (player's, in launch order) or 'R-77' style for others
  missile: MissileId;
  shooterId: EntityId;
  targetId: EntityId | null;
  side: Side;
  t: number;                    // launch time (s)
  range: number | null;         // truth range at launch (m)
  rmax: number | null;          // launch zone at launch (truth geometry)
  rne: number | null;
  rmin: number | null;
  radarMode: RadarModeId;       // shooter's radar at launch
  targetAspectDeg: number | null; // target aspect seen from the shooter: 0 hot, 90 beam, 180 cold
  shooterAlt: number;
  targetAlt: number | null;
  shooterMach: number;
  endT: number | null;
  outcome: 'hit' | 'miss' | 'flying';
  reason: MissReason | null;
  /** Shooter–target distance when the missile ended (m). */
  fPole: number | null;
  /** First RWR launch / active-missile warning the target got for this missile. */
  warnedAt: number | null;
  warnKind: 'launch' | 'missile' | null;
  pitbullAt: number | null;
  datalinkLost: { t: number; why: string } | null;
  seekerLost: { t: number; why: MissReason } | null;
  /** How far off the shooter's nose the target sat while the shooter guided it (launch → pitbull, or impact for SARH). */
  support: { meanOffNoseDeg: number; maxOffNoseDeg: number; seconds: number } | null;
}

export interface BanditSample {
  id: EntityId;
  alive: boolean;
  range: number;                // m
  offNoseDeg: number;           // bandit's bearing off my nose, 0..180
  banditHotDeg: number;         // his nose to me: 0 = pointing at me
  rne: number | null;           // his best radar missile's Rne against me (m), null when he has none left
  rmax: number | null;
  defending: boolean;
}

export interface ThreatSample {
  id: EntityId;                 // missile id
  shooterId: EntityId;
  missile: MissileId;
  seeker: SeekerKind;
  guidance: string;
  range: number;
  offNoseDeg: number;           // missile bearing off my nose, 0 nose .. 90 beam .. 180 tail
  altAbove: number;             // my altitude minus the missile's (m): > 0 = I am above it
}

export interface Sample {
  t: number;
  alive: boolean;
  alt: number;
  speed: number;
  radarMode: RadarModeId;
  sttTarget: EntityId | null;
  designated: EntityId[];
  rwrTop: 'none' | 'search' | 'lock' | 'launch' | 'missile';
  bandits: BanditSample[];
  threats: ThreatSample[];
}

export interface PlayerAction {
  t: number;
  kind: 'mode' | 'designate' | 'lock' | 'unlock' | 'step' | 'launch' | 'chaff' | 'flare' | 'weapon' | 'radar';
  detail?: string;
  targetId?: EntityId | null;
}

export interface CoachInput {
  playerId: EntityId;
  playerType: AircraftId;
  friends: EntityId[];
  enemies: EntityId[];
  names: Record<EntityId, string>;
  units: Units;
  gimbalDeg: number;
  /** The player's jet can fire its radar missiles from TWS (silent shots). */
  twsLaunch: boolean;
  /** FC3 Russian СНП: the radar locks by itself at a fraction of Rmax. */
  autoStt: boolean;
  events: SimEvent[];
  shots: ShotRecord[];
  samples: Sample[];
  actions: PlayerAction[];
  endT: number;
  playerMissilesLeft: number;
}

export interface SortieResult {
  outcome: 'win' | 'loss' | 'draw';
  reason: 'bandits-dead' | 'shot-down' | 'time' | 'bingo' | 'ended';
  t: number;
}

export type CoachKind = 'mistake' | 'good' | 'note';
export interface CoachItem {
  id: string;
  kind: CoachKind;
  /** 3 = cost you a kill or your life, 2 = a real error, 1 = worth knowing. */
  severity: 1 | 2 | 3;
  t: number | null;
  title: string;
  text: string;
  /** Entity to focus the replay camera on. */
  focus: EntityId | null;
}

// ───────────────────────────────────────────────────────────── wording helpers

const REASON_TEXT: Record<MissReason, string> = {
  notched: 'lost him in the notch',
  chaff: 'went for the chaff',
  flare: 'went for a flare',
  kinematic: 'ran out of energy',
  'lost-guidance': 'lost guidance',
  'no-acquisition': 'found nothing when its seeker went active',
  'target-dead': 'lost its target (already down)',
  timeout: 'timed out',
  ground: 'hit the ground',
  overshoot: 'overshot',
};
export const reasonText = (r: MissReason | null): string => (r ? REASON_TEXT[r] : 'missed');

const secs = (s: number) => String(Math.max(0, Math.round(s)));
const ratio = (a: number, b: number) => (a / b).toFixed(2).replace(/0$/, '');

export function aspectWord(deg: number | null): string {
  if (deg === null) return 'unknown-aspect';
  if (deg < 45) return 'hot';
  if (deg < 70) return 'flanking';
  if (deg <= 110) return 'beaming';
  if (deg < 135) return 'dragging';
  return 'cold';
}

export class Namer {
  constructor(private input: Pick<CoachInput, 'names' | 'playerId' | 'units'>) {}
  name(id: EntityId | null | undefined): string {
    if (!id) return 'nobody';
    return this.input.names[id] ?? id;
  }
  /** 'M1' for the player's own shots, "Bandit-1's R-77" for everybody else. */
  shot(s: ShotRecord): string {
    if (s.shooterId === this.input.playerId) return s.label;
    return `${this.name(s.shooterId)}'s ${MISSILES[s.missile].name}`;
  }
  range(m: number | null): string {
    if (m === null || !isFinite(m)) return '--';
    return fmtRange(m, this.input.units, m < (this.input.units === 'metric' ? 10000 : 18520) ? 1 : 0);
  }
}

/** Nearest sample at or before t (binary search), or null. */
export function sampleAt(samples: readonly Sample[], t: number): Sample | null {
  let lo = 0, hi = samples.length - 1;
  if (hi < 0 || t < samples[0].t) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].t <= t) lo = mid; else hi = mid - 1;
  }
  return samples[lo];
}

function sampleStep(samples: readonly Sample[]): number {
  if (samples.length < 2) return 0.5;
  return Math.max(0.05, (samples[samples.length - 1].t - samples[0].t) / (samples.length - 1));
}

// ───────────────────────────────────────────────────────────── rules

/** Player missiles that lost their support (datalink or illumination) and why. */
function ruleSupportLost(inp: CoachInput, nm: Namer): CoachItem[] {
  const out: CoachItem[] = [];
  const deathT = playerDeath(inp);
  for (const s of inp.shots) {
    if (s.shooterId !== inp.playerId) continue;
    const sarh = MISSILES[s.missile].seeker === 'sarh';
    const lost = s.datalinkLost ?? (sarh && s.seekerLost?.why === 'lost-guidance' ? { t: s.seekerLost.t, why: 'lost-guidance' } : null);
    if (!lost) continue;
    if (/destroyed/.test(lost.why) || (deathT !== null && deathT <= lost.t + 0.1)) continue;
    const tgt = nm.name(s.targetId);
    const via = sarh ? 'your lock' : 'datalink';
    // A SARH missile gives up about 1 s after the illumination stops and the lock itself breaks after the
    // radar's memory, so look a few seconds either side.
    const near = (t: number) => t >= lost.t - 4 && t <= lost.t + 4;
    const locks = inp.events.filter((e): e is Extract<SimEvent, { type: 'lock' }> => e.type === 'lock' && e.ownerId === inp.playerId && near(e.t));
    const otherLock = locks.filter(e => e.what === 'locked' && e.targetId !== s.targetId && e.t <= lost.t + 0.05).pop();
    const broken = locks.find(e => e.what === 'broken' && e.targetId === s.targetId);
    const act = inp.actions.filter(a => a.t <= lost.t + 0.05 && a.t >= lost.t - 3 && (a.kind === 'mode' || a.kind === 'unlock' || a.kind === 'radar')).pop();
    const before = sampleAt(inp.samples, lost.t - (sarh ? 1.5 : 0.5));
    const b = before?.bandits.find(x => x.id === s.targetId);
    const defending = before?.threats.find(x => x.offNoseDeg >= 60 && x.guidance !== 'ballistic');
    const pastGimbal = (broken && /gimbal/.test(broken.why ?? '')) || (b !== undefined && b.offNoseDeg > inp.gimbalDeg - 3);
    const azCause = b !== undefined && b.offNoseDeg > inp.gimbalDeg - 5;
    const past = azCause && b
      ? `${Math.round(b.offNoseDeg)}° off your nose, ${Math.round(b.offNoseDeg) > inp.gimbalDeg ? 'past' : 'at the edge of'} the ±${inp.gimbalDeg}° gimbal`
      : `outside your radar's gimbal`;
    let cause: string;
    let mistake = true;
    if (otherLock) cause = `You locked ${nm.name(otherLock.targetId)} while ${s.label} was still on ${via} to ${tgt}`;
    else if (act?.kind === 'mode') cause = `You switched the radar to ${act.detail ?? 'another mode'} while ${s.label} was still on ${via} to ${tgt}`;
    else if (act?.kind === 'radar') cause = `You turned the radar off while ${s.label} was still on ${via} to ${tgt}`;
    else if (act?.kind === 'unlock') cause = `You unlocked while ${s.label} still needed ${via} to ${tgt}`;
    else if (pastGimbal && defending) {
      cause = `You turned to defend against ${nm.name(defending.shooterId)}'s ${MISSILES[defending.missile].name} and put ${tgt} ${past}, so ${s.label} lost ${via}`;
      mistake = false;
    } else if (pastGimbal) cause = `${tgt} went ${past}, and the radar dropped him while ${s.label} needed ${via}`;
    else if ((broken && /notch/.test(broken.why ?? '')) || (b && b.banditHotDeg > 70 && b.banditHotDeg < 110)) {
      cause = `${tgt} beamed you into your radar's notch and the ${sarh ? 'lock' : 'track'} dropped while ${s.label} needed it`; mistake = false;
    } else if (broken) { cause = `Your lock on ${tgt} broke (${broken.why ?? 'lost'}) while ${s.label} needed it`; mistake = false; }
    else { cause = `Your radar lost ${tgt} while ${s.label} needed ${via}`; mistake = false; }
    const after = s.outcome === 'hit'
      ? ': it still hit.'
      : sarh ? `: ${s.label} went dumb and ${reasonText(s.reason)}.` : `: ${s.label} lost support and ${reasonText(s.reason)}.`;
    const lesson = sarh
      ? (defending && pastGimbal ? ' That is the Fox 1 trade: defending costs you the shot. Shoot earlier or with a Fox 3.' : ' A Fox 1 needs STT all the way to impact.')
      : ' Hold the track until pitbull.';
    out.push({
      id: `support-${s.id}`, kind: mistake ? 'mistake' : 'note', severity: s.outcome === 'hit' ? 1 : mistake ? 3 : 2, t: lost.t,
      title: sarh ? 'Lock lost with a Fox 1 in the air' : 'Datalink cut', focus: s.id,
      text: cause + after + lesson,
    });
  }
  return out;
}

/** Launch range, target aspect, outcome. */
function ruleShotQuality(inp: CoachInput, nm: Namer): CoachItem[] {
  const out: CoachItem[] = [];
  const beamShots: ShotRecord[] = [];
  for (const s of inp.shots) {
    if (s.shooterId !== inp.playerId || s.outcome === 'flying') continue;
    const tgt = nm.name(s.targetId);
    const asp = s.targetAspectDeg;
    const r = s.range !== null && s.rmax ? s.range / s.rmax : null;
    const insideRne = s.range !== null && s.rne !== null && s.range <= s.rne;
    const base = { t: s.t, focus: s.id } as const;
    if (s.outcome === 'miss' && (s.reason === 'kinematic' || s.reason === 'timeout')) {
      out.push({
        ...base, id: `energy-${s.id}`, kind: 'mistake', severity: 3, title: 'Out of energy',
        text: `${s.label} ${reasonText(s.reason)}: fired at ${nm.range(s.range)} on a ${aspectWord(asp)} target` +
          `${r !== null ? ` (${ratio(s.range ?? 0, s.rmax ?? 1)}× Rmax, Rne ${nm.range(s.rne)})` : ''}. ` +
          'Shoot inside Rne, or when he is hot, and from higher and faster.',
      });
    } else if (r !== null && r >= 0.9 && asp !== null && asp >= 120) {
      out.push({
        ...base, id: `cold-${s.id}`, kind: 'mistake', severity: 2, title: 'Long shot at a cold target',
        text: `You fired ${s.label} at ${ratio(s.range ?? 0, s.rmax ?? 1)}× Rmax on a cold target (${tgt} aspect ${Math.round(asp)}°)` +
          (s.outcome === 'hit' ? ': it worked, but a cold target shrinks the zone every second.' : `: it ${reasonText(s.reason)}.`),
      });
    } else if (asp !== null && asp >= 70 && asp <= 110 && s.outcome === 'miss' && (s.reason === 'notched' || s.reason === 'chaff')) {
      beamShots.push(s);
    } else if (s.outcome === 'miss' && (s.reason === 'notched' || s.reason === 'chaff' || s.reason === 'flare')) {
      out.push({
        ...base, id: `notched-${s.id}`, kind: 'note', severity: 1, title: 'Defeated by the notch',
        text: `${tgt} beat ${s.label}: it ${reasonText(s.reason)}` +
          `${r !== null ? ` (fired at ${ratio(s.range ?? 0, s.rmax ?? 1)}× Rmax${insideRne ? ', inside Rne' : ''})` : ''}. ` +
          'Closer shots leave him less time to set up the notch; have the next missile ready for when he turns back hot.',
      });
    } else if (s.outcome === 'hit' && insideRne) {
      out.push({
        ...base, id: `rne-${s.id}`, kind: 'good', severity: 1, title: 'Shot inside Rne',
        text: `${s.label} left at ${nm.range(s.range)}, inside Rne (${nm.range(s.rne)}): no escape for ${tgt}, and it hit.`,
      });
    }
  }
  if (beamShots.length) {
    const s = beamShots[0];
    const list = beamShots.map(x => x.label).join(', ');
    out.push({
      id: `beam-${s.id}`, kind: 'mistake', severity: 2, t: s.t, focus: s.id, title: 'Shot at a beaming target',
      text: beamShots.length === 1
        ? `You fired ${s.label} while ${nm.name(s.targetId)} was beaming you (aspect ${Math.round(s.targetAspectDeg ?? 90)}°): he was already in the notch, and it ${reasonText(s.reason)}. Wait until he turns back in.`
        : `You fired ${list} while the target was beaming you (aspect ${beamShots.map(x => Math.round(x.targetAspectDeg ?? 90) + '°').join(', ')}): he was already in the notch and every one was notched or decoyed. Wait until he turns back in.`,
    });
  }
  return out;
}

/** Crank while supporting. */
function ruleCrank(inp: CoachInput, nm: Namer): CoachItem[] {
  const out: CoachItem[] = [];
  const goods: { s: ShotRecord; mean: number }[] = [];
  const deathT = playerDeath(inp);
  for (const s of inp.shots) {
    if (s.shooterId !== inp.playerId || !s.support || s.support.seconds < 4) continue;
    if (deathT !== null && s.endT !== null && deathT < s.endT) continue;
    const tgt = nm.name(s.targetId);
    const mean = Math.round(s.support.meanOffNoseDeg);
    if (!s.datalinkLost && mean >= 30 && s.support.maxOffNoseDeg <= inp.gimbalDeg) goods.push({ s, mean });
    else if (mean < 15) {
      out.push({
        id: `nocrank-${s.id}`, kind: 'mistake', severity: 2, t: s.t, focus: s.id, title: 'No crank',
        text: `You flew almost straight at ${tgt} while ${s.label} flew (${mean}° off the nose)` +
          `${s.fPole !== null && s.outcome === 'hit' ? `: F-pole only ${nm.range(s.fPole)}` : ''}. Crank 40–50° to slow the closure and keep his missiles farther away.`,
      });
    }
  }
  const best = goods.slice().sort((a, b) => (b.s.outcome === 'hit' ? 1 : 0) - (a.s.outcome === 'hit' ? 1 : 0) || (b.s.fPole ?? 0) - (a.s.fPole ?? 0));
  for (const g of best.slice(0, 2)) {
    const fp = g.s.outcome === 'hit' && g.s.fPole !== null ? `, and F-pole was ${nm.range(g.s.fPole)}` : '';
    const more = best.length > 2 && g === best[0] ? ` (${best.length - 1} more shots cranked as well)` : '';
    out.push({
      id: `crank-${g.s.id}`, kind: 'good', severity: 1, t: g.s.t, focus: g.s.id, title: 'Good crank',
      text: `You kept ${nm.name(g.s.targetId)} at ${g.mean}° off the nose while ${g.s.label} flew${fp}${more}.`,
    });
  }
  return out;
}

export interface Reaction {
  /** When the defensive turn started (s). */
  t: number;
  /** When the missile first sat on the beam (or behind) (s). */
  reachedAt: number;
  how: 'beam' | 'drag';
  /** Beamed while more than 500 m above the missile. */
  above: boolean;
  /** Chaff bundles dropped from the turn to the end. */
  chaff: number;
}

/**
 * The first defensive turn against a missile: the missile goes to the beam (60–120° off the nose) or
 * behind (> 120°) and stays there for two samples. The turn starts where the angle first grew 15° past
 * where it was at the warning.
 */
export function firstReaction(inp: Pick<CoachInput, 'samples' | 'events' | 'playerId'>, missileId: EntityId, from: number, to: number): Reaction | null {
  const pts: { t: number; th: ThreatSample }[] = [];
  for (const smp of inp.samples) {
    if (smp.t < from - 0.01 || smp.t > to + 0.01) continue;
    const th = smp.threats.find(x => x.id === missileId);
    if (th) pts.push({ t: smp.t, th });
  }
  let k = -1;
  for (let i = 0; i + 1 < pts.length; i++) if (pts[i].th.offNoseDeg >= 60 && pts[i + 1].th.offNoseDeg >= 60) { k = i; break; }
  if (k < 0) return null;
  const off0 = pts[0].th.offNoseDeg;
  let t = pts[k].t;
  if (off0 < 60) for (let i = 0; i <= k; i++) if (pts[i].th.offNoseDeg >= off0 + 15) { t = pts[i].t; break; }
  let dragN = 0, beamN = 0, above = false;
  for (let i = k; i < pts.length; i++) {
    const o = pts[i].th.offNoseDeg;
    if (o > 120) dragN++; else if (o >= 60) { beamN++; if (pts[i].th.altAbove > 500) above = true; }
  }
  const chaff = inp.events.filter(e => e.type === 'cm' && e.ownerId === inp.playerId && e.what === 'chaff' && e.t >= t - 1 && e.t <= to).length;
  return { t, reachedAt: pts[k].t, how: dragN > beamN ? 'drag' : 'beam', above, chaff };
}

/** Defence against missiles fired at the player. */
function ruleDefence(inp: CoachInput, nm: Namer): CoachItem[] {
  const out: CoachItem[] = [];
  const goods: { s: ShotRecord; r: Reaction; delay: number }[] = [];
  const aboveArh: ShotRecord[] = [];
  for (const s of inp.shots) {
    if (s.targetId !== inp.playerId || !inp.enemies.includes(s.shooterId)) continue;
    if (s.reason === 'target-dead') continue;       // you were already down
    const who = nm.shot(s);
    const end = s.endT ?? inp.endT;
    const killed = s.outcome === 'hit';
    const seeker = MISSILES[s.missile].seeker;
    if (s.warnedAt === null) {
      if (killed) {
        out.push({
          id: `nowarn-${s.id}`, kind: 'note', severity: 2, t: s.t, focus: s.id, title: 'No warning',
          text: `${who} hit you with no warning on the RWR` +
            (seeker === 'ir' ? ': the RWR never shows IR missiles. Inside his IR range, flare early and stay out of his forward cone.' :
              s.radarMode === 'tws' ? ': a TWS Fox 3 is silent until pitbull. Keep your own timeline: be cold before his Rmax.' : '.'),
        });
      }
      continue;
    }
    const warnWord = s.warnKind === 'missile' ? 'it pitbulled' : 'the launch warning';
    const react = firstReaction(inp, s.id, s.warnedAt, end);
    if (!react) {
      out.push({
        id: `nodef-${s.id}`, kind: 'mistake', severity: killed ? 3 : 2, t: s.warnedAt, focus: s.id, title: 'No defence',
        text: killed
          ? `You never went defensive after ${who} ${s.warnKind === 'missile' ? 'pitbulled' : 'launched'} (${secs(end - s.warnedAt)} s before impact): it hit you. Beam it at once, chaff, and go below it.`
          : `You never went defensive against ${who} after ${warnWord}; it ${reasonText(s.reason)} anyway. Next time beam it the moment you see it.`,
      });
      continue;
    }
    const delay = Math.max(0, react.t - s.warnedAt);
    const did = react.how === 'beam' ? 'beamed' : 'turned cold on';
    if (killed) {
      let text: string;
      if (delay > 4) text = `You ${did} ${who} ${secs(delay)} s after ${warnWord}: too late, and it hit you. Start the turn the moment you see it.`;
      else {
        let why: string;
        if (react.how === 'beam' && react.above && seeker === 'arh') why = 'but you stayed above it: in DCS a notch needs ground behind you. Dive below the missile.';
        else if (react.how === 'beam' && react.chaff === 0 && seeker !== 'ir') why = 'but no chaff went out while you were in the beam.';
        else if (react.how === 'drag') why = 'but it still had the energy to catch you: dragging only works from far out.';
        else why = 'but it held on: keep the missile within a few degrees of the beam and keep chaff going.';
        text = `You ${did} ${who} ${secs(delay)} s after ${warnWord}, ${why}`;
      }
      out.push({ id: `deffail-${s.id}`, kind: 'mistake', severity: 3, t: react.t, focus: s.id, title: 'Defence failed', text });
    } else {
      goods.push({ s, r: react, delay });
      if (react.how === 'beam' && react.above && seeker === 'arh' && s.reason !== 'notched' && s.reason !== 'chaff') aboveArh.push(s);
    }
  }
  if (goods.length >= 3) {
    const reasons = new Map<string, number>();
    for (const g of goods) { const k = reasonText(g.s.reason); reasons.set(k, (reasons.get(k) ?? 0) + 1); }
    const beams = goods.filter(g => g.r.how === 'beam').length;
    const d = goods.map(g => g.delay);
    out.push({
      id: 'def-all', kind: 'good', severity: 1, t: goods[0].r.t, focus: goods[0].s.id, title: 'Good defence',
      text: `You defeated ${goods.length} missiles aimed at you (${beams} beamed, ${goods.length - beams} dragged), turning ${secs(Math.min(...d))}–${secs(Math.max(...d))} s after each warning: ` +
        [...reasons].map(([k, n]) => `${n} ${k}`).join(', ') + '.',
    });
  } else {
    for (const g of goods) {
      const warnWord = g.s.warnKind === 'missile' ? 'it pitbulled' : 'the launch warning';
      out.push({
        id: `def-${g.s.id}`, kind: 'good', severity: 1, t: g.r.t, focus: g.s.id, title: g.r.how === 'beam' ? 'Good notch' : 'Good drag',
        text: `You ${g.r.how === 'beam' ? 'beamed' : 'turned cold on'} ${nm.shot(g.s)} ${secs(g.delay)} s after ${warnWord}, and it ${reasonText(g.s.reason)}.`,
      });
    }
  }
  if (aboveArh.length) {
    out.push({
      id: 'above', kind: 'note', severity: 1, t: aboveArh[0].t, focus: aboveArh[0].id, title: 'Beam above the missile',
      text: `You beamed ${aboveArh.length > 1 ? `${aboveArh.length} active missiles` : nm.shot(aboveArh[0])} while above ${aboveArh.length > 1 ? 'them' : 'it'}. In DCS a notch against an active seeker needs ground behind you: dive below the missile.`,
    });
  }
  return out;
}

/** Sitting hot inside a bandit's no-escape range. */
function ruleHotInRne(inp: CoachInput, nm: Namer): CoachItem[] {
  const out: CoachItem[] = [];
  const dt = sampleStep(inp.samples);
  for (const id of inp.enemies) {
    let total = 0, first: number | null = null, rne = 0;
    for (const smp of inp.samples) {
      if (!smp.alive) break;
      const b = smp.bandits.find(x => x.id === id);
      if (!b || !b.alive || b.rne === null || b.defending) continue;
      if (b.range < b.rne && b.offNoseDeg < 35) {
        total += dt;
        if (first === null) { first = smp.t; rne = b.rne; }
      }
    }
    if (total < 10 || first === null) continue;
    const shotAtMe = inp.shots.find(s => s.shooterId === id && s.targetId === inp.playerId && s.t >= first - 1);
    out.push({
      id: `rne-hot-${id}`, kind: 'mistake', severity: shotAtMe ? 2 : 1, t: first, focus: id, title: 'Hot inside his Rne',
      text: `You held a hot aspect inside ${nm.name(id)}'s Rne (about ${nm.range(rne)}) for ${secs(total)} s` +
        (shotAtMe ? ` and he fired ${MISSILES[shotAtMe.missile].name} at you` : '') +
        '. In there you cannot outrun his missile: shoot before his Rne, then crank or turn cold.',
    });
  }
  return out;
}

/** Holding STT long before the shot. */
function ruleEarlyLock(inp: CoachInput, nm: Namer): CoachItem[] {
  const out: CoachItem[] = [];
  if (inp.autoStt) return out;      // FC3 Russian radars lock by themselves at 85 % Rmax, as the shot needs
  let cur: EntityId | null = null, start = 0;
  const flush = (endT: number) => {
    if (!cur) return;
    const firstShot = inp.shots.find(s => s.shooterId === inp.playerId && s.targetId === cur && s.t >= start - 0.5 && s.t <= endT + 0.5);
    const lead = (firstShot?.t ?? endT) - start;
    if (lead >= 20) {
      out.push({
        id: `early-${cur}-${Math.round(start)}`, kind: 'mistake', severity: 1, t: start, focus: cur, title: 'Early lock',
        text: `You held STT on ${nm.name(cur)} for ${secs(lead)} s ${firstShot ? 'before firing' : 'without firing'}: his RWR showed the lock the whole time. ` +
          (inp.twsLaunch ? 'Stay in TWS until the shot.' : 'Lock only when your missile needs it.'),
      });
    }
  };
  for (const smp of inp.samples) {
    const id = smp.alive && smp.radarMode === 'stt' ? smp.sttTarget : null;
    if (id !== cur) { flush(smp.t); cur = id; start = smp.t; }
  }
  flush(inp.endT);
  return out;
}

/** Chaff dropped while no radar missile was on the beam. */
function ruleChaff(inp: CoachInput): CoachItem[] {
  const drops = inp.events.filter(e => e.type === 'cm' && e.ownerId === inp.playerId && e.what === 'chaff');
  if (drops.length < 3) return [];
  let offBeam = 0, idle = 0;
  for (const d of drops) {
    const smp = sampleAt(inp.samples, d.t);
    const radar = (smp?.threats ?? []).filter(x => x.seeker !== 'ir' && x.guidance !== 'ballistic');
    if (!radar.length) { idle++; continue; }
    if (!radar.some(x => x.offNoseDeg >= 55 && x.offNoseDeg <= 125)) offBeam++;
  }
  const out: CoachItem[] = [];
  if (offBeam >= 3 && offBeam >= drops.length / 3) {
    out.push({
      id: 'chaff-offbeam', kind: 'mistake', severity: 1, t: drops[0].t, focus: inp.playerId, title: 'Chaff off the beam',
      text: `${offBeam} of your ${drops.length} chaff bundles went out while no missile was on your beam. Chaff only decoys a seeker while you sit in its notch.`,
    });
  }
  if (idle >= 4 && idle >= drops.length / 2) {
    out.push({
      id: 'chaff-idle', kind: 'note', severity: 1, t: drops[0].t, focus: inp.playerId, title: 'Chaff with nothing in the air',
      text: `${idle} chaff bundles went out with no radar missile in the air. Save them for the notch.`,
    });
  }
  return out;
}

/** TWS silent shots (and STT shots that did not need to be). */
function ruleSilentShot(inp: CoachInput, nm: Namer): CoachItem[] {
  if (!inp.twsLaunch) return [];
  const out: CoachItem[] = [];
  const silent: ShotRecord[] = [];
  for (const s of inp.shots) {
    if (s.shooterId !== inp.playerId || MISSILES[s.missile].seeker !== 'arh' || s.outcome === 'flying') continue;
    if (s.radarMode === 'tws' && s.outcome === 'hit') silent.push(s);
    else if (s.radarMode === 'stt' && s.warnedAt !== null && s.warnedAt - s.t < 3) {
      out.push({
        id: `sttshot-${s.id}`, kind: 'note', severity: 1, t: s.t, focus: s.id, title: 'STT shot',
        text: `${s.label} left from STT: ${nm.name(s.targetId)} saw your lock before the shot. From TWS it would have been silent until pitbull.`,
      });
    }
  }
  if (silent.length) {
    const s = silent[0];
    const warn = s.warnedAt === null ? 'no warning at all' : `no warning until pitbull, ${secs((s.endT ?? inp.endT) - s.warnedAt)} s before impact`;
    out.push({
      id: `silent-${s.id}`, kind: 'good', severity: 1, t: s.t, focus: s.id, title: 'Silent TWS shot',
      text: `${s.label} left from TWS: ${nm.name(s.targetId)} had ${warn}.` +
        (silent.length === 2 ? ' Your other hit was a silent TWS shot too.' : silent.length > 2 ? ` ${silent.length - 1} more hits were silent TWS shots too.` : ''),
    });
  }
  return out;
}

/** Your missile killed a friendly. */
function ruleFratricide(inp: CoachInput, nm: Namer): CoachItem[] {
  const out: CoachItem[] = [];
  for (const e of inp.events) {
    if (e.type !== 'hit') continue;
    const s = inp.shots.find(x => x.id === e.missileId);
    if (!s || s.shooterId !== inp.playerId || !inp.friends.includes(e.targetId)) continue;
    out.push({
      id: `frat-${s.id}`, kind: 'mistake', severity: 3, t: e.t, focus: e.targetId, title: 'Blue on blue',
      text: `${s.label} went active and took ${nm.name(e.targetId)}: an active seeker locks the first jet it finds, friend or foe. Do not shoot into a fight your wingman is in.`,
    });
  }
  return out;
}

/** Death and winchester notes. */
function ruleSummary(inp: CoachInput, nm: Namer): CoachItem[] {
  const out: CoachItem[] = [];
  const death = inp.events.find((e): e is Extract<SimEvent, { type: 'kill' }> => e.type === 'kill' && e.targetId === inp.playerId);
  if (death) {
    const hit = inp.events.find((e): e is Extract<SimEvent, { type: 'hit' }> => e.type === 'hit' && e.targetId === inp.playerId && Math.abs(e.t - death.t) < 0.5);
    const s = hit ? inp.shots.find(x => x.id === hit.missileId) : undefined;
    out.push({
      id: 'death', kind: 'note', severity: 3, t: death.t, focus: s?.id ?? inp.playerId, title: 'Shot down',
      text: s
        ? `${fmtTime(death.t)}: ${nm.shot(s)} hit you. Fired at ${nm.range(s.range)}${launchHow(s)}, ${secs(death.t - s.t)} s of flight.`
        : `${fmtTime(death.t)}: you were shot down by ${nm.name(death.by)}.`,
    });
  }
  const alive = inp.enemies.filter(id => !inp.events.some(e => e.type === 'kill' && e.targetId === id));
  const mine = inp.shots.filter(s => s.shooterId === inp.playerId);
  if (!death && inp.playerMissilesLeft === 0 && alive.length && mine.length) {
    const hits = mine.filter(s => s.outcome === 'hit').length;
    out.push({
      id: 'winchester', kind: 'note', severity: 2, t: mine[mine.length - 1].t, focus: inp.playerId, title: 'Winchester',
      text: `You ran out of missiles with ${alive.length} bandit${alive.length > 1 ? 's' : ''} still flying: ${mine.length} shots, ${hits} hit${hits === 1 ? '' : 's'}. Fewer, closer shots.`,
    });
  }
  return out;
}

/** SAM sites: shot down by one, or broke its track. Reads the 'sam' events (sites have no ShotRecord). */
export function ruleSam(inp: CoachInput, nm: Namer): CoachItem[] {
  const out: CoachItem[] = [];
  const mine = inp.events.filter((e): e is Extract<SimEvent, { type: 'sam' }> => e.type === 'sam' && e.targetId === inp.playerId);
  const death = inp.events.find((e): e is Extract<SimEvent, { type: 'kill' }> => e.type === 'kill' && e.targetId === inp.playerId);
  const sites = [...new Set(mine.map(e => e.siteId))];
  for (const id of sites) {
    const ev = mine.filter(e => e.siteId === id);
    const launch = ev.find(e => e.what === 'launch');
    const broke = ev.find(e => e.what === 'lost' && (e.why === 'notched' || e.why === 'chaff' || e.why === 'terrain' || e.why === 'horizon'));
    if (death && death.by === id) {
      out.push({
        id: `sam-death-${id}`, kind: 'mistake', severity: 3, t: death.t, focus: inp.playerId, title: 'SAM kill',
        text: `The ${nm.name(id)} site shot you down${launch?.range ? `, launched at ${nm.range(launch.range)}` : ''}. Stay outside its ring, get low behind terrain, or beam the site and chaff at the lock.`,
      });
    } else if (launch && broke) {
      out.push({
        id: `sam-break-${id}`, kind: 'good', severity: 2, t: broke.t, focus: inp.playerId, title: 'SAM defeated',
        text: `You broke the ${nm.name(id)} track (${broke.why}) after its launch at ${nm.range(launch.range ?? null)}: its missile went ballistic.`,
      });
    } else if (launch) {
      out.push({
        id: `sam-launch-${id}`, kind: 'note', severity: 1, t: launch.t, focus: inp.playerId, title: 'SAM launch',
        text: `The ${nm.name(id)} site fired at you at ${nm.range(launch.range ?? null)} and you survived. Watch its ring: a lock inside it means a launch is seconds away.`,
      });
    }
  }
  return out;
}

/** How a shot at you left, in the words that matter for the defence. */
function launchHow(s: ShotRecord): string {
  const seeker = MISSILES[s.missile].seeker;
  if (seeker === 'ir') return ' (IR: nothing on the RWR)';
  if (seeker === 'arh' && s.radarMode === 'tws') return ' in TWS (silent until pitbull)';
  if (s.radarMode === 'stt') return ' from STT';
  return '';
}

function playerDeath(inp: CoachInput): number | null {
  const e = inp.events.find(x => x.type === 'kill' && x.targetId === inp.playerId);
  return e ? e.t : null;
}

/** Mistakes and serious notes first (worst first), then what went well, then minor notes. */
function rank(i: CoachItem): number {
  if (i.kind === 'mistake') return i.severity * 10 + 5;
  if (i.kind === 'note') return i.severity >= 2 ? i.severity * 10 : -1;
  return 0;
}

/** Every coaching item for a sortie, worst first (see rank()). */
export function coachSortie(inp: CoachInput): CoachItem[] {
  const nm = new Namer(inp);
  const items = [
    ...ruleSupportLost(inp, nm), ...ruleShotQuality(inp, nm), ...ruleCrank(inp, nm), ...ruleDefence(inp, nm),
    ...ruleHotInRne(inp, nm), ...ruleEarlyLock(inp, nm), ...ruleChaff(inp), ...ruleSilentShot(inp, nm),
    ...ruleFratricide(inp, nm), ...ruleSummary(inp, nm), ...ruleSam(inp, nm),
  ];
  return items.sort((a, b) => rank(b) - rank(a) || (a.t ?? 1e9) - (b.t ?? 1e9));
}

// ───────────────────────────────────────────────────────────── shot table

export interface ShotRow {
  id: EntityId;
  title: string;          // 'M1 · AIM-120C → Bandit-1'
  outcome: string;        // 'HIT' / 'MISS · NOTCHED' / 'IN FLIGHT'
  tone: 'ok' | 'warning' | 'dim' | 'caution';
  launch: string;         // '38 nm · 0.82 Rmax · outside Rne (22 nm)'
  mode: string;           // 'TWS' / 'STT'
  aspect: string;         // 'hot (12°)'
  fPole: string;          // '14 nm' / '--'
  warning: string;        // 'none until pitbull, 18 s before impact'
  flight: string;         // '52 s'
}

/** One debrief row per shot, in pilot words. */
export function describeShot(s: ShotRecord, inp: Pick<CoachInput, 'names' | 'playerId' | 'units' | 'endT'>, modeLabel: (shooter: EntityId, mode: RadarModeId) => string = (_, m) => m.toUpperCase()): ShotRow {
  const nm = new Namer(inp);
  const spec = MISSILES[s.missile];
  const shooter = s.shooterId === inp.playerId ? 'You' : nm.name(s.shooterId);
  const title = `${s.shooterId === inp.playerId ? s.label + ' · ' : shooter + ' · '}${spec.name} → ${nm.name(s.targetId)}`;
  const outcome = s.outcome === 'hit' ? 'HIT' : s.outcome === 'miss' ? `MISS · ${(s.reason ?? '').toUpperCase().replace('-', ' ')}` : 'IN FLIGHT';
  const tone: ShotRow['tone'] = s.outcome === 'hit' ? (s.side === 'blue' ? 'ok' : 'warning') : s.outcome === 'miss' ? 'dim' : 'caution';
  let launch = nm.range(s.range);
  if (s.range !== null && s.rmax) {
    launch += ` · ${ratio(s.range, s.rmax)} Rmax`;
    if (s.rne !== null) launch += s.range <= s.rne ? ` · inside Rne (${nm.range(s.rne)})` : ` · outside Rne (${nm.range(s.rne)})`;
  }
  const end = s.endT ?? inp.endT;
  let warning: string;
  if (s.warnedAt === null) warning = spec.seeker === 'ir' ? 'none (RWR does not see IR missiles)' : 'none';
  else if (s.warnKind === 'missile') warning = `none until pitbull, ${secs(end - s.warnedAt)} s before ${s.outcome === 'hit' ? 'impact' : 'the end'}`;
  else warning = `launch warning ${secs(s.warnedAt - s.t)} s after launch, ${secs(end - s.warnedAt)} s of warning`;
  return {
    id: s.id, title, outcome, tone, launch,
    mode: modeLabel(s.shooterId, s.radarMode),
    aspect: s.targetAspectDeg === null ? '--' : `${aspectWord(s.targetAspectDeg)} (${Math.round(s.targetAspectDeg)}°)`,
    fPole: s.outcome === 'flying' ? '--' : nm.range(s.fPole),
    warning,
    flight: `${secs(end - s.t)} s`,
  };
}

// ───────────────────────────────────────────────────────────── score

const SKILL_MULT: Record<AiSkill, number> = { rookie: 0.7, regular: 1, veteran: 1.25, ace: 1.5 };
const SCENARIO_MULT = { '1v1': 1, '1v2': 1.3, '2v2': 1.1 } as const;
export type ScenarioId = keyof typeof SCENARIO_MULT;

/**
 * Trainer score (0 on a loss): your kills, surviving, missile economy, time. Harder AI and being
 * outnumbered multiply it. Only a win is saved as a best.
 */
export function scoreSortie(inp: CoachInput, result: SortieResult, skill: AiSkill, scenario: ScenarioId): { score: number; parts: { label: string; value: number }[] } {
  const mine = inp.shots.filter(s => s.shooterId === inp.playerId);
  const kills = inp.events.filter(e => e.type === 'kill' && inp.enemies.includes(e.targetId) && mine.some(s => s.outcome === 'hit' && s.targetId === e.targetId && Math.abs((s.endT ?? -99) - e.t) < 0.5)).length;
  const alive = !inp.events.some(e => e.type === 'kill' && e.targetId === inp.playerId);
  const hits = mine.filter(s => s.outcome === 'hit' && inp.enemies.includes(s.targetId ?? '')).length;
  const parts = [
    { label: 'Your kills', value: kills * 300 },
    { label: 'Survived', value: alive ? 200 : 0 },
    { label: 'Missile economy', value: mine.length ? Math.round((200 * hits) / mine.length) : 0 },
    { label: 'Time', value: result.outcome === 'win' ? Math.round(100 * Math.max(0, 1 - result.t / 480)) : 0 },
  ];
  const raw = parts.reduce((a, p) => a + p.value, 0);
  const score = result.outcome === 'loss' ? 0 : Math.round(raw * SKILL_MULT[skill] * SCENARIO_MULT[scenario]);
  return { score, parts };
}
