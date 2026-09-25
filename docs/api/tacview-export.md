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

Supported objects are aircraft, air-to-air missiles, SAM sites and SAM missiles. Position-only objects use
the five-component transform; aircraft use the nine-component transform with attitude and native heading.
Only recorded samples create objects. Missing/dead objects disappear at their next sample. Final recorded
hit/miss/kill events remove affected objects even when a sortie ends before the next sample. Messages also
include launch, pitbull, datalink loss and SAM events, without reconstructing missing trajectories.

`AcmiDownload` owns at most one browser object URL. A new download revokes the previous URL; debrief
cleanup revokes the last URL. Downloads are generated on demand, and temporary anchors are removed.
A failed download leaves the existing debrief usable and displays a message.

## Limits and checks

The existing recording interval is 0.25 seconds. Very short-lived objects may never appear in a sample;
their recorded combat messages can still appear. SAM recording `active` means radar enabled, not alive,
so inactive sites remain visible. Site destruction cannot be inferred from this flag. No radar estimates,
coaching scores, ground-unit/A-G trajectories, countermeasure objects, unrecorded flight telemetry or
exterior GLBs are embedded. Tacview chooses its own models from the recorded names and type tags.

Tests check coordinate signs, angles, native distances, object lifecycle, final outcomes, escaping, empty
and invalid recordings, download URL cleanup, every fighter/loadout and a live SAM engagement recording.
The text-format checks are automated; opening the result in the native Tacview application remains a
manual compatibility check.
