---
category: Panels
---

# Checklist

A numbered procedure with steps that tick off as they are done.

`steps` carries the text, an optional DCS binding per step, and a `note`. `done` lists the ids or
indexes already completed. Use it for cockpit procedures taken from `src/data/procedures.ts`.

```tsx
<Checklist id="lock" done={['scan']}
  steps={[{ id: 'scan', text: 'Set 60° scan, 4 bars' }, { id: 'lock', text: 'Designate the lead', keys: 'RAlt+Space' }]} />
```
