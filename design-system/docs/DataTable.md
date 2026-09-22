---
category: Panels
---

# DataTable

A reference table in cockpit dress.

`columns` declares the cells; `num` right-aligns tabular figures and `mono` marks keys and ids. `cell`
renders anything richer. `highlight` marks rows that match the selected jet.

```tsx
<DataTable columns={[{ key: 'jet', label: 'Jet' }, { key: 'range', label: 'Rmax', num: true }]}
  rows={[{ jet: 'Su-27S', range: '43 nm' }]} />
```
