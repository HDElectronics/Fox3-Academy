import { Placard, Select } from 'fox3-academy-ui';

const row = { display: 'flex', gap: 'var(--gap-5)', alignItems: 'baseline', flexWrap: 'wrap' } as const;
const cell = { display: 'flex', flexDirection: 'column', gap: 'var(--gap-1)' } as const;
const value = { fontFamily: 'var(--font-mono)', fontSize: '20px', color: 'var(--s-ink)' } as const;

export const Stencil = () => (
  <div style={row}>
    <Placard text="Scan volume" />
    <Placard text="Launch zone" />
    <Placard text="Threat ring" />
  </div>
);

export const OverReadout = () => (
  <div style={row}>
    <div style={cell}>
      <Placard text="Target aspect" />
      <span style={value}>L 40</span>
    </div>
    <div style={cell}>
      <Placard text="Closure" />
      <span style={value}>820 kt</span>
    </div>
    <div style={cell}>
      <Placard text="Bandit altitude" />
      <span style={value}>28000 ft</span>
    </div>
  </div>
);

export const WithUnit = () => (
  <div style={row}>
    <div style={cell}>
      <Placard text={<>Range <span style={{ opacity: 0.6 }}>nm</span></>} />
      <span style={value}>33</span>
    </div>
    <div style={cell}>
      <Placard text={<>Time to pitbull <span style={{ opacity: 0.6 }}>s</span></>} />
      <span style={value}>21</span>
    </div>
  </div>
);

export const AsLabel = () => (
  <div style={{ maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: 'var(--gap-1)' }}>
    <Placard text="Bandit jet" for="preview-pl-bandit" />
    <Select
      id="preview-pl-bandit"
      ariaLabel="Bandit jet"
      value="mig29s"
      options={[
        { value: 'mig29s', label: 'MiG-29S' },
        { value: 'su27', label: 'Su-27S' },
        { value: 'f15c', label: 'F-15C' },
        { value: 'f14b', label: 'F-14B' },
      ]}
    />
  </div>
);
