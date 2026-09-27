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

## Re-run and closure (2026-09-27, issue #3)

Same command, five seeds, 600 s budget. All 110 engagements ended (one ace fight as a trade). The 50 regular fights: median 325 s, 12 over
400 s, longest 560 s (F/A-18C vs MiG-29S, seed 5). The long traces show one cycle repeated five or six times:
a shot at 80 to 85 % Rmax, a defended missile (notch, chaff or kinematic miss), a pump and a recommit, about
100 s per cycle, with each reshot closer. Aces finish sooner because they shoot closer and pump less.

No page puts two regular AI jets against each other. In Sortie the player fights the regular bandits and sets
the pace, the AI wingman is a veteran, and time acceleration (up to 8×) shortens any wait. The six-minute figure
was a test threshold, not a user-facing problem, and shortening the cycle would need an unsourced AI change.
Decision: close #3 without tuning. The convergence regressions stay.
