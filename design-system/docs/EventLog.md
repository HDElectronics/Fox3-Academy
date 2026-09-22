---
category: Panels
---

# EventLog

A scrolling log of sim events in phosphor mono.

Append lines through the handle as the fight runs. `max` bounds the history (default 40), `empty` is
the resting text, `live` announces new lines to screen readers — leave it off for chatty sim logs.

```tsx
<EventLog id="log" title="Events" empty="No events yet" />
```
