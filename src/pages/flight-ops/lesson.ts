/**
 * [OWNER: page-flight-ops] Lesson steps and captions for the pattern and landing page. Numbers come from
 * FLIGHT_OPS (src/data/flightOps.ts); anything with `verified: false` is flagged by the page. Pattern numbers
 * are shown in the app's units.
 */
import type { Units } from '../../app/format';
import type { FlightOpsJetData, DemoLeg, NavState, Sourced } from '../../sim/flightOps';
import { altFtText, flapControl, ktText, navPicture, stepOrder, type StepId } from './logic';

export interface LessonStep { id: StepId; text: string; keys?: string; note?: string }

const unv = (s: Sourced<unknown>) => (s.verified ? '' : ' (not verified)');
const navLabel = (d: FlightOpsJetData, id: 'route' | 'return' | 'landing') => d.nav?.modes.find(m => m.id === id)?.label ?? null;

function configureText(d: FlightOpsJetData, u: Units): string {
  const lim = ktText(d.pattern.gearMaxKt.value, u);
  const fc = flapControl(d);
  return fc === 'with-gear' ? `Below ${lim}: gear down. The flaps follow the gear${unv(d.pattern.gearMaxKt)}`
    : fc === 'none' ? `Below ${lim}: gear down. No flap selector${unv(d.pattern.gearMaxKt)}`
      : `Below ${lim}: gear down, flaps ${d.flapLabels[d.landingFlap]}${unv(d.pattern.gearMaxKt)}`;
}

/** Steps for the jet and start. `rtb` = the return-to-base start (jets with nav data only). */
export function lessonSteps(d: FlightOpsJetData, u: Units = 'imperial', rtb = false): LessonStep[] {
  const p = d.pattern;
  const band = d.aoa.band.value;
  const unit = d.aoa.unit === 'deg' ? '°' : ' units';
  const fc = flapControl(d);
  const cfgKeys = fc === 'selector' ? `${d.keys.gear}, ${d.keys.flaps}` : d.keys.gear;
  const byId: Partial<Record<StepId, LessonStep>> = {
    initial: { id: 'initial', text: `Initial: ${altFtText(p.initialAltFt.value, u)} AGL, ${ktText(p.initialKt.value, u)} on the runway heading${unv(p.initialAltFt)}` },
    break: { id: 'break', text: `Break left past the threshold at ${p.breakG.value} g${unv(p.breakG)}`, note: p.breakG.note },
    configure: { id: 'configure', text: configureText(d, u), keys: cfgKeys },
    abeam: { id: 'abeam', text: `Downwind ${altFtText(p.downwindAltFt.value, u)}, ${p.abeamNm.value} nm abeam the aim point${unv(p.abeamNm)}` },
    onspeed: { id: 'onspeed', text: `Fly on-speed AoA with the throttle: ${band[0]}–${band[1]}${unit}`, keys: 'Num+ / Num-' },
    groove: { id: 'groove', text: `Aim with the flight path marker on the ${d.glideDeg.value}° line: ${d.hudCue}` },
    touchdown: { id: 'touchdown', text: `Touch down in the zone around the aim point, ${altFtText(d.aimPointFt.value, u)} past the threshold${unv(d.aimPointFt)}` },
  };
  const nav = d.nav;
  if (rtb && nav) {
    const key = nav.keys.modeCycle.value;
    const ret = navLabel(d, 'return'), route = navLabel(d, 'route') ?? 'NAV', land = navLabel(d, 'landing') ?? 'landing mode';
    const icptDist = u === 'metric' ? `${nav.interceptPointM.value / 1000} km` : `${(nav.interceptPointM.value / 1852).toFixed(1)} nm`;
    const icptAlt = u === 'metric' ? `${nav.interceptAltM.value} m` : `${Math.round(nav.interceptAltM.value / 0.3048 / 10) * 10} ft`;
    byId.navmode = ret
      ? { id: 'navmode', text: `Press ${key} until ${ret}: the system steers to the glide-slope intercept point`, keys: key, note: nav.keys.modeCycle.note }
      : { id: 'navmode', text: `${route} on ${key}, steer point IAF (the glide-slope intercept point)`, keys: key };
    byId.steer = { id: 'steer', text: `Fly the steering: bearing pointer on the nose, command altitude, to ${icptDist} out at ${icptAlt}${unv(nav.interceptPointM)}` };
    byId.glidepath = nav.autoLandingSwitch.value
      ? { id: 'glidepath', text: `${land} comes up at the intercept point. Centre the bars; the tower calls above, below, on glide path${unv(nav.autoLandingSwitch)}` }
      : { id: 'glidepath', text: `At the IAF press ${key} for ${land}: ${nav.cues.join(' / ')} until the cue clears`, keys: key };
  }
  return stepOrder(rtb && !!nav).map(id => byId[id]!).filter(Boolean);
}

/** Caption for the demo leg (Watch mode). `nav` is the live nav picture on the return-to-base legs. */
export function legCaption(leg: DemoLeg | null, d: FlightOpsJetData, u: Units = 'imperial', nav?: NavState, heading = 0): { text: string; why: string } {
  const p = d.pattern;
  const fc = flapControl(d);
  const cfg = fc === 'selector' ? `gear down, flaps ${d.flapLabels[d.landingFlap]}` : 'gear down';
  switch (leg) {
    case 'nav': {
      if (!nav) return { text: 'Return to base.', why: 'Follow the steering.' };
      const pic = navPicture(nav, heading, u);
      const next = d.nav?.autoLandingSwitch.value ? `${navLabel(d, 'landing')} comes up at the intercept point.` : `Select ${navLabel(d, 'landing') ?? 'landing mode'} at the IAF.`;
      return { text: `${pic.mode}: steering to ${pic.point}, ${pic.dist}.`, why: `Bearing pointer on the nose${pic.cmdAlt ? `, hold ${pic.cmdAlt}` : ''}. ${next}` };
    }
    case 'approach': return {
      text: `${nav?.label ?? 'Landing mode'}: join the glide path from below.`,
      why: `${d.nav?.cues.includes('GSUP') ? 'GSUP / GSDN on the HUD' : 'The tower calls above, below, on glide path'}. Configure below ${ktText(p.gearMaxKt.value, u)}.`,
    };
    case 'initial': return { text: `Initial at ${altFtText(p.initialAltFt.value, u)}, ${ktText(p.initialKt.value, u)}.`, why: 'Clean, on the runway heading. Break 5–10 s past the threshold.' };
    case 'break': return { text: `Break: roll left, pull ${p.breakG.value} g.`, why: d.id === 'f16c' ? 'Speed brake out, about 70° bank. Roll out on downwind.' : 'Level turn to downwind. The g bleeds the speed below the gear limit.' };
    case 'downwind': return {
      text: `Downwind ${altFtText(p.downwindAltFt.value, u)}, ${p.abeamNm.value} nm abeam.`,
      why: `Below ${ktText(p.gearMaxKt.value, u)}: ${cfg}${fc === 'with-gear' ? '; the flaps follow' : ''}. Trim to on-speed AoA.`,
    };
    case 'turn': return { text: 'Abeam the aim point: start the descending turn.', why: 'Hold on-speed AoA with the throttle. Roll out on the centreline.' };
    case 'final': return { text: `Final: flight path marker on the ${d.glideDeg.value}° line.`, why: `${d.hudCue}. Stick moves the marker, throttle holds the AoA.` };
    case 'rollout': return { text: 'Touchdown. Idle, brakes, hold the centreline.', why: 'The debrief grades each gate and the final.' };
    default: return { text: 'Press Start.', why: d.nav ? 'The demo flies the overhead pattern, or the return to base.' : 'The demo flies the full overhead pattern.' };
  }
}
