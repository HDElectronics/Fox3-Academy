---
category: Controls
---

# Tabs

Tabs with panels, wired for keyboard use.

`tabs` defines the ids, labels and optional content; the handle exposes `panels` by id so you can fill
them at any time. Prefer tabs for sibling views of one subject, not for navigation between lessons.

```tsx
<Tabs id="ref" value="parts" tabs={[{ id: 'parts', label: 'Parts' }, { id: 'cues', label: 'Cues' }]} />
```
