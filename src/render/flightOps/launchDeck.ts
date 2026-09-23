/**
 * LaunchDeck: the deck-launch furniture for the catapult and ski-jump trainer (issue #27), in ship-local metres
 * (the CarrierMesh frame: origin at the ramp, x to starboard, y up, forward along −z). The scene adds it to the
 * CarrierMesh and drives it from `FlightOpsState.launch` with `update(launch, { a, c }, jetLengthM, t)`.
 *
 * CVN: four catapult tracks at the `STATION_C` offsets (cats 1–2 on the bow, 3–4 on the waist), a shuttle that
 * rides under the nose of the jet on the active catapult, and one jet-blast deflector per catapult: a flat plate
 * that raises behind the jet while it is held and lowers after the stroke. Kuznetsov: painted launch positions
 * 1–3 (a bar across, a lead line to the ramp) and a pair of deck stoppers that stand in front of the main wheels
 * during the run-up and drop at the release. The ski-jump ramp itself is part of CarrierMesh (`skiJumpProfile`).
 * Drawing values, not ship plans; the motion comes from the sim.
 */
import { BoxGeometry, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Material } from 'three';
import { FLIGHT_OPS } from '../../data/flightOps';
import { SHIPS, SHIP_HULL } from '../../data/ships';
import { RAMP_DEG, RAMP_M, STATION_C } from '../../sim/flightOps/launch';
import type { LaunchState, ShipId } from '../../sim/flightOps/types';
import type { Palette } from '../palette';

/** Catapult track length drawn on the deck, metres (drawing value). */
export const CAT_TRACK_M = 95;
/** Jet-blast deflector: width, height, raise time and the gap behind the jet's tail (drawing values). */
export const JBD = { widthM: 11, heightM: 4, raiseS: 2, gapM: 3, raisedDeg: 55 } as const;

/** Ski-jump height above the deck at `into` metres up the ramp (the sim's curve: 0 at the foot, RAMP_DEG at the lip). */
export function skiJumpHeight(into: number): number {
  const x = Math.max(0, Math.min(into, RAMP_M));
  return (x * x * Math.tan(RAMP_DEG * Math.PI / 180)) / (2 * RAMP_M);
}

/** Ski-jump profile points (a forward of the ramp foot, h above the deck), `n` segments. */
export function skiJumpProfile(n = 10): { a: number; h: number }[] {
  return Array.from({ length: n + 1 }, (_, i) => { const a = (RAMP_M * i) / n; return { a, h: skiJumpHeight(a) }; });
}

/** Catapult tracks, ship frame (a forward of the ramp, c to starboard): cats 1–2 end 3 m short of the bow, 3–4 on the waist. */
export function catTracks(id: ShipId = 'cvn'): { station: number; a0: number; a1: number; c: number }[] {
  const L = SHIP_HULL[id].lengthM;
  return Object.entries(STATION_C[id]).map(([k, c]) => {
    const station = Number(k);
    const a1 = station <= 2 ? L - 3 : L * 0.62;
    return { station, a0: a1 - CAT_TRACK_M, a1, c };
  });
}

/** Ski-jump launch positions (ship frame): the run to the ramp foot from the launch data, or the Supercarrier values. */
export function launchPositions(id: ShipId = 'kuznetsov'): { station: number; a: number; c: number; runM: number }[] {
  const run = Object.values(FLIGHT_OPS).find(d => d.launch?.ship === id && d.launch.runM)?.launch?.runM?.value
    ?? { 1: 90, 2: 90, 3: 180 };
  const L = SHIP_HULL[id].lengthM;
  return Object.entries(STATION_C[id]).map(([k, c]) => {
    const station = Number(k);
    const runM = run[station] ?? 90;
    return { station, a: L - runM, c, runM };
  });
}

/** Jet-blast deflector raise, 0 (flush) to 1 (up): up over `JBD.raiseS` from the start, down after the stroke. */
export function jbdRaise(L: Pick<LaunchState, 'kind' | 'stage' | 'endT'> | undefined | null, t: number): number {
  if (!L || L.kind !== 'catapult') return 0;
  const k = (x: number) => Math.max(0, Math.min(1, x / JBD.raiseS));
  if (L.stage === 'hold' || L.stage === 'shot' || L.stage === 'stroke') return k(t);
  return 1 - k(t - (L.endT ?? t));
}

/** Deck stoppers up: the ski-jump jet is held on its position until the release. */
export const stoppersUp = (L: Pick<LaunchState, 'kind' | 'stage'> | undefined | null) => !!L && L.kind === 'skiJump' && L.stage === 'hold';

export class LaunchDeck extends Group {
  readonly shipId: ShipId;
  private readonly geoms: BufferGeometry[] = [];
  private readonly mats: Material[] = [];
  private readonly deckY: number;
  private readonly jbds = new Map<number, Group>();
  private readonly shuttle: Mesh | null = null;
  private readonly stoppers: Group | null = null;
  private holdA: number | null = null;

  constructor(palette: Palette, id: ShipId) {
    super();
    this.name = `flightOps:launchDeck:${id}`;
    this.shipId = id;
    const H = SHIPS[id].deckHeightM;
    this.deckY = H;
    const paint = (color: typeof palette.caution) => this.mat(new MeshBasicMaterial({ color: color.clone(), side: DoubleSide, toneMapped: false }));
    const steel = this.mat(new MeshStandardMaterial({ color: palette.smoke.clone().lerp(palette.dark, 0.25), roughness: 0.7, metalness: 0.3 }));
    const box = (w: number, h: number, d: number, m: Material) => { const g = new BoxGeometry(w, h, d); this.geoms.push(g); return new Mesh(g, m); };

    if (id === 'cvn') {
      const trackMat = paint(palette.smoke);
      for (const t of catTracks(id)) {
        const len = t.a1 - t.a0;
        const track = box(0.5, 0.05, len, trackMat);
        track.position.set(t.c, H + 0.14, -(t.a0 + len / 2));
        track.name = `flightOps:cat${t.station}`;
        this.add(track);
        // Jet-blast deflector: hinged at its forward edge, flush with the deck until raised.
        const pivot = new Group();
        pivot.name = `flightOps:jbd${t.station}`;
        const plate = box(JBD.widthM, 0.25, JBD.heightM, steel);
        plate.position.set(0, 0.13, JBD.heightM / 2);   // extends aft of the hinge
        pivot.add(plate);
        pivot.position.set(t.c, H + 0.02, -(t.a0 - 18));
        this.add(pivot);
        this.jbds.set(t.station, pivot);
      }
      this.shuttle = box(0.7, 0.35, 1.4, paint(palette.caution));
      this.shuttle.name = 'flightOps:shuttle';
      this.shuttle.visible = false;
      this.add(this.shuttle);
    } else {
      const bar = paint(palette.caution), lead = paint(palette.missile);
      for (const p of launchPositions(id)) {
        const across = box(8, 0.04, 0.6, bar);
        across.position.set(p.c, H + 0.14, -p.a);
        across.name = `flightOps:position${p.station}`;
        this.add(across);
        // Lead line from the position to the ramp foot, dashed.
        for (let a = p.a + 4; a + 5 < p.a + p.runM - RAMP_M; a += 10) {
          const dash = box(0.35, 0.04, 5, lead);
          dash.position.set(p.c, H + 0.14, -(a + 2.5));
          this.add(dash);
        }
        // Position number as tick marks beside the bar (1, 2 or 3 ticks).
        for (let i = 0; i < p.station; i++) {
          const tick = box(0.4, 0.04, 2, bar);
          tick.position.set(p.c - 5 - i * 0.9, H + 0.14, -p.a);
          this.add(tick);
        }
      }
      const st = new Group();
      st.name = 'flightOps:stoppers';
      for (const side of [-1, 1]) {
        const pivot = new Group();
        const plate = box(1.4, 0.8, 0.12, steel);
        plate.position.set(0, 0.4, 0);
        pivot.add(plate);
        pivot.position.set(side * 2.1, 0, 0);
        st.add(pivot);
      }
      st.visible = false;
      this.stoppers = st;
      this.add(st);
    }
  }

  private mat<T extends Material>(m: T): T { this.mats.push(m); return m; }

  /**
   * Drive the furniture from the launch state and the jet's ship-frame position (a forward of the ramp,
   * c to starboard), its length and the sim time. `null` hides the moving parts and lowers every deflector.
   */
  update(L: LaunchState | null | undefined, jet: { a: number; c: number } | null, jetLengthM: number, t: number): void {
    if (!L || !jet) {
      this.holdA = null;
      for (const p of this.jbds.values()) p.rotation.x = 0;
      if (this.shuttle) this.shuttle.visible = false;
      if (this.stoppers) this.stoppers.visible = false;
      return;
    }
    if (L.stage === 'hold' || L.stage === 'shot' || this.holdA === null) this.holdA = jet.a;
    const H = this.deckY;
    const c = STATION_C[this.shipId][L.station] ?? jet.c;
    if (this.shipId === 'cvn') {
      const raise = jbdRaise(L, t);
      for (const [st, p] of this.jbds) {
        if (st === L.station) {
          p.position.set(c, H + 0.02, -(this.holdA - jetLengthM / 2 - JBD.gapM));
          p.rotation.x = -raise * JBD.raisedDeg * Math.PI / 180;   // the aft edge rises
        } else p.rotation.x = 0;
      }
      if (this.shuttle) {
        const track = catTracks(this.shipId).find(x => x.station === L.station);
        const nose = jet.a + jetLengthM * 0.4;
        const a = track ? Math.min(track.a1, nose) : nose;
        this.shuttle.visible = true;
        this.shuttle.position.set(c, H + 0.3, -(L.stage === 'settle' || L.stage === 'free' ? (track?.a1 ?? a) : a));
      }
    } else if (this.stoppers) {
      this.stoppers.visible = true;
      this.stoppers.position.set(c, H + 0.1, -(this.holdA + 1.8));
      const up = stoppersUp(L);
      for (const p of this.stoppers.children) p.rotation.x = up ? 0 : -Math.PI / 2 + 0.05;   // dropped: flat, forward
    }
  }

  override dispose(): void {
    for (const g of this.geoms) g.dispose();
    for (const m of this.mats) m.dispose();
    this.removeFromParent();
  }
}
