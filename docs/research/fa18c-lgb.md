# F/A-18C ATFLIR laser and GBU-12 lessons

Source: Eagle Dynamics, **DCS F/A-18C Early Access Guide**, PDF dated 24 March 2024,
424 pages. [Official manual download](https://www.digitalcombatsimulator.com/en/downloads/documentation/dcs-hornet_early_access_guide_en/).
The locally available official English PDF was read as text. This is a manual review, not a
current-game verification. Scope is the DCS player's controls, display cues and lesson outcomes.

## Verified manual procedures

| Pages | Procedure or display fact |
| --- | --- |
| 75 | Weapon Release is RAlt + Space; Trigger is Space. These are separate controls. |
| 224 | The laser-arm field is displayed with LTD/R ARM. REL is time to release; after release LASER counts down to automatic lasing, then TTI counts down to impact. |
| 225 | Boxing TRIG enables trigger-controlled lasing. A trigger press fires for two seconds; a held trigger fires continuously. |
| 226 | FLIR PB14 UFC opens LTDC and LSTC. Select LTDC, enter the code and press ENT; the FLIR format reflects the new value. LSTC is the spot-tracker code, not the bomb code. |
| 227 | LTD/R must be ARM. The manual describes automatic laser firing for LGB delivery and TRIG for manual trigger control. A pod-acquired target designation can be used for LGB attacks. |
| 310–312 | AUTO uses a ground designation and provides steering to the computed release point. Keep the velocity vector on the azimuth steering line and hold Weapon Release when the release cue appears; release the button after all bombs in the pass leave. |
| 321 | GBU-12 is a Paveway II bomb shown as 82LG. The AUTO checklist selects A/G, the LGB, AUTO, MFUZ OFF and EFUZ INST, creates TGT, and matches bomb code to designation code. |
| 322 | SMS PB1 CODE opens UFC CODE entry. Colonize CODE, enter four digits and press ENT. The initial bomb code is XXXX. A selected Paveway II applies code changes to its priority station; without selecting one, the same code applies to all. Paveway II AUTO HUD symbology follows conventional bomb delivery. |

The guide's p310 prose describes HUD designation in two ways; the lesson uses an existing ATFLIR
designation, avoiding that ambiguity. Use named controls when omitting the physical DDI/UFC layout.
The laser code must be set separately on the bomb and on LTDC; changing one does not imply changing
the other. A code mismatch is a training setup fault, not a reason to invent an SMS release inhibit.

## Teaching abstractions and unverified details

The page begins with A/G, one selected 82LG, AUTO, MFUZ OFF and EFUZ INST prepared. The aircraft's
flight path is aligned for the exercise. There is no flight model, bomb ballistics model or calculated
release solution. The fixed approach (8 seconds), flight (12 seconds), and automatic laser window
(last 6 seconds) are arbitrary lesson pacing. They must never be described as DCS timing values.
The two-second manual trigger pulse is a sourced control behavior, not an arbitrary duration.

Use 1688 and 1687 as exercise code presets. These notes do not establish a full valid-code domain,
model every station or assert that these presets are defaults. The bomb begins unset (XXXX) where
code entry is taught. Scenario preconfiguration must be visible to the learner.

Hit/miss results are intentionally simple checks of the designated training target, matching codes
and uninterrupted lasing for the final 3 seconds. This arbitrary completion rule is not a claim
that DCS requires that duration or that a brief interruption guarantees a miss in DCS.
No capture envelope, optical propagation, guidance law, fuze internals or other engineering model
is implied. Track loss and laser interruption are explicit training events. The exact current-DCS
laser scheduling, automatic/manual handoff, masking and recovery behavior remain unverified.
Do not infer that a failed AUTO track always erases an existing aircraft designation.

The data and page-visible caveats live in `src/data/fa18cLgb.ts`. Add these uncertain values to
`docs/api/data.md` and retain an open current-game verification item. Existing ATFLIR image, FOV,
slew and acquisition caveats in `src/data/atflir.ts` also apply.
