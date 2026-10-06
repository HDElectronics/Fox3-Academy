/** Scripted visual choreography only; no bomb ballistics or guidance model. Scene units are kilometres. */
import { BufferGeometry, CylinderGeometry, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, RingGeometry, SphereGeometry, Vector3 } from 'three';
import { AssetVisual } from '../../render/assets';
import type { Theme } from '../../ui/theme';
import type { LaserDeliverySession } from './delivery';
import type { AtflirSession } from './model';
import { LGB_TRAINING_TIMING } from '../../data/fa18cLgb';
export const RELEASE_POINT = new Vector3(-.13, .16, .16);
export const HIT_POINT = new Vector3(.14, .002, -.07);
export const MISS_POINT = new Vector3(.20, .002, -.025);
export function bombPosition(fraction: number, endpoint: Vector3): Vector3 {
  const t = Math.max(0, Math.min(1, fraction));
  return RELEASE_POINT.clone().lerp(endpoint, t).add(new Vector3(0, Math.sin(t * Math.PI) * .025, 0));
}
export class DeliveryVisual extends Group {
  readonly bomb = new Group();
  readonly impact = new Group();
  readonly positionCue = new Vector3();
  label = '';
  private readonly asset: AssetVisual;
  private readonly fallback: Mesh;
  private readonly trailGeometry = new BufferGeometry();
  private readonly trailMaterial: LineBasicMaterial;
  private readonly trail: Line;
  private readonly flashMaterial: MeshBasicMaterial;
  private readonly smokeMaterial: MeshStandardMaterial;
  private readonly flash: Mesh;
  private readonly smoke: Mesh[] = [];
  private readonly ring: Mesh;
  private readonly geometry = [new CylinderGeometry(.0011,.0011,.012,10), new SphereGeometry(1,12,8), new RingGeometry(.8,1,40)];
  private readonly bodyMaterial: MeshStandardMaterial;
  private readonly ringMaterial: MeshBasicMaterial;
  private phase = 'idle';
  private code = '1688';
  private age = 0;
  private session: LaserDeliverySession | null = null;
  private disposed = false;
  constructor(theme: Theme) {
    super();
    this.bodyMaterial = new MeshStandardMaterial({ color: theme.earth });
    this.fallback = new Mesh(this.geometry[0], this.bodyMaterial); this.fallback.rotation.x = Math.PI / 2;
    this.asset = new AssetVisual('gbu12', { onReady: () => { this.fallback.visible = false; } });
    // Four-times exterior scale keeps the prop visible in the overview; it is a labelled teaching aid.
    this.asset.scale.setScalar(.004); this.bomb.add(this.fallback, this.asset);
    this.trailMaterial = new LineBasicMaterial({ color: theme.caution, transparent: true, opacity: .85, depthTest: false });
    this.trail = new Line(this.trailGeometry, this.trailMaterial); this.trail.frustumCulled = false;
    this.flashMaterial = new MeshBasicMaterial({ color: theme.caution, transparent: true, opacity: 1, depthWrite: false });
    this.smokeMaterial = new MeshStandardMaterial({ color: theme.panelMuted, roughness: 1, transparent: true, opacity: .85, depthWrite: false });
    this.flash = new Mesh(this.geometry[1], this.flashMaterial); this.impact.add(this.flash);
    for (let i=0;i<7;i++) { const puff = new Mesh(this.geometry[1], this.smokeMaterial); this.smoke.push(puff); this.impact.add(puff); }
    this.ringMaterial = new MeshBasicMaterial({ color: theme.caution, transparent: true, opacity: .7, depthWrite: false });
    this.ring = new Mesh(this.geometry[2], this.ringMaterial); this.ring.rotation.x = -Math.PI/2; this.impact.add(this.ring);
    this.add(this.bomb, this.trail, this.impact); this.bomb.visible = this.trail.visible = this.impact.visible = false;
  }
  update(delivery: LaserDeliverySession | null, pod: AtflirSession, dt: number): void {
    const phase = delivery?.phase ?? 'idle';
    if (this.session !== delivery || phase === 'idle' || phase === 'approach') {
      this.age = 0; this.bomb.visible = this.trail.visible = this.impact.visible = false; this.label = '';
    }
    if (delivery && phase === 'flight') {
      if (this.phase !== 'flight' || this.session !== delivery) this.code = delivery.bombCode;
      const p = 1 - delivery.timer / LGB_TRAINING_TIMING.flight;
      const matching = delivery.laserOn && delivery.laserCode === this.code && pod.target === 'assigned' && !pod.obscured;
      const endpoint = p < .5 || matching ? HIT_POINT : MISS_POINT;
      this.bomb.position.copy(bombPosition(p, endpoint));
      const direction = bombPosition(Math.min(1,p+.01), endpoint).sub(this.bomb.position).normalize();
      this.bomb.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0,0,-1), direction));
      this.bomb.visible = this.trail.visible = true; this.impact.visible = false;
      this.trailGeometry.setFromPoints(Array.from({length:32},(_,i)=>bombPosition(p*i/31,endpoint)));
      this.positionCue.copy(this.bomb.position); this.label = `GBU-12 · ${Math.ceil(delivery.timer)} s`;
    } else if (phase === 'hit' || phase === 'miss') {
      if (this.phase !== phase || this.session !== delivery) this.age = 0;
      this.age += Math.max(0,Math.min(dt,.1)); this.bomb.visible = false; this.impact.visible = true;
      this.impact.position.copy(phase === 'hit' ? HIT_POINT : MISS_POINT);
      this.positionCue.copy(this.impact.position); this.label = phase === 'hit' ? 'IMPACT · HIT' : 'IMPACT · MISS';
      const a = this.age;
      this.flash.visible = a < 1.4; this.flash.scale.setScalar(.003 + Math.min(a,.5)*.035); this.flash.position.y = .006;
      this.flashMaterial.opacity = Math.max(0,1-a/1.4);
      this.smokeMaterial.opacity = Math.max(.12,.7-a*.065);
      for (const [i,puff] of this.smoke.entries()) {
        const angle = i * 2.4; puff.position.set(Math.cos(angle)*(.003+a*.0015), .006+a*.007+i*.002, Math.sin(angle)*(.003+a*.0015));
        puff.scale.setScalar(.003+Math.min(a,6)*.002+i*.0004); puff.visible = a < 9;
      }
      this.ring.position.y=.0005; this.ring.scale.setScalar(.006+Math.min(a,1.5)*.022); this.ringMaterial.opacity = Math.max(.15,.8-a*.3);
    }
    this.phase = phase; this.session = delivery;
  }
  override dispose(): void {
    if(this.disposed) return; this.disposed=true; this.asset.dispose();
    this.geometry.forEach(g=>g.dispose()); this.trailGeometry.dispose();
    for(const m of [this.bodyMaterial,this.trailMaterial,this.flashMaterial,this.smokeMaterial,this.ringMaterial]) m.dispose();
    this.clear();
  }
}
