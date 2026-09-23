/**
 * [OWNER: page-flight-ops] Lesson steps and captions for the pattern and landing page. Numbers come from
 * FLIGHT_OPS (src/data/flightOps.ts); anything with `verified: false` is flagged by the page.
 */
import type { FlightOpsJetData, DemoLeg, Sourced } from '../../sim/flightOps';
import type { StepId } from './logic';

export interface LessonStep { id: StepId; text: string; keys?: string; note?: string }

const unv = (s: Sourced<unknown>) => (s.verified ? '' : ' (not verified)');

export function lessonSteps(d: FlightOpsJetData): LessonStep[] {
  const p = d.pattern;
  const band = d.aoa.band.value;
  const unit = d.aoa.unit === 'deg' ? '°' : ' units';
  const cfgKeys = d.flapsWithGear ? d.keys.gear : `${d.keys.gear}, ${d.keys.flaps}`;
  return [
    { id: 'initial', text: `Initial: ${p.initialAltFt.value} ft AGL, ${p.initialKt.value} kt on the runway heading${unv(p.initialAltFt)}` },
    { id: 'break', text: `Break left past the threshold at ${p.breakG.value} g${unv(p.breakG)}`, note: p.breakG.note },
    {
      id: 'configure',
      text: d.flapsWithGear
        ? `Below ${p.gearMaxKt.value} kt: gear down. The flaps follow the gear${unv(p.gearMaxKt)}`
        : `Below ${p.gearMaxKt.value} kt: gear down, flaps ${d.flapLabels[d.landingFlap]}${unv(p.gearMaxKt)}`,
      keys: cfgKeys,
    },
    { id: 'abeam', text: `Downwind ${p.downwindAltFt.value} ft, ${p.abeamNm.value} nm abeam the aim point${unv(p.abeamNm)}` },
    { id: 'onspeed', text: `Fly on-speed AoA with the throttle: ${band[0]}–${band[1]}${unit}`, keys: 'Num+ / Num-' },
    { id: 'groove', text: `Aim with the flight path marker on the ${d.glideDeg.value}° line: ${d.hudCue}` },
    { id: 'touchdown', text: `Touch down in the zone around the aim point, ${d.aimPointFt.value} ft past the threshold${unv(d.aimPointFt)}` },
  ];
}

/** Caption for the demo leg (Watch mode). */
export function legCaption(leg: DemoLeg | null, d: FlightOpsJetData): { text: string; why: string } {
  const p = d.pattern;
  switch (leg) {
    case 'initial': return { text: `Initial at ${p.initialAltFt.value} ft, ${p.initialKt.value} kt.`, why: 'Clean, on the runway heading. Break 5–10 s past the threshold.' };
    case 'break': return { text: `Break: roll left, pull ${p.breakG.value} g.`, why: d.id === 'f16c' ? 'Speed brake out, about 70° bank. Roll out on downwind.' : 'Level turn to downwind. The g bleeds the speed below the gear limit.' };
    case 'downwind': return {
      text: `Downwind ${p.downwindAltFt.value} ft, ${p.abeamNm.value} nm abeam.`,
      why: d.flapsWithGear ? `Below ${p.gearMaxKt.value} kt: gear down. Trim to on-speed AoA.` : `Below ${p.gearMaxKt.value} kt: gear down, flaps ${d.flapLabels[d.landingFlap]}. Trim to on-speed AoA.`,
    };
    case 'turn': return { text: 'Abeam the aim point: start the descending turn.', why: 'Hold on-speed AoA with the throttle. Roll out on the centreline.' };
    case 'final': return { text: `Final: flight path marker on the ${d.glideDeg.value}° line.`, why: `${d.hudCue}. Stick moves the marker, throttle holds the AoA.` };
    case 'rollout': return { text: 'Touchdown. Idle, brakes, hold the centreline.', why: 'The debrief grades each gate and the final.' };
    default: return { text: 'Press Start.', why: 'The demo flies the full overhead pattern.' };
  }
}
