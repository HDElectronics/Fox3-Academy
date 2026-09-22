import { Checklist } from 'fox3-academy-ui';

export const SttShot = () => (
  <Checklist
    id="preview-stt"
    steps={[
      { id: 'lock', text: 'Cursor on the contact and lock from ОБЗ. АТК ДВБ shows and his SPO-15 calls the lock.', keys: 'Enter' },
      { id: 'scale', text: 'Read the left range scale: top tick Rmax, middle Rtr, bottom Rmin. The caret is his range.' },
      { id: 'shoot', text: 'Shoot at or inside Rtr for a kill, or at Rmax to force him defensive.' },
      { id: 'release', text: 'When ПР shows, hold the trigger for at least one second.', keys: 'Space' },
      { id: 'call', text: 'The lock symbol flashes after launch. Call Fox 1 and hold the lock to impact.' },
    ]}
  />
);

export const InProgress = () => (
  <Checklist
    id="preview-tws"
    done={['mode', 'frames']}
    steps={[
      { id: 'mode', text: 'Switch to TWS and check the mode at lower left.', keys: 'RAlt + I' },
      { id: 'frames', text: 'Wait one or two scans for the bricks to grow altitude numbers and aspect sticks.' },
      { id: 'pdt', text: 'TDC on the most threatening track and designate it. That is your PDT.', keys: 'Enter' },
      { id: 'sdt', text: 'Designate up to three more, in the order you mean to shoot them.', keys: 'Enter' },
      { id: 'fire', text: 'Steering dot inside the ASE circle, range caret on Rtr, fire on the flashing star.', keys: 'RAlt + Space' },
    ]}
  />
);

export const WithNotes = () => (
  <Checklist
    id="preview-defend"
    steps={[
      {
        id: 'read',
        text: 'Read the SPO-15. Flashing red lamp and an intermittent high tone is a SARH launch.',
        note: 'The SPO never shows an IR missile. Flare on aspect and range instead.',
      },
      {
        id: 'notch',
        text: "Put the shooter on the 3 or 9 o'clock lamp and descend so he looks down at you.",
        note: 'A few degrees off the beam is enough to fall out of the notch.',
      },
      {
        id: 'chaff',
        text: 'Chaff once you are in the beam, single bundles rather than a stream.',
        keys: 'Insert',
      },
      {
        id: 'drag',
        text: 'With range left, turn cold and drag in full burner, still descending.',
        note: 'Only once the first missile is defeated. Turning cold early hands him a free shot.',
      },
    ]}
  />
);

export const ShortProcedure = () => (
  <Checklist
    id="preview-search"
    done={[0]}
    steps={[
      { text: 'BVR mode and radar on. ИЗЛ appears on the HUD.', keys: '2 and I' },
      { text: 'Point the 60° scan at the threat axis.', keys: 'RShift + , / RShift + /' },
      { text: 'Enter the expected range and the height difference to aim the scan in elevation.', keys: 'RCtrl + = / RCtrl + -' },
    ]}
  />
);
