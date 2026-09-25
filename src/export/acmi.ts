/** Tacview ACMI 2.2 export of the sampled whole-fight truth, with no simulation changes. */
import { AIRCRAFT } from '../data/aircraft';
import { MISSILES } from '../data/missiles';
import { SAMS } from '../data/sams';
import type { EntityId, RecordFrame, Side, SimEvent } from '../sim/types';

export interface AcmiOptions {
  title?: string;
  callsigns?: Readonly<Record<EntityId, string>>;
  events?: readonly SimEvent[];
}

const DEG = 180 / Math.PI;
const EARTH_RADIUS = 6378137;
/** No actual mission date or location is recorded by the trainer. */
const REFERENCE_TIME = '2000-01-01T00:00:00Z';

// Text is single-line. Flatten backslashes before escaping commas so callers cannot inject records.
const text = (value: string): string => value.replace(/[\r\n\t|]/g, ' ').replace(/\\/g, '/').replace(/,/g, '\\,');
const n = (value: number, places = 3): string => {
  if (!Number.isFinite(value)) throw new Error('Recording contains an invalid coordinate or time.');
  return String(Number(value.toFixed(places)));
};
const degrees = (radians: number): string => n(radians * DEG);
const heading = (radians: number): string => n(((radians * DEG) % 360 + 360) % 360);

interface Sample {
  id: EntityId;
  side: Side;
  pos: [number, number, number];
  alive: boolean;
  name: string;
  tags: string;
  parent?: EntityId;
  attitude?: [number, number, number];
}

function samples(frame: RecordFrame): Sample[] {
  return [
    ...frame.aircraft.map(a => ({ ...a, name: AIRCRAFT[a.type].short, tags: 'Air+FixedWing', attitude: [a.roll, a.pitch, a.heading] as [number, number, number] })),
    ...frame.missiles.map(m => ({ ...m, name: MISSILES[m.type].name, tags: 'Weapon+Missile', parent: m.shooterId })),
    // `active` means radar enabled. An inactive site still exists in the recording.
    ...(frame.sams ?? []).map(s => ({ ...s, alive: true, name: SAMS[s.type].nato, tags: 'Ground+AntiAircraft' })),
    ...(frame.samMissiles ?? []).map(m => ({ ...m, name: `${SAMS[m.type].nato} missile`, tags: 'Weapon+Missile', parent: m.siteId })),
  ];
}

function transform(s: Sample): string {
  const [east, altitude, south] = s.pos;
  const north = -south;
  const position = [n(east / EARTH_RADIUS * DEG, 8), n(north / EARTH_RADIUS * DEG, 8), n(altitude)];
  // Native flat-world metres preserve trainer distances; synthetic lat/lon are only placement.
  return s.attitude
    ? [...position, degrees(s.attitude[0]), degrees(s.attitude[1]), heading(s.attitude[2]), n(east), n(north), heading(s.attitude[2])].join('|')
    : [...position, n(east), n(north)].join('|');
}

function eventMessage(e: SimEvent): { ids: EntityId[]; message: string } | null {
  switch (e.type) {
    case 'launch': return { ids: [e.shooterId, e.missileId], message: `${MISSILES[e.missile].name} launched` };
    case 'pitbull': return { ids: [e.missileId], message: 'Missile active' };
    case 'hit': return { ids: [e.missileId, e.targetId], message: 'Missile hit' };
    case 'miss': return { ids: [e.missileId], message: `Missile ended: ${e.reason}` };
    case 'kill': return { ids: [e.targetId], message: 'Aircraft destroyed' };
    case 'datalink-lost': return { ids: [e.missileId], message: `Datalink lost: ${e.why}` };
    case 'sam': return { ids: [e.siteId, e.targetId], message: `SAM ${e.what}${e.why ? `: ${e.why}` : ''}` };
    default: return null;
  }
}

/**
 * UTF-8 text (BOM included). Input is not mutated; missing/dead objects are removed at their next
 * recording sample. Empty input produces a valid metadata-only file. UI disables that download.
 */
export function exportAcmi(recording: readonly RecordFrame[], options: AcmiOptions = {}): string {
  const lines = [
    '\uFEFFFileType=text/acmi/tacview', 'FileVersion=2.2',
    `0,ReferenceTime=${REFERENCE_TIME}`,
    '0,DataSource=Fox3 Academy,DataRecorder=Fox3 Academy',
    `0,Title=${text(options.title ?? 'Fox3 Academy sortie')}`,
    '0,ReferenceLongitude=0,ReferenceLatitude=0',
    '0,Comments=Simplified trainer whole-fight truth. Synthetic origin 0N 0E and date 2000-01-01. Native coordinates are east and north metres. Objects are sampled every 0.25 s; events retain their recorded times. No DCS terrain or sensor picture.',
  ];
  const frames = [...recording].sort((a, b) => a.t - b.t);
  if (!frames.length) return lines.join('\n') + '\n';
  const ids = new Map<EntityId, string>();
  // Deterministic for the same entity set, even when frame/array order differs. Never use id 0.
  for (const id of [...new Set(frames.flatMap(f => samples(f).map(s => s.id)))].sort()) ids.set(id, (ids.size + 1).toString(16));
  const events = (options.events ?? []).filter(e => e.t >= 0 && eventMessage(e)).slice().sort((a, b) => a.t - b.t);
  let ei = 0;
  let currentTime: number | null = null;
  const active = new Set<EntityId>();
  const time = (t: number) => {
    if (t < 0) throw new Error('Recording contains a negative time.');
    if (t !== currentTime) { lines.push(`#${n(t, 6)}`); currentTime = t; }
  };
  const writeEvent = (e: SimEvent) => {
    const info = eventMessage(e);
    if (!info) return;
    time(e.t);
    // Events between snapshots may precede a missile's first sample. Do not invent a position.
    const refs = info.ids.filter(id => active.has(id)).map(id => ids.get(id));
    lines.push(`0,Event=Message|${[...refs, text(info.message)].join('|')}`);
    // A sortie can end between 0.25 s samples; retain its final recorded outcome.
    const removed = e.type === 'kill' ? [e.targetId] : e.type === 'hit' || e.type === 'miss' ? [e.missileId] : [];
    for (const id of removed) if (active.delete(id)) lines.push(`-${ids.get(id)}`);
  };
  for (const frame of frames) {
    while (ei < events.length && events[ei].t < frame.t) writeEvent(events[ei++]);
    time(frame.t);
    const alive = samples(frame).filter(s => s.alive);
    const present = new Set(alive.map(s => s.id));
    for (const id of active) if (!present.has(id)) { lines.push(`-${ids.get(id)}`); active.delete(id); }
    for (const s of alive) {
      const id = ids.get(s.id);
      let line = `${id},T=${transform(s)}`;
      if (!active.has(s.id)) {
        line += `,Name=${text(s.name)},Type=${s.tags},Coalition=${s.side === 'blue' ? 'Blue' : 'Red'},Color=${s.side === 'blue' ? 'Blue' : 'Red'}`;
        const callsign = options.callsigns?.[s.id];
        if (callsign) line += `,CallSign=${text(callsign)}`;
        const parent = s.parent && ids.get(s.parent);
        if (parent) line += `,Parent=${parent}`;
        active.add(s.id);
      }
      lines.push(line);
    }
    while (ei < events.length && events[ei].t === frame.t) writeEvent(events[ei++]);
  }
  while (ei < events.length) writeEvent(events[ei++]);
  return lines.join('\n') + '\n';
}

/** Browser download lifetime owned by the mounted debrief. */
export class AcmiDownload {
  private url: string | null = null;

  download(content: string, filename: string): void {
    this.dispose();
    this.url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = this.url;
    link.download = filename;
    try { document.body.append(link); link.click(); }
    catch (error) { this.dispose(); throw error; }
    finally { link.remove(); }
  }

  dispose(): void {
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
  }
}
