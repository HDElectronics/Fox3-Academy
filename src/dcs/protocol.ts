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
  /** LoGetMechInfo positions, 0 = up / retracted / closed, 1 = down / extended / open. */
  mech?: { gear?: number; flaps?: number; hook?: number; speedbrakes?: number; wheelbrakes?: number; canopy?: number };
  /** LoGetEngineInfo: RPM %, fuel kg, fuel flow kg/s. */
  engine?: { rpmL?: number; rpmR?: number; fuelInt?: number; fuelExt?: number; ffL?: number; ffR?: number };
  /** LoGetMCPState flags that are set, e.g. ['MasterWarning']. */
  mcp?: string[];
  /** LoGetSnares: countermeasures left. */
  cm?: { chaff?: number; flare?: number };
  /** Module cockpit arguments by number (raw -1..1 values), for modules the export script knows. */
  args?: Record<number, number>;
  /** Module text indicators by the script's short names, e.g. Hornet IFEI { bingo: '2500' }. */
  ind?: Record<string, string>;
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
      const mech = isObj(raw.mech) ? raw.mech : null;
      const eng = isObj(raw.engine) ? raw.engine : null;
      const cm = isObj(raw.cm) ? raw.cm : null;
      const mcp = isObj(raw.mcp) ? raw.mcp : null;
      const rawArgs = isObj(raw.args) ? raw.args : null;
      const rawInd = isObj(raw.ind) ? raw.ind : null;
      let args: Record<number, number> | undefined;
      if (rawArgs) {
        args = {};
        for (const [k, v] of Object.entries(rawArgs).slice(0, 200)) {
          const n = /^a(\d{1,4})$/.exec(k)?.[1];
          if (n !== undefined && num(v) !== undefined) args[Number(n)] = v as number;
        }
      }
      let ind: Record<string, string> | undefined;
      if (rawInd) {
        ind = {};
        for (const [k, v] of Object.entries(rawInd).slice(0, 20)) {
          if (/^[A-Za-z]{1,24}$/.test(k) && typeof v === 'string') ind[k] = v.slice(0, 16);
        }
      }
      return compact<DcsFrame>({
        type: 'frame', seq, ...base,
        allow: { ownship: flag(allow.ownship), sensor: flag(allow.sensor), object: flag(allow.object) },
        self: s ? compact({ name: str(s.name), lat: num(s.lat), lon: num(s.lon), alt: num(s.alt), hdg: num(s.hdg), pitch: num(s.pitch), bank: num(s.bank) }) : undefined,
        pilot: str(raw.pilot),
        ias: num(raw.ias), tas: num(raw.tas), mach: num(raw.mach),
        altMsl: num(raw.altMsl), altAgl: num(raw.altAgl), vv: num(raw.vv), aoa: num(raw.aoa),
        acc: acc ? compact({ x: num(acc.x), y: num(acc.y), z: num(acc.z) }) : undefined,
        mech: mech ? compact({ gear: num(mech.gear), flaps: num(mech.flaps), hook: num(mech.hook), speedbrakes: num(mech.speedbrakes), wheelbrakes: num(mech.wheelbrakes), canopy: num(mech.canopy) }) : undefined,
        engine: eng ? compact({ rpmL: num(eng.rpmL), rpmR: num(eng.rpmR), fuelInt: num(eng.fuelInt), fuelExt: num(eng.fuelExt), ffL: num(eng.ffL), ffR: num(eng.ffR) }) : undefined,
        mcp: mcp ? Object.keys(mcp).filter(k => mcp[k] === true && /^[A-Za-z]{1,40}$/.test(k)).slice(0, 40) : undefined,
        cm: cm ? compact({ chaff: num(cm.chaff), flare: num(cm.flare) }) : undefined,
        args, ind,
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
