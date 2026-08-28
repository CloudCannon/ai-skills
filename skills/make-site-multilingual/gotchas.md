# Gotchas

Preventative one-line rules for Rosey/RCC sites. Symptom-driven diagnosis lives in [troubleshooting.md](troubleshooting.md); authoring rules live in [tagging.md](tagging.md).

> **Symptom-driven entries live in [`troubleshooting.md`](troubleshooting.md)** — go there when something builds cleanly but translates wrongly. The rules below are preventative.

## Universal (framework-agnostic)

- **Rosey operates on built HTML.** It doesn't see source files, markdown, or frontmatter directly — only the rendered output.
- **Almost every multilingual bug renders correctly in the default language.** Rosey doesn't inject at `/`, so verification there proves almost nothing. Always read a `/{locale}/` page (Phase 6 step 7).
- **`--default-language-at-root` is a decision, not a default — ask.** Present (default at root): existing URLs stay, no collection-URL changes. Omitted (all languages prefixed): the default language moves to `/{defaultLang}/*`, `/` serves a generated redirect page, and every visitor-facing collection `url` needs the `/{defaultLang}/` prefix (Phase 5e). The choice must be identical in `.cloudcannon/postbuild`, Phase 6's manual test, and Appendix B — a mismatch silently builds the wrong URL layout.
- **`rosey build` relocates the default language; your routes must not.** Adding the `{defaultLang}` prefix to your own routes or permalinks in all-languages-prefixed mode gives `/en/en/*` (Phase 1 step 5).
- **All-languages-prefixed: the root `index.html` is a redirect, not a page.** Don't tag it with `data-rosey` or treat it as a content page — Rosey generates it, and it's overwritten each build.
- **All-languages-prefixed: collection URLs must move too.** CloudCannon reads a collection's `url` to open the Visual Editor; if the pages moved to `/{defaultLang}/` but the `url` still says `/[slug]/`, editing opens the redirect page and breaks.
- **`data-rosey` must go on the innermost text element.** Otherwise the captured original includes wrapper tags. **Except inside a CloudCannon rich text region** (`data-editable="source"`, or `text` with `data-type="text"`/`"block"`), where it goes on the region element — a key on a block inside the region can't survive the editor's round-trip and shows up as an uneditable element ([§3c](tagging.md#3c-add-data-rosey-to-translatable-elements)).
- **Don't translate names.** Author names, person names, designations are identity values — no `data-rosey`.
- **Key collisions.** Two pages with the same `data-rosey-root` and same element keys collide. Use unique roots derived from the template's source identity ([§3e](tagging.md#3e-derive-the-root-from-the-templates-source-identity)).
- **`ns` appends, `root` replaces.** `data-rosey-root=""` resets the namespace entirely — that's what makes a value global, and what legitimately produces keys with no `:` in them ([§3b](tagging.md#3b-add-data-rosey-ns-for-component-namespacing)).
- **Nav/footer use `data-rosey-ns`, not `data-rosey-root`** — they sit outside `<main>`. Rosey dedups identical keys across pages automatically. Shared chrome _inside_ `<main>` is the opposite case and needs a root ([§3d](tagging.md#shared-chrome-inside-main-needs-its-own-root)).
- **Nav/footer links use content-as-key** — see [§3g](tagging.md#choosing-a-namespace-strategy) for the strategy and its rename trade-off. For multi-level navs, add a `data-rosey-ns` of the slugified parent text to avoid collisions.
- **Duplicate desktop/mobile nav share one key.** Both instances can use the same `data-rosey` key; Rosey records multiple occurrences and gives both the same translation — the desired behavior.
- **Put rosey attributes inside each looped item's component ([§3g](tagging.md#3g-namespacing-arrays-and-page-builder-blocks)).** On the loop wrapper, they go stale/duplicated when CloudCannon clones an item on add/reorder, breaking new-item translation and stale detection. Structural wrappers get no namespace at all.
- **Stale translation detection.** When `original` ≠ `_base_original`, the RCC shows an amber dashed border and warning badge. Editors update the translation or click "Mark as reviewed".
- **`write-locales` preserves existing translations but removes stale keys.** It adds new keys, removes keys no longer in `base.json`, and never overwrites existing `value` fields on surviving keys.
- **Snapshot boundary** _(RCC layer)_. The RCC clones `[data-rcc]` (or `<main>`) on locale switch; content outside it isn't switched. Most sites want `data-rcc` around nav + main + footer. Never `<body>`.
- **Split-by-directory pages need `data-rcc-exclude` listing every locale** _(RCC layer)_. Otherwise the Visual Editor offers a locale switch that can't change anything — the body has no keys — and editors read that as broken translation. Apply it in the shared post layout so the default-language page is covered too (Phase 8).
- **Rosey's default exclusions block JSON files.** Use `--exclusions "\.(html?)$"` so `_rcc/locales.json` and `_cloudcannon/info.json` flow through to the output.
- **Rosey merges with pre-existing locale pages.** At an already-built locale URL, `rosey build` respects existing content and only translates `data-rosey` elements — the basis of split-by-directory.
- **Rosey rewrites internal links on generated pages, not pre-existing ones.** Copied pages get `<a href>` values prefixed with the locale; split-by-directory pages (already at the locale URL) keep their links as-is, so those templates must prefix their own (Phase 8 step 7).
- **Suppress `data-rosey` on frontmatter-driven fields in shared split-by-directory templates**, or Rosey overwrites the natively-translated content.
- **Split-by-directory slugs come from the filename, never the translated title** — one URL path per post across every locale (Phase 8 step 3).
- **Scope every content query to one locale once per-locale directories exist** — ambient queries build fine and quietly mix languages (Phase 8 step 6).

## Editable regions / component inline editing

> Applies only to sites using editable regions (`data-prop`, `data-editable`). The RCC works without them — skip if your original text has no inline editing. Editable regions themselves are owned by the [`cloudcannon-visual-editing`](../cloudcannon-visual-editing/SKILL.md) skill; the notes below cover only where `data-rosey` and regions interact.

- **Shared components need explicit `data-rosey` passthrough** to the inner text element — a rest-spread would land it on the outer tag.
- **Destructure `data-rosey`** alongside `data-prop` to prevent it leaking onto the outer wrapper.
- **Sanitise `.` to `_` in keys derived from `data-prop`** — a dotted key renders correctly and silently drops every Visual Editor save ([§3f](tagging.md#sanitise-dots-out-of-derived-keys-rcc-layer)).
- **Per-instance opt-out** — `data-rosey={false}` (JSX) or a template conditional for values that shouldn't be translated.
- **Non-editable components need explicit `data-rosey`** — with no `data-prop`, auto-derive produces nothing.
- **Rich-text body content: target the inner text element** (e.g. `<editable-text data-prop="@content">`), not a parent wrapper.
- **Markdown regions need a matching `data-type` and a rich bound input**, or they are permanently stale and their formatting is uneditable ([§3c](tagging.md#markdown-regions-need-a-matching-data-type-and-a-rich-bound-input-rcc-layer)).

## SSG-specific gotchas

Framework-specific gotchas live in `astro/overview.md`, `eleventy/overview.md`, `hugo/overview.md`. Read the one matching your project.
