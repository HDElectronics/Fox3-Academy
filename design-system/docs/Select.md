---
category: Controls
---

# Select

A native select in cockpit dress, for lists too long to be segments.

Use it past about six options, or when the choices are data (jets, missiles, scenarios). Options may
carry a `group` to render optgroups.

```tsx
<Select id="jet" label="Jet" value="su27"
  options={[{ value: 'su27', label: 'Su-27S' }, { value: 'f15c', label: 'F-15C' }]} />
```
