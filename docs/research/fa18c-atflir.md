# F/A-18C ATFLIR foundations

Source: Eagle Dynamics, **DCS F/A-18C Early Access Guide**, PDF dated 24 March 2024,
424 pages. [Official manual download](https://www.digitalcombatsimulator.com/en/downloads/documentation/dcs-hornet_early_access_guide_en/).
The locally available official English PDF was read as text and the tracking-mode figure inspected.
This is a manual review, not a current-game verification.

- pp217–219: ATFLIR format from TAC PB6, A/G or NAV. Power/warmup precedes operational video.
  The lessons begin warmed up, A/G, right DDI on FLIR, with a waypoint designated.
- pp220–221: WFOV / MFOV / NAR; TV / IR; WHT / BLK in IR. Zoom is omitted.
- pp222–223: with FLIR assigned TDC, SCS toward the format cycles designation, SCENE and AUTO.
  INR and SCENE allow slew; designation requires TDC depressed; AUTO inhibits ordinary slew even
  before acquisition. Undesignate once selects INR, twice slaves to the velocity vector.
- pp226–227: move a waypoint designation using depressed TDC; SCENE tracks an image area;
  AUTO acquires a contrast object. Failed acquisition: return to INR/SCENE, reposition and try AUTO again.
- p227: TDC depress in AUTO opens offset designation. It is explicitly excluded, rather than presented
  as a generic designate command.

The UI uses named controls, not invented pushbutton positions. Sensor Control Switch Right, Undesignate
and TDC directions use the existing Hornet binding data. RAID/FLIR FOV is I (manual p76).
On-screen TDC depress is latched for accessibility; it represents holding the physical control, and is
labelled accordingly. The keyboard Enter binding is hold/release.

## Teaching abstractions

`src/pages/atflir/model.ts` is a deterministic page-local training model. The image is a real-time 3D rendering of an original depot using the existing MIT Blender-authored truck
asset with procedural fallbacks. Camera fields of view (28/9/2.4 degrees), continuous slew rates (32/10/2.5 scene metres per second) and tap nudges (1/0.3/0.08 metres), acquisition within 6 scene metres, instantaneous tracks, stationary trucks and manual obstruction
are invented training values. IR contrast and the independently selectable green night-vision look are
artistic treatments, not optical or thermal sensor modeling. The overview is an explicitly labeled training
aid with orbit controls and target labels; these are absent from the pod image.
No DCS-accurate angular FOVs, ranges, real-world sensor performance or weapon engineering are claimed. The synthetic
VVSLV view resets to the centre, since this module has no aircraft flight model. Reticle graphics are simplified.
All limitations are exported in `src/data/atflir.ts` and shown on the page.

Remaining scope: moving targets, realistic pod masking/limits, offset designation, zoom, laser codes, LST
and a separate guided delivery module. Verify current DCS behavior before extending these workflows.
