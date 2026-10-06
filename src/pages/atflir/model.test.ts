import { describe, expect, it } from 'vitest';
import { AtflirSession } from './model';
import { lessonId, progressKey } from './lessons';
describe('Hornet ATFLIR foundations', () => {
  it('assigns TDC without also changing track mode', () => {
    const s = new AtflirSession('control'); s.slew(10, 0); expect(s.x).toBe(0);
    s.scs(); expect(s.mode).toBe('DESIGNATE'); expect(s.focused).toBe(true);
    s.undesignate(); s.slew(10, 0); expect(s.complete).toBe(true);
  });
  it('requires depressed TDC in designation and records the moved point', () => {
    const s = new AtflirSession('track'); s.scs(); s.slew(140, -70); expect(s.x).toBe(0);
    s.depress(true); s.slew(140, -70); expect(s.designation).toEqual({ x: 140, y: -70 });
    s.scs(); expect(s.mode).toBe('DESIGNATE'); s.depress(false);
    s.scs(); expect(s.mode).toBe('SCENE'); s.scs(); expect(s.tracked).toBe('assigned'); expect(s.complete).toBe(true);
  });
  it('does not credit a wrong target or scene-only completion', () => {
    const s = new AtflirSession('track'); s.scs(); s.depress(true); s.slew(-140, 30); s.depress(false); s.scs(); s.scs();
    expect(s.tracked).toBe('wrong'); expect(s.complete).toBe(false);
  });
  it('does not acquire empty ground beside an 8 m truck in the narrow 3D view', () => {
    const s = new AtflirSession('track'); s.scs(); s.undesignate(); s.slew(140, -60);
    s.scs(); s.scs(); expect(s.tracked).toBeNull();
    s.undesignate(); s.slew(0, -10); s.scs(); s.scs(); expect(s.tracked).toBe('assigned');
  });
  it('requires finding the target and narrowing the FOV', () => {
    const s = new AtflirSession('find'); s.cycleFov(); s.cycleFov(); expect(s.complete).toBe(false);
    s.scs(); s.undesignate(); s.slew(140, -70); expect(s.complete).toBe(true);
    s.cycleFov(); expect(s.fov).toBe(0);
  });
  it('blocks AUTO slew, permits recovery and saves only the intended result', () => {
    const s = new AtflirSession('recover'); s.slew(280, -100); expect(s.x).toBe(-140);
    s.undesignate(); s.slew(280, -100); s.scs(); expect(s.complete).toBe(false); s.scs(); expect(s.complete).toBe(true);
  });
  it('leaves failed AUTO in acquisition until the pilot repositions', () => {
    const s = new AtflirSession('track'); s.scs(); s.scs(); s.scs(); expect(s.tracked).toBeNull();
    s.slew(140, -70); expect(s.x).toBe(0); s.undesignate(); s.slew(140, -70); s.scs(); s.scs(); expect(s.tracked).toBe('assigned');
    expect(s.complete).toBe(false); // The designation exercise was skipped.
  });
  it('a lost track is not reacquired until visibility and a new acquisition permit it', () => {
    const s = new AtflirSession('recover'); s.undesignate(); s.slew(280, -100); s.scs(); s.scs();
    s.loseTrack(); expect(s.tracked).toBeNull(); s.undesignate(); s.scs(); s.scs(); expect(s.tracked).toBeNull();
    s.obscured = false; s.undesignate(); s.scs(); s.scs(); expect(s.tracked).toBe('assigned');
  });
  it('double Undesignate returns to VVSLV and restart clears exercise evidence', () => {
    const s = new AtflirSession('recover'); s.undesignate(); s.undesignate(); expect(s.mode).toBe('VVSLV'); expect(s.designation).toBeNull();
    expect(new AtflirSession('recover').done).toEqual([false, false, false]);
    expect(lessonId('invalid')).toBe('control'); expect(progressKey('track')).toBe('atflir:track:fa18c');
  });
});
