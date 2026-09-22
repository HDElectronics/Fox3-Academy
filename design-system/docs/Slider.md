---
category: Controls
---

# Slider

A slider with a digital readout, tick marks and optional coloured zones.

Built for continuous cockpit values: range scale, altitude block, target aspect. `marks` places labelled
ticks under the track (Rmin, Rne, Rmax); `zones` paints bands behind it. Both take live values — the
handle's `setMarks` and `setZones` replace them without disturbing focus.

```tsx
<Slider id="range" label="Range scale" min={10} max={160} step={10} value={80} unit="nm" />
```
