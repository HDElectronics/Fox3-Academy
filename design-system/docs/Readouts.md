---
category: Panels
---

# Readouts

Label and value pairs: the kit's instrument readout.

`variant="panel"` is ink on the painted panel; `glass` is phosphor digits on a black window, for values
that belong to a display. `columns={2}` pairs them up on wide containers. Values are mono and tabular,
so write altitudes without thousands separators.

```tsx
<Readouts id="bandit" rows={[{ id: 'r', label: 'Range', value: '32', unit: 'nm' },
                              { id: 'a', label: 'Altitude', value: '28000', unit: 'ft' }]} />
```
