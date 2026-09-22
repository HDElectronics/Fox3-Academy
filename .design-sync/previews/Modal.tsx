import { Callout, Modal, Readouts } from 'fox3-academy-ui';

// A stand-in for the 3D viewport the debrief overlay covers: sky over horizon over ground.
// The modal mounts `within` its host, so the host needs a real box to fill.
//
// `inert` on the box: the kit's modal traps focus, and a card that renders several cells at once
// puts several traps in one document, which then fight over the active element until the renderer
// runs out of stack. An app only ever has one modal, so inert is a preview-harness detail; it
// changes nothing about how the dialog is painted.
const viewport = {
  display: 'grid',
  height: '340px',
  border: '1px solid var(--panel-line)',
  borderRadius: 'var(--r-2)',
  background:
    'linear-gradient(var(--sky-top) 0 56%, var(--sky-horizon) 56% 58%, var(--earth) 58% 100%)',
};

export const Splash = () => (
  <div style={viewport} inert>
    <Modal
      id="preview-modal-splash"
      title="Splash"
      tone="ok"
      body={
        <Readouts
          id="preview-modal-splash-rows"
          rows={[
            { id: 'bandit', label: 'Bandit', value: 'MiG-29S' },
            { id: 'weapon', label: 'Weapon', value: 'AIM-120C' },
            { id: 'launch', label: 'Launched at', value: '24', unit: 'nm' },
            { id: 'tof', label: 'Time of flight', value: '48', unit: 's' },
          ]}
        />
      }
      actions={[{ label: 'Debrief', primary: true }, { label: 'Fly it again' }]}
    />
  </div>
);

export const Trashed = () => (
  <div style={viewport} inert>
    <Modal
      id="preview-modal-trashed"
      title="Missile trashed"
      tone="warning"
      body={
        <>
          <p>
            The R-27ER went stupid when the bandit put you on the beam at 18 nm. A SARH shot lives on
            your lock: no illumination, no guidance.
          </p>
          <Callout
            kind="dcs"
            body="Hold STT until impact, and keep the bandit out of the notch by cranking 30° off rather than turning cold."
          />
        </>
      }
      actions={[{ label: 'Replay the shot', primary: true }, { label: 'Reset' }]}
    />
  </div>
);

export const Brief = () => (
  <div style={viewport} inert>
    <Modal
      id="preview-modal-brief"
      title="Lesson 4 · Crank and hold"
      dismissable={false}
      body={
        <>
          <p>
            Two AIM-120C off the rail in TWS, then crank to 50° and hold the bandit inside the scan
            volume until each missile calls pitbull.
          </p>
          <p>
            You start at 32000 ft, Mach 0.92, 38 nm from a single Su-27S at 28000 ft, hot.
          </p>
        </>
      }
      actions={[{ label: 'Start', primary: true }, { label: 'Read the procedure' }]}
    />
  </div>
);

export const Spiked = () => (
  <div style={viewport} inert>
    <Modal
      id="preview-modal-spike"
      title="Spiked"
      tone="caution"
      body="The SPO-15 red lamp is steady at 12 o'clock: he is in STT on you. Expect an R-27ER inside 25 nm."
      actions={[{ label: 'Copy', primary: true }]}
    />
  </div>
);
