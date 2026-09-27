import { describe, expect, it } from 'vitest';
import {
  CALL_PLACEHOLDERS, CAS_CAVEATS, COMMS_MENU, JTAC_ACTIONS, JTAC_CALLS, JTAC_CALLSIGNS, MARK_OPTIONS, NINE_LINE_FIELDS,
  NINE_LINE_REMARKS, SU25T_CAN_SEE, buildCommsMenu, fillCall, jtacCall, jtacMenuItems,
  type JtacMarkType, type JtacMenuState,
} from './cas';
import { SOURCE_ID, sourcesFor } from './sources';
import { PROCEDURES } from './procedures';
import type { CommsMenuNode } from './types';

const STATES: JtacMenuState[] = ['idle', 'control', 'remarks', 'readback', 'ip', 'inbound', 'mark', 'lasing', 'run-in', 'in', 'cleared', 'post'];
const MARKS: JtacMarkType[] = ['none', 'wp', 'laser', 'ir'];
/** Phrases ED's A-10C II manual quotes for the JTAC voice. Only these JTAC lines may be verified. */
const ED_JTAC_PHRASES = ['Standby for data.', 'Mark is on the deck.', 'Continue.', 'Cleared hot.', 'Abort.'];

function walk(nodes: readonly CommsMenuNode[], visit: (level: readonly CommsMenuNode[]) => void): void {
  visit(nodes);
  for (const n of nodes) if (n.children) walk(n.children, visit);
}
const fkeys = (level: readonly CommsMenuNode[]) => level.map((n, i) => n.fkey ?? i + 1);

describe('9-line', () => {
  it('lists the nine lines in DCS order, then remarks', () => {
    expect(NINE_LINE_FIELDS.map(f => f.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(NINE_LINE_FIELDS.map(f => f.id)).toEqual(['ip', 'heading', 'distance', 'elevation', 'target', 'location', 'mark', 'friendlies', 'egress']);
    for (const f of NINE_LINE_FIELDS) expect(f.label && f.hint).toBeTruthy();
    expect(NINE_LINE_REMARKS.items).toContain('Weapon');
  });
});

describe('JTAC calls', () => {
  it('gives every call an id, text, speaker and a verified flag, with unique ids', () => {
    const ids = new Set<string>();
    for (const c of JTAC_CALLS) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(c.text.length).toBeGreaterThan(0);
      expect(typeof c.verified).toBe('boolean');
      expect(['jtac', 'pilot']).toContain(c.speaker);
      expect(ids.has(c.id), c.id).toBe(false);
      ids.add(c.id);
    }
  });

  it('cites sources that exist in SOURCES', () => {
    for (const c of JTAC_CALLS) {
      expect(c.sources?.length, c.id).toBeGreaterThan(0);
      for (const s of c.sources ?? []) expect(SOURCE_ID[s as keyof typeof SOURCE_ID], `${c.id}: ${s}`).toBeGreaterThan(0);
    }
    expect(sourcesFor('cas').length).toBeGreaterThanOrEqual(10);
  });

  it('verifies JTAC voice lines only for the phrases ED quotes', () => {
    for (const c of JTAC_CALLS.filter(x => x.speaker === 'jtac' && x.verified)) expect(ED_JTAC_PHRASES).toContain(c.text);
    for (const p of ED_JTAC_PHRASES) expect(JTAC_CALLS.some(c => c.text === p && c.verified)).toBe(true);
    expect(jtacCall('abort-no-permission').verified).toBe(false);
    expect(jtacCall('talk-on').verified).toBe(false);
    expect(jtacCall('ready-remarks').verified).toBe(false);
  });

  it('uses only documented placeholders, and fills them', () => {
    const known = new Set<string>(CALL_PLACEHOLDERS);
    for (const c of JTAC_CALLS) for (const m of c.text.matchAll(/\{(\w+)\}/g)) expect(known.has(m[1] ?? ''), `${c.id}: ${m[1]}`).toBe(true);
    expect(fillCall(jtacCall('remarks-laser').text, { code: 1688 })).toBe('Laser code 1688.');
    expect(fillCall('{callsign} {grid}', { callsign: 'Pontiac 1-1' })).toBe('Pontiac 1-1 {grid}');
    expect(() => jtacCall('nope')).toThrow();
  });

  it('has no exclamation marks and no thousands separators', () => {
    for (const c of JTAC_CALLS) {
      expect(c.text).not.toContain('!');
      expect(c.text).not.toMatch(/\d,\d{3}/);
    }
    for (const s of CAS_CAVEATS) expect(s).not.toContain('!');
  });
});

describe('radio menu', () => {
  it('shows the DCS root list with F4 JTACs live', () => {
    expect(COMMS_MENU.map(n => n.fkey)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 10, 12]);
    const jtacs = COMMS_MENU.find(n => n.fkey === 4)!;
    expect(jtacs.label).toBe('JTACs...');
    expect(jtacs.disabled).toBeFalsy();
    expect(jtacs.children?.[0]?.label).toBe('{callsign}');
    expect(jtacs.children?.[0]?.children?.[0]?.action).toBe('check-in');
    for (const n of COMMS_MENU) if (n.fkey !== 4 && n.fkey !== 12) expect(n.disabled).toBe(true);
  });

  it('keeps F-keys unique and within 1..12 at every level, in every state', () => {
    for (const st of STATES) for (const mk of MARKS) {
      walk(buildCommsMenu('Axeman 1-1', st, mk), level => {
        const keys = fkeys(level);
        expect(new Set(keys).size, `${st}/${mk}`).toBe(keys.length);
        for (const k of keys) { expect(k).toBeGreaterThanOrEqual(1); expect(k).toBeLessThanOrEqual(12); }
      });
    }
  });

  it('uses only documented action ids, and every leaf has one', () => {
    const actions = new Set<string>(JTAC_ACTIONS);
    for (const st of STATES) for (const mk of MARKS) {
      walk(buildCommsMenu('Axeman 1-1', st, mk), level => {
        for (const n of level) {
          if (n.children || n.disabled) continue;
          expect(n.action, n.label).toBeDefined();
          expect(actions.has(n.action!), n.action).toBe(true);
        }
      });
    }
  });

  it('follows the ED flow: F1 is the next call', () => {
    const f1 = (st: JtacMenuState, mk: JtacMarkType = 'wp') => jtacMenuItems(st, mk).find(n => n.fkey === 1)?.action;
    expect(f1('idle')).toBe('check-in');
    expect(f1('control')).toBe('ready-to-copy');
    expect(f1('remarks')).toBe('ready-remarks');
    expect(f1('readback')).toBe('readback');
    expect(f1('ip')).toBe('ip-inbound');
    expect(f1('ip', 'none')).toBe('attack-complete');
    expect(f1('inbound', 'laser')).toBe('laser-on');
    expect(f1('mark')).toBe('contact-mark');
    expect(f1('lasing')).toBe('spot');
    expect(jtacMenuItems('lasing').find(n => n.fkey === 3)?.action).toBe('shift');
    expect(f1('run-in')).toBe('in');
    expect(f1('cleared')).toBe('off');
    expect(jtacMenuItems('mark', 'ir').map(n => n.action)).toEqual(expect.arrayContaining(['pulse', 'rope']));
    expect(jtacMenuItems('idle').map(n => n.action)).not.toContain('check-out');
    expect(jtacMenuItems('in').map(n => n.action)).toContain('check-out');
  });

  it('flags labels that are not in the ED manual', () => {
    const byAction = (st: JtacMenuState, a: string) => jtacMenuItems(st).find(n => n.action === a)!;
    expect(byAction('idle', 'check-in').unverified).toBe(true);
    expect(byAction('remarks', 'ready-remarks').unverified).toBe(true);
    expect(byAction('readback', 'readback').unverified).toBe(true);
    expect(byAction('control', 'ready-to-copy').unverified).toBeFalsy();
    expect(byAction('run-in', 'in').unverified).toBeFalsy();
  });
});

describe('marks', () => {
  it('covers every line-7 mark and keeps the built-in smoke white', () => {
    expect(MARK_OPTIONS.map(m => m.id)).toEqual(MARKS);
    expect(MARK_OPTIONS.find(m => m.id === 'wp')?.colour).toBe('white');
    for (const m of MARK_OPTIONS) if (m.kind !== 'smoke') expect(m.colour).toBeNull();
  });
  it('lets the Su-25T use smoke only', () => {
    expect(SU25T_CAN_SEE).toEqual({ smoke: true, laser: false, ir: false });
  });
});

describe('callsigns, caveats and binds', () => {
  it('lists the DCS JTAC callsigns', () => {
    expect(JTAC_CALLSIGNS).toHaveLength(19);
    expect(JTAC_CALLSIGNS[0]).toBe('Axeman');
  });
  it('lists every simplified item', () => {
    expect(CAS_CAVEATS.length).toBeGreaterThan(5);
    for (const needle of [/abort/i, /300 s/, /talk-on/i, /1113/, /grid/i, /danger close/i, /F5/]) {
      expect(CAS_CAVEATS.some(c => needle.test(c)), String(needle)).toBe(true);
    }
  });
  it('gives the Su-25T radio menu keys', () => {
    const comms = PROCEDURES.su25t.binds.filter(b => b.group === 'comms');
    expect(comms.map(b => b.keyboard)).toEqual(['\\', 'F1 … F12', 'Esc']);
  });
});
