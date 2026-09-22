import { Lamp } from 'fox3-academy-ui';

const row = { display: 'flex', gap: 'var(--gap-2)', flexWrap: 'wrap', alignItems: 'center' } as const;
const stack = { display: 'flex', flexDirection: 'column', gap: 'var(--gap-3)' } as const;

export const Tones = () => (
  <div style={row}>
    <Lamp label="SHOOT" tone="ok" state="on" />
    <Lamp label="LOCK" tone="hi" state="on" />
    <Lamp label="ECM" tone="caution" state="on" />
    <Lamp label="MISSILE" tone="warning" state="on" />
    <Lamp label="TWS" tone="advisory" state="on" />
  </div>
);

export const States = () => (
  <div style={row}>
    <Lamp label="SHOOT" tone="ok" state="off" title="Outside Rmax" />
    <Lamp label="SHOOT" tone="ok" state="on" title="Inside Rmax" />
    <Lamp label="SHOOT" tone="ok" state="flash" title="Inside Rne" />
  </div>
);

export const RussianStrip = () => (
  <div style={row}>
    <Lamp label="ИЗЛ" tone="advisory" state="on" title="Radar transmitting" />
    <Lamp label="СНП" tone="hi" state="on" title="Track while scan" />
    <Lamp label="АТК" tone="hi" state="off" title="Single target track" />
    <Lamp label="ПР" tone="ok" state="flash" title="Launch permitted" />
  </div>
);

export const ThreatStrip = () => (
  <div style={stack}>
    <div style={row}>
      <Lamp label="LOCK" tone="caution" state="on" title="He is holding a lock on you" />
      <Lamp label="LAUNCH" tone="warning" state="flash" title="Launch warning on the RWR" />
      <Lamp label="CHAFF" tone="caution" state="off" title="Chaff remaining" />
    </div>
    <div style={row}>
      <Lamp label="PITBULL" tone="ok" state="on" title="Your missile is on its own radar" />
      <Lamp label="TRASHED" tone="hi" state="off" title="Your missile is out of energy" />
    </div>
  </div>
);
