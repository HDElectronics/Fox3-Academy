# Tacview export

BVR Sortie → Debrief → **Download ACMI** saves `fox3-sortie-<aircraft>.acmi` locally. Open that file in
Tacview. The export is independent of the replay's Truth / Your radar switch: it always contains the
recorded whole-fight truth. Nothing is uploaded. With no recording samples, the button is disabled.

## Format and source

`src/export/acmi.ts` implements the [official Tacview ACMI 2.2 text format](https://www.tacview.net/documentation/acmi/en/)
([current documentation](https://raia-software-inc.gitbook.io/tacview/technical-documentation/acmi-telemetry-file-format),
checked 2026-09-25). The file has a UTF-8 BOM, required format header, metric units, hexadecimal object IDs,
frame timestamps, object transforms, object removal records and combat messages. The format's native flat
coordinates preserve the trainer's distances. Aircraft attitude is exported; missiles have position only.

## Coordinate and time contract

The trainer has no geographic map or mission date. The file explicitly labels both as synthetic:

- Origin: latitude 0°, longitude 0°. Reference date: `2000-01-01T00:00:00Z`.
- East = sim x; north = −sim z; altitude = sim y, all in metres.
- Native `U` / `V` = east / north. Synthetic longitude = `east / 6378137 × 180/π`;
  latitude = `north / 6378137 × 180/π` (an equatorial equirectangular placement).
- Aircraft roll/pitch/heading convert recorded radians to degrees. Positive roll banks right;
  positive pitch climbs; heading is clockwise from north. The same heading supplies native Heading and Yaw.
- Frame offsets retain simulation seconds; they are independent of replay speed or selected display units.

This is a synthetic placement, not a DCS theater reconstruction. Tacview terrain and geographic distances
may differ from the trainer. Native coordinates are supplied for flat-world measurements.

## API and lifetime

`exportAcmi(recording: readonly RecordFrame[], options?: AcmiOptions): string` is deterministic and does not
mutate input. Options supply a title, callsign map and recorded `SimEvent[]`. Frames and events are sorted
chronologically. IDs are allocated from the sorted set of recorded entity IDs; zero stays reserved for
file metadata. Names and type tags appear when an object first appears. Parent IDs associate missiles with
recorded shooters/sites. Text metadata cannot inject extra records. Invalid coordinates/times fail export.

Supported objects are aircraft, air-to-air missiles, SAM sites, SAM missiles, ground units, air-to-ground
weapons and smoke marks. Position-only objects use the five-component transform; aircraft and ground units
use the nine-component transform (ground units: zero roll and pitch, recorded heading). Only recorded samples
create objects. Missing/dead objects disappear at their next sample. Final recorded hit/miss/kill events
remove affected objects even when a sortie ends before the next sample. Messages also include launch,
pitbull, datalink loss and SAM events, without reconstructing missing trajectories.

### Ground attack and CAS (recordings with `groundUnits`, `agWeapons`, `marks`)

All tags and events below are documented in the ACMI 2.2 reference ("Object types", "Common types",
"Events"). A recording without these fields exports exactly as before; a BVR-only snapshot test guards it.

| Recorded | ACMI object | Name |
|---|---|---|
| Ground unit `tank` | `Ground+Heavy+Armor+Vehicle+Tank` | Tank |
| `apc` | `Ground+Armor+Vehicle` | APC |
| `truck` | `Ground+Light+Vehicle` | Truck |
| `bunker`, `building` | `Ground+Static+Building` | Bunker, Building |
| `sam-site`, `aaa` | `Ground+AntiAircraft` | SAM site, AAA |
| A-G weapon, kind `missile` / `rocket` / `bomb` | `Weapon+Missile` / `Weapon+Rocket` / `Weapon+Bomb`, `Parent` = shooter | `AG_WEAPONS` name |
| Smoke mark | `Misc+Decoy+SmokeGrenade` (the documented smoke grenade) | White / Orange / Red / Green smoke |

Coalition and Color follow the recorded side, as for aircraft. Recordings carry the unit kind, not the
scenario's unit name, so names are the kind labels above.

Events, at their recorded times (all `Event=Message` unless noted; object references only for objects
already sampled):

- `ag-launch`: `<weapon> launched` (shooter, weapon, target). `ag-impact`: `<weapon> impact` (weapon,
  target), then the weapon is removed. `ag-miss`: `<weapon> missed: <reason>`, weapon removed.
- `ground-kill` (ground unit or SAM site): `<name> destroyed[ by <weapon>]` (target, shooter), then
  `Event=Destroyed|<id>` and removal. A killed SAM site stays removed even though its recording has no
  alive flag. A ground unit whose sample turns dead with no kill event gets `Event=Destroyed` at that sample.
  A kill recorded at the same time as a sample is written after the sample, so the message still refers to it.
- `mark`: `<White smoke | Laser | IR pointer> mark on|off` (mark object if it is smoke, owner). A smoke
  mark ending by event is removed and not respawned by later samples.
- `note` (JTAC and lesson calls): `Event=Message|<text>` with no object reference.

Not exported: cannon rounds (`gun25t`; one object and message per round would bury the fight; kills by
cannon still appear in the `ground-kill` message), laser and IR spots as objects (no documented ACMI type;
messages only), laser codes (not in the recording or the mark event), the Shkval sight state, and
`shkval-lock`, `shkval-lost`, `laser`, `gun`, `tracer` and `gun-hit` events.

`AcmiDownload` owns at most one browser object URL. A new download revokes the previous URL; debrief
cleanup revokes the last URL. Downloads are generated on demand, and temporary anchors are removed.
A failed download leaves the existing debrief usable and displays a message.

## Limits and checks

The existing recording interval is 0.25 seconds. Very short-lived objects may never appear in a sample;
their recorded combat messages can still appear. SAM recording `active` means radar enabled, not alive,
so inactive sites remain visible. Site destruction cannot be inferred from this flag. No radar estimates,
coaching scores, cannon rounds, countermeasure objects, unrecorded flight telemetry or
exterior GLBs are embedded. Tacview chooses its own models from the recorded names and type tags.

Tests check coordinate signs, angles, native distances, object lifecycle, final outcomes, escaping, empty
and invalid recordings, download URL cleanup, every fighter/loadout, a live SAM engagement recording, a
byte-identical BVR snapshot, a synthetic CAS recording (ground units, A-G launch/impact/miss, kills, smoke
mark on/off, a note), same-time kills, SAM site kills and a live Su-25T recording with a ground unit.
The text-format checks are automated; opening the result in the native Tacview application remains a
manual compatibility check.
