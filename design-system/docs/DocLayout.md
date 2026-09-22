---
category: Layout
---

# DocLayout

A reference page: title, contents panel, and sections.

Give it `sections` and it renders each as a `<section id>` with an h2 and builds the contents list, or
pass your own `content` plus a `toc`. `tocHeader` takes a filter box above the contents.

```tsx
<DocLayout title="Reference" sections={[{ id: 'fleet', title: 'Fleet', content: 'Ten jets...' }]} />
```
