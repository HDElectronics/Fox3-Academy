---
category: Panels
---

# Toast

A short transient message, bottom centre.

`within` keeps the stack inside an element rather than the page. `ms={0}` leaves it up until dismissed.
Use it for things the pilot should notice but not act on; anything requiring a decision belongs in the
coach box.

```tsx
<Toast text="Datalink lost" tone="caution" ms={0} />
```
