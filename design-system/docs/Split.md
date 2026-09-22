---
category: Layout
---

# Split

Two panels side by side that stack when the split itself gets narrow.

Usually two screen bezels — radar and RWR. `columns` sets the grid, `stackBelow` the width at which it
folds to one column.

```tsx
<Split items={[<ScreenBezel key="r" label="RADAR" />, <ScreenBezel key="w" label="SPO-15" />]} />
```
