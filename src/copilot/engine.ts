/**
 * Copilot rule engine. Each rule is a condition on the Situation; the engine turns conditions into callouts
 * with the timing a human copilot would use: a condition must hold `holdS` before it is called (no chatter
 * from one noisy frame), it is called once, repeated every `repeatS` while it lasts, and after it clears it
 * must stay clear `rearmS` before it can be called again. Pure and clock-driven: tests pass the time.
 */
import type { Situation } from './situation';

/** warning: act now (red). caution: fix soon (amber). advisory: information (lit-button colour). */
export type Severity = 'warning' | 'caution' | 'advisory';

export interface RuleContext<C> { cfg: C }

export interface Rule<C = unknown> {
  id: string;
  severity: Severity;
  /** True while the condition holds. Return false when the data is missing: never alert on unknowns. */
  test(s: Situation, ctx: RuleContext<C>): boolean;
  /** Short text for the screen, e.g. "BINGO 3000 lb". */
  text(s: Situation, ctx: RuleContext<C>): string;
  /** Words to speak; default: the text. */
  say?(s: Situation, ctx: RuleContext<C>): string;
  /** Screen and log only: for cues the jet already voices (fire, FUEL LO). */
  silent?: boolean;
  holdS?: number;
  repeatS?: number;
  rearmS?: number;
}

/** say is empty for silent rules. */
export interface Callout { id: string; severity: Severity; text: string; say: string; t: number }
export interface ActiveAlert { id: string; severity: Severity; text: string; sinceS: number }

interface RuleState { since: number | null; called: number | null; lastSpoken: number | null; clearedAt: number | null }

const SEVERITY_ORDER: Record<Severity, number> = { warning: 0, caution: 1, advisory: 2 };
const DEFAULT_HOLD_S = 1;
const DEFAULT_REARM_S = 3;

export class CopilotEngine<C> {
  private state = new Map<string, RuleState>();

  constructor(private rules: readonly Rule<C>[], public cfg: C) {}

  /** Evaluate every rule at time `t` (seconds). Returns what is active and what to call now, most urgent first. */
  step(s: Situation, t: number): { active: ActiveAlert[]; calls: Callout[] } {
    const ctx: RuleContext<C> = { cfg: this.cfg };
    const active: ActiveAlert[] = [];
    const calls: Callout[] = [];
    for (const r of this.rules) {
      let st = this.state.get(r.id);
      if (!st) this.state.set(r.id, (st = { since: null, called: null, lastSpoken: null, clearedAt: null }));
      let on = false;
      try { on = r.test(s, ctx); } catch { on = false; }
      if (!on) {
        if (st.called !== null) st.clearedAt = t;
        st.since = null;
        st.called = null;
        continue;
      }
      st.since ??= t;
      if (t - st.since < (r.holdS ?? DEFAULT_HOLD_S)) continue;
      const text = r.text(s, ctx);
      active.push({ id: r.id, severity: r.severity, text, sinceS: st.since });
      const rearmed = st.clearedAt === null || t - st.clearedAt >= (r.rearmS ?? DEFAULT_REARM_S);
      const first = st.called === null;
      const repeat = !first && r.repeatS !== undefined && st.lastSpoken !== null && t - st.lastSpoken >= r.repeatS;
      if (first) st.called = t;
      if ((first && rearmed) || repeat) {
        st.lastSpoken = t;
        calls.push({ id: r.id, severity: r.severity, text, say: r.silent ? '' : r.say?.(s, ctx) ?? text, t });
      }
    }
    const order = (a: { severity: Severity }, b: { severity: Severity }) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return { active: active.sort(order), calls: calls.sort(order) };
  }

  /** Forget timing state (new mission, profile change). */
  reset(): void { this.state.clear(); }
}
