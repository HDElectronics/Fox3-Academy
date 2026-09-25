/**
 * SAM sites in the 3D view, drawn the way the DCS F10 map and Mission Editor show them: a site marker, the
 * threat ring on the ground (maximum engagement range), a dashed minimum-range ring, and a faint altitude
 * band up to the site's ceiling. A reviewed vehicle with a procedural fallback sits at the site, boosted to a
 * pixel floor like the jets. The tag reads the site and what its radar is doing (SEARCH, TRACK, LAUNCH).
 * SAMs in flight go through the TacticalScene missile pipeline (samMissileLike) so they get smoke and trails.
 * Game view only: ring sizes are SAMS[type] (not verified in the Mission Editor), no radar internals.
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3, type BufferGeometry, type Color } from 'three';
import { SAMS } from '../data/sams';
import type { MissileId, SamId } from '../data/types';
import type { EntityId, SamMissile, SamState, Side } from '../sim/types';
import { fmtRange, type Units } from '../app/format';
import type { Stage } from './stage';
import type { LineBatch } from './lines';
import { Shape, type SymbolLayer } from './symbols';
import { sideColor, type Palette } from './palette';
import { Tag, LabelPriority, type DeclutterLabel, type LabelRegistration } from './tags';
import { boostedScale, UNIT_PER_M } from './units';
import type { MissileLike } from './tactical';
import { AssetVisual } from './assets';
import { fitGroundAsset } from './attack/groundUnits';

/** The fields the renderer reads from a SAM site (sim SamSite and recorded frames both fit). */
export interface SamSiteLike {
  id: EntityId;
  type: SamId;
  side: Side;
  /** Site position in sim metres; y is the site's ground height. */
  pos: { x: number; y: number; z: number };
  state: SamState;
  targetId: EntityId | null;
  active: boolean;
  alive?: boolean;
}

/** Short site name used on tags ('SA-11'). */
export function samShortName(type: SamId): string {
  return SAMS[type].nato.split(' ')[0];
}

/** Tag text for a site: name, class, radar state and ring radius. `tone` colours the tag. */
export function samTagText(s: SamSiteLike, u: Units): { title: string; type: string; sub: string; tone: 'caution' | 'warning' | 'dim' | null } {
  const ring = fmtRange(SAMS[s.type].threatRingKm * 1000, u);
  const dead = s.alive === false;
  const state = dead ? 'DESTROYED' : !s.active || s.state === 'off' ? 'SILENT'
    : s.state === 'engage' ? 'LAUNCH' : s.state === 'track' ? 'TRACK' : 'SEARCH';
  const tone = dead || state === 'SILENT' ? 'dim' : s.state === 'engage' ? 'warning' : s.state === 'track' ? 'caution' : null;
  return { title: samShortName(s.type), type: 'SAM', sub: state + ' · RING ' + ring, tone };
}

/** Points of a horizontal circle (render units), closed: n + 1 points. */
export function circlePoints(cx: number, y: number, cz: number, r: number, n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.sin(a) * r, y, cz - Math.cos(a) * r]);
  }
  return out;
}

/** Stand-in body for a SAM in the missile pipeline (mesh only; tag and size come from `display`). */
const SAM_MESH: Record<SamId, MissileId> = { sa10: 'aim54c', sa11: 'aim54a', sa15: 'aim7m' };
/** Rough body length for the on-screen size of a SAM, m (display only). */
const SAM_LEN_M: Record<SamId, number> = { sa10: 7, sa11: 5.5, sa15: 3 };
/** Motor smoke seconds in the replay (display only, not weapon data). */
export const SAM_SMOKE_S: Record<SamId, number> = { sa10: 10, sa11: 12, sa15: 6 };

/** Adapt a SAM in flight to the missile renderer. Reuses `out` when given. */
export function samMissileLike(m: Pick<SamMissile, 'id' | 'type' | 'side' | 'siteId' | 'targetId' | 'pos' | 'vel' | 'alive' | 'guided' | 'motorLeft' | 'launchedAt' | 'result'>, out?: MissileLike): MissileLike {
  const o: MissileLike = out ?? {
    id: m.id, type: SAM_MESH[m.type], side: m.side, shooterId: m.siteId, targetId: m.targetId, pos: new Vector3(), vel: new Vector3(),
    alive: true, guidance: 'ballistic', motorLeft: 0, launchedAt: m.launchedAt, seekerOn: null, timeToActive: null, result: null,
  };
  o.pos.set(m.pos.x, m.pos.y, m.pos.z);
  o.vel.set(m.vel.x, m.vel.y, m.vel.z);
  o.targetId = m.targetId;
  o.alive = m.alive;
  o.guidance = m.guided ? 'sarh' : 'ballistic';
  o.motorLeft = m.motorLeft;
  o.result = m.result ? { kind: m.result.kind, reason: m.result.reason, t: m.result.t } as MissileLike['result'] : null;
  o.display = samMissileDisplay(m.type);
  return o;
}

export function samMissileDisplay(type: SamId): NonNullable<MissileLike['display']> {
  return { name: samShortName(type), lengthM: SAM_LEN_M[type], guidedText: 'SITE TRACK', smoke: 1, visualAssetId: `${type}-missile` };
}
export function samMissileMesh(type: SamId): MissileId { return SAM_MESH[type]; }

// ------------------------------------------------------------------------------------------ meshes

const VEHICLE_M = 9;

interface Part { geo: BufferGeometry; x: number; y: number; z: number; rx?: number; ry?: number }

/** Low-poly launcher + radar vehicle, metres, nose toward −z. Built once per type. */
function vehicleParts(type: SamId): Part[] {
  const hull = new BoxGeometry(3, 1.4, 8);
  const parts: Part[] = [{ geo: hull, x: 0, y: 0.9, z: 0 }];
  if (type === 'sa10') {
    // Four tall canisters raised near vertical, a separate flat radar panel beside them.
    for (let i = 0; i < 4; i++) parts.push({ geo: new CylinderGeometry(0.35, 0.35, 7, 6), x: -1.1 + i * 0.73, y: 4.4, z: 2.2, rx: -0.25 });
    parts.push({ geo: new BoxGeometry(3.6, 3.4, 0.3), x: 5.5, y: 4, z: 0, rx: -0.4 });
    parts.push({ geo: new BoxGeometry(0.4, 3, 0.4), x: 5.5, y: 2, z: 0.4 });
  } else if (type === 'sa11') {
    // Turntable with four rails angled up, radar dish on the front.
    parts.push({ geo: new BoxGeometry(2.4, 0.6, 2.4), x: 0, y: 1.9, z: 1 });
    for (let i = 0; i < 4; i++) parts.push({ geo: new BoxGeometry(0.35, 0.35, 5.5), x: -0.9 + i * 0.6, y: 3.2, z: 1, rx: 0.5 });
    parts.push({ geo: new CylinderGeometry(1.1, 1.1, 0.25, 10), x: 0, y: 3, z: -2.6, rx: Math.PI / 2 - 0.3 });
  } else {
    // Turret box with a search antenna on top and a tracking panel on the front.
    parts.push({ geo: new BoxGeometry(2.6, 2.2, 3), x: 0, y: 2.7, z: 0.5 });
    parts.push({ geo: new BoxGeometry(3.4, 0.2, 1.2), x: 0, y: 4.1, z: 0.5, rx: 0.3 });
    parts.push({ geo: new BoxGeometry(1.8, 1.6, 0.25), x: 0, y: 2.9, z: -1.1, rx: -0.2 });
  }
  return parts;
}

interface SiteVis {
  id: EntityId;
  data: SamSiteLike;
  mesh: Group;
  fallback: Group;
  dead: boolean | null;
  tint: Color;
  asset: AssetVisual;
  mat: MeshStandardMaterial;
  tag: Tag;
  unregister: () => void;
  seen: number;
  pos: Vector3;
}

export interface SamDrawContext {
  lines: LineBatch;
  symbols: SymbolLayer;
  palette: Palette;
  units: Units;
  /** Draw rings, minimum range and altitude band. */
  rings: boolean;
  labels: boolean;
  /** Site → target track line. */
  illumination: boolean;
  /** Displayed position (render units) of an aircraft, if visible. */
  jetPos(id: EntityId): Vector3 | undefined;
  /** Hide sites on this side when truth is off and the observer is on the other side. */
  showSide(side: Side): boolean;
  minPx: number;
  labelTick: boolean;
}

/** Owns SAM site meshes and tags for one TacticalScene. */
export class SamSiteLayer {
  private sites = new Map<EntityId, SiteVis>();
  private frame = 0;

  constructor(private stage: Stage, private group: Group, private register: (l: DeclutterLabel, o: LabelRegistration) => () => void) {}

  get size(): number { return this.sites.size; }

  sync(sites: Iterable<SamSiteLike>): void {
    const f = ++this.frame;
    for (const s of sites) {
      let v = this.sites.get(s.id);
      if (!v) v = this.create(s);
      v.seen = f; v.data = s;
      v.pos.set(s.pos.x, s.pos.y, s.pos.z).multiplyScalar(UNIT_PER_M);
    }
    for (const v of this.sites.values()) if (v.seen !== f) { this.disposeSite(v); this.sites.delete(v.id); }
  }

  private create(s: SamSiteLike): SiteVis {
    const P = this.stage.palette;
    const mat = new MeshStandardMaterial({ color: P.dark.clone().lerp(sideColor(P, s.side), 0.35), roughness: 0.85, metalness: 0.1, flatShading: true });
    const mesh = new Group();
    const fallback = new Group();
    for (const p of vehicleParts(s.type)) {
      const m = new Mesh(p.geo, mat);
      m.position.set(p.x, p.y, p.z);
      if (p.rx) m.rotation.x = p.rx;
      if (p.ry) m.rotation.y = p.ry;
      fallback.add(m);
    }
    const asset = new AssetVisual(s.type, { onReady: visual => {
      fitGroundAsset(visual, VEHICLE_M);
      fallback.visible = false;
      this.stage.requestRender();
    } });
    asset.setTint(sideColor(P, s.side));
    mesh.add(fallback, asset);
    mesh.name = 'sam:' + s.type;
    this.group.add(mesh);
    const tag = new Tag(this.stage.labels, 'site', s.side);
    const v: SiteVis = { id: s.id, data: s, mesh, fallback, dead: null, tint: sideColor(P, s.side).clone(), asset, mat, tag, unregister: () => {}, seen: 0, pos: new Vector3() };
    v.unregister = this.register(tag, { priority: LabelPriority.site });
    this.sites.set(s.id, v);
    return v;
  }

  draw(c: SamDrawContext): void {
    const cam = this.stage.camera;
    for (const v of this.sites.values()) {
      const s = v.data, P = c.palette;
      const show = c.showSide(s.side);
      v.mesh.visible = show;
      v.tag.visible = show && c.labels;
      if (!show) continue;
      const dead = s.alive === false;
      const col: Color = sideColor(P, s.side);
      const { x, y, z } = v.pos;
      const ppu = this.stage.pxPerUnit(cam.position.distanceTo(v.pos));
      const sc = boostedScale(ppu, VEHICLE_M, c.minPx);
      v.mesh.position.copy(v.pos);
      v.mesh.scale.set(sc, dead ? sc * 0.55 : sc, sc);
      if (v.dead !== dead || !v.tint.equals(col)) {
        v.dead = dead; v.tint.copy(col);
        v.mat.color.copy(dead ? P.soot : P.dark);
        if (!dead) v.mat.color.lerp(col, 0.35);
        v.asset.setMaterial(dead ? v.mat : null);
        if (!dead) v.asset.setTint(col);
      }
      c.symbols.put(x, y + 0.0005, z, Shape.diamond, 14, col, dead ? 0.35 : 0.95);
      if (c.rings && !dead) {
        const spec = SAMS[s.type];
        const r = spec.threatRingKm * 1000 * UNIT_PER_M;
        const hot = s.state === 'engage' ? P.warning : s.state === 'track' ? P.caution : col;
        const a = s.active ? 0.8 : 0.35;
        const gy = y + 0.003;
        ring(c.lines, x, gy, z, r, 128, hot, a, 1.8, 0);
        ring(c.lines, x, gy, z, spec.minRangeKm * 1000 * UNIT_PER_M, 32, col, a * 0.5, 1.1, 6);
        // Altitude band: faint ceiling ring and a few posts from the ground ring up to it.
        const top = y + spec.maxAltM * UNIT_PER_M;
        ring(c.lines, x, top, z, r, 96, col, a * 0.28, 1, 10);
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2;
          const px = x + Math.sin(ang) * r, pz = z - Math.cos(ang) * r;
          c.lines.seg(px, gy, pz, px, top, pz, col.r, col.g, col.b, a * 0.22, col.r, col.g, col.b, a * 0.05, 1, 0);
        }
      }
      // Track radar on a target: dashed line site → target (the site "illuminating" it).
      if (c.illumination && !dead && s.active && s.targetId && (s.state === 'track' || s.state === 'engage')) {
        const t = c.jetPos(s.targetId);
        if (t) {
          const k = s.state === 'engage' ? P.warning : P.caution;
          c.lines.seg(x, y + 0.004, z, t.x, t.y, t.z, k.r, k.g, k.b, 0.75, k.r, k.g, k.b, 0.75, 1.5, 14, 60, 0.6);
        }
      }
      if (v.tag.visible) {
        v.tag.obj.position.set(x, y + 0.004, z);
        if (c.labelTick) {
          const tt = samTagText(s, c.units);
          v.tag.set(tt.title, tt.type, tt.sub, '');
          v.tag.setTone(tt.tone);
          v.tag.setDead(dead);
        }
      }
    }
  }

  /** Displayed site position (render units), or null. */
  positionOf(id: EntityId): Vector3 | null { return this.sites.get(id)?.pos ?? null; }

  clear(): void {
    for (const v of this.sites.values()) this.disposeSite(v);
    this.sites.clear();
  }

  private disposeSite(v: SiteVis): void {
    v.unregister(); v.tag.dispose(); v.mesh.removeFromParent();
    v.asset.dispose();
    for (const m of v.fallback.children) (m as Mesh).geometry.dispose();
    v.mat.dispose();
  }
}

function ring(lines: LineBatch, cx: number, y: number, cz: number, r: number, n: number, c: Color, a: number, w: number, dash: number): void {
  let px = cx, pz = cz - r;
  for (let i = 1; i <= n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const x = cx + Math.sin(ang) * r, z = cz - Math.cos(ang) * r;
    lines.seg(px, y, pz, x, y, z, c.r, c.g, c.b, a, c.r, c.g, c.b, a, w, dash);
    px = x; pz = z;
  }
}
