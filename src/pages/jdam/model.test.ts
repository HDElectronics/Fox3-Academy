import { describe, expect, it } from 'vitest';
import { JdamSession, manualHudCue, pressStoresOsb } from './model';
function ready(lesson: 'setup' | 'delivery' | 'troubleshoot' = 'delivery'): JdamSession {
  const session = new JdamSession(lesson);
  session.ag = true; session.masterArm = true; session.selected = true;
  session.mode = 'TOO'; session.efuz = 'INST'; session.designation = 'assigned';
  session.skipWarmup();
  return session;
}
describe('Hornet JDAM training workflow', () => {
  it('starts the documented 150-second warmup on selection, with separate TIMING and STBY cues', () => {
    const session = new JdamSession('setup');
    session.step(1000);
    expect(session.warmupRemaining).toBe(150);
    expect(session.status).toBe('OFF');
    session.selected = true;
    expect(session.timing).toBe(true);
    expect(session.status).toBe('STBY');
    expect(session.alignmentClock).toBe(600);
    session.step(149);
    expect(session.timing).toBe(true);
    session.step(1);
    expect(session.timing).toBe(false);
    expect(session.alignmentClock).toBe(450);
    expect(session.status).toBe('STBY');
  });
  it('requires a fresh warmup after deselection, but does not restart for an unchanged selection', () => {
    const session = ready();
    session.selected = true;
    expect(session.warmupRemaining).toBe(0);
    session.selected = false; session.selected = true;
    expect(session.warmupRemaining).toBe(150);
  });
  it('does not let the training shortcut power an unselected weapon', () => {
    const session = new JdamSession('setup');
    session.skipWarmup();
    expect(session.selected).toBe(false);
    expect(session.warmupRemaining).toBe(150);
  });
  it('finishes setup only with the assigned designation and configured store', () => {
    const session = new JdamSession('setup');
    session.ag = true; session.masterArm = true; session.selected = true;
    session.mode = 'TOO'; session.efuz = 'INST'; session.designation = 'wrong';
    session.skipWarmup(); session.step(0.1);
    expect(session.complete).toBe(false);
    session.designation = 'assigned'; session.step(0.1);
    expect(session.done).toEqual([true, true, true]);
    session.startRun();
    expect(session.phase).toBe('idle');
  });
  it('keeps IN RNG available until the learner presses release', () => {
    const session = ready(); session.startRun(); session.step(30);
    expect(session.phase).toBe('approach'); expect(session.inRange).toBe(true);
    session.setRelease(true); session.step(0.1);
    expect(session.phase).toBe('flight');
  });
  it('does not release early; a held button releases after the scripted range gate', () => {
    const session = ready(); session.startRun(); session.setRelease(true);
    session.step(7);
    expect(session.phase).toBe('approach'); expect(session.inRange).toBe(false);
    session.step(2);
    expect(session.phase).toBe('flight'); expect(session.timer).toBe(11);
  });
  it.each(['arm', 'ag', 'weapon', 'mode', 'efuz', 'designation', 'timing'] as const)('blocks release with missing %s prerequisite', (missing) => {
    const session = ready();
    if (missing === 'arm') session.masterArm = false;
    if (missing === 'ag') session.ag = false;
    if (missing === 'weapon') session.selected = false;
    if (missing === 'mode') session.mode = 'PP';
    if (missing === 'efuz') session.efuz = 'OFF';
    if (missing === 'designation') session.designation = null;
    if (missing === 'timing') { session.selected = false; session.selected = true; }
    session.startRun(); session.setRelease(true); session.step(10);
    expect(session.phase).toBe('approach'); expect(session.status).not.toBe('RDY');
  });
  it('releases after warmup expires even when a single time step crosses both readiness gates', () => {
    const session = ready(); session.selected = false; session.selected = true;
    session.startRun(); session.setRelease(true); session.step(151);
    expect(session.phase).toBe('flight'); expect(session.timer).toBe(11);
  });
  it('reaches the released target without any laser or continued designation', () => {
    const session = ready(); session.startRun(); session.setRelease(true); session.step(9);
    session.designation = null; session.masterArm = false; session.selected = false;
    session.step(11);
    expect(session.phase).toBe('hit'); expect(session.complete).toBe(true);
    expect(session.releasedTarget).toBe('assigned');
  });
  it('cannot correct a wrong released target by changing the designation in flight', () => {
    const session = new JdamSession('troubleshoot');
    session.startRun(); session.setRelease(true); session.step(9);
    session.designation = 'assigned'; session.step(11);
    expect(session.phase).toBe('miss'); expect(session.releasedTarget).toBe('wrong');
    expect(session.complete).toBe(false);
    session.retry(); expect(session.releasedTarget).toBe(null);
    session.startRun(); session.setRelease(true); session.step(20);
    expect(session.phase).toBe('hit'); expect(session.complete).toBe(true);
  });
  it('cancels held consent on retry and rejects invalid time steps', () => {
    const session = ready(); session.setRelease(true); session.retry(); session.startRun();
    for (const dt of [NaN, Infinity, -1, 0]) session.step(dt);
    expect(session.timer).toBe(8);
    session.step(20); expect(session.phase).toBe('approach');
  });
  it('produces the same result in one large step and many frame steps', () => {
    const one = ready(); const many = ready();
    for (const session of [one, many]) { session.startRun(); session.setRelease(true); }
    one.step(21);
    for (let i = 0; i < 1260; i++) many.step(1 / 60);
    expect(many.phase).toBe(one.phase); expect(many.done).toEqual(one.done);
  });
});

describe('corrected target release check', () => {
  it('does not award the release check for bombing the wrong designation', () => {
    const s = new JdamSession('troubleshoot'); s.startRun(); s.setRelease(true); s.step(9);
    expect(s.releasedTarget).toBe('wrong'); expect(s.done[1]).toBe(false);
  });
  it('keeps J-82 selected when PB6 is pressed inside the EFUZ submenu', () => {
    const session = ready();
    let menu = pressStoresOsb(session, 3, false);
    expect(menu).toBe(true);
    menu = pressStoresOsb(session, 6, menu);
    expect(menu).toBe(false);
    expect(session.selected).toBe(true);
    expect(session.timing).toBe(false);
    expect(session.status).toBe('RDY');
    expect(pressStoresOsb(session, 6, false)).toBe(false);
    expect(session.selected).toBe(false);
  });
  it('sets EFUZ and MODE from the STORES pushbuttons', () => {
    const session = new JdamSession('setup');
    session.selected = true;
    expect(pressStoresOsb(session, 3, pressStoresOsb(session, 3, false))).toBe(false);
    expect(session.efuz).toBe('INST');
    expect(pressStoresOsb(session, 5, pressStoresOsb(session, 3, false))).toBe(false);
    expect(session.efuz).toBe('OFF');
    pressStoresOsb(session, 5, false);
    expect(session.mode).toBe('TOO');
  });
  it('shows only the sourced MANUAL range cues on the HUD', () => {
    const session = ready();
    expect(manualHudCue(session)).toBe('');
    session.startRun();
    expect(manualHudCue(session)).toBe('TMR 8');
    session.step(8);
    expect(manualHudCue(session)).toBe('IN RNG');
    session.setRelease(true); session.step(.01); session.setRelease(false);
    session.step(20);
    expect(session.phase).toBe('hit');
    expect(manualHudCue(session)).toBe('');
  });
});
