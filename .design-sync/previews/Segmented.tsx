import { Segmented } from 'fox3-academy-ui';

const stack = { display: 'flex', flexDirection: 'column', gap: 'var(--gap-4)' } as const;

export const RadarMode = () => (
  <Segmented
    id="preview-radar-mode"
    label="Radar mode"
    value="tws"
    options={[
      { value: 'search', label: 'ОБЗ ДВБ', sub: 'Search' },
      { value: 'tws', label: 'СНП ДВБ', sub: 'Track while scan' },
      { value: 'stt', label: 'АТК ДВБ', sub: 'Lock' },
    ]}
  />
);

export const ScanWidth = () => (
  <Segmented
    id="preview-scan-width"
    label="Azimuth"
    value="60"
    options={[
      { value: '20', label: '20°', sub: '1.3 s' },
      { value: '40', label: '40°', sub: '2.6 s' },
      { value: '60', label: '60°', sub: '5.0 s' },
    ]}
  />
);

export const Sizes = () => (
  <div style={stack}>
    <Segmented
      id="preview-bars-s"
      label="Bars"
      size="s"
      value="4"
      options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '4', label: '4' }, { value: '6', label: '6' }]}
    />
    <Segmented
      id="preview-bars-m"
      label="Bars"
      value="4"
      options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '4', label: '4' }, { value: '6', label: '6' }]}
    />
  </div>
);

export const WithKeysAndDisabled = () => (
  <Segmented
    id="preview-launch-mode"
    label="Launch mode"
    fill
    value="tws"
    options={[
      { value: 'tws', label: 'TWS', sub: 'Datalink', keys: '1' },
      { value: 'pdstt', label: 'PD-STT', sub: 'SARH', keys: '2' },
      { value: 'phact', label: 'PH ACT', sub: 'Active', keys: '3', disabled: true },
    ]}
  />
);
