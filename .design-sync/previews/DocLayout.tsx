import { Button, Callout, Chips, DataTable, DocLayout } from 'fox3-academy-ui';

export const Reference = () => (
  <DocLayout
    id="preview-doc-reference"
    title="Reference"
    meta="Su-27S · N001 · SPO-15"
    lede="Everything the trainer teaches, in one place: what the radar does, what the missile needs from you, and what the RWR is telling you."
    sections={[
      {
        id: 'scan',
        title: 'Scan volume',
        content:
          'The N001 scans a 60° window you place left, centre or right of the nose, in one, two or four bars. A contact outside that window does not exist as far as the radar is concerned, so aim the volume at the threat axis before you look for anything in it.',
      },
      {
        id: 'tws',
        title: 'Track while scan',
        content:
          'СНП ДВБ holds one designated track and keeps scanning. The bandit hears nothing but your search radar until the radar auto-locks at 85 % of Rmax, and from then on he has a steady lock warning.',
      },
      {
        id: 'defend',
        title: 'Defending',
        content:
          'Beam the shooter to put yourself in the notch, chaff in the beam, and stay there until the missile is trashed. Turning cold before the missile is committed only gives it a free tail chase.',
      },
    ]}
  />
);

export const WithFilterAndActions = () => (
  <DocLayout
    id="preview-doc-filter"
    title="Procedures"
    meta="F-15C · APG-63(V)1 · ALR-56C"
    lede="Step-by-step BVR procedures for the jet in the top bar. Filter the contents by the part of the fight you are working on."
    actions={<Button label="Print" variant="ghost" size="s" />}
    tocHeader={
      <Chips
        id="preview-doc-chips"
        ariaLabel="Filter sections"
        value={['radar']}
        options={[
          { value: 'radar', label: 'Radar' },
          { value: 'shot', label: 'Shot' },
          { value: 'defend', label: 'Defend' },
        ]}
      />
    }
    sections={[
      {
        id: 'setup',
        title: 'Radar setup',
        content:
          'Radar on with I, BVR search with 2, then set the range scale with = and - so the bandit sits in the top third of the VSD. Scan width goes to ±60° with RCtrl + = while you are looking, and back to ±30° once you have him.',
      },
      {
        id: 'shot',
        title: 'The shot',
        content:
          'Bug the contact with Enter to get a TWS track, wait for the SHOOT cue inside Rmax, then hold the trigger. Two AIM-120C with a few seconds between them beat one perfect shot.',
      },
      {
        id: 'crank',
        title: 'Crank and hold',
        content:
          'Turn 50° off and keep the bandit inside the scan volume until the missile calls pitbull. Cranking cuts your closure and keeps the shot alive; turning cold kills it.',
      },
    ]}
  />
);

export const CustomContent = () => (
  <DocLayout
    id="preview-doc-custom"
    title="Launch zones"
    meta="Not verified · in-game numbers only"
    toc={[
      { id: 'reading', label: 'Reading the bar' },
      { id: 'numbers', label: 'What the numbers mean' },
    ]}
    content={
      <>
        <section id="reading">
          <h2>Reading the bar</h2>
          <p>
            The launch-zone bar on the display is the game telling you what its own missile model
            expects. Rmax is the shot that only works if he keeps flying at you; Rne is the shot he
            cannot outrun whatever he does.
          </p>
          <Callout
            kind="simplified"
            body="The trainer reproduces the in-game numbers and cues, not the weapon itself. Every constant here is tuned to match what DCS shows on the display."
          />
        </section>
        <section id="numbers">
          <h2>What the numbers mean</h2>
          <DataTable
            id="preview-doc-table"
            columns={[
              { key: 'cue', label: 'Cue', mono: true },
              { key: 'means', label: 'Means' },
            ]}
            rows={[
              { cue: 'RMAX', means: 'He must stay hot for the whole time of flight' },
              { cue: 'RNE', means: 'No escape: he cannot outrun it by turning cold' },
              { cue: 'RTR', means: 'Both of you can still turn and live' },
            ]}
          />
        </section>
      </>
    }
  />
);
