import { Chips } from 'fox3-academy-ui';

const stack = { display: 'flex', flexDirection: 'column', gap: 'var(--gap-4)' } as const;

export const ViewLayers = () => (
  <Chips
    id="preview-ch-layers"
    label="View layers"
    value={['cone', 'trails']}
    options={[
      { value: 'cone', label: 'Scan volume' },
      { value: 'trails', label: 'Missile trails' },
      { value: 'truth', label: 'Bandit truth' },
      { value: 'notch', label: 'Notch gate' },
      { value: 'horizon', label: 'Horizon grid' },
    ]}
  />
);

export const RwrEmitters = () => (
  <Chips
    id="preview-ch-emitters"
    label="Show emitters"
    value={['fighter', 'missile', 'sam']}
    options={[
      { value: 'fighter', label: 'Fighters' },
      { value: 'missile', label: 'Missiles' },
      { value: 'sam', label: 'SAM' },
      { value: 'awacs', label: 'AWACS' },
      { value: 'unknown', label: 'Unknown' },
    ]}
  />
);

export const WithKeys = () => (
  <Chips
    id="preview-ch-overlays"
    label="Overlays"
    value={['dlz']}
    options={[
      { value: 'dlz', label: 'DLZ bar', keys: 'D' },
      { value: 'timeline', label: 'Missile timeline', keys: 'T' },
      { value: 'rwr', label: 'RWR', keys: 'R' },
    ]}
  />
);

export const NoneOn = () => (
  <div style={stack}>
    <Chips
      id="preview-ch-none"
      label="Debrief tracks"
      value={[]}
      options={[
        { value: 'player', label: 'Player' },
        { value: 'bandit', label: 'Bandit' },
        { value: 'shots', label: 'Shots' },
        { value: 'chaff', label: 'Chaff' },
      ]}
    />
  </div>
);

export const Disabled = () => (
  <Chips
    id="preview-ch-jets"
    label="Covers these jets"
    value={['su27', 'mig29s']}
    options={[
      { value: 'su27', label: 'Su-27S' },
      { value: 'mig29s', label: 'MiG-29S' },
      { value: 'f15c', label: 'F-15C' },
      { value: 'f14b', label: 'F-14B', disabled: true, title: 'No Phoenix lesson on this page yet' },
    ]}
  />
);
