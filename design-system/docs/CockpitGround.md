---
category: Layout
---

# CockpitGround

The page ground the kit expects: dark background, body font, cockpit skin.

An app gets this from `body` in base.css. Use it when mounting kit components outside a full page, and
to switch skins: `cockpit="ru"` paints the Soviet turquoise chrome for Flankers and Fulcrums, `us` the
gull grey of the Western jets. It sets `data-cockpit` on the document element, as the app does.

```tsx
<CockpitGround cockpit="ru"><ConsolePanel title="Радар">...</ConsolePanel></CockpitGround>
```
