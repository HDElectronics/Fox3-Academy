import { Button } from 'fox3-academy-ui';

const row = { display: 'flex', gap: 'var(--gap-2)', alignItems: 'center', flexWrap: 'wrap' } as const;

export const Variants = () => (
  <div style={row}>
    <Button label="Designate" variant="primary" />
    <Button label="Step" />
    <Button label="Reset" variant="ghost" />
  </div>
);

export const Sizes = () => (
  <div style={row}>
    <Button label="Bars" size="s" />
    <Button label="Scan width" size="m" />
    <Button label="Commit" size="l" variant="primary" />
  </div>
);

export const WithKeyBinding = () => (
  <div style={row}>
    <Button label="Designate" keys="RAlt+Space" />
    <Button label="Undesignate" keys="RShift+Space" />
    <Button label="Uncage" keys="I" variant="ghost" />
  </div>
);

export const ShootCue = () => (
  <div style={row}>
    <Button label="Shoot" lamp lit variant="primary" />
    <Button label="Shoot" lamp />
  </div>
);

export const Disabled = () => (
  <div style={row}>
    <Button label="Launch" variant="primary" disabled />
    <Button label="No Fox 3" disabled title="The Su-27 carries no active radar missile" />
  </div>
);
