import { Button, Lamp, Row, Segmented, Toggle } from 'fox3-academy-ui';

export const ReplayControls = () => (
  <Row
    items={[
      <Button key="back" label="Step back" size="s" />,
      <Button key="play" label="Play" variant="primary" />,
      <Button key="fwd" label="Step" size="s" />,
      <Button key="reset" label="Reset" variant="ghost" size="s" />,
    ]}
  />
);

export const MixedControls = () => (
  <Row
    items={[
      <Segmented
        key="speed"
        id="preview-row-speed"
        ariaLabel="Replay speed"
        size="s"
        value="2"
        options={[
          { value: '1', label: '1×' },
          { value: '2', label: '2×' },
          { value: '4', label: '4×' },
        ]}
      />,
      <Toggle key="truth" id="preview-row-truth" label="Truth layer" style="switch" value />,
      <Button key="debrief" label="Debrief" variant="ghost" size="s" />,
    ]}
  />
);

export const CueLamps = () => (
  <Row
    items={[
      <Lamp key="shoot" label="SHOOT" tone="hi" state="on" />,
      <Lamp key="launch" label="LAUNCH" tone="warning" state="flash" />,
      <Lamp key="lock" label="LOCK" tone="caution" state="on" />,
      <Lamp key="pitbull" label="PITBULL" tone="ok" state="off" />,
    ]}
  />
);

export const Wrapping = () => (
  <Row
    items={[
      <Button key="radar" label="Radar" keys="I" size="s" />,
      <Button key="tws" label="RWS / TWS" keys="RAlt+I" size="s" />,
      <Button key="prf" label="PRF" keys="RShift+I" size="s" />,
      <Button key="width" label="Scan width" keys="RCtrl+=" size="s" />,
      <Button key="elev" label="Antenna up" keys="RShift+;" size="s" />,
      <Button key="centre" label="Cursor centre" keys="RCtrl+I" size="s" />,
    ]}
  />
);
