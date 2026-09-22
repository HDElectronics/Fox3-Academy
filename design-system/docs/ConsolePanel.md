---
category: Panels
---

# ConsolePanel

A painted side-console panel with a title row and quarter-turn fasteners.

The kit's main container: lessons put their controls in one. `actions` sits at the right of the title
row for small controls such as Reset. `dense` tightens the padding for packed consoles; `fasteners={false}`
drops the corner screws.

```tsx
<ConsolePanel title="Radar" actions={<Button label="Reset" variant="ghost" size="s" />}>
  <Segmented id="mode" label="Mode" value="tws" options={[{ value: 'tws', label: 'TWS' }]} />
</ConsolePanel>
```
