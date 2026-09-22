import { Select } from 'fox3-academy-ui';

const stack = { display: 'flex', flexDirection: 'column', gap: 'var(--gap-4)', maxWidth: '360px' } as const;
const row = { display: 'flex', gap: 'var(--gap-5)', alignItems: 'center', flexWrap: 'wrap' } as const;

export const Jet = () => (
  <div style={stack}>
    <Select
      id="preview-se-jet"
      label="Jet"
      value="su27"
      options={[
        { value: 'f15c', label: 'F-15C', group: 'United States' },
        { value: 'f14b', label: 'F-14B', group: 'United States' },
        { value: 'f16c', label: 'F-16C', group: 'United States' },
        { value: 'fa18c', label: 'F/A-18C', group: 'United States' },
        { value: 'su27', label: 'Su-27S', group: 'Russia' },
        { value: 'su33', label: 'Su-33', group: 'Russia' },
        { value: 'mig29s', label: 'MiG-29S', group: 'Russia' },
        { value: 'm2000c', label: 'M-2000C', group: 'France' },
      ]}
    />
  </div>
);

export const Missile = () => (
  <div style={stack}>
    <Select
      id="preview-se-missile"
      label="Missile"
      value="r27er"
      options={[
        { value: 'r27er', label: 'R-27ER' },
        { value: 'r27et', label: 'R-27ET' },
        { value: 'r77', label: 'R-77', disabled: true },
        { value: 'aim7m', label: 'AIM-7M' },
        { value: 'aim120c', label: 'AIM-120C' },
        { value: 'aim54c', label: 'AIM-54C' },
      ]}
    />
  </div>
);

export const InlineRow = () => (
  <div style={row}>
    <Select
      id="preview-se-scenario"
      label="Scenario"
      inline
      value="crank"
      options={[
        { value: 'single', label: 'Single bandit, hot' },
        { value: 'crank', label: 'Crank after launch' },
        { value: 'notch', label: 'Notch the launch' },
        { value: 'drag', label: 'Drag and chaff' },
      ]}
    />
    <Select
      id="preview-se-bandit"
      label="Bandit"
      inline
      value="mig29s"
      options={[
        { value: 'mig29s', label: 'MiG-29S' },
        { value: 'su27', label: 'Su-27S' },
        { value: 'f15c', label: 'F-15C' },
      ]}
    />
  </div>
);

export const Disabled = () => (
  <div style={stack}>
    <Select
      id="preview-se-mode"
      label="Launch mode"
      disabled
      value="pdstt"
      options={[
        { value: 'tws', label: 'TWS' },
        { value: 'pdstt', label: 'PD-STT' },
        { value: 'phact', label: 'PH ACT' },
      ]}
    />
  </div>
);
