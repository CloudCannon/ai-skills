# Visual Editing (Astro) — entry point

Astro-specific Visual Editor guidance, built on `@cloudcannon/editable-regions`. The cross-SSG rules live one level up: [`../editable-regions.md`](../editable-regions.md) owns the region types and the attribute reference, and [`../visual-editing-reference.md`](../visual-editing-reference.md) owns the patterns that use them. The files here carry only what differs for Astro.

## Reading order

| Order | File                                                             | Read when                                                   |
| ----- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| 1     | [visual-editing.md](visual-editing.md)                           | Always — the Phase 4 workflow, census and checklists        |
| 2     | [../visual-editing-reference.md](../visual-editing-reference.md) | On demand — the generic pattern behind a checklist item     |
| 3     | [visual-editing-reference.md](visual-editing-reference.md)       | On demand — what Astro does differently from that pattern   |
| 4     | [troubleshooting.md](troubleshooting.md)                         | An Astro-specific symptom, after checking the generic table |

**MUST NOT:** read `visual-editing-reference.md` front to back. It is a pattern reference; `visual-editing.md` links into the section you need.

## Cross-SSG deep-dives

| File                                                                 | Covers                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| [../editable-regions.md](../editable-regions.md)                     | Region types, attribute reference, custom elements            |
| [../visual-editing-reference.md](../visual-editing-reference.md)     | The generic pattern reference — paths, arrays, components     |
| [../editable-regions-internals.md](../editable-regions-internals.md) | The Visual Editor JavaScript API; lifecycle traces and quirks |
| [../troubleshooting.md](../troubleshooting.md)                       | Generic symptom → fix                                         |
