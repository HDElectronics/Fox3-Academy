---
category: Layout
---

# LabLayout

The lab page frame: 3D viewport, side console, bottom display strip.

`viewport` is the element the Stage renders into; `console` holds the panels; `strip` holds the display
bezels. On phones it reorders to viewport, displays, console — set `mobileTabs` to turn those into real
tabs, and `mobileActions` to pin the primary controls to the bottom.

```tsx
<LabLayout viewport={<div />} console={<ConsolePanel title="Radar">...</ConsolePanel>} />
```
