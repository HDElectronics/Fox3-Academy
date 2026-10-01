import { describe, expect, it } from 'vitest';
import { latLon, linkView, modelTime, ownShipRows, previewSnapshot } from './model';
import { contextualLinks, destinationFor } from '../../app/navigation';
import { jetAllowed } from '../../app/roleGate';
import { routeFor } from '../../app/routes';
import { AIRCRAFT_ORDER } from '../../data/aircraft';

describe('DCS link page model', () => {
  it('walks the coach through bridge, DCS and ping', () => {
    const off = previewSnapshot('off')!;
    expect(linkView(off)).toMatchObject({ lamps: { bridge: 'off', dcs: 'off', ping: 'off' }, pingReady: false, coach: { tone: 'caution' } });
    expect(linkView(off).coach.why).toContain('npm run dcs-link');

    const waiting = previewSnapshot('waiting')!;
    expect(linkView(waiting)).toMatchObject({ lamps: { bridge: 'on', dcs: 'off' }, pingReady: true, coach: { text: 'Bridge up. Waiting for DCS.' } });

    const live = previewSnapshot('live')!;
    const v = linkView(live);
    expect(v).toMatchObject({ lamps: { bridge: 'on', dcs: 'on', ping: 'on' }, coach: { text: 'Two-way link confirmed.', tone: 'ok' } });
    expect(v.link).toMatchObject({ bridge: 'v0.1.0', script: 'v0.1.0', rate: '10.0 Hz', age: '42 ms', ownship: 'Allowed' });
    expect(v.ping).toEqual({ sent: '3', answered: '3', lost: '0', rtt: '21 ms' });

    const blocked = { ...live, pings: { ...live.pings, answered: 0 }, frame: { ...live.frame!, allow: { ownship: false, sensor: false, object: null } } };
    expect(linkView(blocked).coach.text).toContain('blocks own-ship export');
    expect(linkView(blocked).link).toMatchObject({ ownship: 'Blocked by server', object: '—' });
    expect(linkView({ ...live, dcs: 'stale' }).lamps.dcs).toBe('flash');
    expect(linkView({ ...live, pings: { ...live.pings, pending: 1 } }).lamps.ping).toBe('flash');
  });

  it('formats own-ship rows in the selected units', () => {
    const f = previewSnapshot('live')!.frame;
    const row = (units: 'metric' | 'imperial', id: string) => ownShipRows(f, units).find(r => r.id === id)!.value;
    expect(row('imperial', 'type')).toBe('F-16C_50');
    expect(row('imperial', 'ias')).toBe('334 kt');
    expect(row('metric', 'ias')).toBe('619 km/h');
    expect(row('imperial', 'alt')).toBe('23000 ft');
    expect(row('metric', 'alt')).toBe('7010 m');
    expect(row('imperial', 'vv')).toBe('236 ft/min');
    expect(row('imperial', 'hdg')).toBe('270°');
    expect(row('imperial', 'g')).toBe('1.3 G');
    expect(row('imperial', 'aoa')).toBe('4.0°');
    expect(ownShipRows(null, 'metric').every(r => r.value === '—')).toBe(true);
  });

  it('formats position and model time', () => {
    expect(latLon(41.6123, 41.5987)).toBe("N41°36.74' E041°35.92'");
    expect(latLon(-33.99999, -70.5)).toBe("S34°00.00' W070°30.00'");
    expect(modelTime(3725.9)).toBe('01:02:05');
  });

  it('is a reference page open to every jet', () => {
    expect(destinationFor('dcs')).toBe('reference');
    expect(contextualLinks('reference')).toContainEqual({ path: 'dcs', label: 'DCS link' });
    for (const id of AIRCRAFT_ORDER) expect(jetAllowed(routeFor('dcs'), id)).toBe(true);
    expect(previewSnapshot(null)).toBeNull();
  });
});
