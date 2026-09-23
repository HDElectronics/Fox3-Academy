/**
 * [OWNER: page-flight-ops] Lesson steps and captions for the pattern and landing page. Numbers come from
 * FLIGHT_OPS (src/data/flightOps.ts); anything with `verified: false` is flagged by the page. Pattern numbers
 * are shown in the app's units.
 */
import type { Units } from '../../app/format';
import { SHIPS } from '../../data/ships';
import { CLIMB_ALT_FT, rotateAtKt, targetWire, type FlightOpsJetData, type DemoLeg, type FlightOpsPhase, type NavState, type Sourced } from '../../sim/flightOps';
import { altFtText, flapControl, ktText, navPicture, stepOrder, type LessonKind, type StepId } from './logic';

export interface LessonStep { id: StepId; text: string; keys?: string; note?: string }

const unv = (s: Sourced<unknown>) => (s.verified ? '' : ' (not verified)');
const unvAny = (...s: Sourced<unknown>[]) => (s.every(x => x.verified) ? '' : ' (not verified)');
const navLabel = (d: FlightOpsJetData, id: 'route' | 'return' | 'landing') => d.nav?.modes.find(m => m.id === id)?.label ?? null;

function configureText(d: FlightOpsJetData, u: Units): string {
  const lim = ktText(d.pattern.gearMaxKt.value, u);
  const fc = flapControl(d);
  return fc === 'with-gear' ? `Below ${lim}: gear down. The flaps follow the gear${unv(d.pattern.gearMaxKt)}`
    : fc === 'none' ? `Below ${lim}: gear down. No flap selector${unv(d.pattern.gearMaxKt)}`
      : `Below ${lim}: gear down, flaps ${d.flapLabels[d.landingFlap]}${unv(d.pattern.gearMaxKt)}`;
}

/** Power the takeoff lesson sets: MIL, or MIL then full afterburner. */
const powerText = (d: FlightOpsJetData) => (d.takeoff.afterburner.value ? 'MIL, then full afterburner' : 'MIL');

/** Takeoff steps (#24), per jet: brakes, power, release, rotate, pitch band, gear up, flaps up. */
function takeoffSteps(d: FlightOpsJetData, u: Units): Partial<Record<StepId, LessonStep>> {
  const t = d.takeoff, fc = flapControl(d);
  const [lo, hi] = t.pitchDeg.value;
  const at = rotateAtKt(d), early = t.pullEarlyKt;
  const thrKey = t.keys.throttleMax?.value ?? 'PgUp';
  return {
    brakes: { id: 'brakes', text: `Hold the wheel brakes on ${t.keys.brakes.value}${unv(t.keys.brakes)}`, keys: t.keys.brakes.value, note: t.keys.brakes.note },
    power: { id: 'power', text: `Throttle to ${powerText(d)}, brakes held${unv(t.afterburner)}`, keys: `${thrKey}, Num+`, note: t.afterburner.note },
    release: { id: 'release', text: 'Release the brakes. Hold the centreline with nosewheel steering', keys: 'Left / Right' },
    rotate: early
      ? { id: 'rotate', text: `Pull at ${ktText(at, u)}: Vr ${ktText(t.vrKt.value, u)}, start the pull ${ktText(early.value, u)} early${unv(t.vrKt)}`, keys: 'Down', note: early.note }
      : { id: 'rotate', text: `Rotate at Vr ${ktText(t.vrKt.value, u)}${unv(t.vrKt)}`, keys: 'Down', note: t.vrKt.note },
    pitch: { id: 'pitch', text: `Nose to ${lo}–${hi}°${unv(t.pitchDeg)} and hold it. Tail strike at ${t.tailStrikeDeg.value}°${unv(t.tailStrikeDeg)}`, note: t.tailStrikeDeg.note },
    gearup: { id: 'gearup', text: `Positive climb: gear up before ${ktText(t.gearUpMaxKt.value, u)}${unv(t.gearUpMaxKt)}`, keys: d.keys.gear },
    flapsup: fc === 'with-gear'
      ? { id: 'flapsup', text: 'The flaps follow the gear up' }
      : { id: 'flapsup', text: `Flaps ${d.flapLabels[0]} above ${ktText(t.vrKt.value + 30, u)}`, keys: d.keys.flaps },
  };
}

/** Carrier Case I steps (#26), per jet, numbers from `d.carrier`; unverified numbers are flagged. */
function carrierSteps(d: FlightOpsJetData, u: Units): Partial<Record<StepId, LessonStep>> {
  const c = d.carrier;
  if (!c) return {};
  const p = c.pattern, ship = SHIPS[c.ship];
  const [i0, i1] = p.breakIntervalS.value, [a0, a1] = p.abeamNm.value, [n0, n1] = p.ninetyAltFt.value, [g0, g1] = p.grooveS.value;
  const band = d.aoa.band.value, unit = d.aoa.unit === 'deg' ? '°' : ' units';
  const flaps = flapControl(d) === 'selector' ? `, flaps ${d.flapLabels[d.landingFlap]}` : '';
  const aid = ship.lights === 'iflols' ? 'the ball (IFLOLS)' : 'the Luna-3 light';
  const power = c.touchdownPower.value === 'MIL' ? 'MIL (no afterburner)' : 'max power';
  return {
    initial: { id: 'initial', text: `Initial: 3 nm astern at ${altFtText(p.initialAltFt.value, u)}, ${ktText(p.initialKt.value, u)}, just starboard of the ship on the BRC${p.initialAltFt.verified ? unv(p.initialKt) : unv(p.initialAltFt)}`, note: p.initialAltFt.note },
    break: { id: 'break', text: `Break left before 4 nm ahead of the ramp, ${i0}–${i1} s interval${unv(p.breakIntervalS)}`, note: p.breakIntervalS.note },
    configure: { id: 'configure', text: `Below ${ktText(p.gearFlapsMaxKt.value, u)}: gear down${flaps}, hook down${unvAny(p.gearFlapsMaxKt, c.hookKey)}`, keys: `${d.keys.gear}, ${c.hookKey.value}`, note: c.hookKey.note },
    abeam: { id: 'abeam', text: `Downwind ${altFtText(p.downwindAltFt.value, u)}, ${a0}–${a1} nm abeam the ship${unv(p.abeamNm)}` },
    ninety: { id: 'ninety', text: `The 90: ${altFtText(n0, u)}–${altFtText(n1, u)}, on speed, gear down${unv(p.ninetyAltFt)}`, note: p.ninetyAltFt.note },
    ball: { id: 'ball', text: `Wings level in the groove at ${p.ballNm.value} nm: call ${aid} on ${c.ballCallKey.value}${unvAny(p.ballNm, c.ballCallKey)}`, keys: c.ballCallKey.value, note: c.ballCallKey.note },
    onspeed: { id: 'onspeed', text: `On-speed AoA ${band[0]}–${band[1]}${unit} with the throttle; ${g0}–${g1} s in the groove${unv(p.grooveS)}`, keys: 'Num+ / Num-' },
    trap: { id: 'trap', text: `No flare: fly the ${ship.glideDeg.value}° glide slope${unv(ship.glideDeg)} to the deck, ${power} at touchdown${unv(c.touchdownPower)}, catch the ${targetWire(ship)} wire` },
  };
}

/**
 * Carrier caption for the demo leg (Watch mode) and the Fly coach: what the pilot does next, from the
 * jet's Case I numbers.
 */
export function carrierCaption(leg: DemoLeg | null, d: FlightOpsJetData, u: Units = 'imperial'): { text: string; why: string } {
  const c = d.carrier;
  if (!c) return { text: 'Press Start.', why: 'No carrier data for this jet.' };
  const p = c.pattern, ship = SHIPS[c.ship];
  const aid = ship.lights === 'iflols' ? 'the ball' : 'the Luna-3 light';
  switch (leg) {
    case 'initial': return { text: `Initial: ${altFtText(p.initialAltFt.value, u)}, ${ktText(p.initialKt.value, u)}, starboard side of the ship.`, why: 'On the BRC. Break left once past the bow, before 4 nm.' };
    case 'break': return { text: 'Break left: level turn to downwind.', why: `Hook down. Roll out ${p.abeamNm.value[0]}–${p.abeamNm.value[1]} nm abeam, descend to ${altFtText(p.downwindAltFt.value, u)}.` };
    case 'downwind': return { text: `Downwind ${altFtText(p.downwindAltFt.value, u)}: gear, flaps, hook.`, why: `Below ${ktText(p.gearFlapsMaxKt.value, u)}. Trim on speed. Start the 180 abeam the LSO platform.` };
    case 'turn': return { text: 'The 180: constant bank, on speed.', why: `The 90 at ${altFtText(p.ninetyAltFt.value[0], u)}–${altFtText(p.ninetyAltFt.value[1], u)}. Roll out on the landing centreline, not the ship's.` };
    case 'final': return { text: `In the groove: fly ${aid}.`, why: `Call it at ${p.ballNm.value} nm. ${ship.lights === 'iflols' ? 'Meatball' : 'Light'}, lineup, angle of attack. No flare.` };
    case 'rollout': return { text: 'Trap. Throttle to idle once stopped.', why: 'The debrief shows the LSO grade, the wire and the comments.' };
    case 'bolter': return { text: 'Bolter: power up, fly off the angle.', why: 'Climb ahead and come round for another pass.' };
    default: return { text: 'Press Start.', why: `The demo flies Case I to the ${ship.name}.` };
  }
}

/**
 * Steps for the jet and start. `kind`: 'pattern', 'rtb' (return to base, jets with nav data only) or
 * 'takeoff'; `true` / `false` are the older rtb flag.
 */
export function lessonSteps(d: FlightOpsJetData, u: Units = 'imperial', kind: boolean | LessonKind = false): LessonStep[] {
  if (kind === 'takeoff') { const to = takeoffSteps(d, u); return stepOrder('takeoff', d).map(id => to[id]!); }
  if (kind === 'carrier' || kind === 'groove') { const cs = carrierSteps(d, u); return stepOrder(kind, d).map(id => cs[id]!).filter(Boolean); }
  const rtb = kind === true || kind === 'rtb';
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

/**
 * Caption for the demo leg (Watch mode). `nav` is the live nav picture on the return-to-base legs; `phase`
 * and `speedKt` split the takeoff leg into brakes and roll.
 */
export function legCaption(leg: DemoLeg | null, d: FlightOpsJetData, u: Units = 'imperial', nav?: NavState, heading = 0,
  phase?: FlightOpsPhase, speedKt = 0): { text: string; why: string } {
  const p = d.pattern;
  const fc = flapControl(d);
  const cfg = fc === 'selector' ? `gear down, flaps ${d.flapLabels[d.landingFlap]}` : 'gear down';
  const t = d.takeoff;
  switch (leg) {
    case 'takeoff': {
      if (phase === 'ready') return { text: `Holding the brakes on ${t.keys.brakes.value}, throttle to ${powerText(d)}.`, why: 'Release once the power is set.' };
      const [lo, hi] = t.pitchDeg.value;
      const at = rotateAtKt(d);
      if (speedKt < at) return { text: `Takeoff roll: nosewheel steering on the centreline, pull at ${ktText(at, u)}.`, why: at !== t.vrKt.value ? `Vr ${ktText(t.vrKt.value, u)}; the pull starts ${ktText(t.vrKt.value - at, u)} early.` : `Rotate at Vr ${ktText(t.vrKt.value, u)}.` };
      return { text: `Rotate: nose to ${lo}–${hi}°.`, why: `Hold the attitude; the jet flies off. Tail strike at ${t.tailStrikeDeg.value}°.` };
    }
    case 'climbout': {
      const flaps = fc === 'selector' ? `, then flaps ${d.flapLabels[0]}` : fc === 'with-gear' ? '; the flaps follow' : '';
      return { text: `Positive climb: gear up${flaps}.`, why: `Gear up before ${ktText(t.gearUpMaxKt.value, u)}. Climb at ${ktText(300, u)}, level at ${altFtText(CLIMB_ALT_FT, u)}.` };
    }
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
