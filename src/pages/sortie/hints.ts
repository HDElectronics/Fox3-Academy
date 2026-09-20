/**
 * In-flight coach: one "what to do now + why" line from a snapshot of the fight. Pure (the fly screen
 * builds the snapshot from the World and the radar picture). Priorities, highest first: a missile on
 * you, a launch or lock warning, supporting your own missile, being inside his Rne, the shot, the
 * approach, the search.
 */
import type { RadarModeId, SeekerKind } from '../../data/types';
import { fmtRange, clockCode, type Units } from '../../app/format';
import { D2R } from '../../sim/math';

export type HintTone = 'warning' | 'caution' | 'hi' | 'ok' | 'dim';
export interface Hint { text: string; why: string; tone: HintTone }

export interface HintState {
  units: Units;
  alive: boolean;
  jet: { short: string; hasTws: boolean; twsLaunch: boolean; /** FC3 Russian auto-lock fraction of Rmax, 0 = none. */ autoStt: number; gimbalDeg: number };
  keys: { designate: string | null; launch: string | null; mode: string | null; chaff: string | null; launchHoldS?: number };
  radarMode: RadarModeId;
  weapon: { name: string; seeker: SeekerKind; count: number } | null;
  missilesLeft: number;
  shootCue: boolean;
  /** The launch rules allow the shot although the cue is not lit (M-2000C TIR and JF-17 SHOOT light only inside Rne). */
  inRange?: boolean;
  cueLabel: string;
  blocked: string;
  contacts: number;
  primary: { label: string; range: number; rmax: number | null; rne: number | null } | null;
  /** Top RWR contact (the display's priority threat). bearing rad rel nose (+ right), elevation rad. */
  rwr: { state: 'search' | 'lock' | 'launch' | 'missile'; bearing: number; elevation: number; emitter: string; missile: string | null; seeker: SeekerKind | null } | null;
  /** Your missiles still flying, supported ones first. */
  own: { label: string; guidance: string; tta: number | null; tti: number | null; target: string; targetOffDeg: number | null }[];
  /** Bandits as the AWACS picture gives them (truth). bearing rad rel nose. */
  bandits: { name: string; range: number; bearing: number; alt: number; inRne: boolean; rne: number | null; hot: boolean }[];
  ownAlt: number;
}

const k = (keys: string | null) => (keys ? ` (${keys})` : '');
const deg = (rad: number) => Math.abs(rad / D2R);
const side = (bearing: number) => (bearing >= 0 ? 'right' : 'left');

export function flightHint(s: HintState): Hint {
  const R = (m: number) => fmtRange(m, s.units, m < (s.units === 'metric' ? 10000 : 18520) ? 1 : 0);
  if (!s.alive) return { text: 'You are down. The debrief opens in a moment.', why: 'Watch the replay to see which missile got you and when you could have defended.', tone: 'warning' };

  const r = s.rwr;
  if (r?.state === 'missile') {
    const off = deg(r.bearing);
    const beam = off >= 70 && off <= 110;
    const below = r.elevation < -2 * D2R;
    if (beam && !below) return { text: `Missile on the beam at ${clockCode(r.bearing)}. Now dive below it and keep chaff going${k(s.keys.chaff)}.`, why: 'The seeker loses you in the notch only with ground behind you: be lower than the missile.', tone: 'warning' };
    if (beam) return { text: `Good notch: missile at ${clockCode(r.bearing)}, you are below it. Hold the beam and chaff${k(s.keys.chaff)}.`, why: 'Zero closure plus ground clutter hides you from its Doppler seeker; chaff only works while you sit in the notch.', tone: 'warning' };
    return { text: `Missile active at ${clockCode(r.bearing)}: turn to put it at ${r.bearing >= 0 ? '3' : '9'} o'clock, dive, chaff${k(s.keys.chaff)}. Or press NOTCH.`, why: 'An active seeker needs closure to see you. Beam it and it sees you as ground clutter.', tone: 'warning' };
  }
  if (r?.state === 'launch') {
    if (r.seeker === 'sarh') return { text: `${r.emitter} launched ${r.missile ?? 'a missile'} from ${clockCode(r.bearing)}: notch HIS radar. Put him at ${r.bearing >= 0 ? '3' : '9'} o'clock, dive, chaff.`, why: 'A semi-active shot rides his lock. Break the lock and the missile goes dumb and ignores chaff.', tone: 'warning' };
    return { text: `${r.emitter} launched ${r.missile ?? 'a missile'} from ${clockCode(r.bearing)}. Beam or turn cold now, before it goes active.`, why: 'Distance is life: every second cold or on the beam costs the missile energy.', tone: 'warning' };
  }
  const threatB = s.bandits.find(b => b.inRne && b.hot);
  if (r?.state === 'lock') {
    if ((s.shootCue || s.inRange) && s.primary && s.weapon && s.missilesLeft > 0) {
      const hold = s.keys.launchHoldS ? ` held ${s.keys.launchHoldS} s` : '';
      return {
        text: `${r.emitter} has you locked, and your shot on ${s.primary.label} is valid: fire${s.keys.launch ? ` (${s.keys.launch}${hold})` : ''}, then crank or beam.`,
        why: 'His lock usually means his launch is close. Get your missile off first so he has to defend too.',
        tone: 'caution',
      };
    }
    if (threatB) return { text: `${r.emitter} has you locked and you are inside his Rne. Beam or turn cold now.`, why: `Inside ${R(threatB.rne ?? 0)} his missile runs you down even if you run.`, tone: 'caution' };
    return { text: `${r.emitter} has you locked at ${clockCode(r.bearing)}. A launch may follow.`, why: 'A lock (steady tone) is the step before a launch. Keep your shot timeline, be ready to beam.', tone: 'caution' };
  }

  const sup = s.own.find(m => m.guidance === 'datalink' || m.guidance === 'sarh');
  if (sup) {
    const off = sup.targetOffDeg ?? 0;
    const sarh = sup.guidance === 'sarh';
    const time = sarh ? (sup.tti !== null ? `impact in ${Math.round(sup.tti)} s` : 'hold the lock') : sup.tta !== null ? `active in ${Math.round(sup.tta)} s` : 'on datalink';
    if (off > s.jet.gimbalDeg - 8) return { text: `Easy: ${sup.target} is ${Math.round(off)}° off the nose, gimbal is ±${s.jet.gimbalDeg}°. Turn back toward him.`, why: `Past the gimbal the radar drops him and ${sup.label} loses ${sarh ? 'its illumination' : 'datalink'}.`, tone: 'caution' };
    if (off < 25) return { text: `Crank: put ${sup.target} 40–50° off the nose. ${sup.label} ${time}.`, why: sarh ? 'A Fox 1 needs your lock to impact; cranking slows the closure while you hold it.' : 'Cranking keeps him in your scan while you fly less toward his missiles (bigger F-pole).', tone: 'hi' };
    return { text: `Good crank, hold it. ${sup.label} ${time}.`, why: sarh ? 'Keep the lock until impact: a Fox 1 goes dumb without it.' : 'Keep the track until pitbull; after that the missile needs nothing from you.', tone: 'ok' };
  }
  const act = s.own.find(m => m.guidance === 'active');
  if (act && !threatB) return { text: `${act.label} is pitbull on ${act.target}: it needs nothing from you now. Pump cold or take the next target.`, why: 'Once its own seeker is on, turning away costs the missile nothing and keeps you out of his range.', tone: 'ok' };

  if (threatB && s.missilesLeft > 0 && !s.shootCue) return { text: `You are hot inside ${threatB.name}'s Rne (${R(threatB.rne ?? 0)}). Shoot or turn cold now.`, why: 'Inside his no-escape range a missile from him runs you down even if you turn and run.', tone: 'caution' };
  if (s.missilesLeft === 0) return { text: 'Winchester: nothing left to shoot. Turn cold and extend.', why: 'With no missiles your only job is to survive: keep him behind you and outside his range.', tone: 'caution' };
  if (!s.weapon) return { text: 'Select a missile.', why: 'The launch zone and the shoot cue need a selected weapon.', tone: 'dim' };

  if (s.shootCue && s.primary) {
    const fox1 = s.weapon.seeker === 'sarh';
    const hold = s.keys.launchHoldS ? ` held ${s.keys.launchHoldS} s` : '';
    return {
      text: `${s.cueLabel ? `${s.cueLabel} on` : 'Launch available on'} ${s.primary.label}: fire${s.keys.launch ? ` (${s.keys.launch}${hold})` : ''}.${fox1 ? ' Then hold the lock to impact.' : ''}`,
      why: `${R(s.primary.range)}, Rmax ${s.primary.rmax ? R(s.primary.rmax) : '--'}, Rne ${s.primary.rne ? R(s.primary.rne) : '--'}. Inside Rne he cannot outrun it; near Rmax he can.`,
      tone: 'hi',
    };
  }
  if (s.primary) {
    if (s.inRange) {
      const hold = s.keys.launchHoldS ? ` held ${s.keys.launchHoldS} s` : '';
      return {
        text: `${s.primary.label} in range: you can fire now${s.keys.launch ? ` (${s.keys.launch}${hold})` : ''}. ${s.cueLabel} lights inside Rne${s.primary.rne ? ` (${R(s.primary.rne)})` : ''}.`,
        why: `${R(s.primary.range)}, Rmax ${s.primary.rmax ? R(s.primary.rmax) : '--'}. Outside Rne he can still beam or drag it; closer, or with him hot, it is a surer kill.`,
        tone: 'hi',
      };
    }
    if (s.jet.autoStt && s.radarMode === 'tws') {
      const lockAt = s.primary.rmax ? ` (about ${R(s.primary.rmax * s.jet.autoStt)})` : '';
      return { text: `${s.primary.label} designated: the radar locks him by itself at ${Math.round(s.jet.autoStt * 100)} % of Rmax${lockAt}. Keep closing, high and fast.`, why: 'He hears nothing until the auto-lock; then he gets a lock warning, and your shot is on.', tone: 'dim' };
    }
    if (/lock|STT/i.test(s.blocked) && !s.jet.autoStt) return { text: `Lock ${s.primary.label} for the ${s.weapon.name}: designate again${k(s.keys.designate)}.`, why: s.blocked, tone: 'hi' };
    if (s.primary.rmax && s.primary.range > s.primary.rmax) return { text: `${s.primary.label} at ${R(s.primary.range)}, Rmax ${R(s.primary.rmax)}: keep closing, climb and speed up.`, why: 'Shoot high and fast: altitude and Mach at launch stretch every missile in DCS.', tone: 'dim' };
    return { text: `${s.primary.label} designated. Wait for the shoot cue.`, why: s.blocked || 'The cue lights when the launch rules allow the shot.', tone: 'dim' };
  }
  if (s.contacts > 0) {
    if (s.jet.hasTws && s.radarMode === 'rws') return { text: `Contacts on the scope. Go TWS${k(s.keys.mode)} and designate the nearest${k(s.keys.designate)}.`, why: s.jet.twsLaunch ? 'TWS tracks them without a lock warning, and your Fox 3 can leave from TWS silently.' : 'In TWS you track him without a lock warning until the radar locks for the shot.', tone: 'hi' };
    if (s.jet.autoStt) return { text: `Slew the cursor onto the nearest contact (or click it) and designate${k(s.keys.designate)}: the radar locks by itself at ${Math.round(s.jet.autoStt * 100)} % of Rmax.`, why: 'FC3 Russian radars fire from STT only; СНП keeps him unaware until the auto-lock.', tone: 'hi' };
    return { text: `Designate the nearest contact: click it on the radar${k(s.keys.designate)}.`, why: s.jet.hasTws ? 'Designate first, then the launch zone and cue come up.' : `The ${s.jet.short} has no TWS: you lock (STT) to shoot, and he hears it.`, tone: 'hi' };
  }
  const near = s.bandits.slice().sort((a, b) => a.range - b.range)[0];
  if (near) {
    const off = deg(near.bearing);
    return {
      text: `AWACS: ${near.name} ${off < 10 ? 'on the nose' : `${Math.round(off)}° ${side(near.bearing)}`}, ${R(near.range)}. ${off > 30 ? 'Turn toward him and search.' : 'Search: he will show in a frame or two.'}`,
      why: 'The radar only sees inside its scan: point the nose at him and check the bars cover his altitude.',
      tone: 'dim',
    };
  }
  return { text: 'All bandits are down.', why: 'Splash. The debrief opens in a moment.', tone: 'ok' };
}
