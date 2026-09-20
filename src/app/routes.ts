/** Route table. Order = nav order. Pages load lazily. */
import type { PageFactory } from './page';

export interface RouteDef {
  path: string;          // '#/<path>'
  label: string;         // nav label
  title: string;         // one-line purpose, shown as nav tooltip and hangar card
  load: () => Promise<{ default: PageFactory }>;
}

export const ROUTES: RouteDef[] = [
  { path: 'hangar', label: 'Hangar', title: 'Pick your jet and see what its radar and missiles can do', load: () => import('../pages/hangar/index') },
  { path: 'radar', label: 'Radar', title: 'See the scan volume in 3D: azimuth, bars, elevation, and why you miss contacts', load: () => import('../pages/radar-lab/index') },
  { path: 'tws', label: 'TWS', title: 'Track while scan: several missiles, several targets, no lock warning', load: () => import('../pages/tws/index') },
  { path: 'missiles', label: 'Missiles', title: 'Launch zones: how altitude, speed and target aspect change range', load: () => import('../pages/missile-lab/index') },
  { path: 'defense', label: 'Defense', title: 'Beat an incoming missile: notch, chaff, drag and timing', load: () => import('../pages/defense/index') },
  { path: 'rwr', label: 'RWR', title: 'Read your warning receiver: who is searching, locking, launching', load: () => import('../pages/rwr-trainer/index') },
  { path: 'sortie', label: 'Sortie', title: 'Fly a full BVR engagement against AI that shoots back, then debrief it', load: () => import('../pages/sortie/index') },
  { path: 'reference', label: 'Cockpit', title: 'Key bindings, HOTAS and step-by-step procedures for your jet', load: () => import('../pages/reference/index') },
];
