/**
 * [OWNER: page-reference] BVR glossary: one-line pilot definitions, as DCS uses the words.
 * Facts from docs/research/bvr-mechanics.md, ru-fc3.md, f15c-fc3.md, hornet-viper.md, missiles.md.
 * `jets` marks the terms your own cockpit uses, so the page can tag them for the selected jet.
 */
import type { AircraftId } from '../../data/types';

export type GlossaryCat = 'radar' | 'missiles' | 'zone' | 'defence' | 'brevity';

export const GLOSSARY_CATS: { id: GlossaryCat; title: string }[] = [
  { id: 'radar', title: 'Radar and tracking' },
  { id: 'missiles', title: 'Missiles' },
  { id: 'zone', title: 'Launch zone' },
  { id: 'defence', title: 'Defending' },
  { id: 'brevity', title: 'Brevity' },
];

export interface GlossaryEntry {
  term: string;
  /** Long form or cockpit spelling, shown after the term. */
  aka?: string;
  def: string;
  cat: GlossaryCat;
  jets?: AircraftId[];
}

const RU: AircraftId[] = ['su27', 'su33', 'j11a', 'mig29s'];
const ALL_FOX3: AircraftId[] = ['j11a', 'mig29s', 'f15c', 'fa18c', 'f16c', 'f14b', 'jf17'];

export const GLOSSARY: GlossaryEntry[] = [
  // ---- radar and tracking
  { cat: 'radar', term: 'RWS', aka: 'Range While Search',
    def: 'The radar sweeps and shows raw hits with range but keeps no track files: to shoot, you lock one. The Hornet adds designatable trackfiles (LTWS), and the Viper and JF-17 bug a hit into SAM. ОБЗ on the Russian HUD, LRS on the F-15C, RECH on the Mirage.' },
  { cat: 'radar', term: 'TWS', aka: 'Track While Scan',
    def: 'The radar keeps sweeping while it builds track files with heading and speed. Most Western jets fire Fox 3s from it without a lock, so the target hears nothing until pitbull. The Russian СНП designates one track and locks it by itself at 85 % Rmax.' },
  { cat: 'radar', term: 'STT', aka: 'Single Target Track',
    def: 'A lock: the antenna stares at one target and the rest of the picture goes. The target gets a lock warning. SARH missiles need it to impact. АТК ДВБ on the Russian HUD, PD STT on the F-14, PSIC on the Mirage.' },
  { cat: 'radar', term: 'Brick', def: 'A raw radar hit in search, drawn as a small bar or rectangle. It fades after a frame or two; it has no heading or speed.' },
  { cat: 'radar', term: 'Track file', aka: 'trackfile',
    def: 'What TWS builds from repeated hits: estimated position, heading and speed, extrapolated between sweeps. Hard turns or leaving the scan make it coast, then drop.' },
  { cat: 'radar', term: 'PDT / SDT', aka: 'Primary / Secondary Designated Target', jets: ['f15c'],
    def: 'F-15C TWS designations: the PDT is a star, SDTs are hollow bricks. AIM-120s ripple to the PDT, then the SDTs in the order you designated them.' },
  { cat: 'radar', term: 'L&S', aka: 'Launch and Steering target', jets: ['fa18c'],
    def: 'Hornet: the primary TWS trackfile, a star in the HAFU. It is picked automatically; an AIM-120 goes to whatever is L&S at launch.' },
  { cat: 'radar', term: 'DT2', aka: 'Designated Target 2', jets: ['fa18c'],
    def: 'Hornet: the second designation, a diamond in the HAFU, set with TDC Depress. Undesignate swaps it with the L&S for the next shot.' },
  { cat: 'radar', term: 'Bugged', aka: 'bugged target, FCR TOI', jets: ['f16c'],
    def: 'Viper: the circled System Track your next AIM-120 goes to. A short TMS Right steps the bug to the next track; TMS Up on the bug goes STT.' },
  { cat: 'radar', term: 'HPT / SPT', aka: 'High / Second Priority Target', jets: ['jf17'],
    def: 'JF-17: the first TDC press on a TWS track makes it the HPT (circle), a second track becomes the SPT. S2 LEFT swaps them. Neither is a lock.' },
  { cat: 'radar', term: 'MLC', aka: 'Main-lobe clutter',
    def: 'The ground return where your radar beam hits the ground. A Doppler radar filters it out, and with it any target whose radial speed matches the ground: that is the notch. The F-14 filter is ±133 kt wide and turns itself off in look-up.' },
  { cat: 'radar', term: 'HPRF / MPRF', aka: 'High / Medium pulse repetition frequency',
    def: 'HPRF sees hot, fast-closing targets far out; MPRF sees low-closure targets (beam and tail). Interleaved runs both. F-15C: HI / MED / interleaved.' },
  { cat: 'radar', term: 'ППС / ЗПС / АВТ', aka: 'Russian PRF selector, RShift + I', jets: RU,
    def: 'ППС is high PRF for a closing target, ЗПС medium PRF for a tail chase, АВТ interleaves both when you do not know the aspect, at about 25 % less range. СНП runs only with ППС or ЗПС.' },
  { cat: 'radar', term: 'Look-down', def: 'Your radar points below the horizon at a target with the ground behind it. Detection shrinks on many radars and the target can notch you in the clutter.' },
  { cat: 'radar', term: 'Gimbal limit',
    def: 'How far the antenna can look off the nose, ±60° on most of these radars. Turn past it and you lose the track, and with it your missile support.' },

  // ---- missiles
  { cat: 'missiles', term: 'Fox 1 / Fox 2 / Fox 3', def: 'Launch calls. Fox 1 is a semi-active radar missile, Fox 2 an infrared missile, Fox 3 an active radar missile.' },
  { cat: 'missiles', term: 'SARH', aka: 'Semi-active radar homing, Fox 1',
    def: 'The missile homes on your radar energy reflected off the target, so you hold STT until impact and he sees lock and launch the whole time. R-27R/ER, AIM-7M, Super 530D.' },
  { cat: 'missiles', term: 'ARH', aka: 'Active radar homing, Fox 3', jets: ALL_FOX3,
    def: 'The missile carries its own radar and switches it on near the target. Until then it flies on your datalink updates or on its own inertial guidance.' },
  { cat: 'missiles', term: 'Datalink', jets: ALL_FOX3,
    def: 'Midcourse target updates your radar sends a Fox 3 while you keep a track on the target. Lose the track and the missile flies to the last predicted intercept point and goes active there.' },
  { cat: 'missiles', term: 'Pitbull', jets: ALL_FOX3,
    def: 'Your Fox 3 has gone active and no longer needs your radar: now you can turn away. Your cue is the timer: T to M (F-15C), ACT to TTG (Hornet), A to T (Viper), TOA 0 (JF-17), blinking TTI (F-14). The Russian HUD has no such cue: the manual lets you drop the lock once the R-77 is within about 15 km of him.' },
  { cat: 'missiles', term: 'Husky',
    def: 'Real-world brevity for an active missile at high PRF, before it goes MPRF (pitbull). DCS models one activation, so in the game you only get pitbull.' },
  { cat: 'missiles', term: 'Maddog', def: 'A Fox 3 fired with no lock: its seeker comes on almost at once and takes the first thing it finds, friendly or not.' },
  { cat: 'missiles', term: 'Loft',
    def: 'The missile climbs after launch to fly in thin air and arrive with more energy. The AIM-120 lofts about 30° when fired beyond ~25 km; the R-27 and R-77 do not loft in DCS.' },

  // ---- launch zone
  { cat: 'zone', term: 'DLZ', aka: 'Dynamic launch zone',
    def: 'The range scale on your HUD or radar display with the Rmax, no-escape and Rmin marks and a caret for the target range. It moves with altitude, speed and his aspect.' },
  { cat: 'zone', term: 'Rmax',
    def: 'Longest shot against a target that keeps flying as he is. Fire here and he only has to turn away to beat it. Top tick on the Russian HUD; RMAX on the Hornet.' },
  { cat: 'zone', term: 'Rpi', jets: ['f15c', 'f16c'],
    def: 'F-15C and Viper: maximum range against a non-manoeuvring target with your current steering. Their name for Rmax.' },
  { cat: 'zone', term: 'Rtr', aka: 'turn and run', jets: [...RU, 'f15c', 'f16c'],
    def: 'Maximum range if he turns and runs at your launch: the no-escape shot. Middle tick on the Russian HUD; RTR on the F-15C and Viper. Shoot inside it for a kill.' },
  { cat: 'zone', term: 'Rne', aka: 'no-escape range', jets: ['fa18c', 'm2000c'],
    def: 'Hornet: he stays in range even if he turns 180° at launch. SHOOT flashes inside it. Same idea as Rtr. The M-2000C shows TIR inside its most restrictive zone.' },
  { cat: 'zone', term: 'Rmin', def: 'Minimum range: closer than this the missile cannot arm or turn onto him in time.' },
  { cat: 'zone', term: 'ПР', aka: 'launch authorised', jets: RU,
    def: 'Russian HUD shoot cue: the target is in range for the selected missile. Hold Space at least 1 s.' },
  { cat: 'zone', term: 'F-pole', def: 'Your range to the target when your missile hits. More F-pole means more margin against his shot coming back.' },
  { cat: 'zone', term: 'A-pole',
    def: 'Your range to the target when your missile goes active, the moment you can leave. The Viper DLZ calls it the M-pole.' },

  // ---- defending
  { cat: 'defence', term: 'Notch',
    def: 'Put the radar or missile on your beam within a few degrees so your radial speed sits inside its Doppler gate and you vanish into the clutter. Works best low, with ground behind you; chaff helps only while you are in it.' },
  { cat: 'defence', term: 'Beam',
    def: 'Flying perpendicular to the threat, at your 3 or 9 o\'clock. It is how you notch, and it slows the missile\'s closure without running away.' },
  { cat: 'defence', term: 'Crank',
    def: 'After your shot, turn about 50° off the target, just inside your radar gimbal, to slow the closure while you keep supporting the missile.' },
  { cat: 'defence', term: 'Pump',
    def: 'Turn cold to open the range, then come back hot and re-engage. You pump once your missile no longer needs you, or to reset before his shot reaches you.' },
  { cat: 'defence', term: 'Drag',
    def: 'Turn cold and run at full afterburner, descending into thick air, so the missile behind you runs out of energy before it catches you.' },

  // ---- brevity
  { cat: 'brevity', term: 'Bogey', def: 'A radar or visual contact you have not identified yet.' },
  { cat: 'brevity', term: 'Bandit', def: 'A contact identified as hostile.' },
  { cat: 'brevity', term: 'Spike', def: 'Your RWR shows an airborne radar tracking you: a lock, a launch, or a mode it cannot tell.' },
  { cat: 'brevity', term: 'Nails', def: 'Your RWR shows an airborne radar in search. He sees you, but is not locked.' },
  { cat: 'brevity', term: 'Mud', def: 'Your RWR shows a surface threat, a SAM or ground radar.' },
];

export function glossaryHaystack(g: GlossaryEntry): string {
  return [g.term, g.aka ?? '', g.def].join(' • ');
}
