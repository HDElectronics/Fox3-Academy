/**
 * Missile Lab: turn a flown shot into pilot words. Headline (HIT / MISS · reason), what happened, and a
 * one-line lesson. Pure (no DOM) so it is unit-tested.
 */
import type { Dlz } from '../../sim/types';
import { shotHits, type ShotResult } from '../../sim/dlz';
import { MISSILES } from '../../data';
import { missileModel } from '../../sim/missileModel';
import { irAcquisitionRange } from '../../sim/launch';
import type { Units } from '../../app/format';
import { ASPECT_DEG, fmtAltU, fmtDist, fmtR, toShotSetup, turnCapG, zonePlace, type CueNames, type LabSetup, type PresetId } from './model';

/**
 * Would this shot still hit if he had turned cold and run at launch? One extra flight of the same model,
 * so the lesson says what actually happens instead of reading it off the table's Rne.
 */
export function hitsIfColdAtLaunch(setup: LabSetup): boolean {
  return shotHits(toShotSetup({ ...setup, maneuver: 'turn-cold', reactAfter: 0 })).hit;
}

export type Tone = 'ok' | 'caution' | 'warning' | 'hi' | 'dim';

export interface ShotSummary {
  hit: boolean;
  /** 'HIT' or 'MISS · OUT OF ENERGY'. */
  headline: string;
  /** What happened, one or two sentences. */
  what: string;
  /** The one-line lesson. */
  lesson: string;
  /** Extra cockpit note (no shoot cue here, inside Rmin...). */
  cueNote: string | null;
  tone: Tone;
  /** Mach and altitude at the end of the flight (impact or give-up). */
  endMach: number;
  endAlt: number;
  peakMach: number;
  /** g the missile could still pull at the end. */
  endG: number;
  /** Missile to target at the end (m). */
  endRange: number;
}

const man = (m: LabSetup['maneuver']) => ({
  none: 'flew straight', 'turn-cold': 'turned cold', beam: 'beamed', crank: 'cranked', 'notch-chaff': 'notched',
}[m]);

export function reasonHeadline(reason: string, ir: boolean): string {
  switch (reason) {
    case 'hit': return 'HIT';
    case 'kinematic': return 'MISS · OUT OF ENERGY';
    case 'timeout': return 'MISS · BATTERY DEAD';
    case 'notched': return 'MISS · NOTCHED';
    case 'chaff': return 'MISS · CHAFF';
    case 'flare': return 'MISS · FLARE';
    case 'overshoot': return 'MISS · OUT-TURNED';
    case 'no-acquisition': return ir ? 'MISS · NO LOCK' : 'MISS · NOTHING AT PITBULL';
    case 'ground': return 'MISS · GROUND';
    case 'lost-guidance': return 'MISS · LOST GUIDANCE';
    case 'target-dead': return 'MISS · TARGET GONE';
    default: return 'MISS';
  }
}

export function summarize(setup: LabSetup, r: ShotResult, dlz: Dlz, cues: CueNames, u: Units): ShotSummary {
  const spec = MISSILES[setup.missile];
  const name = spec.name;
  const last = r.trace[r.trace.length - 1] ?? { missileMach: 0, missileAlt: setup.shooterAlt, range: setup.range, t: 0 };
  const endMach = r.hit && r.impactMach !== null ? r.impactMach : last.missileMach;
  const endAlt = last.missileAlt;
  const peakMach = r.trace.reduce((m, s) => Math.max(m, s.missileMach), 0);
  const endG = turnCapG(setup.missile, endMach, endAlt);
  const endRange = r.hit ? 0 : last.range;
  const tof = r.timeOfFlight;
  const ir = spec.seeker === 'ir';
  const sarh = r.trace[0]?.guidance === 'sarh' || spec.seeker === 'sarh';
  const react = setup.reactAfter;
  const place = zonePlace(setup.range, dlz);
  const M = (v: number) => 'Mach ' + v.toFixed(1);
  const rne = `${cues.rne} (${fmtR(dlz.rne, u)})`;
  const rmax = `${cues.rmax} (${fmtR(dlz.rmax, u)})`;
  const reactTxt = react > 0 ? `${Math.round(react)} s after launch` : 'at launch';

  let what = '';
  let lesson = '';
  if (r.hit) {
    what = `${name} hit after ${Math.round(tof)} s at Mach ${endMach.toFixed(2)}.`;
    if (setup.maneuver === 'turn-cold') {
      lesson = place === 'nez'
        ? `Inside ${rne}: he turned cold ${reactTxt} and still could not outrun it.`
        : `He turned cold ${reactTxt}, but the missile still had the energy to run him down.`;
    } else if (setup.maneuver === 'none') {
      const coldHits = hitsIfColdAtLaunch(setup);
      if (place === 'nez') {
        lesson = coldHits
          ? `Inside ${rne}: even a turn to cold at launch would not have saved him.`
          : `Inside ${rne} by the table, yet a turn to cold at launch would have beaten this one. The marks are estimates: leave some margin.`;
      } else {
        lesson = coldHits
          ? `He flew straight. Here even a turn to cold at launch would not have saved him, though the shot was outside ${rne}.`
          : `He flew straight. A turn to cold at launch would have beaten it: the shot was outside ${rne}.`;
      }
    } else if (setup.maneuver === 'crank') {
      lesson = 'A crank only slows the closure; on its own it does not defeat a missile with energy.';
    } else if (ir) {
      lesson = setup.maneuver === 'beam'
        ? 'He beamed without flares. An IR seeker does not care about the Doppler notch; only flares and distance beat it.'
        : 'He beamed, dived and dropped flares, but the seeker held him this time.';
    } else {
      lesson = setup.maneuver === 'beam'
        ? 'He beamed, but did not sit in the Doppler notch long enough (a few degrees off, or no ground behind him).'
        : 'He beamed, dived and dropped chaff, but the seeker held him: the notch was not clean enough for the chaff to work.';
    }
    if (endMach < 1.5 && setup.maneuver !== 'none') lesson += ` It arrived slow (${M(endMach)}, about ${Math.round(endG)} g left).`;
  } else {
    const short = fmtDist(endRange, u);
    switch (r.reason) {
      case 'kinematic':
        what = `${name} ran out of energy ${short} short of the target after ${Math.round(tof)} s.`;
        if (setup.maneuver === 'turn-cold') lesson = `Target turned cold ${reactTxt}: the missile arrived at ${M(endMach)} and could not close the gap.`;
        else if (ASPECT_DEG[setup.aspect] >= 135) lesson = `A cold target runs away from the missile: the zone against him is far shorter than head-on (${rmax} here).`;
        else if (place === 'beyond-rmax') lesson = cues.cueSimplified
          ? `Beyond ${rmax}: the shot was past the ${cues.rmax} mark on your scale.`
          : `Beyond ${rmax}: there would have been no ${cues.cue} cue for this shot.`;
        else if (setup.shooterAlt < 5000) lesson = `Thick air at ${fmtAltU(setup.shooterAlt, u)} bleeds the missile's energy. The same shot from higher reaches further.`;
        else if (setup.maneuver === 'crank') lesson = 'His crank cut the closure and stretched the chase past the missile\'s energy. Shoot closer against a defending target.';
        else if (setup.maneuver !== 'none') lesson = `He ${man(setup.maneuver)} ${reactTxt}: chasing him across his path used up the missile's energy${r.pitbull ? '' : ' before it ever went active'}. Shoot closer so it arrives before his defence does.`;
        else lesson = 'Shoot closer, higher or faster.';
        break;
      case 'timeout':
        what = `${name} was still flying after ${Math.round(tof)} s but its battery ran out.`;
        lesson = `In DCS the ${name} guides for about ${Math.round(missileModel(setup.missile).maxTimeS)} s. A long shot at a running target runs the clock out.`;
        break;
      case 'notched':
        what = `He put the missile on his beam and the seeker lost him in the Doppler notch.`;
        lesson = 'A notch works when he holds the beam within a few degrees with the ground behind him. Look-up shots are much harder to notch.';
        if (sarh) lesson += ' Against a SARH shot, beaming your radar breaks the lock the same way.';
        break;
      case 'chaff':
        what = `The seeker locked a chaff bundle while he sat in the notch.`;
        lesson = `Chaff only works in the notch. The ${name}'s chaff factor here is ${spec.chaffSusceptibility.toFixed(2)} (higher is easier to decoy).`;
        break;
      case 'flare':
        what = 'The seeker took a flare.';
        lesson = 'Flares work best out of afterburner and in bursts. Shoot again closer, so the seeker has less time to be fooled.';
        break;
      case 'overshoot':
        what = `It tracked to the end but could not turn with him: ${M(endMach)} with about ${Math.round(endG)} g left.`;
        lesson = setup.maneuver === 'turn-cold'
          ? `Target turned cold ${reactTxt}: the missile arrived at ${M(endMach)} and could not pull lead.`
          : `His last turn needed more g than the slow missile had left. Energy at the end decides the endgame.`;
        break;
      case 'no-acquisition':
        what = ir ? 'The seeker never found him.' : 'The seeker went active and found nothing in its cone.';
        lesson = 'He moved far from where the missile expected him before pitbull.';
        break;
      case 'lost-guidance':
        what = 'The shooter lost radar support and the missile could not continue homing.';
        lesson = 'Semi-active shots need the shooter’s lock to impact. Beam the shooter and hold the notch to break that support.';
        break;
      case 'ground':
        what = 'It flew into the ground.';
        lesson = 'Low shots at a diving target end in the dirt.';
        break;
      default:
        what = `${name} missed (${r.reason}).`;
        lesson = 'Shoot closer, higher or faster.';
    }
  }

  let cueNote: string | null = null;
  const acq = ir ? irAcquisitionRange(setup.missile, ASPECT_DEG[setup.aspect] * Math.PI / 180) : Infinity;
  if (place === 'inside-rmin') cueNote = `Inside ${cues.rmin} (${fmtR(dlz.rmin, u)}): too close for a valid shot.`;
  else if (setup.range > acq) cueNote = `No IR lock here in DCS: the seeker sees this aspect only inside about ${fmtR(acq, u)}. No missile launches without that lock.`;
  else if (cues.prFraction !== null && setup.range > cues.prFraction * dlz.rmax) {
    cueNote = `No ${cues.cue} in the cockpit: it lights only inside ${Math.round(cues.prFraction * 100)} % of Rmax (${fmtR(cues.prFraction * dlz.rmax, u)}).`;
  } else if (place === 'beyond-rmax') {
    cueNote = cues.cueSimplified ? `Beyond ${rmax}: past the ${cues.rmax} mark on your scale.` : `Beyond ${rmax}: no ${cues.cue} cue in the cockpit.`;
  } else if (cues.cueInsideRne && place === 'rne-rmax') {
    cueNote = `No ${cues.cue} in the cockpit yet: it shows only inside ${rne}.`;
  }

  return {
    hit: r.hit, headline: reasonHeadline(r.hit ? 'hit' : r.reason, ir), what, lesson, cueNote,
    tone: r.hit ? 'ok' : 'warning', endMach, endAlt, peakMach, endG, endRange,
  };
}

/** A one-line takeaway for a preset once its shots have flown. */
export function presetTakeaway(id: PresetId, shots: { setup: LabSetup; result: ShotResult; sum: ShotSummary }[], u: Units, c: Pick<CueNames, 'rmax' | 'rne'> = { rmax: 'Rmax', rne: 'Rne' }): string {
  const [a, b] = shots;
  const out = (s: { result: ShotResult; sum: ShotSummary }) =>
    s.result.hit ? `hit at Mach ${s.sum.endMach.toFixed(1)}` : `missed (${s.sum.headline.replace('MISS · ', '').toLowerCase()})`;
  const name = a ? MISSILES[a.setup.missile].name : '';
  switch (id) {
    case 'high-fast':
      if (!a || !b) return '';
      return `Same ${name}, same ${fmtR(a.setup.range, u)}: from ${fmtAltU(a.setup.shooterAlt, u)} at M1.2 it ${out(a)}; from ${fmtAltU(b.setup.shooterAlt, u)} at M0.7 it ${out(b)}. Thin air and launch speed are free range.`;
    case 'hot-cold':
      if (!a || !b) return '';
      return `Same ${fmtR(a.setup.range, u)} shot: against the hot target it ${out(a)}; against the cold one it ${out(b)}. A cold target shrinks your zone to a fraction.`;
    case 'rmax-cold':
      if (!a || !b) return '';
      return `At ${c.rmax} it ${out(a)} while he flew on; when he turned cold after ${Math.round(b.setup.reactAfter)} s it ${out(b)}. ${c.rmax} only forces him defensive.`;
    case 'rne':
      if (!a) return '';
      return a.result.hit
        ? `At ${c.rne} he turned cold at launch and ran in afterburner, and it still ${out(a)}. Inside ${c.rne}, running does not save him.`
        : `At ${c.rne} he turned cold at launch and ran, and it ${out(a)}: this time the mark was optimistic. Shoot a little inside it.`;
    case 'loft':
      if (!a || !b) return '';
      return `With its loft the ${name} ${out(a)}; flying flat it ${out(b)}. The climb into thin air is what stretches its long shots.`;
  }
}
