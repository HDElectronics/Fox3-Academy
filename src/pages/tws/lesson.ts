/**
 * [OWNER: page-tws] Words of the lesson, per jet: the step checklist and its done tests, the coach ("NOW"),
 * what each bandit's RWR means, and the end-of-run summary. Everything reads a TwsLesson (no DOM).
 */
import { AIRCRAFT, AIRCRAFT_CAVEATS } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import { RWRS, rwrSymbol } from '../../data/rwr';
import type { AircraftId, MissileId } from '../../data/types';
import type { EntityId, Missile } from '../../sim/types';
import { dlzFor } from '../../sim/dlz';
import { explainDetection, trackOf } from '../../sim/radar';
import { fmtRange, fmtTime } from '../../app/format';
import { R2D, relBearing } from '../../sim/math';
import { MERGE_RANGE_M, type BanditState, type TwsLesson, type Tone } from './drill';
import type { ActBind, JetBinds, PageAct } from './binds';

// ---------------------------------------------------------------------------------------------- keys

/** Key text for an action: the keyboard key, or the HOTAS name when it is click only. */
export function keyText(b: JetBinds, act: PageAct): string {
  const a = b.acts[act];
  if (!a) return '';
  return a.keys ?? a.name;
}

/** Why the page uses its own key for this action (the bind's own note says whether DCS has none or it is unverified). */
export function pageKeyNote(a: ActBind): string {
  return a.note ?? 'No default key in DCS: this page uses the key shown.';
}

/** Short tag for the key list: no DCS default, or a DCS default that research could not confirm. */
export function pageKeyTag(a: ActBind): string {
  return a.note && /not verified/i.test(a.note) ? 'DCS default not verified' : 'no DCS default: page key';
}

/** Step keys + HOTAS note for the checklist. */
function stepKeys(b: JetBinds, act: PageAct, fc3: boolean): { keys?: string; note?: string } {
  const a = b.acts[act];
  if (!a) return {};
  const hold = a.holdS && !/hold/i.test(a.name) ? ` (hold ${a.holdS} s)` : '';
  if (fc3) return { keys: a.keys ?? undefined, note: hold ? `Hold ${a.holdS} s.` : undefined };
  const page = a.source === 'page' ? ` ${pageKeyNote(a)}` : '';
  return { keys: a.keys ?? undefined, note: `${a.name}${hold}.${page}` };
}

/** 'a' or 'an' before a jet or missile name, as a pilot says it: an F-15C, an AIM-120C, an SD-10, a Su-27, a MiG-29S. */
export function article(name: string): string {
  return /^(?:[AEIO]|[FHLMNRSX](?:[-\d]|[A-Z][-\d]))/.test(name) ? 'an' : 'a';
}

// ---------------------------------------------------------------------------------------------- steps

export interface LessonStep {
  id: string;
  text: string;
  keys?: string;
  note?: string;
  done: (L: TwsLesson) => boolean;
}

const twsShots = (L: TwsLesson) => L.flags.shots.filter(s => s.mode === 'tws' && s.seeker === 'arh');
const distinct = (ids: EntityId[]) => new Set(ids).size;
const twsTargets = (L: TwsLesson) => distinct(twsShots(L).map(s => s.targetId));
const twsActiveTargets = (L: TwsLesson) => distinct(twsShots(L).filter(s => L.flags.activeSupported.has(s.missileId)).map(s => s.targetId));

/** The per-jet checklist, from DCS procedures (docs/research). */
export function stepsFor(ac: AircraftId, b: JetBinds): LessonStep[] {
  const spec = AIRCRAFT[ac], fc3 = spec.module === 'fc3';
  const k = (act: PageAct) => stepKeys(b, act, fc3);
  const lbl = spec.radar.modeLabels;
  const cur = b.cursor ? `${b.cursor.up} ${b.cursor.left} ${b.cursor.down} ${b.cursor.right}` : undefined;
  const snap = { keys: cur ?? k('designate').keys, note: `Or click it. ${keyText(b, 'designate')} on the designated track locks him early (Su-27 manual).` };
  switch (ac) {
    case 'su27':
    case 'su33':
      return [
        { id: 'tws', text: `Switch to ${short(lbl.tws)} (TWS)`, ...k('mode'), done: L => L.flags.tws },
        { id: 'des', text: 'Designate one firm track: slew the cursor onto it and it snaps to it', ...snap, done: L => L.flags.des1 },
        { id: 'lock', text: `Close in: at 85 % Rmax ${short(lbl.tws)} locks him by itself (${short(lbl.stt)}). Now he hears it`, done: L => L.flags.locked },
        { id: 'fire', text: 'Fire the R-27ER when ПР shows', ...k('fire'), done: L => L.flags.shots.some(s => s.seeker === 'sarh') },
        { id: 'hold', text: 'Hold the lock until impact: the R-27ER homes on your beam', done: L => L.flags.hits.some(h => h.seeker === 'sarh') },
      ];
    case 'j11a':
      return [
        { id: 'tws', text: `Switch to ${short(lbl.tws)} (TWS)`, ...k('mode'), done: L => L.flags.tws },
        { id: 'des', text: 'Designate one firm track: slew the cursor onto it and it snaps to it', ...snap, done: L => L.flags.des1 },
        { id: 'lock', text: `At 85 % Rmax the radar locks him by itself (${short(lbl.stt)})`, done: L => L.flags.locked },
        { id: 'fire', text: 'Fire an R-77 on ПР', ...k('fire'), done: L => L.flags.shots.some(s => s.type === 'r77') },
        { id: 'hold', text: 'Hold STT until it goes active, about 15 km from him', done: L => L.flags.activeFromLock.size > 0 },
        { id: 'next', text: `Unlock, back to ${short(lbl.tws)}, lock and shoot the next bandit`, ...k('unlock'), done: L => L.flags.relockNext },
      ];
    case 'mig29s':
      return [
        { id: 'snp2', text: `Press ${keyText(b, 'mode')} twice from ОБЗ: СНП2`, ...k('mode'), done: L => L.flags.snp2 },
        { id: 'pair', text: 'Slew the cursor onto the lead; the radar adds Ц2 within 8° of it', keys: cur ?? k('designate').keys, note: 'Or click the lead.', done: L => L.flags.snp2Pair },
        { id: 'ready', text: 'Wait for Ц1 Ц2 and ПР (85 % Rmax on the lead)', done: L => L.flags.snp2Ready },
        { id: 'fire', text: 'Hold the trigger: two R-77s leave, one per target', ...k('fire'), done: L => L.flags.snp2Salvo.length >= 2 },
        { id: 'support', text: 'Stay in СНП2 until both go active, about 15 km from them', done: L => L.flags.snp2Salvo.length >= 2 && L.flags.snp2Salvo.every(id => L.flags.activeSupported.has(id)) },
      ];
    case 'f15c':
      return [
        { id: 'tws', text: 'Switch to TWS: the scan becomes a ±30° window', ...k('mode'), done: L => L.flags.tws },
        { id: 'firm', text: 'Wait for two firm track files', done: L => L.flags.firm2 },
        { id: 'des', text: 'Designate two or more: first Enter = PDT, next ones = SDTs', ...k('designate'), done: L => L.flags.des2 },
        { id: 'fire', text: 'Fire one AIM-120 per designated track: they ripple PDT, SDT…', ...k('fire'), done: L => twsTargets(L) >= 2 },
        { id: 'support', text: 'Keep them in the window until every missile goes active. Never lock anyone', done: L => twsActiveTargets(L) >= 2 },
      ];
    case 'fa18c':
      return [
        { id: 'tws', text: 'Select TWS on the radar format', ...k('mode'), done: L => L.flags.tws },
        { id: 'des', text: 'L&S (star) picks itself; designate a second track for DT2 (diamond)', ...k('designate'), done: L => L.flags.des2 },
        { id: 'fire', text: 'Fire at the L&S on SHOOT', ...k('fire'), done: L => twsShots(L).length >= 1 },
        { id: 'swap', text: 'Undesignate: DT2 becomes L&S. Fire again', ...k('cycle'), done: L => twsTargets(L) >= 2 },
        { id: 'support', text: 'Keep both in the scan until the pyramids show A', done: L => twsActiveTargets(L) >= 2 },
      ];
    case 'f16c':
      return [
        { id: 'tws', text: 'TMS Right held 1 s: TWS', ...k('mode'), done: L => L.flags.tws },
        { id: 'bug', text: 'TMS Up on a track: bug it. The scan shrinks to ±25° 3-bar around it', ...k('designate'), done: L => L.flags.des1 },
        { id: 'fire', text: 'Fire at the bug', ...k('fire'), done: L => twsShots(L).length >= 1 },
        { id: 'step', text: 'Short TMS Right: the bug steps to the next track. Fire again', ...k('cycle'), done: L => twsTargets(L) >= 2 },
        { id: 'support', text: 'Keep the tracks in the scan until A counts out', done: L => twsActiveTargets(L) >= 2 },
      ];
    case 'f14b':
      return [
        { id: 'tws', text: 'TWS through Jester: ±20° 4-bar or ±40° 2-bar', ...k('mode'), done: L => L.flags.tws },
        { id: 'wcs', text: 'The WCS numbers the targets 1–6 by itself (TWS AUTO)', done: L => L.flags.des2 },
        { id: 'fire', text: 'Trigger: one Phoenix at priority 1', ...k('fire'), done: L => twsShots(L).length >= 1 },
        { id: 'next', text: 'Trigger again: the next number, one Phoenix per target', ...k('fire'), done: L => twsTargets(L) >= 2 },
        { id: 'support', text: 'Keep them in the scan until each TTI blinks (active)', done: L => twsActiveTargets(L) >= 2 },
      ];
    case 'jf17':
      return [
        { id: 'tws', text: 'TWS: the INTC default; S2 Left cycles RWS / TWS / VS', ...k('mode'), done: L => L.flags.tws },
        { id: 'hpt', text: 'TDC press on a track: HPT. A bug, not a lock', ...k('designate'), done: L => L.flags.des1 },
        { id: 'spt', text: 'TDC press on a second track: SPT', ...k('designate'), done: L => L.flags.des2 },
        { id: 'fire', text: 'Fire the SD-10 at the HPT on SHOOT', ...k('fire'), done: L => twsShots(L).length >= 1 },
        { id: 'swap', text: 'S2 Left swaps HPT and SPT. Fire again', ...k('cycle'), done: L => twsTargets(L) >= 2 },
        { id: 'support', text: 'Keep both tracks until TOA reaches 0', done: L => twsActiveTargets(L) >= 2 },
      ];
    case 'm2000c':
      return [
        { id: 'find', text: 'RECH: find them. No multi-target TWS in the Mirage', done: L => L.flags.contacts2 },
        { id: 'lock', text: 'Lock one (PSIC). From now on he hears you', ...k('designate'), done: L => L.flags.locked },
        { id: 'fire', text: 'Fire the Super 530D inside the zone', ...k('fire'), done: L => L.flags.shots.some(s => s.type === 's530d') },
        { id: 'hold', text: 'Hold PSIC to impact: the 530D is semi-active', done: L => L.flags.hits.some(h => h.seeker === 'sarh') },
        { id: 'next', text: 'Lock the next and repeat: two 530Ds, two targets', ...k('unlock'), done: L => distinct(L.flags.hits.filter(h => h.seeker === 'sarh').map(h => h.targetId)) >= 2 },
      ];
  }
}

function short(label: string | undefined): string {
  return (label ?? '').replace(/\s*ДВБ$/, '');
}

// ---------------------------------------------------------------------------------------------- jet copy

export interface JetIntro {
  lede: string;
  weaponLine: string;
  /** "Simplified here" lines specific to this lesson and jet. */
  simplified: string[];
}

/** Main radar missile the lesson is about. */
export function mainMissile(ac: AircraftId): MissileId {
  const load = AIRCRAFT[ac].loadout;
  return (load.find(w => MISSILES[w.missile].seeker !== 'ir') ?? load[0]).missile;
}

export function introFor(ac: AircraftId): JetIntro {
  const spec = AIRCRAFT[ac], ms = MISSILES[mainMissile(ac)];
  const tws = spec.radar.tws;
  let lede: string;
  if (ac === 'su27' || ac === 'su33') lede = `No Fox 3 in the ${spec.short}. СНП builds track files silently, but every R-27ER leaves from a lock: watch each bandit's RWR light up from the moment you lock.`;
  else if (ac === 'j11a') lede = 'The only Flanker with a Fox 3, fired from STT only: he hears your lock for the whole midcourse. At pitbull you let go and lock the next. Sequential kills, not simultaneous.';
  else if (ac === 'mig29s') lede = 'СНП2: two R-77s at two targets in one trigger pull, if the pair sits inside the 8° strobe. The one FC3 Russian multi-target shot.';
  else if (ac === 'm2000c') lede = 'No multi-target TWS in the Mirage: every Super 530D is a PSIC lock he hears from the first second to impact. Compare the warning times with a TWS jet.';
  else lede = `One ${ms.name} per bandit, all from TWS. None of them hears a lock: their RWRs show search until each missile goes active.`;
  const how = !tws ? 'no multi-target TWS' : tws.launchFromTws ? `up to ${tws.maxSimultaneousTargets} targets from TWS` : ac === 'mig29s' ? 'two targets in СНП2, else from STT' : 'launch from STT only';
  const weaponLine = `${ms.name} · ${ms.seeker === 'arh' ? 'active, Fox 3' : ms.seeker === 'sarh' ? 'semi-active, Fox 1' : 'infrared, Fox 2'} · ${how}`;
  const simplified = [
    'The four bandits never shoot and fly straight at you. They do not defend against your missiles: press Notch on a card to make one beam you.',
    'Your jet holds its altitude and speed. Guided steering offers Straight, Hot or a crank. Free lab also accepts trainer heading and altitude commands with the arrow keys; these are not DCS stick inputs.',
    'Free lab cursor speed and acquisition gate are trainer approximations. Manual designation is an aid; the optional DCS СНП cursor snap restores automatic acquisition when slewed onto a firm track.',
    'A missile that reaches its target always kills: no Pk roll.',
    'Detection is a range test with a soft edge (DCS AI sensor tables), no PRF or ECM effects.',
  ];
  if (spec.radar.tws?.autoSttAtRmaxFraction) simplified.push(`Enter on the designated track locks him before 85 % Rmax here, as the Su-27 manual says. The MiG-29 and Su-33 manuals say that early lock "will not take place"; which one DCS does today is not verified.`);
  if (ac === 'mig29s') simplified.push('СНП2 uses the shared radar and launch rules. What the two targets\' RWRs show in СНП2 is not documented; here they hear search until pitbull. The bandits fly a tighter wall so a pair fits in the 8° strobe.');
  if (ac === 'j11a' || ac === 'mig29s') simplified.push('A launch warning for an R-77 fired from STT is not verified in DCS; here the target hears a lock until the seeker goes active.');
  if (ac === 'f14b') simplified.push('Jester\'s menu is replaced by the mode buttons, and the 3 s from trigger to missile away is not modelled. This run carries six Phoenix. A PD-STT Phoenix stays semi-active to impact; TWS uses datalink then active, while close shots launch active.');
  if (ac === 'f16c') simplified.push('System Tracks, SAM and DTT are folded into TWS bugging and STT.');
  if (ac === 'fa18c') simplified.push('RAID, EXP and LTWS are not modelled.');
  if (ac === 'm2000c') simplified.push('PSID (single-target track-while-scan) is not modelled.');
  const cav = AIRCRAFT_CAVEATS[ac].find(c => /^Detection/.test(c));
  if (cav) simplified.push(cav);
  return { lede, weaponLine, simplified };
}

/** Another jet worth flying on the same picture, and why. */
export function suggestion(ac: AircraftId): { ac: AircraftId; why: string } {
  switch (ac) {
    case 'su27': case 'su33': return { ac: 'f15c', why: 'same FC3 keys, real multi-target TWS: four AIM-120s and nobody hears a lock' };
    case 'j11a': return { ac: 'mig29s', why: 'СНП2 puts two R-77s on two bandits in one trigger pull' };
    case 'mig29s': return { ac: 'f15c', why: 'four designations and no 8° limit' };
    case 'f15c': return { ac: 'su27', why: 'the other side of the coin: one target at a time, and he hears every lock' };
    case 'm2000c': return { ac: 'f15c', why: 'see how much shorter the warnings get from TWS' };
    default: return { ac: 'su27', why: 'feel what a one-target STT jet gives away in warning time' };
  }
}

// ---------------------------------------------------------------------------------------------- bandit cards

export const STATE_TEXT: Record<BanditState, string> = {
  quiet: 'Quiet', search: 'Search', lock: 'Lock', launch: 'Launch', missile: 'Missile active', dead: 'Splashed',
};

/** Tone of each RWR state's lamp. */
export const STATE_TONE: Record<BanditState, Tone | null> = {
  quiet: null, search: 'dim', lock: 'caution', launch: 'warning', missile: 'warning', dead: null,
};

/** What his RWR type calls you (SPO-15 lamp letter, TEWS symbol …). */
export function rwrLine(L: TwsLesson, id: EntityId): string {
  const b = L.bandit(id);
  if (!b) return '';
  const rwrId = AIRCRAFT[b.type].rwr, rwr = RWRS[rwrId];
  const sym = rwrSymbol(rwrId, L.ac);
  return rwr.kind === 'lamps' ? (sym ? `${sym} lamp` : 'no type lamp') : `"${sym}"`;
}

/** The RWR's own description of the cue for this state (tooltip). */
export function rwrCue(L: TwsLesson, id: EntityId, s: BanditState): string {
  const b = L.bandit(id);
  if (!b || s === 'quiet' || s === 'dead') return '';
  return RWRS[AIRCRAFT[b.type].rwr].cues[s];
}

const secs = (s: number | null | undefined) => (s === null || s === undefined ? '?' : Math.max(0, Math.round(s)).toString());

/** Seconds since this bandit's first lock / launch / missile warning (null = none yet). */
function warnedFor(L: TwsLesson, id: EntityId): number | null {
  const w = L.banditLog.get(id)?.firstWarn;
  return w === null || w === undefined ? null : L.world.t - w;
}

/** One line: why his RWR says what it says. */
export function banditWhy(L: TwsLesson, id: EntityId): string {
  const b = L.bandit(id), st = L.me.radar;
  if (!b) return '';
  const s = L.banditState(id), m = L.missileOn(id);
  const log = L.banditLog.get(id);
  switch (s) {
    case 'dead':
      return log?.lead === null || log?.lead === undefined ? 'He never got a warning before impact.' : `His first warning came ${log.lead.toFixed(0)} s before impact.`;
    case 'missile':
      return log?.firstWarnState === 'missile'
        ? `Seeker active on him: his first real warning, about ${secs(m?.timeToImpact)} s to impact.`
        : `Seeker active on him, about ${secs(m?.timeToImpact)} s to impact. He has been warned for ${secs(warnedFor(L, id))} s.`;
    case 'launch':
      if (m && MISSILES[m.type].seeker === 'sarh') return `Launch warning: the ${MISSILES[m.type].name} rides your beam. Warned for ${secs(warnedFor(L, id))} s.`;
      return `Launch warning${m ? `: ${L.label(m.id)} (${MISSILES[m.type].name}) is on its way` : ''}. Warned for ${secs(warnedFor(L, id))} s.`;
    case 'lock':
      if (m && MISSILES[m.type].seeker === 'arh' && m.guidance !== 'active') return `Only a lock: the ${MISSILES[m.type].name} on its way stays silent until active (${secs(m.timeToActive)} s).`;
      return 'Continuous lock tone: he knows who is looking and that a shot may follow.';
    case 'search':
      if (L.notchedAt.has(id)) return 'He sits in your notch: your radar lost him, but his RWR still hears your search.';
      if (m && m.guidance !== 'active') return `Search only, yet ${L.label(m.id)} is ${m.guidance === 'inertial' ? 'flying blind toward him' : `${secs(m.timeToActive)} s from going active on him`}.`;
      return 'A radar sweeping past, the same in RWS and TWS. Nothing to defend.';
    case 'quiet':
      if (st.mode === 'off') return 'Your radar is off.';
      if (st.mode === 'stt' && st.stt.targetId !== id) return `Your STT beam stares at ${L.bandit(st.stt.targetId)?.callsign ?? 'another bandit'}: nothing reaches him.`;
      if (m && m.guidance !== 'active') return `Nothing, and ${L.label(m.id)} is on its way.`;
      return detectWhy(L, id, false) ?? 'Your beam has not swept over him yet.';
  }
}

/** Why your search does not see this bandit, in the lesson's units (null = it can). */
export function detectWhy(L: TwsLesson, id: EntityId, withNotch = true): string | null {
  const b = L.bandit(id);
  if (!b || !b.alive) return null;
  const x = explainDetection(L.world, L.me, b, { units: L.units });
  const reason = x.reasons.find(reason => withNotch || !reason.startsWith('In the notch:'));
  return reason ? `${reason}.` : null;
}

// ---------------------------------------------------------------------------------------------- coach

export interface Coach { text: string; why: string; tone: Tone | null }

const nm = (id: MissileId) => MISSILES[id].name;

/** State-driven advice: what to do now, and why. */
export function coachFor(L: TwsLesson, b: JetBinds): Coach {
  const spec = L.spec, me = L.me, st = me.radar, w = L.world, u = L.units;
  const key = (a: PageAct) => keyText(b, a);
  const lbl = spec.radar.modeLabels;
  const mine = L.playerMissiles();
  const fr = (m: number) => fmtRange(m, u);

  if (L.ended) return { text: 'Run it again, or fly the same picture in another jet.', why: '', tone: null };

  // Missiles in trouble first.
  const blind = mine.find(m => m.guidance === 'ballistic' && MISSILES[m.type].seeker === 'sarh');
  if (blind) return { text: `${L.label(blind.id)} is blind: the lock on ${L.bandit(blind.targetId)?.callsign ?? 'him'} broke and a semi-active missile has nothing to home on.`, why: 'A SARH missile needs your STT to impact. Relock at once or it is lost.', tone: 'warning' };
  const lost = mine.find(m => m.guidance === 'inertial');
  if (lost) {
    const why = st.mode === 'stt' && st.stt.targetId !== lost.targetId ? 'STT on one target deletes every other track, so its datalink stopped.' : st.mode === 'rws' ? 'RWS keeps no track files, so there is nothing to send.' : 'Its track dropped: he left the scan, notched you, or the radar changed mode.';
    return { text: `${L.label(lost.id)} lost its datalink and flies to where the old track said ${L.bandit(lost.targetId)?.callsign ?? 'he'} would be. If he moved, its seeker opens on empty sky.`, why, tone: 'caution' };
  }

  // A bandit you are working is beaming you: the notch hides him from your radar (not from his RWR).
  for (const id of L.notching) {
    const bd = L.bandit(id);
    if (!bd?.alive) continue;
    const m = L.missileOn(id), since = L.notchedAt.get(id);
    const guided = !!m && m.guidance !== 'active' && MISSILES[m.type].seeker !== 'ir';
    if (since !== undefined && (guided || st.stt.targetId === id || w.t - since < 12)) {
      return { text: `${bd.callsign} is beaming you: inside your ${spec.radar.notchKts} kt notch your radar loses him${m ? `, and ${L.label(m.id)} loses its guidance` : ''}.`, why: 'Zero closing speed looks like the ground to a Doppler radar. His RWR still hears you: the notch hides him from your radar, not you from him.', tone: 'caution' };
    }
  }

  if (st.mode === 'stt') return coachStt(L, b, key);

  if (st.mode === 'tws') {
    if (L.snp2) return coachSnp2(L, key);
    const live = mine.filter(m => MISSILES[m.type].seeker === 'arh');
    const onLink = live.filter(m => m.guidance === 'datalink');
    if (live.length && !onLink.length && live.every(m => m.guidance === 'active')) {
      return { text: 'Every missile in the air is active: they need you no more. In the jet you would turn away now, or designate whoever is left.', why: 'After pitbull an active missile uses its own radar.', tone: 'ok' };
    }
    if (onLink.length) {
      const drift = onLink.find(m => { const t = trackOf(st, m.targetId); return !t || t.coasting; });
      if (drift) return { text: `${L.who(drift.targetId)} is slipping out of your track: ${L.label(drift.id)} is about to lose its datalink.`, why: `Keep every target with a missile on it inside the scan${spec.radar.tws?.maxAzHalfWidthDeg ? ` (±${Math.round(st.azHalf * R2D)}° window)` : ''} until its seeker goes active.`, tone: 'caution' };
      const next = Math.min(...onLink.map(m => m.timeToActive ?? 99));
      const names = [...new Set(onLink.map(m => L.bandit(m.targetId)?.callsign).filter(Boolean))].join(', ');
      const ck = L.canLaunch();
      const doubled = !!ck.targetId && !!L.missileOn(ck.targetId);
      const stepFirst = doubled && ['fa18c', 'f16c', 'jf17'].includes(L.ac) && L.me.radar.tracks.some(t => t.firm && !L.missileOn(t.targetId) && L.bandit(t.targetId)?.alive);
      const untargeted = L.bandits.some(x => x.alive && !L.missileOn(x.id));
      const more = !ck.ok || !L.multiTarget ? ''
        : stepFirst ? ` Next target: ${key('cycle')} steps the primary off ${L.who(ck.targetId)}, then fire.`
        : !doubled ? ` In range: ${key('fire')} fires at ${L.who(ck.targetId)}.`
        : untargeted ? ` ${key('fire')} now would put a second missile on ${L.who(ck.targetId)}: designate a fresh track first.`
        : ' Every bandit has a missile on him.';
      const many = names.includes(',');
      return { text: `${onLink.length > 1 ? `${onLink.map(m => L.label(m.id)).join(', ')} are` : `${L.label(onLink[0].id)} is`} flying on your datalink: keep the tracks in the scan. Next pitbull in ${secs(next)} s.${more}`, why: `${names} ${many ? 'hear' : 'hears'} only search. ${many ? 'Their' : 'His'} first real warning comes when ${many ? 'each' : 'the'} seeker goes active.`, tone: 'hi' };
    }
    const ck = L.canLaunch();
    if (ck.ok) return { text: fireAdvice(L, b, ck.targetId), why: 'Nobody hears a lock: in TWS every bandit keeps hearing only search.', tone: 'hi' };
    if (st.designated.length) {
      const frac = L.autoSttFraction;
      const tid = st.designated[0], trk = trackOf(st, tid);
      if (frac && trk && me.selectedWeapon) {
        const d = dlzFor(me.pos, me.vel, trk.pos, trk.vel, me.selectedWeapon);
        const r = me.pos.distanceTo(trk.pos);
        return { text: `${L.who(tid)} designated, ${fr(r)}. ${short(lbl.tws)} will not launch: at 85 % Rmax (${fr(frac * d.rmax)}) it locks him by itself.`, why: 'Until then he hears only search. From the auto-lock on, his RWR shows your lock.', tone: null };
      }
      return { text: `${st.designated.length > 1 ? `${st.designated.length} tracks designated` : `${L.who(tid)} designated`}. ${ck.reason}.`, why: L.multiTarget ? 'Designate every target you mean to shoot; each launch goes to the next one in your jet\'s order.' : '', tone: null };
    }
    const firm = st.tracks.filter(t => t.firm);
    if (firm.length) {
      const hint = spec.id === 'fa18c' ? 'The L&S (star) picks itself: the closest track.' : spec.id === 'f14b' ? 'The WCS numbers the tracks by itself.' : `Click a track, or put the cursor on it and press ${key('designate')}.`;
      return { text: `Track files are up: ${firm.map(t => t.label).join(' ')}. ${hint}`, why: 'Each track has speed and heading, and glides between sweeps because the computer predicts it. That prediction is what a missile flies on.', tone: null };
    }
    if (st.tracks.length) return { text: `Building tracks: the first hit makes a tentative track; the second, one revisit later (${L.revisit().toFixed(1)} s), gives speed and heading.`, why: 'A track needs two hits before it can be designated or guide a missile.', tone: null };
    const miss = scanMiss(L);
    if (miss) return { text: `No tracks. ${miss}`, why: 'TWS builds a track only where the beam sweeps. Keep the group inside the scan volume (the green wedge in 3D).', tone: 'caution' };
    return { text: `No tracks yet. ${detectLine(L)}`, why: 'TWS only builds a track when the beam hits him; the bandits are flying into range.', tone: 'dim' };
  }

  // RWS / search.
  const n = L.contacts().length;
  if (!spec.radar.tws) {
    return n
      ? { text: `RECH: ${n} contact${n > 1 ? 's' : ''}. No TWS in the ${spec.short}: to shoot, lock one (${key('designate')}). He hears that lock until impact.`, why: `Lock late, close to the zone (${nm(mainMissile(L.ac))} Rmax), to keep his warning short.`, tone: null }
      : { text: `Searching. ${detectLine(L)}`, why: 'Bricks appear where the beam found him.', tone: 'dim' };
  }
  const brick = spec.display === 'ru-hud' ? 'mark' : 'brick';
  return n
    ? { text: `Search: each ${brick} is one echo, stale the moment it appears. No heading, no memory, nothing to guide a missile with. ${L.ac === 'mig29s' ? `Press ${key('mode')} twice for СНП2` : `Switch to ${short(lbl.tws) || 'TWS'} (${key('mode')})`}, or click a ${brick} to lock it.`, why: 'Locking from RWS works, but he hears the lock at once.', tone: null }
    : scanMiss(L)
      ? { text: `No ${brick}s. ${scanMiss(L)}`, why: 'The radar only sees where the beam sweeps: move the scan or tilt the antenna.', tone: 'caution' }
      : { text: `Search. ${detectLine(L)}`, why: `Watch the scan volume sweep; a ${brick} appears where the beam finds a jet.`, tone: 'dim' };
}

function coachStt(L: TwsLesson, b: JetBinds, key: (a: PageAct) => string): Coach {
  const st = L.me.radar, tid = st.stt.targetId, who = L.who(tid);
  const m = tid ? L.missileOn(tid) : undefined;
  const log = tid ? L.banditLog.get(tid) : undefined;
  const heard = log?.firstWarn !== null && log?.firstWarn !== undefined ? L.world.t - log.firstWarn : 0;
  if (st.stt.lostFor > 0) return { text: `Lock on ${who} is in memory: the radar is coasting on his last track.`, why: 'Notch, gimbal or range: a few seconds and the lock breaks.', tone: 'caution' };
  const gim = L.spec.radar.gimbalAzDeg;
  if (m && m.guidance === 'sarh') return { text: `Hold the lock. The ${nm(m.type)} is riding your beam; ${who} has had a launch warning for ${secs(heard)} s.`, why: `Semi-active: break the lock and it goes dumb. Crank ${L.crankDeg}° off (Crank L / R) to slow the closure, inside the ±${gim}° gimbal. Everyone else is off your display.`, tone: 'hi' };
  if (m && m.guidance === 'datalink') {
    const warn = L.banditState(tid ?? '') === 'launch' ? 'He gets a launch warning from this STT shot.' : 'He hears your lock, not the missile.';
    return { text: `Hold STT until ${L.label(m.id)} goes active in ${secs(m.timeToActive)} s.`, why: `${warn} ${L.multiTarget ? 'In TWS he would hear nothing at all.' : 'The missile flies on your radar\'s updates until its own seeker takes over.'}`, tone: 'hi' };
  }
  if (m && m.guidance === 'active') {
    return L.multiTarget
      ? { text: `${L.label(m.id)} is active: unlock (${key('unlock')}) and go back to TWS for the rest.`, why: 'After pitbull the missile needs nothing from you.', tone: 'ok' }
      : { text: `Pitbull: ${L.label(m.id)} has its own radar on ${who}. Unlock (${key('unlock')}), let ${short(L.spec.radar.modeLabels.tws)} rebuild the tracks and designate the next bandit.`, why: 'The R-77 no longer needs you. Every second in STT is a second not spent on the next target.', tone: 'ok' };
  }
  const ck = L.canLaunch();
  const others = L.multiTarget ? ' STT has deleted every other track.' : '';
  if (ck.ok) return { text: `Locked and in range: fire (${key('fire')}).${others}`, why: `${who} has heard your lock for ${secs(heard)} s. Every second you wait he can turn, notch or climb.`, tone: 'hi' };
  return { text: `Locked on ${who}: ${ck.reason}.${others}`, why: L.spec.radar.tws ? `He hears your lock the whole time. ${L.multiTarget ? 'In TWS he would hear only search.' : `${short(L.spec.radar.modeLabels.tws)} would have kept him in the dark until 85 % Rmax.`}` : 'He hears your lock the whole time. Lock late, close to the zone.', tone: 'caution' };
}

function coachSnp2(L: TwsLesson, key: (a: PageAct) => string): Coach {
  const st = L.me.radar;
  const salvo = L.flags.snp2Salvo.map(id => L.world.missiles.get(id)).filter((m): m is Missile => !!m && m.alive);
  if (salvo.length) {
    const link = salvo.filter(m => m.guidance === 'datalink');
    if (link.length) return { text: `Stay in СНП2: ${link.map(m => L.label(m.id)).join(' and ')} fly on your radar until active (next in ${secs(Math.min(...link.map(m => m.timeToActive ?? 99)))} s).`, why: 'Both targets hear only search until each seeker goes active.', tone: 'hi' };
    return { text: 'Both R-77s are active. Go back to СНП or ОБЗ for whoever is left.', why: 'After pitbull they need nothing from you.', tone: 'ok' };
  }
  if (!st.designated.length) return { text: `СНП2: put the cursor on the lead and press ${key('designate')} (or click it). The radar picks Ц2 within 8° by itself.`, why: 'The 8° is the cursor strobe: the pair must fly close together.', tone: null };
  if (st.designated.length === 1) return { text: `No Ц2 yet: no firm track within 8° of ${L.who(st.designated[0])}. Pick a lead that has a wingman close by.`, why: 'СНП2 takes two targets inside the 8° strobe; the rest of the picture must wait.', tone: 'caution' };
  const c = L.snp2Status();
  if (c?.ok) return { text: `Ц1 Ц2 and ПР: hold the trigger (${key('fire')}). Two R-77s leave, one per target.`, why: 'Neither target has heard a lock.', tone: 'hi' };
  return { text: `Ц1 ${L.who(st.designated[0])}, Ц2 ${L.who(st.designated[1])}. ${c?.reason ?? ''}.`, why: 'In СНП2 the radar holds both tracks and waits for ПР on the lead; no auto-lock.', tone: null };
}

function fireAdvice(L: TwsLesson, b: JetBinds, target: EntityId | null): string {
  const f = keyText(b, 'fire'), who = L.who(target);
  switch (L.ac) {
    case 'f15c': return `In range: ${f} sends one AIM-120 at ${who}. The next press goes to the next designation, PDT then SDTs in order.`;
    case 'fa18c': return `SHOOT: fire at the L&S, ${who} (${f}), then Undesignate (${keyText(b, 'cycle')}) so DT2 becomes the L&S, and fire again.`;
    case 'f16c': return `In range: fire at the bug, ${who} (${f}), then short TMS Right (${keyText(b, 'cycle')}) to step the bug and fire again.`;
    case 'f14b': return `In range: each trigger press (${f}) sends one Phoenix at priority 1, ${who}; the numbers then move up.`;
    case 'jf17': return `SHOOT: SD-10 at the HPT, ${who} (${f}). S2 Left (${keyText(b, 'cycle')}) swaps HPT and SPT for the second.`;
    default: return `In range: fire (${f}) at ${who}.`;
  }
}

/** A bandit your radar could see if the scan pointed at him: 'Bandit-3 (…): outside the bars …'. */
function scanMiss(L: TwsLesson): string | null {
  for (const b of L.bandits) {
    if (!b.alive) continue;
    const x = explainDetection(L.world, L.me, b, { units: L.units });
    if (x.range < x.detectRange * 0.9 && (!x.inAzimuth || !x.inBars)) return `${b.callsign} is in range but ${(detectWhy(L, b.id, false) ?? '').replace(/^Outside/, 'outside')}`;
  }
  return null;
}

/** "Your N001 sees a Su-27-size target at about 68 km head-on; the closest bandit is at 75 km." */
function detectLine(L: TwsLesson): string {
  const alive = L.bandits.filter(x => x.alive);
  if (!alive.length) return '';
  const b0 = alive[0];
  const det = L.spec.radar.detectKm.headOn * 1000 * Math.pow(AIRCRAFT[b0.type].rcsM2 / 5, 0.25);
  const nearest = Math.min(...alive.map(x => L.rangeTo(x.id)));
  const type = AIRCRAFT[b0.type].short;
  return `Your ${L.spec.radar.name} sees ${article(type)} ${type} at about ${fmtRange(det, L.units)} head-on; the nearest bandit is at ${fmtRange(nearest, L.units)}.`;
}

// ---------------------------------------------------------------------------------------------- end

export interface EndRow { callsign: string; result: string; warning: string }
export interface EndSummary { title: string; lead: string; rows: EndRow[]; insight: string; tone: Tone }

export function endSummary(L: TwsLesson): EndSummary {
  const e = L.ended;
  const dead = L.bandits.filter(b => !b.alive);
  const t = fmtTime(e?.t ?? L.world.t);
  const title = e?.kind === 'clear' ? 'Sky clear' : e?.kind === 'merge' ? 'Merge' : 'Time up';
  const lead = e?.kind === 'clear' ? `All four bandits down in ${t}.` : e?.kind === 'merge' ? `A bandit got inside ${fmtRange(MERGE_RANGE_M, L.units)} at ${t}. ${dead.length} of 4 splashed before the merge.` : `${t} and ${dead.length} of 4 splashed.`;
  const rows: EndRow[] = L.bandits.map(b => {
    const log = L.banditLog.get(b.id);
    const killer = log?.killedBy ? L.world.missiles.get(log.killedBy) : undefined;
    const result = b.alive ? 'Alive' : `Splashed ${fmtTime(log?.diedAt ?? 0)}${killer ? `, ${L.label(killer.id)} ${nm(killer.type)}` : ''}`;
    let warning: string;
    if (!log || log.firstWarn === null) warning = b.alive ? (log?.firstSearch !== null && log?.firstSearch !== undefined ? 'Heard search only' : 'Heard nothing') : 'No warning before impact';
    else if (!b.alive && log.lead !== null) warning = `${STATE_TEXT[log.firstWarnState ?? 'lock']}, ${log.lead.toFixed(0)} s before impact`;
    else warning = `${STATE_TEXT[log.firstWarnState ?? 'lock']} at ${fmtTime(log.firstWarn)}`;
    return { callsign: b.callsign, result, warning };
  });
  const leads = L.bandits.map(b => L.banditLog.get(b.id)?.lead).filter((x): x is number => typeof x === 'number');
  const avg = leads.length ? leads.reduce((a, c) => a + c, 0) / leads.length : null;
  const locked = L.bandits.some(b => { const s = L.banditLog.get(b.id)?.firstWarnState; return s === 'lock' || s === 'launch'; });
  let insight: string;
  if (avg !== null && !locked) insight = `Average warning ${avg.toFixed(0)} s, and nobody heard a lock: that is TWS.`;
  else if (avg !== null) insight = `Average warning ${avg.toFixed(0)} s: every shot that started from a lock gave the bandit that time to notch or run.`;
  else insight = dead.length ? 'Nobody got a warning.' : 'No kills this time.';
  if (e?.kind === 'merge' && L.ac === 'mig29s') insight += ' Two at a time, and only inside 8°: the rest of the picture has to wait.';
  else if (e?.kind === 'merge' && !L.multiTarget) insight += ' With one target at a time, the clock is the enemy.';
  return { title, lead, rows, insight, tone: e?.kind === 'clear' ? 'ok' : e?.kind === 'merge' ? 'caution' : 'dim' };
}

/** Azimuth of a bandit off your nose, deg (for the card). */
export function bearingDeg(L: TwsLesson, id: EntityId): number {
  const b = L.bandit(id);
  return b ? relBearing(L.me.pos, L.me.heading, b.pos) * R2D : 0;
}
