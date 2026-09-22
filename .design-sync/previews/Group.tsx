import { Button, Chips, Group, Readouts, Segmented, Select, Toggle } from 'fox3-academy-ui';

export const ScanVolume = () => (
  <Group label="Scan volume" hint="Wider costs frame time: 60° over four bars takes 5.0 s to come back round.">
    <Segmented
      id="preview-group-az"
      label="Azimuth"
      value="60"
      options={[
        { value: '20', label: '20°' },
        { value: '40', label: '40°' },
        { value: '60', label: '60°' },
      ]}
    />
    <Segmented
      id="preview-group-bars"
      label="Bars"
      size="s"
      value="4"
      options={[
        { value: '1', label: '1' },
        { value: '2', label: '2' },
        { value: '4', label: '4' },
        { value: '6', label: '6' },
      ]}
    />
  </Group>
);

export const Inline = () => (
  <Group label="Countermeasures" inline>
    <Button label="Chaff" keys="Insert" size="s" />
    <Button label="Flare" keys="Delete" size="s" />
    <Toggle id="preview-group-cm-auto" label="Auto program" size="s" value />
  </Group>
);

export const LaunchCues = () => (
  <Group label="Launch zone" hint="Rmax is the best case against a non-manoeuvring target. Shoot inside Rne and he cannot outrun it.">
    <Readouts
      id="preview-group-dlz"
      rows={[
        { id: 'rmax', label: 'Rmax', value: '38', unit: 'nm' },
        { id: 'rne', label: 'Rne', value: '14', unit: 'nm' },
        { id: 'range', label: 'Range', value: '26', unit: 'nm' },
        { id: 'tti', label: 'Time to impact', value: '52', unit: 's' },
      ]}
    />
  </Group>
);

export const Loadout = () => (
  <Group label="Stores">
    <Select
      id="preview-group-missile"
      label="Selected missile"
      value="r27er"
      options={[
        { value: 'r27er', label: 'R-27ER' },
        { value: 'r27et', label: 'R-27ET' },
        { value: 'r73', label: 'R-73' },
      ]}
    />
    <Chips
      id="preview-group-stations"
      label="Stations"
      value={['s3', 's4']}
      options={[
        { value: 's3', label: '3' },
        { value: 's4', label: '4' },
        { value: 's5', label: '5' },
        { value: 's6', label: '6' },
      ]}
    />
  </Group>
);
