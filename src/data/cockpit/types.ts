/** Pilot-facing DCS cockpit descriptions. This is an explorer, not a systems or flight simulation. */
export type CockpitRegion = 'front' | 'left' | 'right' | 'seat' | 'hotas';
export type CockpitControlKind = 'button' | 'switch' | 'rotary' | 'lever' | 'indicator' | 'display' | 'axis' | 'panel' | 'fixture';
export interface CockpitSourceRef {
  /** One-based PDF page, suitable for a #page= link to the official guide. */
  page: number;
  section?: string;
}
export interface CockpitControl {
  /** Globally unique within the aircraft; include a panel prefix. */
  id: string;
  label: string;
  kind: CockpitControlKind;
  /** Brief answer to “what is this for?” in original wording. */
  summary: string;
  operation: string;
  effect: string;
  positions?: readonly { label: string; effect: string }[];
  /** Omit unverified keyboard defaults. A cockpit label is not a default key binding. */
  binding?: { command: string; keys?: string; verified: boolean };
  /** Status in the cited manual, not a promise about every DCS version. */
  dcsStatus?: 'documented' | 'not-implemented' | 'uncertain';
  notes?: string;
  sources: readonly CockpitSourceRef[];
}
export interface CockpitPanel {
  id: string;
  label: string;
  region: CockpitRegion;
  summary: string;
  controls: readonly CockpitControl[];
  sources: readonly CockpitSourceRef[];
}
