import { Button, CoachBox, ConsolePanel, LabLayout, Readouts, ScreenBezel, Segmented } from 'fox3-academy-ui';

// The Stage renders into the viewport element in the app. Here it is a plain stand-in: sky over
// ground with the HUD line the lab draws over it.
const Viewport = ({ hud, mark }: { hud: string; mark: string }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background:
        'linear-gradient(var(--sky-top) 0 58%, var(--sky-horizon) 58% 61%, var(--earth) 61% 100%)',
    }}
  >
    <div
      style={{
        position: 'absolute',
        top: '10px',
        left: '12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--fs-xs)',
        letterSpacing: '0.08em',
        color: 'var(--sym)',
        textShadow: '0 0 6px var(--sym)',
      }}
    >
      {hud}
    </div>
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '40%',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--fs-xs)',
        color: 'var(--hostile)',
      }}
    >
      <span style={{ width: '12px', height: '12px', border: '2px solid var(--hostile)', borderRadius: '50%' }} />
      {mark}
    </div>
  </div>
);

const face = {
  position: 'absolute' as const,
  inset: 0,
  backgroundImage:
    'repeating-linear-gradient(to right, var(--screen-line) 0 1px, transparent 1px 25%),' +
    'repeating-linear-gradient(to bottom, var(--screen-line) 0 1px, transparent 1px 25%)',
};

const brick = (left: string, top: string) => (
  <div
    style={{
      position: 'absolute',
      left,
      top,
      width: '14px',
      height: '4px',
      background: 'var(--sym)',
      boxShadow: '0 0 6px var(--sym)',
    }}
  />
);

// The strip sizes its bezels through a direct-child rule, which the preview binding's portal host
// sits in the way of, so each display carries its own strip-sized box.
//
// Two cells drop the optional header: the lab is a whole-screen frame, and without it the console
// and the display strip both land above the fold of a card-sized capture.
const display = { width: '200px' };

const BanditPanelMetric = () => (
  <ConsolePanel title="Bandit">
    <Readouts
      id="preview-lab-bandit-ru"
      columns={2}
      rows={[
        { id: 'range', label: 'Range', value: '24', unit: 'km' },
        { id: 'aspect', label: 'Aspect', value: 'Beam' },
        { id: 'alt', label: 'Altitude', value: '9200', unit: 'm' },
        { id: 'closure', label: 'Closure', value: '640', unit: 'km/h' },
      ]}
    />
  </ConsolePanel>
);

const RadarPanel = () => (
  <ConsolePanel title="Radar" dense>
    <Segmented
      id="preview-lab-mode"
      label="Mode"
      value="tws"
      options={[
        { value: 'rws', label: 'RWS' },
        { value: 'tws', label: 'TWS' },
        { value: 'stt', label: 'STT' },
      ]}
    />
  </ConsolePanel>
);

const BanditPanel = () => (
  <ConsolePanel title="Bandit">
    <Readouts
      id="preview-lab-bandit"
      columns={2}
      rows={[
        { id: 'range', label: 'Range', value: '32', unit: 'nm' },
        { id: 'aspect', label: 'Aspect', value: 'Hot' },
        { id: 'alt', label: 'Altitude', value: '28000', unit: 'ft' },
        { id: 'closure', label: 'Closure', value: '980', unit: 'kt' },
      ]}
    />
  </ConsolePanel>
);

export const RadarLab = () => (
  <LabLayout
    id="preview-lab-basic"
    viewport={<Viewport hud="F-15C · 32000 FT · M 0.92 · HDG 015" mark="32 NM" />}
    console={
      <>
        <CoachBox
          text="Bug the lead contact and hold the crank."
          why="TWS keeps the scan running, so the second bandit stays on the display."
        />
        <RadarPanel />
      </>
    }
  />
);

export const WithDisplayStrip = () => (
  <LabLayout
    id="preview-lab-strip"
    viewport={<Viewport hud="F-15C · 32000 FT · M 0.92 · HDG 015" mark="32 NM" />}
    strip={
      <>
        <div style={display}>
          <ScreenBezel
            label="RADAR"
            status="TWS"
            aspect="4 / 3"
            corners={{ tl: '4 BAR', tr: '40 NM' }}
            content={
              <div style={face}>
                {brick('44%', '30%')}
                {brick('62%', '52%')}
              </div>
            }
          />
        </div>
        <div style={display}>
          <ScreenBezel
            label="RWR"
            status="ALR-56C"
            aspect="4 / 3"
            corners={{ bl: 'PRI 29' }}
            content={
              <div style={{ position: 'absolute', inset: 0 }}>
                <div style={{ position: 'absolute', inset: '8% 26%', border: '1px solid var(--sym-dim)', borderRadius: '50%' }} />
                <div style={{ position: 'absolute', inset: '30% 38%', border: '1px solid var(--sym-dim)', borderRadius: '50%' }} />
                <div
                  style={{
                    position: 'absolute',
                    left: '46%',
                    top: '22%',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--fs-xs)',
                    color: 'var(--sym)',
                    textShadow: '0 0 5px var(--sym)',
                  }}
                >
                  29
                </div>
              </div>
            }
          />
        </div>
      </>
    }
    console={
      <>
        <RadarPanel />
        <BanditPanel />
      </>
    }
  />
);

export const PhoneTabs = () => (
  <LabLayout
    id="preview-lab-phone"
    header={{ title: 'Defending', meta: 'MiG-29S · R-77 inbound' }}
    viewport={<Viewport hud="МИГ-29С · 7300 М · 950 КМ/Ч · КУРС 270" mark="24 КМ" />}
    mobileTabs
    mobileActions={
      <>
        <Button label="Chaff" variant="primary" keys="Insert" />
        <Button label="Notch" variant="cap" />
        <Button label="Reset" variant="ghost" />
      </>
    }
    strip={
      <div style={display}>
        <ScreenBezel
          label="SPO-15"
          status="ПУСК"
          aspect="4 / 3"
          corners={{ tl: 'П', tr: 'ЗПС' }}
          content={<div style={face} />}
        />
      </div>
    }
    console={
      <>
        <CoachBox
          tone="warning"
          text="Beam him now and hold it."
          why="The R-77 needs his radar until it goes active; in the notch he loses the track."
        />
        <BanditPanelMetric />
      </>
    }
  />
);
