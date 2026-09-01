# Visual Editing (Astro) — entry point

Astro-specific Visual Editor guidance, built on `@cloudcannon/editable-regions`. The cross-SSG rules live one level up: [`../editable-regions.md`](../editable-regions.md) owns the region types and the attribute reference; the files here carry only what differs for Astro.

## Reading order

| Order | File                                                       | Read when                                                     |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| 1     | [visual-editing.md](visual-editing.md)                     | Always — the Phase 4 workflow, census and checklists          |
| 2     | [visual-editing-reference.md](visual-editing-reference.md) | On demand — when a checklist item needs the pattern behind it |

**MUST NOT:** read `visual-editing-reference.md` front to back. It is a pattern reference; `visual-editing.md` links into the section you need.

## Cross-SSG deep-dives

| File                                                                 | Covers                                           |
| -------------------------------------------------------------------- | ------------------------------------------------ |
| [../editable-regions.md](../editable-regions.md)                     | Region types, attribute reference, decision tree |
| [../editable-regions-internals.md](../editable-regions-internals.md) | On demand — lifecycle trace, JS API, quirks      |
