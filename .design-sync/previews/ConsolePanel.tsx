import { Button, ConsolePanel, Readouts, Segmented } from 'fox3-academy-ui';

export const RadarConsole = () => (
  <ConsolePanel
    title="Radar"
    actions={<Button label="Reset" variant="ghost" size="s" />}
  >
    <Segmented
      id="preview-console-mode"
      label="Mode"
      value="tws"
      options={[
        { value: 'search', label: 'Search' },
        { value: 'tws', label: 'TWS' },
        { value: 'stt', label: 'STT' },
      ]}
    />
  </ConsolePanel>
);

export const WithReadouts = () => (
  <ConsolePanel title="Bandit">
    <Readouts
      id="preview-console-readouts"
      rows={[
        { id: 'range', label: 'Range', value: '32', unit: 'nm' },
        { id: 'aspect', label: 'Aspect', value: 'Hot' },
        { id: 'alt', label: 'Altitude', value: '28000', unit: 'ft' },
        { id: 'closure', label: 'Closure', value: '980', unit: 'kt' },
      ]}
    />
  </ConsolePanel>
);

export const Dense = () => (
  <ConsolePanel title="Scan volume" dense>
    <Readouts
      id="preview-console-dense"
      columns={2}
      rows={[
        { id: 'az', label: 'Azimuth', value: '±60', unit: '°' },
        { id: 'bars', label: 'Bars', value: '4' },
        { id: 'frame', label: 'Frame', value: '5.0', unit: 's' },
        { id: 'elev', label: 'Elevation', value: '-12', unit: '°' },
      ]}
    />
  </ConsolePanel>
);

export const NoFasteners = () => (
  <ConsolePanel title="Countermeasures" fasteners={false}>
    <Readouts
      id="preview-console-cm"
      rows={[
        { id: 'chaff', label: 'Chaff', value: '96' },
        { id: 'flare', label: 'Flares', value: '96' },
      ]}
    />
  </ConsolePanel>
);
