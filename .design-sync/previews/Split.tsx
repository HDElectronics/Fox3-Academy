import { ConsolePanel, Readouts, ScreenBezel, Split } from 'fox3-academy-ui';

export const RadarAndRwr = () => (
  <Split
    items={[
      <ScreenBezel
        key="radar"
        label="Your radar · Su-27S"
        aspect="1"
        status="СНП ДВБ"
        corners={{ tl: '80 KM', tr: 'ППС', bl: 'B4 ±60', br: '4 TRK' }}
      />,
      <ScreenBezel key="rwr" label="SPO-15" aspect="1" status="Beryoza" />,
    ]}
  />
);

export const WeightedColumns = () => (
  <Split
    columns="3fr 2fr"
    items={[
      <ScreenBezel
        key="vsd"
        label="Your radar · F-15C"
        aspect="4 / 3"
        status="TWS"
        corners={{ tl: '40 NM', tr: 'HI PRF', bl: '4B ±60', br: 'AIM-120C' }}
      />,
      <ScreenBezel key="tews" label="ALR-56C" aspect="1" status="TEWS" />,
    ]}
  />
);

export const ConsolePair = () => (
  <Split
    items={[
      <ConsolePanel key="shot" title="Your shot" dense>
        <Readouts
          id="preview-split-shot"
          rows={[
            { id: 'weapon', label: 'Weapon', value: 'AIM-120C' },
            { id: 'range', label: 'Range', value: '24', unit: 'nm' },
            { id: 'rmax', label: 'Rmax', value: '41', unit: 'nm' },
            { id: 'pitbull', label: 'Pitbull in', value: '31', unit: 's' },
          ]}
        />
      </ConsolePanel>,
      <ConsolePanel key="bandit" title="Bandit" dense>
        <Readouts
          id="preview-split-bandit"
          rows={[
            { id: 'type', label: 'Type', value: 'Su-27S' },
            { id: 'aspect', label: 'Aspect', value: 'Hot' },
            { id: 'alt', label: 'Altitude', value: '31000', unit: 'ft' },
            { id: 'closure', label: 'Closure', value: '1040', unit: 'kt' },
          ]}
        />
      </ConsolePanel>,
    ]}
  />
);

export const StacksWhenNarrow = () => (
  <div style={{ maxWidth: '520px' }}>
    <Split
      stackBelow={760}
      items={[
        <ScreenBezel
          key="radar"
          label="Your radar · MiG-29S"
          aspect="16 / 9"
          status="АТК ДВБ"
          corners={{ tl: '50 KM', tr: 'ЗПС', bl: 'R-77', br: 'ПР' }}
        />,
        <ScreenBezel key="rwr" label="SPO-15" aspect="16 / 9" status="Beryoza" />,
      ]}
    />
  </div>
);
