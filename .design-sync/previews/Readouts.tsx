import { Readouts } from 'fox3-academy-ui';

export const BanditBlock = () => (
  <Readouts
    id="preview-readouts-bandit"
    rows={[
      { id: 'range', label: 'Range', value: '32', unit: 'nm' },
      { id: 'aspect', label: 'Aspect', value: 'Hot' },
      { id: 'alt', label: 'Altitude', value: '28000', unit: 'ft' },
      { id: 'closure', label: 'Closure', value: '980', unit: 'kt' },
      { id: 'heading', label: 'Heading', value: '095', unit: '°' },
    ]}
  />
);

export const LaunchZone = () => (
  <Readouts
    id="preview-readouts-dlz"
    variant="glass"
    rows={[
      { id: 'rmax', label: 'Rmax', value: '34', unit: 'nm' },
      { id: 'rne', label: 'Rne', value: '18', unit: 'nm' },
      { id: 'rmin', label: 'Rmin', value: '2', unit: 'nm' },
      { id: 'tti', label: 'Time to impact', value: '0:48' },
    ]}
  />
);

export const ScanVolume = () => (
  <Readouts
    id="preview-readouts-scan"
    columns={2}
    rows={[
      { id: 'az', label: 'Azimuth', value: '±60', unit: '°' },
      { id: 'bars', label: 'Bars', value: '4' },
      { id: 'frame', label: 'Frame', value: '5.0', unit: 's' },
      { id: 'elev', label: 'Elevation', value: '-4', unit: '°' },
      { id: 'scale', label: 'Range scale', value: '80', unit: 'km' },
      { id: 'prf', label: 'PRF', value: 'ППС' },
    ]}
  />
);

export const MissileTimeline = () => (
  <Readouts
    id="preview-readouts-missile"
    variant="glass"
    columns={2}
    rows={[
      { id: 'weapon', label: 'Weapon', value: 'AIM-120C' },
      { id: 'target', label: 'Target', value: 'PDT' },
      { id: 'tof', label: 'Flight time', value: '52', unit: 's' },
      { id: 'active', label: 'Active in', value: '31', unit: 's' },
      { id: 'range', label: 'Range', value: '24', unit: 'nm' },
      { id: 'gimbal', label: 'Off nose', value: '48', unit: '°' },
    ]}
  />
);
