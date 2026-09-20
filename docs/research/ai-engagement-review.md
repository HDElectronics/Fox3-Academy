# Regular AI engagement duration review

Reviewed 2026-09-21. This is evidence from the trainer, not a claim about the behavior of DCS AI.

## Method

Run `DUELS=1 SEEDS=5 DUEL_SECONDS=600 npx vitest run tests/tune/ai-duels.test.ts --disableConsoleIntercept`.
The matrix contains ten aircraft pairings, regular and ace skill, five seeds each, plus ten passive-target
controls. The focused regression suite covers the two previously reported long matchups over all five seeds.

## Findings

All 110 diagnostic engagements ended before the 600-second budget, with no NaN, immortal missiles, or
stuck states reported by the normal matrix checks. Some regular fights exceed six minutes. In the
Hornet/MiG-29S seed-1 trace, long-range shots were defended, the shooter pumped and recommitted, and later
shots moved closer. This is continued engagement rather than a frozen state machine.

The existing reshoot policy already reduces subsequent launch range after failed shots. Defensive gates
come from the project's research; reaction accuracy, reshoot delay, and pump duration are trainer choices.
No new source justifies weakening defense or changing those values solely to force a six-minute finish.

## Decision

Retain the sourced gameplay parameters. Keep multi-seed convergence regressions. The original six-minute
pacing concern remains open for a future, explicitly labeled training-difficulty or scenario-design decision.
Do not present a timeout threshold as evidence that real DCS behavior is incorrect.
