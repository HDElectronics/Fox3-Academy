---
category: Controls
---

# Button

A cockpit push-button, drawn as a stencilled cap.

Use `variant="primary"` for the one action the lesson wants next, `cap` (the default) for ordinary
controls, and `ghost` for low-weight actions like Reset. `keys` prints the DCS binding on the cap and
exposes it as `aria-keyshortcuts` — use the real binding, never an invented one. `lamp` adds a lamp
strip that `setLit()` drives, for cues such as SHOOT.

```tsx
<Button label="Designate" keys="RAlt+Space" variant="primary" />
```
