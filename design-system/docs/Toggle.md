---
category: Controls
---

# Toggle

A latching two-state cap: on or off, not a momentary press.

Reads as a switch to assistive tech. `value` is the current state and `onChange` fires on user input
only — calling `set(value)` on the handle stays silent unless you pass `emit`.

```tsx
<Toggle id="ae" label="Auto elevation" value={true} />
```
