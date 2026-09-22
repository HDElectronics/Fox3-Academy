import { DataTable } from 'fox3-academy-ui';

export const FleetRadars = () => (
  <DataTable
    id="preview-table-fleet"
    caption="Fleet · radar, RWR and Fox 3"
    columns={[
      { key: 'jet', label: 'Jet' },
      { key: 'radar', label: 'Radar', mono: true },
      { key: 'rwr', label: 'RWR', mono: true },
      { key: 'fox3', label: 'Fox 3' },
    ]}
    highlight={(row) => row.jet === 'Su-27S'}
    rows={[
      { jet: 'Su-27S', radar: 'N001', rwr: 'SPO-15', fox3: 'None' },
      { jet: 'MiG-29S', radar: 'N019M', rwr: 'SPO-15', fox3: 'R-77' },
      { jet: 'F-15C', radar: 'APG-63(V)1', rwr: 'ALR-56C', fox3: 'AIM-120C' },
      { jet: 'F-14B', radar: 'AWG-9', rwr: 'ALR-67', fox3: 'AIM-54C' },
      { jet: 'M-2000C', radar: 'RDI', rwr: 'Serval', fox3: 'None' },
    ]}
  />
);

export const AfterLaunch = () => (
  <DataTable
    id="preview-table-support"
    caption="What the shot needs from you after launch"
    columns={[
      { key: 'missile', label: 'Missile', mono: true },
      { key: 'fox', label: 'Fox', num: true },
      { key: 'mode', label: 'Fired from' },
      { key: 'support', label: 'Support' },
    ]}
    highlight={(row) => row.missile === 'AIM-120C'}
    rows={[
      { missile: 'R-27R', fox: '1', mode: 'АТК ДВБ (STT)', support: 'Hold the lock to impact' },
      { missile: 'R-27ER', fox: '1', mode: 'АТК ДВБ (STT)', support: 'Hold the lock to impact' },
      { missile: 'R-77', fox: '3', mode: 'СНП / АТК ДВБ', support: 'Hold until about 8 nm, then free' },
      { missile: 'AIM-7M', fox: '1', mode: 'STT', support: 'Hold the lock to impact' },
      { missile: 'AIM-120C', fox: '3', mode: 'TWS or STT', support: 'Hold until pitbull, then crank off' },
      { missile: 'AIM-54C', fox: '3', mode: 'TWS or PD-STT', support: 'TWS goes active by itself; PD-STT stays SARH' },
    ]}
  />
);

export const RwrCodes = () => (
  <DataTable
    id="preview-table-rwr"
    caption="ALR-56C codes · what the scope draws"
    columns={[
      { key: 'symbol', label: 'Code', mono: true },
      { key: 'emitter', label: 'Emitter' },
      { key: 'reads', label: 'Reads as' },
    ]}
    highlight={(row) => row.symbol === 'M'}
    rows={[
      { symbol: '29', emitter: 'Flanker or Fulcrum', reads: 'Every Su-27, Su-33, J-11A and MiG-29 shares it' },
      { symbol: '15', emitter: 'F-15C', reads: 'Also the SA-15 code on the ground list' },
      { symbol: '14', emitter: 'F-14B', reads: 'AWG-9 search is audible long before a lock' },
      { symbol: 'M', emitter: 'Active missile', reads: 'Drawn in the inner ring as the primary threat' },
      { symbol: '50', emitter: 'A-50 AWACS', reads: 'Steady search, no threat by itself' },
    ]}
  />
);

export const FlankerBindings = () => (
  <DataTable
    id="preview-table-binds"
    caption="Su-27S · BVR keys"
    columns={[
      { key: 'action', label: 'Action' },
      { key: 'keys', label: 'Key', mono: true },
      { key: 'group', label: 'Group' },
    ]}
    highlight={(row) => row.group === 'Weapons'}
    rows={[
      { action: 'BVR mode', keys: '2', group: 'Radar' },
      { action: 'Radar on / off', keys: 'I', group: 'Radar' },
      { action: 'ОБЗ / СНП ДВБ', keys: 'RAlt + I', group: 'Radar' },
      { action: 'PRF ППС / ЗПС / АВТ', keys: 'RShift + I', group: 'Radar' },
      { action: 'Cursor slew', keys: '; , . /', group: 'Radar' },
      { action: 'Designate / lock', keys: 'Enter', group: 'Radar' },
      { action: 'Launch (hold 1 s)', keys: 'Space', group: 'Weapons' },
      { action: 'Chaff', keys: 'Insert', group: 'Defence' },
    ]}
  />
);
