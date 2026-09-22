import { Tabs } from 'fox3-academy-ui';

const frame = { maxWidth: '520px' } as const;

export const RadarReference = () => (
  <div style={frame}>
    <Tabs
      id="preview-tb-radar"
      ariaLabel="Radar reference"
      value="tws"
      tabs={[
        { id: 'search', label: 'Search', content: 'Set 60 degrees azimuth and 4 bars until you have a contact, then narrow the volume onto it.' },
        { id: 'tws', label: 'TWS', content: 'Track while scan keeps the scan running and feeds the missile by datalink. Keep the bandit inside the volume or the track goes stale.' },
        { id: 'stt', label: 'STT', content: 'A single-target lock puts a steady spike on the bandit RWR. He will know the moment you lock him.' },
      ]}
    />
  </div>
);

export const DefenceCues = () => (
  <div style={frame}>
    <Tabs
      id="preview-tb-defence"
      ariaLabel="Defence"
      value="notch"
      fill
      tabs={[
        { id: 'crank', label: 'Crank', content: 'Turn to put the bandit on the edge of the scan volume. You keep the datalink and open the geometry.' },
        { id: 'notch', label: 'Notch', content: 'Put the threat on the beam and descend. The doppler filter drops you when your closure falls near zero.' },
        { id: 'drag', label: 'Drag', content: 'Turn cold and run. Drop chaff as the missile goes pitbull and watch the RWR for the active tone.' },
      ]}
    />
  </div>
);

export const WithKeyBindings = () => (
  <div style={frame}>
    <Tabs
      id="preview-tb-keys"
      ariaLabel="Cockpit reference"
      value="binds"
      tabs={[
        { id: 'binds', label: 'Key binds', keys: '1', content: 'Designate RAlt+Space, undesignate RShift+Space, lock RCtrl+Space.' },
        { id: 'cues', label: 'RWR cues', keys: '2', content: 'A solid ring is a lock. A flashing symbol with the launch tone is a missile in the air.' },
        { id: 'sources', label: 'Sources', keys: '3', content: 'Every number on this page traces to a sourced research note.' },
      ]}
    />
  </div>
);

export const FirstTab = () => (
  <div style={frame}>
    <Tabs
      id="preview-tb-first"
      ariaLabel="Missile"
      tabs={[
        { id: 'r27er', label: 'R-27ER', content: 'Semi-active. Hold the lock all the way to impact or the shot goes stupid.' },
        { id: 'r77', label: 'R-77', content: 'Active. Support it to pitbull, then you are free to turn.' },
        { id: 'aim54c', label: 'AIM-54C', content: 'Launch mode is captured on the rail: TWS flies datalink then active, PD-STT stays semi-active.' },
      ]}
    />
  </div>
);
