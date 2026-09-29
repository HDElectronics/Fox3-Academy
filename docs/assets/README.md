# Original exterior asset library

Fox3 ships 58 original Blender-authored exterior models under the repository's [MIT license](../../LICENSE):
12 aircraft, 17 air-to-air missiles, 19 other stores/SAM missiles, and 10 ground vehicles or structures.
No third-party meshes, game extractions or image textures are included. Public photographs and drawings
were visual references only; per-model reference links and variant caveats are in
[`manifest.json`](../../src/assets/models/manifest.json).

The models are artist approximations for a game tutorial. Panel lines, markings, small fittings and some
family variants are simplified. They are not engineering models or a claim of exact DCS model parity.
The refined legacy Hornet tail silhouette is included. R-60 is available in the library for future loadout
visuals; the current simulation has no R-60 in-flight entity. The Litening pod and APKWS carriage pod are loadout assets; the APKWS in-flight rocket remains procedural.
Maverick D/H/L share one exterior file. See [A-10/CAS exterior art](a10c.md). This integration does not change gameplay data or weapon behavior.

## Preferred source and rebuild

Editable, original source is in [`scripts/assets/source`](../../scripts/assets/source). The seven Blender
Python generators create editable `.blend` scenes, review GLBs and Cycles images. The A-10/CAS generator
lives under `source/aircraft/a10c/`; its stores live in `source/stores/generate_stores.py`.
They share `source/blender_exterior.py` helpers; see [their workflow](a10c.md). OpenVSP is
optional and was not used for these models. Blender 5.2.2 generated the integration exports. Rebuild:

```sh
python3 scripts/assets/rebuild_models.py --blender /path/to/blender --work /tmp/fox3-models
# Rebuild one asset while retaining the other manifest entries:
python3 scripts/assets/rebuild_models.py --blender /path/to/blender --work /tmp/fox3-models --only r77
npm run check
```

`--out` can target a separate comparison directory. Review renders and `.blend` files remain in the work
folder; only optimized GLBs and their manifest belong in the application bundle. The R-77 single-asset
rebuild was exercised end to end. Export bytes can differ with Blender/exporter versions.

`prepare_models.py` reduces dense surfaces, merges static meshes by material and preserves separate
F-14 wing pivots and all nine A-10 configuration pivots. Assets contain only geometry and material colors, use metres, nose −Z, up +Y and right +X;
ground assets have their base at Y=0. The runtime fits aircraft/missile lengths and ground footprints to the
existing display contracts. The manifest records review-source and optimized-output SHA-256 hashes;
its `source_caveats` retain the original review notes, including checks since completed during integration.
All production entries use the same nine fields: `id`, `category`, `name`, `source_sha256`, `sha256`,
`bytes`, `references`, `source_caveats`, and `authorship`. Detailed authoring metadata stays with review sources.

## Runtime and limits

`AssetVisual` loads bundled URLs on demand, shares geometry while referenced, clones tintable materials per
instance, and releases resources on final disposal. Loading or failure leaves a procedural fallback visible.
Tactical side colors, shadows and wreck materials also apply when an asset arrives after a state change.

Clean aircraft use the new exteriors. The F-14 wings follow the existing visual sweep schedule. The A-10 has named gear, flap and split-deceleron pivots. For the other exteriors, deploying
gear, flaps or speedbrakes switches the whole aircraft to its existing animated procedural model; retracting
those parts restores the exterior. Detailed gear-door sequencing and LOD chains remain future work.
Ground units, SAM sites, A-G stores and tactical missiles use the same loader; gun rounds remain tracers.

The default build embeds all GLBs in its standalone HTML. The web build emits separate hashed assets and
fetches only models needed by the current scene. The complete geometry library is about 12 MB before
base64 encoding or transfer compression. Prefer the web build for normal hosting.

Automated checks parse all 58 exports, check coverage, finite positions, embedded resources, sensible bounds,
ground origin, and budgets of 18 meshes / 60000 triangles per asset. Loader tests cover concurrent users,
late loads, failure, tint isolation and cleanup. Real F-14 geometry is tested in spread and swept states; the A-10 rig is checked through deployment and retraction.
The original 51-model integration had desktop and 390 CSS-pixel browser checks. The A-10/CAS batch has Cycles source/export reviews and a desktop browser gallery check;
see [A-10/CAS exterior art](a10c.md) for measurements and verification. These checks do not
establish physical-phone or low-end-GPU frame rates; device QA remains tracked in
[#6](https://github.com/HDElectronics/Fox3-Academy/issues/6).
