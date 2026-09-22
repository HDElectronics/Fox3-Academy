---
category: Controls
---

# Segmented

A row of caps where exactly one is selected: the kit's mode selector.

The workhorse for radar modes, scan widths and bars. `sub` puts a second small line under a segment
(frame time under a scan width, seeker type under a launch mode). `fill` stretches the segments across
the row. Give every instance a stable `id`; the placard `label` is also its accessible name.

```tsx
<Segmented id="mode" label="Radar mode" value="tws"
  options={[{ value: 'search', label: 'ОБЗ ДВБ', sub: 'Search' },
            { value: 'tws', label: 'СНП ДВБ', sub: 'Track while scan' }]} />
```
