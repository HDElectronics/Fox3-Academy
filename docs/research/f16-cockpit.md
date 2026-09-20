# F-16C cockpit catalogue: sources and coverage

The F-16C cockpit explorer is an informational reference for DCS World players. Its catalogue contains **49 panels and 399 items**, including physical controls, read-only indicators and displays, a panel overview and a fixture. It does not claim to map every physical cockpit component.

## Source and method

The primary source is Eagle Dynamics' [DCS F-16C Viper Early Access Guide, English, updated 16 August 2026](https://www.digitalcombatsimulator.com/upload/iblock/e78/33zl8132hi71d3tv0194vvkzpzl3mrr6/DCS%20F-16C%20Early%20Access%20Guide%20EN.pdf), a 774-page PDF. The source is registered as `edViperGuide` in `src/data/sources.ts`.

Descriptions are original paraphrases of pilot-facing gameplay functions. Each catalogue item records its purpose, operation, effect and source page; verified positions and relevant limitations are included where available. Source links use one-based PDF page numbers through `#page=N`. The principal cockpit inventory is on pages 44–89, supplemented by the HUD, ICP, MFD, EHSI, autopilot, radio and defensive-system sections. Pedal descriptions also use the flight-control, taxi and landing sections.

The interface uses original 2D schematics. Grouping helps locate controls by region; spacing, shapes and scale are teaching aids rather than a traced cockpit image or an exact geometric model.

## Catalogue coverage

The catalogue is assembled in `src/data/cockpit/index.ts` from the front, left, right and pedal datasets. The interface groups items into:

| Region | Items |
|---|---:|
| Front panel, including auxiliary instruments | 212 |
| Left console | 117 |
| Right console | 44 |
| Stick / throttle | 20 |
| Seat & pedals | 6 |

Item categories distinguish buttons, switches, rotary controls, levers, axes, indicators, displays, panel overviews and fixtures. Counts include separately mapped MFD option buttons and annunciators; they are not counts of independently simulated systems.

The current data contains 341 documented items, 51 items marked unavailable or not implemented in the cited guide, and seven items requiring further verification. **Manual implementation statements are source claims, not observations of a current DCS installation.** A partially unavailable control can remain documented when its specific inactive position is identified in the description.

## Open verification points

| Item | What remains unverified |
|---|---|
| ENG FIRE warning pushbutton | Its warning meaning is documented; a distinct press action is not. |
| MISSILE LAUNCH pushbutton | Its indication is documented; a distinct clickable action is not. |
| ICP IFF button | The button is documented, but the guide marks its DED page unavailable; current-build page behavior needs checking. |
| MANUAL CANOPY CONTROL handcrank | The overview identifies it without establishing its DCS interaction. |
| ANTI-G TEST | The physical label alone does not establish working behavior or a binding. |
| Throttle cutoff release | Its DCS interaction needs verification beyond the overview identification. |
| Utility Light | The overview labels the fixture without a detailed operating description. |

The only displayed verified key chord is the guide's `LCtrl+E` ejection command on page 81. That citation does not specify the repeated-input sequence and must not be read as a one-press ejection instruction. The current DCS Controls command still needs checking. Other keyboard defaults and hardware-axis names are not inferred from cockpit labels.

## Deliberate limits

- The KY-58 is a manual-unavailable panel overview; its individual selectors are not mapped.
- HOTAS entries summarize contextual behavior. They do not enumerate every sensor, weapon or master-mode interaction.
- DED and MFD software page trees, every display symbol and every warning-lamp state are outside the item inventory. Repeated ECM status lamps are grouped by shared legend meaning.
- Passive overview fixtures such as the DTU receptacle and arm rest, and unverified pedal-adjustment hardware, are not asserted as mapped controls.
- Selecting an item opens an explanation. It does not actuate aircraft systems, simulate a startup or implement a flight model.

Progress records items **explored**, meaning their explanations have been opened. It does not measure procedural proficiency, correct operation or mastery.
