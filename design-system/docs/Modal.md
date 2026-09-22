---
category: Panels
---

# Modal

A focus-trapped dialog, over the page or inside a viewport.

`within` mounts it as an overlay inside an element instead of the page — that is how a debrief appears
over the 3D view. `actions` renders kit buttons in the footer; each closes the dialog unless it sets
`closes: false`. Escape and the backdrop close it while `dismissable` holds.

```tsx
<Modal title="Splash" tone="ok" open body="R-27ER timed out 4 nm short."
  actions={[{ label: 'Debrief', primary: true }]} />
```
