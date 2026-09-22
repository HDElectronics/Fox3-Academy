import { Slider } from 'fox3-academy-ui';

const stack = { display: 'flex', flexDirection: 'column', gap: 'var(--gap-5)', maxWidth: '420px' } as const;

export const RangeScale = () => (
  <div style={stack}>
    <Slider id="preview-sl-scale" label="Range scale" min={10} max={160} step={10} value={80} unit="nm" />
  </div>
);

export const AltitudeBlock = () => (
  <div style={stack}>
    <Slider
      id="preview-sl-alt"
      label="Altitude block"
      min={5}
      max={45}
      step={1}
      value={28}
      unit="ft"
      readoutCh={6}
      format={v => String(v * 1000)}
      hint="Bandit is co-altitude at 28000 ft"
    />
  </div>
);

export const WithMarks = () => (
  <div style={stack}>
    <Slider
      id="preview-sl-marks"
      label="Target range"
      min={0}
      max={60}
      step={1}
      value={33}
      unit="nm"
      marks={[
        { value: 4, label: 'Rmin' },
        { value: 28, label: 'Rne', title: 'No-escape range' },
        { value: 44, label: 'Rmax' },
      ]}
      hint="Inside Rne the bandit cannot outrun the shot"
    />
  </div>
);

export const LaunchZones = () => (
  <div style={stack}>
    <Slider
      id="preview-sl-dlz"
      label="AIM-120C launch zone"
      min={0}
      max={60}
      step={1}
      value={33}
      unit="nm"
      zones={{
        exact: true,
        bands: [
          { from: 4, to: 28, tone: 'solid' },
          { from: 28, to: 44, tone: 'hatched' },
        ],
        marks: [
          { value: 4, label: 'Rmin' },
          { value: 28, label: 'Rne', cue: true, priority: 2 },
          { value: 44, label: 'Rmax', priority: 1 },
        ],
      }}
    />
  </div>
);

export const Aspect = () => (
  <div style={stack}>
    <Slider id="preview-sl-aspect" label="Target aspect" min={0} max={180} step={5} value={45} unit="°" />
  </div>
);

export const Disabled = () => (
  <div style={stack}>
    <Slider
      id="preview-sl-off"
      label="Scan elevation"
      min={-10}
      max={10}
      step={1}
      value={0}
      unit="°"
      disabled
      hint="Auto elevation is holding the bar on the track"
    />
  </div>
);
