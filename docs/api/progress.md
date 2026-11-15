# Progress overview

The **Flight log** (`#/progress`, linked from the Learn home) reads the existing browser-local results for every
jet. It sits under Learn in the top bar but not on the Learn row, which is the lesson path. The route accepts
fighter and attack aircraft; selecting the Su-25T never redirects it to a fighter gate. The selected jet appears
first. Each card links to its first incomplete goal and lists every available goal, grouped and numbered by
lesson-path step, with an explicit Complete / Incomplete state. Completed goals remain available for practice.

The totals count saved completion goals, not hours, attempts or proficiency. Reference-page visits and
saved scenario settings do not count. A partial drill run can remain incomplete until that page awards its
completion flag. There is no account, cloud synchronization, reset or storage migration in this feature.

## Saved-key contract

`src/app/lessonPath.ts` holds the lesson path (order, labels, titles) for every jet.
`src/app/learningProgress.ts` holds the single-flag keys and their legacy aliases; the hangar re-exports them.
`src/pages/progress/model.ts` maps each path step to the goals its page awards (`stepGoals`) and builds
`pathProgress(jet, get)`: the steps with their goals, the Fly hand-off and the position (`status`). A step is
complete when every goal on its page is. The Learn bar, the Learn home and this page all read it.

| Goal | Saved key |
|---|---|
| Fighter module | `<route>:<aircraft>:done` (plus existing radar-lab, missile-lab, rwr-trainer aliases) |
| Pattern / landing | `flight-ops:<aircraft>:done` |
| Runway takeoff | `flight-ops:<aircraft>:takeoff` |
| Carrier landing / launch | `flight-ops:<aircraft>:carrier` / `flight-ops:<aircraft>:launch` |
| Refuelling | `flight-ops:<aircraft>:aar` |
| Su-25T strike lesson, including its sortie | `strike:<lesson>:su25t` |

Carrier/refuelling availability comes from `FLIGHT_OPS`. The attack list comes from the Strike lesson
catalogue. Neither unsupported goals nor reference visits enter the denominator. The BVR Sortie is the Fly
hand-off after a fighter's path: a goal of its own, listed last. An attack jet's sortie is a lesson of its own
pages (Shkval & Vikhr on the Su-25T, CAS & JTAC on the A-10C II), so it counts once, inside that step.

On a page with several lessons, the Learn bar also shows which one is open ("LESSON 8/10 · HARM 3/9", wide
windows only). The page's lesson picker publishes that position (`src/ui/lessonPicker.ts`, `watchLessonPosition`); the
shell never imports page code for it, and the picker reads the same saved keys as this table.

`continuePath(p)` is where Continue goes: the first goal left on the first incomplete step, or the Fly sortie
once the path is complete. Hrefs carry `ac=` (`goal.href`) for cross-jet links; `goal.path` is the same link
without it, for links within the selected jet.

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
For the whole app (Learn bar, Learn home, lesson pages), the dev server reads `?progress=start|mid|complete`
once (`src/app/progressFixture.ts`, `AppStore.previewProgress`): reads come from the fixture, writes stay in
memory, saved progress is untouched, and production builds ignore the parameter.
