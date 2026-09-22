---
category: Panels
---

# ScreenBezel

A display frame around black glass: the housing for a radar or RWR face.

`content` takes the element that draws — a canvas display from `src/ui/displays`, or a 3D container.
`corners` writes phosphor readouts into the glass corners, `status` sits in the label row, `footer`
holds soft keys under the glass. `aspect` fixes the glass ratio.

```tsx
<ScreenBezel label="RADAR" aspect="4 / 3" status="СНП ДВБ"
  corners={{ tl: 'BAR 1/4', tr: '80 nm' }} />
```
