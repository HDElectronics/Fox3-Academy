import { Button, Row, ScreenBezel } from 'fox3-academy-ui';

// The glass hosts a canvas display in the app. A preview cannot run the radar draw loop, so these
// are static phosphor stand-ins: the same tokens, the same black glass, drawn with plain divs.
//
// A bezel fills its column, and a card column is far wider than a display strip, so each cell is
// held to the width a lab actually gives its displays.
const box = { maxWidth: '420px' };
const wide = { maxWidth: '560px' };
const face = {
  position: 'absolute' as const,
  inset: 0,
  backgroundImage:
    'repeating-linear-gradient(to right, var(--screen-line) 0 1px, transparent 1px 25%),' +
    'repeating-linear-gradient(to bottom, var(--screen-line) 0 1px, transparent 1px 25%)',
};

const brick = (left: string, top: string, hot = false) => (
  <div
    style={{
      position: 'absolute',
      left,
      top,
      width: '16px',
      height: '5px',
      background: hot ? 'var(--sym-hi)' : 'var(--sym)',
      boxShadow: `0 0 6px ${hot ? 'var(--sym-hi)' : 'var(--sym)'}`,
    }}
  />
);

const ring = (inset: string) => (
  <div
    style={{
      position: 'absolute',
      inset,
      border: '1px solid var(--sym-dim)',
      borderRadius: '50%',
    }}
  />
);

const code = (left: string, top: string, text: string, primary = false) => (
  <div
    style={{
      position: 'absolute',
      left,
      top,
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--fs-xs)',
      color: primary ? 'var(--sym-hi)' : 'var(--sym)',
      textShadow: '0 0 5px currentColor',
    }}
  >
    {text}
  </div>
);

export const RadarFormat = () => (
  <div style={box}>
  <ScreenBezel
    id="preview-bezel-radar"
    label="RADAR"
    status="TWS"
    aspect="4 / 3"
    corners={{ tl: '4 BAR', tr: '80 NM', bl: 'AZ ±60', br: 'HI PRF' }}
    content={
      <div style={face}>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: '1px',
            background: 'var(--sym-dim)',
          }}
        />
        {brick('44%', '26%', true)}
        {brick('61%', '38%')}
        {brick('29%', '57%')}
      </div>
    }
  />
  </div>
);

export const RwrScope = () => (
  <div style={box}>
  <ScreenBezel
    id="preview-bezel-rwr"
    label="RWR"
    status="ALR-56C"
    aspect="1"
    corners={{ bl: 'PRI 29', br: 'VOL 7' }}
    content={
      <div style={{ position: 'absolute', inset: 0 }}>
        {ring('8%')}
        {ring('28%')}
        {ring('42%')}
        {code('46%', '20%', '29', true)}
        {code('68%', '52%', '15')}
        {code('30%', '66%', '10')}
      </div>
    }
  />
  </div>
);

export const WithSoftKeys = () => (
  <div style={box}>
  <ScreenBezel
    id="preview-bezel-softkeys"
    label="VSD"
    status="STT"
    aspect="4 / 3"
    corners={{ tl: '1 BAR', tr: '40 NM', br: 'AIM-7M' }}
    content={
      <div style={face}>
        {brick('47%', '33%', true)}
        <div
          style={{
            position: 'absolute',
            left: '38%',
            top: '24%',
            width: '24%',
            height: '18%',
            border: '1px solid var(--sym-hi)',
          }}
        />
      </div>
    }
    footer={
      <Row
        items={[
          <Button label="RWS" variant="cap" size="s" />,
          <Button label="TWS" variant="cap" size="s" />,
          <Button label="Declutter" variant="ghost" size="s" />,
        ]}
      />
    }
  />
  </div>
);

export const DlzStrip = () => (
  <div style={wide}>
  <ScreenBezel
    id="preview-bezel-dlz"
    label="DLZ"
    status="AIM-120C"
    aspect="16 / 3"
    corners={{ tl: 'RMAX 38', tr: 'RNE 11', br: 'TTI 0:52' }}
    content={
      <div style={{ position: 'absolute', inset: 0, display: 'grid', alignContent: 'center', padding: '0 14%' }}>
        <div style={{ position: 'relative', height: '10px', background: 'var(--screen-2)', border: '1px solid var(--sym-dim)' }}>
          <div style={{ position: 'absolute', left: '18%', right: '58%', top: 0, bottom: 0, background: 'var(--sym-dim)' }} />
          <div style={{ position: 'absolute', left: '42%', right: '24%', top: 0, bottom: 0, background: 'var(--sym)' }} />
          <div
            style={{
              position: 'absolute',
              left: '52%',
              top: '-7px',
              bottom: '-7px',
              width: '2px',
              background: 'var(--sym-hi)',
              boxShadow: '0 0 6px var(--sym-hi)',
            }}
          />
        </div>
      </div>
    }
  />
  </div>
);
