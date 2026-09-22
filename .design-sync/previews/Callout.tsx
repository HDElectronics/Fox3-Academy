import { Callout } from 'fox3-academy-ui';

const stack = { display: 'flex', flexDirection: 'column', gap: 'var(--gap-3)' } as const;
const list = { margin: '0', paddingLeft: '1.2em', display: 'grid', gap: 'var(--gap-1)' } as const;

export const Simplified = () => (
  <Callout
    kind="simplified"
    body="Missile flight here is a speed-over-time curve tuned to reproduce DCS time of flight. Treat the numbers as a reliable guide to when a shot goes stale, not as the weapon itself."
  />
);

export const Kinds = () => (
  <div style={stack}>
    <Callout
      kind="simplified"
      body="Chaff is modelled as a chance to break a radar lock while you are inside the notch. One bundle at the right moment beats a stream at the wrong one."
    />
    <Callout
      kind="dcs"
      body="In СНП the radar locks a designated track by itself at 85 % of Rmax and goes to АТК ДВБ. His SPO-15 calls the lock from that moment, so expect him to turn."
    />
    <Callout
      kind="real"
      body="A real crew flies the same intercept while running the radar, the radio and the formation. The trainer hands you one job at a time so the picture stays readable."
    />
  </div>
);

export const NotVerified = () => (
  <Callout
    kind="note"
    title="Not verified"
    body="How far an R-77 flies after you drop the lock early is not in the research notes. The trainer keeps supporting to about 15 km, which is what the procedure teaches."
  />
);

export const RichBody = () => (
  <Callout
    kind="dcs"
    title="What the VSD shows in TWS"
    body={
      <div style={stack}>
        <p style={{ margin: 0 }}>
          TWS narrows the scan to a ±30° window and holds tracks inside it. Slew the window with RShift + , and RShift + /.
        </p>
        <ul style={list}>
          <li>Star: the primary designated target, the one the next AIM-120 goes to.</li>
          <li>Hollow brick: a secondary designated target, shot in the order you designated it.</li>
          <li>Plain brick: a raw hit, no track file yet. Give it another frame.</li>
        </ul>
        <p style={{ margin: 0 }}>
          Designating the same track twice drops you into STT and loses every other track.
        </p>
      </div>
    }
  />
);
