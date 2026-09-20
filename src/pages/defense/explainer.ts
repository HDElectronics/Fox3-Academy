/**
 * [OWNER: page-defense] "How it works in DCS" section under the lab: the notch gate, look-down and
 * clutter, why chaff only works in the notch, SARH vs ARH defense, and what this jet's RWR shows and
 * when. Everything is read from the data layer for the selected jet.
 */
import type { AircraftId, MissileId } from '../../data/types';
import { AIRCRAFT, AIRCRAFT_CAVEATS } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import { RWRS, RWR_CAVEATS } from '../../data/rwr';
import { procedureFor } from '../../data/procedures';
import { h, type Child } from '../../ui/dom';
import { callout, dataTable } from '../../ui/panels';
import { kbd } from '../../ui/keys';
import { cruiseFor, carriersOf } from '../../sim/scenarios';
import { MPS_PER_KT, M_PER_NM } from '../../sim/math';
import { missileModel } from '../../sim/missileModel';
import { radarRules } from '../../sim/radar';
import { THREATS, canTwsShot, defaultThreat } from './drills';
import { cmKeys, type CmKey } from './cmkeys';

type Units = 'metric' | 'imperial';

const kt = (mps: number) => mps / MPS_PER_KT;
const spd = (mps: number, u: Units) => (u === 'metric' ? `${Math.round(mps * 3.6)} km/h` : `${Math.round(kt(mps))} kt`);
const gateTxt = (knots: number, u: Units) => (u === 'metric' ? `${Math.round(knots * MPS_PER_KT * 3.6)} km/h` : `${knots} kt`);
const dist = (km: number, u: Units) => (u === 'metric' ? `${km} km` : `${(km * 1000 / M_PER_NM).toFixed(1)} nm`);

/** Half-width of the beam window (deg) for a gate (m/s) at a ground speed (m/s). */
export function beamWindowDeg(gateMps: number, groundMps: number): number {
  return (Math.asin(Math.min(1, gateMps / Math.max(1, groundMps))) * 180) / Math.PI;
}

/** Top view of the beam: shooter, your velocity split into radial and across components, the window. */
function beamDiagram(): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 560 220');
  svg.setAttribute('class', 'dfx-diagram');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Top view: the shooter on the left, you on the right flying across his line of sight. Your speed along his line of sight is the radial speed; inside the narrow beam window it stays inside his gate.');
  // You at (380,160) flying about 11 degrees off the beam; the window is ±7 degrees around straight up.
  svg.innerHTML = `
    <defs>
      <marker id="dfx-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" class="dfx-fill-ink"/>
      </marker>
      <marker id="dfx-arrow-hi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" class="dfx-fill-hi"/>
      </marker>
    </defs>
    <path d="M380 160 L 365.3 40 L 394.7 40 Z" class="dfx-window"/>
    <text x="380" y="22" class="dfx-t dfx-mid">beam window: ±asin(gate ÷ speed)</text>
    <line x1="60" y1="160" x2="540" y2="160" class="dfx-los"/>
    <text x="70" y="148" class="dfx-t">his line of sight</text>
    <circle cx="46" cy="160" r="9" class="dfx-shooter"/>
    <text x="46" y="190" class="dfx-t dfx-mid">shooter</text>
    <line x1="380" y1="160" x2="380" y2="62" class="dfx-across"/>
    <line x1="380" y1="160" x2="400" y2="62" class="dfx-vel" marker-end="url(#dfx-arrow)"/>
    <text x="408" y="74" class="dfx-t">your speed</text>
    <line x1="380" y1="160" x2="404" y2="160" class="dfx-radial" marker-end="url(#dfx-arrow-hi)"/>
    <path d="M380 164 L 374 178 L 380 174 L 386 178 Z" class="dfx-you" transform="rotate(11 380 170)"/>
    <text x="370" y="150" class="dfx-t dfx-end">you</text>
    <text x="548" y="186" class="dfx-t dfx-hi dfx-end">radial speed</text>
    <text x="548" y="204" class="dfx-t dfx-end">= speed × sin(angle off the beam)</text>`;
  return svg;
}

function p(...c: Child[]) { return h('p', null, ...c); }

/** "Chaff in DCS: Dispense Switch - Forward [E] · here [E] or [C]". */
function keyRow(label: string, k: CmKey): HTMLElement {
  return h('div', { class: 'dfx-keyrow' },
    h('span', { class: 'dfx-keylabel' }, `${label} in DCS`),
    k.dcsName ? h('span', { class: 'dfx-hotas' }, k.dcsName) : null,
    k.dcsKey ? kbd(k.dcsKey) : k.dcsName ? null : h('span', { class: 'dfx-hotas' }, 'no default key'),
    h('span', { class: 'dfx-keylabel' }, 'on this page'), kbd(k.bind),
    k.note ? h('span', { class: 'dfx-keynote' }, k.note) : null);
}

export interface ExplainerOptions { ac: AircraftId; units: Units }

export function buildExplainer(o: ExplainerOptions): HTMLElement {
  const spec = AIRCRAFT[o.ac];
  const u = o.units;
  const rwr = RWRS[spec.rwr];
  const cruise = cruiseFor(o.ac);
  const v = cruise.speed;

  // Radars that fire the drill threats at this jet.
  const shooters: AircraftId[] = [];
  for (const m of THREATS) for (const s of carriersOf(m, o.ac)) if (!shooters.includes(s)) shooters.push(s);
  const radarRows = shooters.map(s => {
    const r = AIRCRAFT[s].radar;
    return {
      radar: r.name, jet: AIRCRAFT[s].short, gate: gateTxt(r.notchKts, u),
      lookDown: r.notchNeedsLookDown ? 'yes' : 'no (flat gate here)',
      window: `±${beamWindowDeg(r.notchKts * MPS_PER_KT, v).toFixed(1)}°`,
      memory: `${radarRules(s).sttMemoryS} s`,
    };
  });
  // ARH threats that can come at this jet, their pitbull distances, and who warns for an STT shot.
  const arhThreats = THREATS.filter(m => MISSILES[m].seeker === 'arh' && carriersOf(m, o.ac).length > 0);
  const pits = arhThreats.map(m => MISSILES[m].pitbullKm ?? 15);
  const pitLo = Math.min(...pits), pitHi = Math.max(...pits);
  const pitTxt = pitLo === pitHi ? `about ${dist(pitLo, u)}` : `about ${dist(pitLo, u)} to ${dist(pitHi, u)}`;
  const warners = [...new Set(arhThreats.flatMap(m => carriersOf(m, o.ac)).filter(s => AIRCRAFT[s].radar.sttArhLaunchWarning))];
  const twsShooters = [...new Set(arhThreats.flatMap(m => carriersOf(m, o.ac)).filter(canTwsShot))];
  const mainArh = MISSILES[defaultThreat('pitbull', o.ac)];
  const mainTws = carriersOf(defaultThreat('pitbull', o.ac), o.ac).some(canTwsShot);
  const pitKm = mainArh.pitbullKm ?? 15;
  const secs = (closureMps: number) => Math.round((pitKm * 1000) / closureMps);
  const gateList = [...new Map(shooters.map(sh => [AIRCRAFT[sh].radar.name, AIRCRAFT[sh].radar.notchKts])).entries()]
    .map(([name, k]) => `${name} ${k} kt`).join(', ');
  const w54 = beamWindowDeg(54 * MPS_PER_KT, v).toFixed(1);
  const w113 = beamWindowDeg(113 * MPS_PER_KT, v).toFixed(1);

  const missileRows = THREATS.map((id: MissileId) => {
    const m = MISSILES[id];
    return {
      name: m.name, fox: `Fox ${m.fox} · ${m.seeker.toUpperCase()}`,
      chaff: m.chaffSusceptibility.toFixed(2).replace(/0$/, ''),
      pitbull: m.pitbullKm ? `about ${dist(m.pitbullKm, u)}` : 'none (SARH)',
      seekerGate: spd(missileModel(id).notchMps, u),
      by: carriersOf(id, o.ac).map(a => AIRCRAFT[a].short).join(', '),
    };
  });

  const keys = cmKeys(o.ac);
  const defend = procedureFor(o.ac, 'defend');
  const notchCaveats = [...new Set(shooters.flatMap(s => AIRCRAFT_CAVEATS[s].filter(c => /notch|doppler/i.test(c)).map(c => `${AIRCRAFT[s].short}: ${c}`)))];
  const cmCaveats = AIRCRAFT_CAVEATS[o.ac].filter(c => /chaff|flare/i.test(c));

  const card = (title: string, ...body: Child[]) => h('article', { class: 'dfx-card' }, h('h3', null, title), ...body);
  const wide = (title: string, left: Child[], right: Child[]) => h('article', { class: 'dfx-card dfx-wide' }, h('h3', null, title),
    h('div', { class: 'dfx-cols' }, h('div', null, ...left), h('div', null, ...right)));

  const rwrTable = dataTable({
    caption: `${rwr.name} in the ${spec.short}`,
    columns: [
      { key: 'state', label: 'State', mono: true },
      { key: 'when', label: 'When it comes' },
      { key: 'looks', label: 'What you see and hear' },
      { key: 'act', label: 'What you do' },
    ],
    rows: [
      { state: 'Search', when: 'His radar sweeps you in RWS or TWS. A TWS track looks exactly like search.', looks: rwr.cues.search, act: 'Note the bearing. He may already be tracking you.' },
      { state: 'Lock', when: 'He goes STT. Every SARH shot starts here, and every FC3 R-77 shot.', looks: rwr.cues.lock, act: 'Expect a shot. Be ready to beam him.' },
      {
        state: 'Launch',
        when: `A SARH missile rides his lock (the whole flight). ${warners.length
          ? `An ARH from STT: at once from the ${warners.map(s => AIRCRAFT[s].short).join(', ')}; from the others only a lock until pitbull (simplified).`
          : 'An ARH from STT: here only a lock until pitbull. DCS most likely plays it that way, but it is not verified (simplified).'}`,
        looks: rwr.cues.launch, act: 'Beam his radar now, descend, chaff in the notch.',
      },
      { state: 'Missile', when: `An ARH seeker goes active on you, ${pitTxt} out.${twsShooters.length ? ' From a TWS shot this is your first and only warning.' : ''}`, looks: rwr.cues.missile, act: 'Beam the missile itself, get low, chaff in the notch.' },
    ],
  });

  const el = h('section', { class: 'dfx', 'aria-labelledby': 'dfx-title' },
    h('header', { class: 'dfx-head' },
      h('h2', { id: 'dfx-title' }, 'How missile defense works in DCS'),
      h('p', { class: 'dfx-lede' }, `The rules the drills above are built on, for the ${spec.short} and its ${rwr.name}.`)),
    h('div', { class: 'dfx-grid' },
      wide('The notch is a speed gate', [
        p('A pulse-Doppler radar, and a radar seeker, pick a jet out of the ground clutter by its speed along the line of sight. Anything that moves along that line at about ground speed is thrown away with the clutter. That band is the notch gate. Put the threat at your 3 or 9 o\'clock and almost all your speed goes across his line of sight: you fall into the gate and vanish.'),
        beamDiagram(),
        p(`How exact? The beam window is asin(gate ÷ your ground speed). At the ${spec.short}'s cruise speed (${spd(v, u)}) a 54 kt gate gives ±${w54}° and the N001's 113 kt gate ±${w113}°. "Roughly abeam" is not enough: keep the needle in the gate.`),
      ], [
        p('When his radar loses you, an STT lock goes to memory and then breaks; a TWS track coasts and is dropped. A missile seeker drops you after a moment in its gate (0.6 s in this trainer; ED does not publish it) and flies on to where it last saw you.'),
        dataTable({
          caption: 'Radars that shoot at you in these drills',
          columns: [
            { key: 'radar', label: 'Radar', mono: true }, { key: 'jet', label: 'Jet', mono: true }, { key: 'gate', label: 'Gate', num: true },
            { key: 'window', label: 'Beam window', num: true }, { key: 'lookDown', label: 'Needs look-down' }, { key: 'memory', label: 'Lock memory', num: true },
          ],
          rows: radarRows,
        }),
        h('p', { class: 'dfx-small' }, `Beam window at your cruise speed. Lock memory: how long his STT survives in the notch before it breaks (this trainer's value where research gives none).`),
      ]),
      card('Look-down and clutter',
        p('Since DCS 2.7.1 the AIM-120 and the AIM-7 family use a ground-clutter model: the seeker only loses you in the notch when there is ground behind you in its beam. Get below the missile. Above it, looking up, the notch is much narrower or does not work at all. This trainer applies the same rule to every radar missile.'),
        p('A lofted Fox 3 comes down on you from above, which is why "notch low" works. A shot from below (he is lower than you) is the one where you should drag instead.'),
        p('Inside about 8 km the seeker\'s gate narrows further: DCS 2.7.14 made AMRAAMs harder to notch once they are active and close. Defend early, not at the end.'),
        p('Diving moves you along his line of sight when he is above you. Keep the descent moderate or the needle leaves the gate.')),
      card('SARH or ARH: what you beam',
        h('h4', null, 'SARH: R-27ER, AIM-7M'),
        p('It homes on his radar energy reflected off you, so it needs his STT the whole way. Beam the shooter\'s radar. When his lock breaks the missile goes dumb moments later (1.5 s in this trainer), and a dumb SARH missile ignores chaff. You get a lock warning, then a launch warning for the whole flight.'),
        h('h4', null, 'ARH: R-77, AIM-120C, SD-10, AIM-54C'),
        p('It flies on his datalink until pitbull, then turns its own seeker on. Before pitbull, notching his radar makes his track coast and the missile flies to a stale point. After pitbull the shooter no longer matters: beam the missile itself, low, and chaff.'),
        arhThreats.includes('aim54c')
          ? p('The exception is an AIM-54 fired from PD-STT: in DCS it stays SARH to impact, so you beam the F-14\'s radar as against a Sparrow. Inside 10 nm, or from P-STT or PH ACT, it launches active instead. The trainer uses the NORM active distance; TGTS selection and pulse-radar detection remain simplified.')
          : null),
      wide('Chaff only works in the notch', [
        p('Chaff stops almost dead in the air. A Doppler seeker throws it away like ground clutter, unless you are in its gate too: then the cloud and you look the same, and the seeker may take the cloud. Chaff dropped with the missile on your nose does nothing.'),
        p('Each missile has a chaff factor (the Lua ccm_k0: 1 is the default, 0 is immune). SARH missiles are the easiest to chaff; the AIM-120C is the hardest. Once a SARH missile has lost its guidance it ignores chaff.'),
        p('Near the notch counts a little too: in this trainer a bundle\'s odds are full at zero radial speed, half at the gate edge and nothing at twice the gate.'),
      ], [
        dataTable({
          caption: 'The drill threats',
          columns: [
            { key: 'name', label: 'Missile', mono: true }, { key: 'fox', label: 'Type', mono: true }, { key: 'chaff', label: 'Chaff factor', num: true },
            { key: 'pitbull', label: 'Pitbull' }, { key: 'seekerGate', label: 'Seeker gate', num: true }, { key: 'by', label: 'Fired by' },
          ],
          rows: missileRows,
        }),
        h('p', { class: 'dfx-small' }, 'Seeker gate: this trainer\'s value in look-down, far from the missile. It shrinks in look-up and inside 8 km.'),
      ]),
      wide(`What your ${rwr.name} tells you, and when`, [rwrTable], [
        h('ul', { class: 'dfx-list' }, rwr.teach.map(t => h('li', null, t))),
        callout({ kind: 'simplified', body: h('ul', null, [...RWR_CAVEATS[spec.rwr], 'No elevation blind zones: every threat shows at any bank angle.'].map(c => h('li', null, c))) }),
      ]),
      card('Timing',
        p(`${mainTws ? `A TWS Fox 3 is silent until pitbull.` : `The ${mainArh.name} comes from STT: here you get his lock, then nothing more until pitbull (simplified).`} The ${mainArh.name} goes active about ${dist(pitKm, u)} from you. At 1,000 m/s closure (you hot) that leaves about ${secs(1000)} s; beaming, about ${secs(700)} s; running cold, about ${secs(450)} s. These times are derived from the pitbull distance, not published by ED.`),
        p('Drag works only outside his no-escape range (Rne, Rtr): the missile must cover your run as well as the gap. Inside it, turning your back only makes you a slower, hotter target: notch instead.'),
        p('Defend at the launch warning or the spike, not when the missile is close. Drill 4 shows why.')),
      card(`Your ${spec.short}`,
        p(`${spec.cms.chaff} chaff, ${spec.cms.flares} flares.`),
        h('div', { class: 'dfx-keys' }, keyRow('Chaff', keys.chaff), keyRow('Flares', keys.flare)),
        defend ? h('h4', null, defend.title) : null,
        defend ? h('ol', { class: 'dfx-list' }, defend.steps.map(s => h('li', null, s.text, s.keys ? [' ', kbd(s.keys)] : null, s.hotas && !s.keys ? h('span', { class: 'dfx-hotas' }, ` (${s.hotas})`) : null))) : null,
        cmCaveats.length ? callout({ kind: 'simplified', body: cmCaveats.join(' ') }) : null),
      h('article', { class: 'dfx-card dfx-wide' }, h('h3', null, 'Simplified here'),
        h('ul', { class: 'dfx-list dfx-list--cols' },
          h('li', null, `Radar notch gates used here: ${gateList}. They are the DCS AI sensor-table values where the radar has one; player-module radars are coded in C++ and their gates are not published (the AWG-9 figure is Heatblur's).`),
          h('li', null, 'The seeker gate (about 50–60 kt in look-down), the 0.4 factor in look-up, the narrower gate inside 8 km and the 0.6 s it takes to lose you are this trainer\'s gameplay picks. ED does not publish them.'),
          h('li', null, 'Chaff: each bundle gets one roll, only while the missile is inside 12 km and you are in or near its gate. The real formula is not public.'),
          h('li', null, 'Pitbull distances for the AIM-120, R-77 and SD-10 are not in the game files; the values here are the best community reading.'),
          h('li', null, 'One missile per drill; no jamming, no home-on-jam, no terrain. The flight model is a tactical autopilot, not a flight model.'),
          h('li', null, 'Drill 3 calls the launch for you. In DCS a TWS shot is silent; you would drag on the picture (AWACS, his range) instead.'),
          ...notchCaveats.map(c => h('li', null, c)))),
    ));
  return el;
}
