import { CoachBox } from 'fox3-academy-ui';

const stack = { display: 'flex', flexDirection: 'column', gap: 'var(--gap-3)' } as const;

export const Advice = () => (
  <CoachBox
    text="Crank right 40° and hold him on the gimbal limit."
    why="You keep the datalink to the missile while opening the bandit's closure, so his shot goes stale before yours does."
  />
);

export const Tones = () => (
  <div style={stack}>
    <CoachBox title="NOW" tone="ok" text="Pitbull. The missile is on its own radar, so you are free to turn cold." />
    <CoachBox title="NOW" tone="caution" text="He is inside your Rne. Notch or drag before he launches." />
    <CoachBox title="NOW" tone="warning" text="Launch warning. Beam him and pump chaff." />
  </div>
);

export const WithoutWhy = () => (
  <CoachBox title="SETUP" text="Pick a scan width that covers the threat axis, then set your bars to cover his altitude block." />
);

export const Debrief = () => (
  <CoachBox
    title="A · MISS · OUT OF ENERGY"
    tone="dim"
    text="Your R-27ER ran out of speed 4 nm short."
    why="You shot at 28 nm from 18000 ft. The ER needs altitude and speed to reach that far; climb to the mid twenties and hold Mach before the shot."
  />
);
