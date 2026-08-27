# Hugo-Specific Patterns

Framework-specific implementation details for making a Hugo site multilingual with Rosey/RCC/CloudCannon. Read alongside the main [`SKILL.md`](SKILL.md) workflow and [`tagging.md`](tagging.md).

## Coverage note — read this first

**This file is partial, and the main skill's rules have not been verified on Hugo.** The workflow was developed and tested on Astro and Eleventy sites. Two consequences:

- **Hugo has native multilingual routing** (`defaultContentLanguage`, `languages`, `.Site.Home.AllTranslations`). Phase 8 (split-by-directory), Phase 8 step 6 (locale-scoped queries) and step 7 (prefixing internal links) may be partly or wholly handled by Hugo already — check before hand-rolling any of them, and prefer Hugo's own mechanism where it exists.
- **Everything in [`tagging.md`](tagging.md) does apply**, because Rosey operates on built HTML regardless of SSG. The rules that need a Hugo-specific expression are flagged below; the rest transfer directly.

Treat gaps here as unverified rather than not-applicable, and feed anything you learn back into this file.

## Root Derivation

**MUST derive the root from the page's source identity, not `.RelPermalink`** ([§3e](tagging.md#3e-derive-the-root-from-the-templates-source-identity)). `.RelPermalink` is the computed URL, so paginated list pages (`/blog/page/2/`) and one template serving many taxonomy terms each derive a **different** root — minting a duplicate, untranslated copy of every key on those pages while the default-language site renders perfectly.

Use `.File.ContentBaseName` / `.File.Path` for single pages, and set an explicit root on list and taxonomy templates:

```html
<!-- single pages: derived from the content file -->
<main data-rosey-root="{{ .File.Path | replaceRE "\\.[^.]+$" "" | default "index" }}">

<!-- list / taxonomy templates: one shared root for every page of the listing -->
<main data-rosey-root="blog">
```

`.RelPermalink` is acceptable only on a site with no pagination and no multi-term templates:

```html
<main data-rosey-root="{{ .RelPermalink | replaceRE "^/|/$" "" | default "index" }}">
```

## Visitor-Facing Locale Picker

When implementing the locale picker (Phase 9 of the main skill) in Hugo, use `.RelPermalink` to parse the current path. The URL construction logic (parse path, detect locale prefix, strip/prepend) is the same as described in the main skill -- adapt using Hugo template functions. Honor the Phase 1 step 5 mode: with all-languages-prefixed (no `--default-language-at-root`), treat the default language code as a locale segment too and prefix its link (`/en{basePath}`), since its pages live under `/en/`, not `/`.

The picker's client-side script guards on the editor flag — **(RCC layer)** hide the nav picker inside the Visual Editor (the RCC injects its own floating switcher), otherwise run the active-state highlight. The guard is harmless off CloudCannon, since `window.inEditorMode` is only ever set there:

```html
<script>
  if (window.inEditorMode) {
    document.querySelectorAll("nav[aria-label='Language']").forEach(function (nav) {
      nav.style.display = "none";
    });
  } else {
    document.querySelectorAll("nav[aria-label='Language'] a").forEach(function (link) {
      link.classList.toggle("active", link.pathname === window.location.pathname);
    });
  }
</script>
```
