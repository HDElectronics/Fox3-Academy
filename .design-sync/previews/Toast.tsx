import { Toast } from 'fox3-academy-ui';

// Toasts stack at the bottom of the element they are mounted `within` — in the app that is the
// lab viewport, so the preview gives them one: a sky-over-ground box with a real height.
const viewport = {
  display: 'grid',
  height: '160px',
  border: '1px solid var(--panel-line)',
  borderRadius: 'var(--r-2)',
  background:
    'linear-gradient(var(--sky-top) 0 60%, var(--sky-horizon) 60% 63%, var(--earth) 63% 100%)',
};

export const Designated = () => (
  <div style={viewport}>
    <Toast text="Designated T2 · Su-27S" ms={0} />
  </div>
);

export const Pitbull = () => (
  <div style={viewport}>
    <Toast text="Pitbull · AIM-120C is own-radar now" tone="ok" ms={0} />
  </div>
);

export const ChaffOut = () => (
  <div style={viewport}>
    <Toast text="Chaff: 0 left" tone="caution" ms={0} />
  </div>
);

export const TrackLost = () => (
  <div style={viewport}>
    <Toast text="Track lost — bandit in the notch, TWS dropped T1" tone="warning" ms={0} />
  </div>
);
