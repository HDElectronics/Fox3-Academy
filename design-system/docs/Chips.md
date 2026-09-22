---
category: Controls
---

# Chips

Multi-select caps: zero or more on at once.

For filters and sets — which emitters to show, which jets a glossary entry covers. `value` is an array;
`onChange` gets the full array. Each chip may carry a `keys` binding.

```tsx
<Chips id="bands" label="Bands" value={['e', 'i']}
  options={[{ value: 'e', label: 'E/F' }, { value: 'i', label: 'I' }, { value: 'j', label: 'J' }]} />
```
