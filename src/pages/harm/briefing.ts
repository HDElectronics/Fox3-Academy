/**
 * [OWNER: page-harm] The "Missions" view: the full guide to the two DCS practice missions (public/missions, generator
 * missions/harm/harm_training.py): downloads, the jet at the start, a to-scale map, the route, the sites with their
 * RWR symbols, classes and PB codes, what each mission does, the F10 menu, and which lesson to fly before each range.
 * Same content as missions/harm/README.md. Facts: docs/research/fa18c-harm.md.
 */
import { h } from '../../ui';
import { MISSIONS } from './lessons';

/** Map of the practice area: 10 px per nm, origin 56 nm west / 14 nm north of Range 1, north up. */
const MAP_SVG = `
<svg class="harm-map" viewBox="0 0 860 320" role="img" aria-label="Route map: start over the sea, fence at the coast, Range 1 SA-6, Range 2 SA-8 and SA-15 south-east of it, Range 3 SA-11 north-east near Kutaisi, home at Kobuleti.">
  <rect class="harm-map__sea" x="0" y="0" width="860" height="320"/>
  <path class="harm-map__land" d="M470 320 L475 257 L455 210 L436 160 L428 100 L418 20 L418 0 L860 0 L860 320 Z"/>
  <path class="harm-map__coast" d="M470 320 L475 257 L455 210 L436 160 L428 100 L418 20 L418 0"/>
  <g class="harm-map__grid">
    <line x1="80" y1="0" x2="80" y2="320"/><line x1="180" y1="0" x2="180" y2="320"/><line x1="280" y1="0" x2="280" y2="320"/><line x1="380" y1="0" x2="380" y2="320"/><line x1="480" y1="0" x2="480" y2="320"/><line x1="580" y1="0" x2="580" y2="320"/><line x1="680" y1="0" x2="680" y2="320"/><line x1="780" y1="0" x2="780" y2="320"/>
    <line x1="0" y1="60" x2="860" y2="60"/><line x1="0" y1="160" x2="860" y2="160"/><line x1="0" y1="260" x2="860" y2="260"/>
  </g>
  <g class="harm-map__gl">
    <text x="84" y="314">50 nm W</text><text x="284" y="314">30 W</text><text x="484" y="314">10 W</text><text x="584" y="314">R1</text><text x="684" y="314">10 E</text>
    <text x="40" y="40">Black Sea</text><text x="806" y="16">N ↑</text>
  </g>
  <g class="harm-map__af">
    <rect x="471" y="253" width="8" height="8"/><text x="420" y="276">Kobuleti (WP5)</text>
    <rect x="534" y="58" width="8" height="8"/><text x="508" y="52">Senaki</text>
    <rect x="732" y="74" width="8" height="8"/><text x="745" y="70">Kutaisi</text>
  </g>
  <path class="harm-map__route" d="M67 160 L402 160 L578 154 L670 240 L784 126 L475 257"/>
  <g class="harm-map__sam">
    <polygon points="578,144 588,162 568,162"/><text x="558" y="134">R1 SA-6</text>
    <polygon points="650,250 659,266 641,266"/><text x="604" y="284">R2 SA-8</text>
    <polygon points="689,212 698,228 680,228"/><text x="703" y="224">R2 SA-15</text>
    <polygon points="784,116 794,134 774,134"/><text x="760" y="154">R3 SA-11</text>
  </g>
  <g class="harm-map__wp">
    <circle cx="67" cy="160" r="6"/><circle cx="402" cy="160" r="6"/><circle cx="670" cy="240" r="5"/>
    <text x="56" y="146">WP0</text><text x="378" y="146">WP1 FENCE</text><text x="594" y="172">WP2</text><text x="628" y="232">WP3</text><text x="800" y="120">WP4</text>
  </g>
</svg>`;

const table = (head: string[], rows: (string | HTMLElement)[][]) =>
  h('div', { class: 'harm-brief__table' }, h('table', { class: 'harm-table' },
    h('thead', null, h('tr', null, head.map(t => h('th', null, t)))),
    h('tbody', null, rows.map(r => h('tr', null, r.map(c => h('td', null, c)))))));

const list = (items: string[]) => h('ul', { class: 'harm-brief__list' }, items.map(t => h('li', null, t)));

export function buildBriefing(): HTMLElement {
  const map = h('figure', { class: 'harm-brief__map' });
  map.innerHTML = MAP_SVG;
  map.append(h('figcaption', null, 'To scale, 10 nm grid, north up. Coastline approximate. Site positions were placed by hand on open ground in the Mission Editor.'));

  return h('article', { class: 'harm-brief', 'aria-label': 'Practice missions guide' },
    h('header', { class: 'harm-brief__head' },
      h('p', { class: 'harm-brief__eyebrow' }, 'F/A-18C · Caucasus · single player'),
      h('h2', null, 'Fly it in DCS'),
      h('p', null, 'Two missions to practise what the lessons teach, in the real jet. Copy the .miz files into Saved Games\\DCS\\Missions (or DCS.openbeta), then open them from Mission in the main menu. Same jet, route and sites in both; only the SAMs change.')),

    h('section', { class: 'harm-brief__cards' }, MISSIONS.map(m => h('div', { class: 'harm-brief__card' },
      h('h3', null, m.title),
      h('a', { href: `./missions/${m.file}`, download: m.file, class: 'harm-missions__file' }, `Download ${m.file}`),
      h('p', null, m.text)))),

    h('section', null,
      h('h3', null, 'Your jet at the start'),
      h('p', null, 'Callsign Weasel 1. Airborne over the Black Sea at 25000 ft, 450 kt true airspeed, heading 090, 51 nm west of Range 1. 4 × AGM-88C on stations 2, 3, 7 and 8; 2 × AIM-9X on the wingtips; centreline tank. No enemy aircraft, clear weather, no wind.')),

    h('section', null, h('h3', null, 'The route'), map,
      table(['WP', 'Name', 'Leg', 'Notes'], [
        ['0', 'Start', '—', '25000 ft, 450 kt, heading 090'],
        ['1', 'FENCE', '090 · 33.5 nm', 'Coast in. Range 1 is 17.6 nm further east.'],
        ['2', 'R1 SA-6', '088 · 17.6 nm', 'Exactly on the Straight Flush: your range ruler in SP, your PB point for code 108.'],
        ['3', 'R2 SA-8/15', '133 · 12.6 nm', 'Midway between the two Range 2 radars.'],
        ['4', 'R3 SA-11', '045 · 16.2 nm', 'Exactly on the Snow Drift: PB point for code 107. 38 nm from the fence.'],
        ['5', 'Kobuleti', '247 · 33.5 nm', 'Home. Landing waypoint.'],
      ]),
      h('p', { class: 'harm-small' }, 'Legs are true courses from the mission grid, rounded. The HSI and HUD give you the live bearing and distance.')),

    h('section', null, h('h3', null, 'The sites'),
      table(['Site', 'Where', 'RWR', 'Class', 'PB code', 'Mission 1', 'Mission 2'], [
        ['SA-6, 1S91 Straight Flush', 'WP2, on the radar', '6', 'H1', '108', 'On at start', 'Live'],
        ['SA-8, Land Roll', 'Near WP3', '8', 'H1', '117', 'F10: Range 2 ON', '—'],
        ['SA-15, Scrum Half', 'Near WP3, 5.4 nm NE of the SA-8', '15', 'H2', '119', 'F10: Range 2 ON', '—'],
        ['SA-11, 9S18M1 Snow Drift', 'WP4, on the radar', 'SD', 'H2', '107', 'F10: Range 3 ON', 'Live'],
      ]),
      h('p', { class: 'harm-small' }, 'The SA-11 launchers carry their own Fire Dome radars (RWR 11, code 115); while holding fire in mission 1 they may stay quiet. Codes from the ED guide appendix (p420).')),

    h('section', null, h('h3', null, 'Mission 1: safe ranges'),
      list([
        'Every SAM keeps its radar on, never fires, never moves and never switches off for an incoming HARM.',
        'Range 1 (SA-6) is on at the start. Ranges 2 and 3 come on from the F10 radio menu, under Other.',
        'F10 › Other also resets each range once (a fresh copy at the same place) and repeats the briefing.',
        'A message confirms every radar you kill.',
      ]),
      table(['Range', 'Fly this lesson first', 'In DCS'], [
        ['1, SA-6 at WP2', 'SP', 'Let the HARM cue itself to the 6 and fire between 30 and 25 nm to WP2 (practice suggestion). Then reset it and try TOO, or PB with code 108.'],
        ['2, SA-8 + SA-15 near WP3', 'TOO', 'TDC to the HARM display, CLASS H2 for the 15, hand off with Cage/Uncage, fire. Then CLASS H1 for the 8.'],
        ['3, SA-11 at WP4', 'PB', 'UFC, option 4 TGT, 107, ENT; HRM pull-up; WPDSG on WP4; hold release and fly the cue. Reset it and try the A/C pull-up.'],
      ])),

    h('section', null, h('h3', null, 'Mission 2: live SEAD'),
      list([
        'The SA-6 at WP2 and the SA-11 at WP4 are weapons free.',
        'They use the default DCS reaction to anti-radiation missiles (Mission Editor "Evasion of ARM"): they may switch the radar off when your HARM comes. The HARM then loses guidance (ED guide p367): wait for the radar to come back and shoot again.',
        'Turn on Options › Gameplay › Immortal for the first tries.',
        'Pullback lesson: unbox HRM OVRD before you go, let the SA-6 lock you, pickle when HARM shows without an X, then turn away.',
        'Live lesson: TOO on the SA-6 from 30–25 nm before the fence, then PB on the SA-11 from stand-off, then home to WP5.',
      ])),

    h('section', null, h('h3', null, 'Before every run'),
      list([
        'Master Arm ARM (M), A/G master mode (2 or the button on the left panel).',
        'Right DDI: stores page, HARM (pushbutton 6). Left DDI: EW page, box HUD (pushbutton 14).',
        'AMPCD: HSI with WYPT boxed, step to the waypoint you are working.',
        'Countermeasures ready; climb toward 30000 ft if the jet will go (the guide advises 30000 ft AGL and above).',
        'Weapon release in DCS is RAlt+Space. Check your own bindings, especially with a HOTAS profile.',
      ])),

    h('section', null, h('h3', null, 'Not verified in game'),
      list([
        'Whether the weapons-hold SAMs in mission 1 ever lock you, or only search.',
        'When the RWR first shows each site on this route.',
        'Launch distances marked as suggestions are practice advice, not DCS figures.',
        'The coastline on the map.',
      ])),
  );
}
