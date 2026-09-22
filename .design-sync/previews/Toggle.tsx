import { Toggle } from 'fox3-academy-ui';

const row = { display: 'flex', gap: 'var(--gap-2)', alignItems: 'center', flexWrap: 'wrap' } as const;

export const LampCaps = () => (
  <div style={row}>
    <Toggle id="preview-tg-auto-elev" label="Auto elevation" value />
    <Toggle id="preview-tg-datalink" label="Datalink" value />
    <Toggle id="preview-tg-truth" label="Bandit truth" />
  </div>
);

export const SwitchLever = () => (
  <div style={row}>
    <Toggle id="preview-tg-master-arm" label="Master arm" style="switch" value states={['SAFE', 'ARM']} />
    <Toggle id="preview-tg-emcon" label="Radar" style="switch" states={['SILENT', 'RADIATE']} />
  </div>
);

export const RwrAudio = () => (
  <div style={row}>
    <Toggle id="preview-tg-rwr-audio" label="RWR audio" style="switch" value />
    <Toggle id="preview-tg-launch-tone" label="Launch tone" style="switch" />
  </div>
);

export const WithKeyBinding = () => (
  <div style={row}>
    <Toggle id="preview-tg-tws" label="TWS" keys="I" value />
    <Toggle id="preview-tg-chaff" label="Chaff program" keys="Insert" />
  </div>
);

export const Sizes = () => (
  <div style={row}>
    <Toggle id="preview-tg-trails-s" label="Missile trails" size="s" value />
    <Toggle id="preview-tg-trails-m" label="Missile trails" value />
  </div>
);

export const Disabled = () => (
  <div style={row}>
    <Toggle id="preview-tg-fox3" label="Fox 3" disabled title="The Su-27S carries no active radar missile" />
    <Toggle id="preview-tg-snp2" label="СНП2" style="switch" disabled states={['OFF', 'ON']} title="MiG-29S only" />
  </div>
);
