# Progress overview

Learn → **Progress** (`#/progress`) reads the existing browser-local results for every jet. The route
accepts fighter and attack aircraft; selecting the Su-25T never redirects it to a fighter gate. The selected
jet appears first. Each card links to its first incomplete goal and lists every available goal with an
explicit Complete / Incomplete state. Completed goals remain available for practice.

The totals count saved completion goals, not hours, attempts or proficiency. Reference-page visits and
saved scenario settings do not count. A partial drill run can remain incomplete until that page awards its
completion flag. There is no account, cloud synchronization, reset or storage migration in this feature.

## Saved-key contract

`src/app/learningProgress.ts` holds the existing fighter lesson path and completion-key compatibility.
The hangar re-exports these helpers, so its existing consumers and legacy keys continue to work.
`src/pages/progress/model.ts` adds applicable flight-ops and attack goals:

| Goal | Saved key |
|---|---|
| Fighter module | `<route>:<aircraft>:done` (plus existing radar-lab, missile-lab, rwr-trainer aliases) |
| Pattern / landing | `flight-ops:<aircraft>:done` |
| Runway takeoff | `flight-ops:<aircraft>:takeoff` |
| Carrier landing / launch | `flight-ops:<aircraft>:carrier` / `flight-ops:<aircraft>:launch` |
| Refuelling | `flight-ops:<aircraft>:aar` |
| Su-25T strike lesson, including its sortie | `strike:<lesson>:su25t` |

Carrier/refuelling availability comes from `FLIGHT_OPS`. The attack list comes from the Strike lesson
catalogue. Neither unsupported goals nor reference visits enter the denominator. The BVR Sortie is a goal
within each fighter's path; the attack sortie is its own Su-25T goal.

Saved RWR best scores are counts of correct answers; winning BVR Sortie best scores are out of 100.
Displaying a score does not infer a missing completion flag. Missing or invalid scores are omitted.

`jetProgress(id, get)`, `fleetProgress(get)` and `progressTotals(jets)` are pure read-only selectors.
`progressHref(path, id)` includes `ac=`; the router consumes it once before mounting the selected lesson.
The page listens for progress updates and releases the subscription on unmount. It does not write progress
or change the selected aircraft until the user follows a lesson link or changes the top-bar selection.

## Checks

Tests cover every aircraft and role, supported goals, producer-key compatibility, legacy flags, totals,
next-goal selection, saved-score units, deep-link role compatibility and storage remaining unchanged.
`?shot=empty|mixed|complete` supplies read-only screenshot data, clearly labelled in the page; it does not
write fixtures to localStorage. Combine with `?ac=su27|f15c|f14b|su25t` to check both skins and roles.
