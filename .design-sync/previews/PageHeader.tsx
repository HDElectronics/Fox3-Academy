import { Button, PageHeader, Segmented } from 'fox3-academy-ui';

export const Standard = () => (
  <PageHeader
    title="Track while scan"
    meta="Su-27S · N001 · FC3"
    lede="Build the picture in СНП ДВБ, then designate the bandit you intend to shoot. He hears nothing until you lock."
  />
);

export const WithActions = () => (
  <PageHeader
    title="Launch zone"
    meta="F-15C · AN/APG-63(V)1 · AIM-120C"
    lede="Read Rmax and Rne off the DLZ bar, then shoot where the missile still has the energy to finish."
    actions={
      <div style={{ display: 'flex', gap: 'var(--gap-2)', alignItems: 'center', flexWrap: 'wrap' }}>
        <Button label="Replay" size="s" />
        <Button label="Reset" variant="ghost" size="s" />
      </div>
    }
  />
);

export const Compact = () => (
  <PageHeader
    compact
    title="Radar lab"
    meta="MiG-29S · N019M · FC3"
    lede="Scan volume: 60° over four bars, 5.0 s a frame."
    actions={
      <Segmented
        id="preview-pagehead-view"
        ariaLabel="Camera"
        size="s"
        value="side"
        options={[
          { value: 'plan', label: 'Plan' },
          { value: 'side', label: 'Side' },
          { value: 'chase', label: 'Chase' },
        ]}
      />
    }
  />
);

export const TitleAndMeta = () => (
  <PageHeader title="Defending" meta="M-2000C · RDI · Serval" />
);
