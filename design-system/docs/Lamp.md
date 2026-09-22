---
category: Panels
---

# Lamp

A single annunciator lamp: off, lit, or flashing.

Tones follow the cockpit: caution amber, warning red, ok green, hi for designation, advisory for the
lit-cap green. Use `state="flash"` only for something that genuinely flashes in DCS.

```tsx
<Lamp label="SHOOT" tone="ok" state="flash" />
```
