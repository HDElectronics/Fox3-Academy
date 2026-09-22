# Aircraft asset sources

Research date: 2026-09-21

**Status: deferred to community contributions.** The application retains its existing procedural aircraft
models. No further asset search, purchase, generation or cleanup is scheduled. No external review model
has been integrated. The candidates below are historical research leads, not an active adoption queue;
contributors should recheck availability, rights and quality before proposing a replacement.

Prefer free, openly redistributable assets. Price alone does not establish redistribution rights. No
purchase or asset integration has been made. See [B20 in the backlog](../../BACKLOG.md) for acceptance criteria.

This is a bounded source and licence survey for the ten aircraft currently in Fox3 Academy. It covers visual aircraft and cockpit assets only. A follow-up exterior review downloaded and converted the F-16, F-15 and MiG-29 candidates outside this repository. No aircraft assets have been adopted or committed here; exact variant detail, target-render appearance and performance still require review.

## Acceptance rule

An asset is ready for an integration trial only when its own upstream page or repository grants both modification and redistribution, the licence covers the mesh and every bundled texture, and the publisher's right to license the work is credible. A Creative Commons badge on an unexplained upload is not enough when the model may have come from another game.

Do not use models extracted from DCS, War Thunder, Ace Combat or another game, even if a third-party upload labels the extraction CC BY. Do not use an asset whose only terms are "free", "royalty free", "editorial", non-commercial, or no-derivatives. Those terms do not provide the open redistribution and modification rights selected for this project.

The project is MIT licensed. GPL aircraft are open-source assets, but adding them to the single-file application requires a deliberate distribution decision. Preserve the original preferred source, conversion scripts, copyright notices, licence, attribution and change log; provide corresponding source with releases; and get a licence review before combining a GPL model with the MIT application. This note does not decide whether an embedded model and the surrounding application form one GPL-covered work.

## Licence meanings used here

- **GPL v2 / GPL v2-or-later:** modification and redistribution are allowed, including commercially, but redistributed derivatives must remain under the GPL and complete corresponding source must be available. See the [GNU GPL v2 text](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
- **CC BY 4.0:** copying, redistribution and adaptation are allowed, including commercially. Credit, a licence link and an indication of changes are required. See the [Creative Commons deed](https://creativecommons.org/licenses/by/4.0/).
- **CC0 1.0:** copying, modification and redistribution are allowed without permission or attribution, subject to rights outside copyright. See the [Creative Commons deed](https://creativecommons.org/publicdomain/zero/1.0/).
- **OGA-BY 3.0:** permits reproduction, adaptation and distribution with attribution and identification of changes. The legal text also permits redistribution under CC BY 3.0. See the [OpenGameArt legal text](https://static.opengameart.org/OGA-BY-3.0.txt).

## Candidate matrix

| Fox3 Academy aircraft | Best source found | Rights evidence | Variant and asset fit | Decision |
|---|---|---|---|---|
| Su-27S Flanker-B | [Sketchfab: Sukhoi Su-27](https://sketchfab.com/3d-models/sukhoi-su-27-flanker-2541c1dbc6c1499cb7b38b5bf1314750) | Page says CC Attribution (Sketchfab applies CC BY 4.0 to this option). | Low-poly external model; page gives a general aircraft description but does not say the uploader created the mesh or identify source files. Other prominent results explicitly say DCS or War Thunder. | **Blocked.** Ask the uploader for creation/source provenance before considering it. Explicit DCS/War Thunder uploads are rejected. |
| Su-33 Flanker-D | [FlightGear FGAddon package](https://svn.code.sf.net/p/flightgear/fgaddon/trunk/Aircraft/Sukhoi-Su-33/) | Package root contains the [GPL v2 text](https://svn.code.sf.net/p/flightgear/fgaddon/trunk/Aircraft/Sukhoi-Su-33/COPYING). | The package's [`su33-set.xml`](https://svn.code.sf.net/p/flightgear/fgaddon/trunk/Aircraft/Sukhoi-Su-33/su33-set.xml) identifies Su-33 Flanker-D, author Emmanuel Baranger, model rating 4 and cockpit rating 2. | **Withheld from redistribution.** Follow-up found third-party texture/livery credits and no explicit package-wide grant. Confirm all components and whether the grant is GPL-2.0-only or later before publishing a preview. |
| J-11A Flanker-L | [Sketchfab: Shenyang J11](https://sketchfab.com/3d-models/shenyang-j11-flanker-l-aaa7700649fc43848020981313cc595c) | Page says CC Attribution. | About 30k triangles and a family match, but the page does not identify the J-11A subvariant, original modelling work or source provenance. | **Blocked.** Obtain written provenance and confirm the A variant before use. A repainted Su-27 may be acceptable only if the UI labels it as a family stand-in. |
| MiG-29S Fulcrum-C | [FlightGear MiG-29 package](https://svn.code.sf.net/p/flightgear/fgaddon/trunk/Aircraft/Mig-29/) | The [package README](https://svn.code.sf.net/p/flightgear/fgaddon/trunk/Aircraft/Mig-29/README.txt) says the model is distributed under GPL v2; the root includes [`COPYING.txt`](https://svn.code.sf.net/p/flightgear/fgaddon/trunk/Aircraft/Mig-29/COPYING.txt). | README identifies a MiG-29 9-12 Fulcrum-A, says physical modelling was unfinished, and says the cockpit uses English rather than Cyrillic labels. It is not the DCS MiG-29S 9-13/Fulcrum-C. | **Rejected for integration.** The reviewed exterior falls below the visual-quality target and represents the wrong variant. Do not carry it forward as a replacement for MiG-29S. |
| F-15C Eagle | [OpenGameArt: F-15](https://opengameart.org/content/f-15) | Asset page names MNDV.ecb as author, specifies OGA-BY 3.0 and an attribution notice; it says packed matcap textures are CC0. | A small Blender external model with movable control surfaces. The page does not identify the subvariant, and no cockpit is claimed. | **Rejected for integration.** The reviewed exterior falls below the visual-quality target: about 2,820 triangles, flat colors and no cockpit detail. Reference schematic images were excluded because their separate provenance was unclear. Exact C variant is unverified. Retained here as a research record, not a fallback recommendation. |
| F-15C Eagle | [FlightGear F-15 package](https://svn.code.sf.net/p/flightgear/fgaddon/trunk/Aircraft/F-15/) | No `LICENSE`, `COPYING` or copyright file was present in the current package root. The [maintainer README](https://github.com/FGMEMBERS/F-15) does not state a licence. | Exact F-15C configuration and a highly rated external/cockpit model, but its README says the cockpit uses third-party photographs, which need their own redistribution grant. | **Rejected until licensed.** Do not infer a licence from inclusion in FlightGear or from a mirror repository. |
| F/A-18C Hornet Lot 20 | [Sketchfab: F/A-18C Hornet](https://sketchfab.com/3d-models/mcdonnell-douglas-fa-18c-hornet-c68c8417c8e84864b2a5e0c35c178fd9) | Page says CC Attribution. | About 10k triangles and an exact C-model title, but the description does not establish original authorship, Lot 20 details or cockpit content. | **Blocked.** Obtain creator/source provenance and verify Lot 20 geometry before use. |
| F/A-18C Hornet Lot 20 cockpit | [OpenHornet](https://openhornet.com/) | Project page says CC BY-NC-SA and personal non-commercial use. | Detailed F/A-18C Lot 20 home-cockpit CAD, not a game-ready aircraft asset. | **Rejected for this project.** The non-commercial restriction is not open-source-compatible and conflicts with an MIT-distributed asset. It may be consulted only within its terms; do not copy its CAD or art. |
| F-16C Viper Block 50 | [FlightGear F-16 repository](https://github.com/NikolaiVChr/f16) | [`copyright.txt`](https://github.com/NikolaiVChr/f16/blob/master/copyright.txt) expressly extends to every file and grants GPL v2-or-later modification and redistribution; the repository includes the [GPL v2 licence](https://github.com/NikolaiVChr/f16/blob/master/LICENSE). | README explicitly lists F-16CJ Block 50 and says variants have distinct cockpit layouts. The package includes exterior, cockpit, textures and systems; browser cost is unknown. | **Strongest exact candidate.** Trial the Block 50 exterior and cockpit only after GPL distribution review and a complete component-level provenance scan. |
| F-14B Tomcat | [Maintainer release and licence](https://zaretto.com/content/realistic-grumman-f-14-simulator-flightgear), [source](https://github.com/Zaretto/f-14b) | The maintainer explicitly licenses the work under GPL v3 and links the source and release. | Exact F-14B title with original exterior/cockpit author credits. Selected textures and liveries still need review. | **Promising free review candidate.** This primary grant corrects the earlier repository-only missing-licence assessment. Convert and inspect before adoption. |
| F-14B Tomcat | [Sketchfab: F-14B](https://sketchfab.com/3d-models/grumman-f-14b-tomcat-50285312fae748b3811b9cb7804cab29) | Page says CC Attribution. | The page says only that a decal was fan-made by the uploader; it does not say the underlying 189k-triangle model was created by them. | **Blocked.** The licence badge does not resolve ownership of the base mesh. |
| JF-17 Thunder | [Sketchfab: JF-17](https://sketchfab.com/3d-models/jf-17-b57660f346314df1877e15b85d6e74be) | Page says CC Attribution. | About 8k triangles, but the description says it is "for" an external mobile game and does not state who created or owns the mesh. No cockpit is claimed. | **Blocked.** Get confirmation from the game/model rights holder; do not rely on the uploader badge alone. No corroborated open cockpit source was found. |
| Mirage 2000C | [FlightGear Mirage 2000 repository](https://github.com/5H1N0B11/flightgear-mirage2000) | Repository identifies GPL-2.0 and contains an explicit [`LICENSE`](https://github.com/5H1N0B11/flightgear-mirage2000/blob/master/LICENSE). | README says the main aircraft is Mirage 2000-5, with D/N exterior variants, and the cockpit remains a -5. This is not the DCS Mirage 2000C RDI cockpit. | **Family stand-in only.** The external delta shape may support a clearly labelled distant model after review; do not use its cockpit or present it as an exact 2000C. Exact C results found in this pass were paid or identified as War Thunder content. |

Explicitly rejected examples include a model titled [Su-27 (DCS World)](https://sketchfab.com/3d-models/su-27-dcs-world-793852b672d54416a797a5070beabb3b), a model titled [Su-27 (War Thunder)](https://sketchfab.com/3d-models/su-27-war-thunder-9b029e1361d54d6892bda837ffb83bbe), an [Ace Combat Su-33 extraction](https://sketchfab.com/3d-models/su-33-flanker-d-3d3e2c35670f4ebcbe5566e016e2473c), and a model titled [Mirage 2000C-S4 (War Thunder)](https://sketchfab.com/3d-models/mirage-2000c-s4-2-custom-war-thunder-66dc57f5e15a4c73b4c2a910da6b106b). An uploader cannot grant rights they do not own; the Su-33 page additionally uses a non-commercial, no-derivatives licence. These are not fallback options.

Sketchfab's own [Creative Commons overview](https://sketchfab.com/blogs/community/an-introduction-to-creative-commons-licenses/) says its default downloadable-model attribution licence is CC BY and that adding NC, ND or SA changes the allowed use. Its [download guidance](https://sketchfab.com/developers/download-api/guidelines) requires attribution to the creator and source to follow the model. These terms explain the rights shown on the listed pages; they do not warrant that an uploader owns a mesh. Sketchfab's separate [paid-model licence](https://sketchfab.com/licenses) expressly disclaims any warranty of the licensor's authority, reinforcing the need for provenance checks.

## Practical result

There is no verified, exact, open-licensed set covering all ten aircraft.

- **F-16CJ Block 50:** retain the cleaned FlightGear exterior as the preferred candidate for further
  integration review. Its visual direction is acceptable. This does not approve implementation, establish
  cockpit fidelity, or resolve the final GPL distribution approach. The mesh is shared by several variants,
  so configuration identity does not prove every visual detail.
- **OpenGameArt F-15:** rejected on visual quality; seek a substantially more detailed F-15C.
- **FlightGear MiG-29 9-12:** rejected on visual quality and variant mismatch; seek a MiG-29S / 9-13.
- **Su-33:** existing FlightGear lead remains withheld pending an explicit component grant. The animated Sketchfab candidate below is not currently downloadable and has an Editorial licence.
- **F-14B:** the maintainer's GPL v3 grant makes the detailed FlightGear model a new review candidate.
- **MiG-29 9-13:** Rifeor's downloadable CC BY 4.0 model is a stronger visual candidate; exact 9-13S details and browser optimization remain to be checked.
- **J-11A:** Yanes/FGPRC's GPL v3-or-later configuration is a review candidate with a shared Su-27-family exterior caveat.
- **Su-27S, F/A-18C Lot 20, JF-17 and Mirage 2000C:** no suitable exact candidate cleared yet.
  The known Mirage 2000-5 is a different variant, not an approved substitute.

A future community search should prioritize convincing shape, textures and detail comparable to or better than the
reviewed F-16, correct aircraft variants, and clear upstream rights. Polygon counts alone do not establish
quality. Keep rejected candidates as research records; do not treat them as approved fallbacks.

## Additional Sketchfab and FlightGear candidates

- [Animated Su-33 by jotar](https://sketchfab.com/3d-models/animated-su-33-d-flanker-jet-fighter-befe30627b3b478ba3f9862c4088974d): checked the [primary model metadata](https://api.sketchfab.com/v3/models/befe30627b3b478ba3f9862c4088974d). It reports `isDownloadable: false`, an **Editorial** licence and 15,702 triangles. A viewable model is not necessarily offered for download. This is a visual reference lead, not an openly licensed integration candidate; a separate creator grant and authorized files would be needed.
- [Rifeor MiG-29 9-13](https://sketchfab.com/3d-models/mig-29-9-13-2c8a8f454fa04a8b914aa9a227f67bbe): primary metadata reports downloadable, **CC BY 4.0**, 898,873 triangles and eleven texture sets. The model links to the creator's [matching portfolio project](https://www.artstation.com/artwork/DvlkrA). Promising quality; evaluate silhouette, 9-13S details, texture rights and optimized browser cost before adoption.
- [Yanes/FGPRC Su-27SK and J-11A](https://github.com/yanes19/SU-27SK): README grants GPL v3-or-later; `J-11A-set.xml` names that variant. It shares Su-27-family exterior geometry, so the configuration alone does not prove exact external details. The Su-27SK is an export variant, not an exact Su-27S replacement.
- [Chris Kuhn's high-poly Hornet](https://blendswap.com/blend/8636): creator-authored CC-BY work, but a two-seat F/A-18B. Do not silently substitute it for the F/A-18C.

Sketchfab candidates should be reported with separate **visual quality**, **download availability** and **licence** statuses. Its downloadable CC BY models can be good fits; Editorial, NC and ND restrictions do not meet this project's open-asset requirement. Do not recover viewer-only files or assume a third-party reseller has creator permission.

For paid fallbacks, ordinary marketplace licences may permit inclusion in a finished game while forbidding distribution of the underlying model. For example, [CGTrader's Royalty Free terms](https://help.cgtrader.com/hc/en-us/articles/360015124437-Royalty-Free-License) restrict raw redistribution and require protection against extraction in software. Such a purchase is not automatically suitable for an open repository or this application's directly accessible assets. No qualifying paid fallback has been verified in this survey.

## Local exterior evaluation

- **F-16:** inspected source revision `0d0d3d425a9a852b9cd6a764dedee7c9c72cdf51`. Assimp conversion retains
  about 18,000 faces and four textures. Blender inspection found coherent geometry, UVs and normals. Raw
  conversion exposes FlightGear afterburner-effect geometry, opaque canopy glass and deployed landing gear;
  a review export must identify any effect removal, material approximations and Block 50 configuration
  filtering. No separate cockpit was imported. Preserve the original Blender/AC3D inputs and converter.
- **MiG-29:** converted the GPLv2 9-12 airframe and its texture. This older exterior remains a wrong-variant
  comparison for MiG-29S. Cockpit, detailed nozzle submodels and animations were not imported.
- **F-15:** the author-uploaded Blender file is editable but low detail. The review export removes reference
  drawings, uses flat PBR colors, and does not establish exact F-15C geometry.
- **Additional Hornet lead:** [HeriFajar's original-author low-poly Hornet](https://sketchfab.com/3d-models/fa-18-hornet-low-poly-25a2485d6eb4428f89c014e03fb42047)
  claims CC BY 4.0 and authorship, but the creator warns of minimal textures, no cockpit, and possible
  dimensional inaccuracies. Exact C variant is unverified; this is not a high-fidelity recommendation.

The research has not produced a uniform high-fidelity open-licensed fleet. Review models independently
before adoption, with their licences and source archives separate from the MIT application code.

## 2D-first cockpit explorer

A ten-aircraft 3D cockpit set is not currently feasible from the sources above. F-16 is the only exact variant with a clearly package-wide open grant. The Su-33 package has a low cockpit rating, MiG-29 and Mirage use the wrong variants, F-15 lacks an explicit package licence, and the newly located F-14B and J-11A sources still need a dedicated cockpit review. No credible open JF-17 cockpit was found. OpenHornet is detailed but non-commercial.

Build the first cockpit explorer as original project-owned 2D SVG/Canvas diagrams:

1. Draw panels, bezels, switches and display areas as new schematic geometry. Use the existing design tokens and instrument font rather than copying cockpit photography or manual artwork.
2. Use official DCS/aircraft manuals as factual references for pilot-facing location, label and behavior. A reference manual or screenshot being publicly viewable does not grant redistribution or modification rights; do not trace or package it.
3. Keep each interactive hotspot in data: aircraft, station, control label, DCS command/binding, state, lesson and source citation. Mark uncertain locations or behavior in the UI.
4. Use authored display renderers already in the project for radar/RWR/MFD content. Surround them with schematic panels until a matching open 3D cockpit passes the asset checklist.
5. Add optional 3D cockpits aircraft by aircraft. Do not delay complete ten-aircraft lesson coverage while waiting for a uniform 3D set.

This produces a consistent, responsive explorer and keeps the project free to publish under MIT. A later 3D view can reuse the same hotspot data without changing the researched labels and interactions.

## Integration checklist for a future asset pass

- Record the canonical upstream URL, revision or release, creator names, exact licence identifier and retrieval date in an asset manifest.
- Confirm that the licence covers the mesh, UVs, textures, normal maps, fonts, liveries and cockpit photographs. Remove any component whose rights differ or are absent.
- Obtain a clear creator statement for community uploads. Reject anything named or tagged as extracted, ripped, converted or retextured from a commercial game unless that game's rights holder issued the licence.
- Verify the exact airframe variant visually. Label a family model as simplified when antennas, nose, canopy, wing, landing gear or cockpit differ from the DCS aircraft.
- Convert from the preferred source to glTF/GLB with a reproducible script. Keep the preferred source alongside the conversion when the licence requires source delivery.
- Make separate exterior and cockpit exports. Strip unused systems, weapons, sounds and simulator scripts. Use only visual geometry needed by the lesson.
- Produce browser LODs, compressed textures and a no-cockpit distant model, then measure load size, GPU memory and frame time on desktop and phone before replacing a procedural jet.
- Ship an in-app credits entry plus repository notices and change history. For GPL assets, also ship the licence and complete corresponding source in the release channel selected after review.
