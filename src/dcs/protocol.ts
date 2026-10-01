/**
 * DCS link protocol v1, as the page sees it. The export script (dcs-link/Scripts/Fox3Academy/Fox3Link.lua)
 * sends JSON datagrams to the bridge (dcs-link/bridge.ts), which forwards them to the page as Server-Sent
 * Events. Everything arriving here is untrusted input: parse*() keep only known, well-typed fields.
 * Units are the DCS export API's: metres, m/s, radians, G, model seconds. Spec: docs/api/dcs-link.md.
 */

/** Loopback ports. The public site's CSP allows only BRIDGE_URL, so the page port is fixed. */
export const DCS_LINK_PORTS = { http: 47780, fromDcs: 47781, toDcs: 47782 } as const;
export const BRIDGE_URL = `http://127.0.0.1:${DCS_LINK_PORTS.http}`;

/** What a multiplayer server lets clients export. null: the export API has no such check (or it failed). */
export interface ExportPermissions { ownship: boolean | null; sensor: boolean | null; object: boolean | null }

export interface OwnShip {
  /** DCS unit type name, e.g. "F-16C_50", "Su-27". */
  name?: string;
  lat?: number; lon?: number; alt?: number;
  /** Radians. */
  hdg?: number; pitch?: number; bank?: number;
}

export interface DcsFrame {
  type: 'frame';
  seq: number;
  script?: string;
  /** Model time, seconds. */
  t?: number;
  allow: ExportPermissions;
  self?: OwnShip;
  pilot?: string;
  ias?: number; tas?: number; mach?: number;
  altMsl?: number; altAgl?: number; vv?: number;
  /** Radians per the ED reference Export.lua (not verified in game). */
  aoa?: number;
  /** Acceleration in G, body axes; y is the load factor the pilot feels. */
  acc?: { x?: number; y?: number; z?: number };
}

export type DcsMessage =
  | DcsFrame
  | { type: 'hello'; script?: string; t?: number }
  | { type: 'bye'; script?: string; t?: number }
  | { type: 'pong'; id: number; script?: string; t?: number };

export interface BridgeStatus {
  bridge: string;
  dcs: { packets: number; rejected: number; lastPacketAgeMs: number | null; script: string | null };
  commands: number;
  clients: number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown, max = 64): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined);
const flag = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/** Drop undefined fields so the parsed object only carries what DCS sent. */
function compact<T extends object>(o: T): T {
  const r = o as Obj;
  for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
  return o;
}

export function parseDcsMessage(raw: unknown): DcsMessage | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const base = { script: str(raw.script, 32), t: num(raw.t) };
  switch (raw.type) {
    case 'hello': return compact({ type: 'hello' as const, ...base });
    case 'bye': return compact({ type: 'bye' as const, ...base });
    case 'pong': {
      const id = num(raw.id);
      return id === undefined || !Number.isInteger(id) ? null : compact({ type: 'pong' as const, id, ...base });
    }
    case 'frame': {
      const seq = num(raw.seq);
      if (seq === undefined) return null;
      const allow = isObj(raw.allow) ? raw.allow : {};
      const s = isObj(raw.self) ? raw.self : null;
      const acc = isObj(raw.acc) ? raw.acc : null;
      return compact<DcsFrame>({
        type: 'frame', seq, ...base,
        allow: { ownship: flag(allow.ownship), sensor: flag(allow.sensor), object: flag(allow.object) },
        self: s ? compact({ name: str(s.name), lat: num(s.lat), lon: num(s.lon), alt: num(s.alt), hdg: num(s.hdg), pitch: num(s.pitch), bank: num(s.bank) }) : undefined,
        pilot: str(raw.pilot),
        ias: num(raw.ias), tas: num(raw.tas), mach: num(raw.mach),
        altMsl: num(raw.altMsl), altAgl: num(raw.altAgl), vv: num(raw.vv), aoa: num(raw.aoa),
        acc: acc ? compact({ x: num(acc.x), y: num(acc.y), z: num(acc.z) }) : undefined,
      });
    }
    default: return null;
  }
}

export function parseBridgeStatus(raw: unknown): BridgeStatus | null {
  if (!isObj(raw) || raw.v !== 1 || raw.type !== 'status' || !isObj(raw.dcs)) return null;
  const d = raw.dcs;
  return {
    bridge: str(raw.bridge, 32) ?? '?',
    dcs: {
      packets: num(d.packets) ?? 0,
      rejected: num(d.rejected) ?? 0,
      lastPacketAgeMs: num(d.lastPacketAgeMs) ?? null,
      script: str(d.script, 32) ?? null,
    },
    commands: num(raw.commands) ?? 0,
    clients: num(raw.clients) ?? 0,
  };
}

/** Parse an SSE data line; null when it is not JSON. */
export function parseJson(data: string): unknown {
  try { return JSON.parse(data); } catch { return null; }
}
