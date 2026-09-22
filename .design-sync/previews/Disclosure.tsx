import { Disclosure, Readouts } from 'fox3-academy-ui';

const stack = { display: 'flex', flexDirection: 'column', gap: 'var(--gap-2)' } as const;
const prose = { display: 'flex', flexDirection: 'column', gap: 'var(--gap-2)', margin: 0 } as const;
const list = { margin: 0, paddingLeft: '1.2em', display: 'grid', gap: 'var(--gap-1)' } as const;

export const Open = () => (
  <Disclosure
    id="preview-disclosure-frame"
    title="Why a wider scan finds him later"
    open
    content={
      <div style={prose}>
        <p style={{ margin: 0 }}>
          The antenna sweeps the whole volume before it starts again, so the frame time grows with the
          azimuth and the bar count. A contact only paints when the beam crosses it.
        </p>
        <p style={{ margin: 0 }}>
          At ±60° and 4 bars a frame takes about 5 s, and detection needs two of them. Narrow to ±30°
          once you know the threat axis and the same target shows up twice as fast.
        </p>
      </div>
    }
  />
);

export const Collapsed = () => (
  <div style={stack}>
    <Disclosure id="preview-disclosure-prf" title="When to use ППС, ЗПС or АВТ" content="ППС for a closing target, ЗПС for a tail chase, АВТ when the aspect is unknown, at about 25 % less range." />
    <Disclosure id="preview-disclosure-notch" title="Why the notch works at all" content="A pulse-Doppler radar rejects returns with no closure. Fly 90° to the shooter and your return sits in the same filter as the ground." />
    <Disclosure id="preview-disclosure-crank" title="Crank against gimbal limit" content="Cranking cuts closure and keeps his shot honest, but past ±60° off the nose the track drops and your missile loses updates." />
  </div>
);

export const WithDetail = () => (
  <Disclosure
    id="preview-disclosure-shot"
    title="Read the launch zone before you shoot"
    open
    content={
      <div style={prose}>
        <p style={{ margin: 0 }}>Shoot at or inside Rne if you want the kill. Shoot at Rmax only to make him turn.</p>
        <Readouts
          id="preview-disclosure-readouts"
          variant="glass"
          columns={2}
          rows={[
            { id: 'rmax', label: 'Rmax', value: '34', unit: 'nm' },
            { id: 'rne', label: 'Rne', value: '18', unit: 'nm' },
            { id: 'range', label: 'Range', value: '26', unit: 'nm' },
            { id: 'alt', label: 'Altitude', value: '28000', unit: 'ft' },
          ]}
        />
        <ul style={list}>
          <li>Rmax assumes he flies straight on. He will not.</li>
          <li>Rne holds even if he turns cold the moment you shoot.</li>
          <li>Height and speed at launch move both numbers more than anything else you control.</li>
        </ul>
      </div>
    }
  />
);
