import { EventLog } from 'fox3-academy-ui';

const row = { display: 'flex', gap: 'var(--gap-3)', flexWrap: 'wrap', alignItems: 'flex-start' } as const;
const cell = { flex: '1 1 14rem', minWidth: '12rem' } as const;

export const Resting = () => (
  <EventLog
    id="preview-log-events"
    title="Events"
    empty="No events yet. Shots, pitbull calls and defeats are stamped here as the run goes."
  />
);

export const Titles = () => (
  <div style={row}>
    <div style={cell}>
      <EventLog id="preview-log-fight" title="Fight" empty="Waiting for the merge." />
    </div>
    <div style={cell}>
      <EventLog id="preview-log-debrief" title="Debrief" empty="Fly the engagement to fill the debrief." />
    </div>
    <div style={cell}>
      <EventLog id="preview-log-rwr" title="RWR" empty="No emitters on the SPO-15." />
    </div>
  </div>
);

export const NoTitle = () => (
  <EventLog id="preview-log-bare" empty="Log cleared. New lines land at the top, newest first." />
);
