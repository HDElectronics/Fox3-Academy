# A-10C II / CAS Blender rebuild review

Rebuilt 2026-09-28. All seven production GLBs were constructed in Blender 5.2.2 LTS with
`bpy`/`bmesh`, then exported and material-batched through the same Blender preparation path as the fleet.
Python drives Blender and the rebuild wrapper. No standalone Python GLB encoder or old GLB import was
used to author these meshes. **OpenVSP: not used for any of the seven models.**

The editable preferred source is `scripts/assets/source/a10c/generate.py`.
The rebuild also writes a `.blend` scene per model under
`.shots/a10c-model-review/a10c/<id>/model.blend`. See [rebuild commands and rig contract](a10c.md).

## Production measurements

KB means 1000 bytes. Counts are triangles in the shipped GLB, independently audited after preparation.

| Model | Tool | Before KB | After KB | Before triangles | After triangles | Meshes |
|---|---|---:|---:|---:|---:|---:|
| `a10c` | Blender / Python automation | 602.5 | 501.2 | 8188 | 18201 | 16 |
| `gbu12` | Blender / Python automation | 81.2 | 118.8 | 1068 | 3792 | 5 |
| `agm65` | Blender / Python automation | 52.9 | 76.4 | 684 | 1580 | 4 |
| `apkws` | Blender / Python automation | 234.4 | 85.2 | 3212 | 3756 | 3 |
| `mk82` | Blender / Python automation | 59.4 | 81.6 | 784 | 2884 | 3 |
| `cbu97` | Blender / Python automation | 59.4 | 80.9 | 784 | 2884 | 3 |
| `tgp` | Blender / Python automation | 51.8 | 37.9 | 680 | 968 | 3 |

The jet is 17.5300 m wide and 16.2591 m long in its clean configuration. Runtime axes remain metres,
nose −Z, up +Y, right +X. All nine existing pivots, eleven pylon labels and seven APKWS pod-opening
labels survive export and preparation. No runtime wiring or test edits were needed.

The new jet adds curved wing sections, smoother fuselage/canopy/gear-pod shells, beveled surface edges,
nacelle/rudder seams and a canopy frame projected onto the glass. The first Cycles review exposed a
floating windshield bow; it was corrected and the A-10 source and production GLB rebuilt before final checks.
Material batching and indexed Blender exports keep file sizes small despite the higher triangle counts.
The independent export review also exposed a preview-only Euler/quaternion mismatch after Blender import;
the Cycles studio now applies hinge rotations as quaternions and restores the original transform.
The production rig and its passing runtime tests needed no changes.

## Validation

- Seven independent GLB audits passed: finite geometry, valid indices/transforms, embedded resources,
  nondegenerate bounds and no budget warnings (jet 1.5 MB, each store 300 KB; 60000 triangles).
- `npx tsc --noEmit -p .`: passed, zero TypeScript errors.
- `npx vitest run src/render`: passed, 18 files / 188 tests.
- `npm run build`: passed.
- Requested headless gallery command completed at 1440 × 900; screenshot inspected, no app console errors.
  `scripts/shot.sh` uses the existing localhost:5190 server serving this checkout. The existing user-facing
  :5191 server was not reconfigured.
- All 51 unrelated manifest entries are unchanged. No Git commands were run.

## Review artifacts

All paths below are relative to the checkout and remain local review outputs.

- Browser: `.shots/a10c-gallery-blender.png`.
- Authoring Cycles views: `.shots/a10c-model-review/a10c/<id>/{front,side,top,quarter}.png`.
- Jet rear and deployed authoring views: `.shots/a10c-model-review/a10c/a10c/{rear,deployed}.png`.
- Independent optimized-GLB Cycles views: `.shots/a10c-model-review/shipped/<id>/{front,side,top,quarter}.png`.
- Optimized jet rear/deployed views: `.shots/a10c-model-review/shipped/a10c/{rear,deployed}.png`.
- Final contact sheets: `.shots/a10c-model-review/shipped/a10c-contact.png` and
  `.shots/a10c-model-review/shipped/stores-contact.png`.
- Audit JSON: `.shots/a10c-model-review/audits/<id>.json`.
- Prior source and GLBs: `.shots/a10c-model-review/before-blender/`.

Reviewed front, side, top, front/rear quarter and deployed jet views, plus store views. These are original
exterior approximations, not exact DCS mesh reproductions. Small variant fittings, full gear-door sequences,
physical-device performance and LODs remain outside this visual rebuild. Maverick D/H/L share one body;
the APKWS asset is the LAU-131 carriage pod, while its flying projectile remains procedural.

## Files changed in this rebuild

Modified:

- `src/assets/models/a10c.glb`
- `src/assets/models/gbu12.glb`
- `src/assets/models/agm65.glb`
- `src/assets/models/apkws.glb`
- `src/assets/models/mk82.glb`
- `src/assets/models/cbu97.glb`
- `src/assets/models/tgp.glb`
- `src/assets/models/manifest.json`
- `scripts/assets/source/a10c/generate.py`
- `scripts/assets/source/a10c/review.py`
- `scripts/assets/rebuild_models.py`
- `scripts/assets/prepare_models.py`
- `docs/assets/a10c.md`
- `docs/assets/README.md`

Added: `docs/assets/a10c-blender-rebuild.md` (this report).

Removed: `scripts/assets/source/a10c/blender_sources.py` (obsolete import-only helper).

No source files under `src/pages`, `src/sim`, `src/data`, `src/ui`, or `src/render` were changed by this rebuild.
The production build and `.shots` outputs are generated local artifacts, not additional source changes.
