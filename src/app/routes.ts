/** Stable route table. Top-level and contextual navigation live in navigation.ts. */
import type { AircraftRole } from '../data/types';
import type { PageFactory } from './page';

export interface RouteDef {
  path: string;          // '#/<path>'
  aliases?: readonly string[];
  label: string;         // nav label
  title: string;         // one-line purpose, shown as nav tooltip and hangar card
  load: () => Promise<{ default: PageFactory }>;
  /** Jet roles this route teaches; default ['fighter']. The picker and the role gate (roleGate.ts) read it. */
  roles?: readonly AircraftRole[];
}

export const ROUTES: RouteDef[] = [
  { path: 'hangar', aliases: ['learn'], label: 'Learn', title: 'Follow a lesson path for your selected aircraft', load: () => import('../pages/hangar/index') },
  { path: 'cockpit', label: 'Cockpit explorer', title: 'Explore aircraft panels and understand each mapped control', load: () => import('../pages/cockpit/index') },
  { path: 'practice', label: 'Practice', title: 'Explore the labs and practise at your own pace', load: () => import('../pages/practice/index') },
  { path: 'radar', label: 'Radar', title: 'See the scan volume in 3D: azimuth, bars, elevation, and why you miss contacts', load: () => import('../pages/radar-lab/index') },
  { path: 'tws', label: 'TWS', title: 'Track while scan: several missiles, several targets, no lock warning', load: () => import('../pages/tws/index') },
  { path: 'missiles', label: 'Missiles', title: 'Launch zones: how altitude, speed and target aspect change range', load: () => import('../pages/missile-lab/index') },
  { path: 'defense', label: 'Defense', title: 'Beat an incoming missile: notch, chaff, drag and timing', load: () => import('../pages/defense/index') },
  { path: 'flight-ops', label: 'Pattern & landing', title: 'Fly the overhead break, configure, hold on-speed AoA and land in the zone', load: () => import('../pages/flight-ops/index') },
  { path: 'strike', label: 'Shkval & Vikhr', title: 'Su-25T: find, lock and lase with the Shkval, fire Vikhrs, fly a rocket CCIP pass', load: () => import('../pages/strike/index'), roles: ['attack'] },
  { path: 'rwr', label: 'RWR', title: 'Read your warning receiver: who is searching, locking, launching', load: () => import('../pages/rwr-trainer/index') },
  { path: 'sortie', label: 'Sortie', title: 'Fly a full BVR engagement against AI that shoots back, then debrief it', load: () => import('../pages/sortie/index') },
  { path: 'reference', label: 'Reference', title: 'Key bindings, HOTAS and step-by-step procedures for your jet', load: () => import('../pages/reference/index') },
];

export function routeFor(path: string): RouteDef {
  return ROUTES.find(r => r.path === path || r.aliases?.includes(path)) ?? ROUTES[0]!;
}
