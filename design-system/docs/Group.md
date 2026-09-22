---
category: Controls
---

# Group

A titled fieldset of related controls.

Renders a `<fieldset>` with a placard legend, an optional hint line under the body, and `inline` for a
horizontal arrangement. Group controls that are read together, not everything on a panel.

```tsx
<Group label="Scan volume" hint="Wider scan costs frame time.">
  <Segmented id="az" label="Azimuth" value="60" options={[{ value: '60', label: '60°' }]} />
</Group>
```
