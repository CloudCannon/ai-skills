# Migrating from an existing i18n system

Strip an existing i18n system (astro-i18n, astro-i18next, next-intl, i18next, vue-i18n, path-based routing, dictionaries + `t()`) down to a clean single-language site, then apply the Rosey stack.

**MUST:** finish this before starting [setup.md](setup.md). Running both at once leaves two translation systems half-wired.

Use this when the site already has an i18n system (astro-i18n, astro-i18next, next-intl, i18next, vue-i18n, path-based routing, dictionaries + `t()`, etc.). The goal is to get to a **clean single-language site**, then apply the main workflow. Astro has a companion supplement (`astro/overview.md`) with concrete before/after code.

## A1. Identify the current method

| Signal                | What to look for                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **package.json**      | `astro-i18n`, `astro-i18next`, `next-intl`, `i18next`, `vue-i18n`, `react-intl`, `@nuxtjs/i18n`                              |
| **Framework config**  | `astro.config.mjs` `i18n` block (routing only — no translation runtime), `next.config.js` i18n, `nuxt.config.ts` i18n module |
| **Recipe helpers**    | `src/i18n/ui.ts` dictionary, `getLangFromUrl()`, `useTranslations()`, `getRelativeLocaleUrl()`                               |
| **Folder structure**  | Per-locale content folders (`/en/`, `/fr/`), or `locales/` dirs with JSON/YAML                                               |
| **Routing**           | Locale-prefixed routes (`/fr/about`), locale-detecting middleware, `[locale]` segments                                       |
| **Translation files** | `.json`, `.yaml`, `.po` key/value pairs                                                                                      |
| **Template usage**    | `t("key")`, `$t("key")`, `useTranslation()`, `<Trans>`, `Astro.currentLocale`                                                |

Document: which locales are supported, where translation files live and their format, how routing works, which components call translation functions.

## A2. Extract existing translations

Convert existing data into Rosey's locale JSON format (`rosey/locales/{code}.json`):

```json
{
  "page:section:key": { "original": "English source text", "value": "Translated text" }
}
```

- **Flat JSON** (`{"key": "value"}`): map each key to a Rosey-namespaced key reflecting where the text appears.
- **Nested JSON**: flatten using `:` as the separator.
- **`.po` / `.yaml`**: extract msgid/msgstr or key/value pairs.
- **Duplicated content files** (`/en/about.md`, `/fr/about.md`): compare field by field; map each translatable field to a Rosey key based on page slug + field name.

For large sites, write a one-off Node script that reads the old files and emits Rosey-format locale JSON. **The key mapping is the hard part** — Rosey keys come from the `data-rosey`/`data-rosey-ns`/`data-rosey-root` attributes you'll add, so decide your naming scheme ([tagging.md](tagging.md)) before finalizing the mapping.

## A3. Remove the old infrastructure

Do this **after** extracting translations, **before** adding Rosey — and don't run two systems at once.

1. Remove i18n packages from `package.json`, reinstall.
2. Remove i18n config from the framework config file.
3. Remove locale routing (`[locale]` segments, middleware, redirects).
4. Replace `t("key")` calls with the source-language text (the text Rosey will tag).
5. Remove duplicate content folders (keep the source language only) — **but triage first**: pages whose locale copies differ only in UI strings become Rosey-only pages; pages whose _body_ genuinely differs per locale should become split-by-directory collections (Phase 8).
6. Remove old-format translation files (Rosey generates its own).
7. Clean up unused i18n imports.

**Verify the site builds and renders correctly in the source language.** This is your clean baseline.

## A4. Apply the Rosey stack

Run the main workflow (Phases 2–6). Fastest: `npx rosey-cloudcannon-connector init --yes --locales fr,de`, then tag templates and (RCC layer) add the import.

## A5. Import extracted translations

After `write-locales` generates the locale files, merge your Phase A2 translations in: for each key that matches a key Rosey generated in `base.json`, set the `value`. Keys that don't match need manual review — the naming scheme differs. (During this remap, `write-locales --keep-unused` can preserve old keys until you've copied their values across.)

## A6. Verify

Run the full Phase 6 sequence, including the **6a assertions** and the translated-page read. Two checks matter more here than in a greenfield setup:

- **Every extracted translation landed on a live key.** Any key still holding a value but absent from `base.json` means the naming scheme didn't line up — those are silently dead translations, not a cleanup task for later.
- **`git diff rosey/base.json`** against the first post-migration build: the key count should be in the same order of magnitude as the number of strings the old dictionary held. A large shortfall means a page tree or component set never got tagged.

Then (RCC layer) test in the Visual Editor, including that an edit survives a reload.

## Gotchas

- **Key mapping is the hardest part.** Old systems use arbitrary keys (`home.hero.title`); Rosey keys come from DOM attributes. Plan the naming scheme first.
- **Don't remove and add simultaneously.** Get to a clean single-language site before adding Rosey.
- **Duplicated content folders lose structure.** Map translated frontmatter fields by how they render in HTML, not their YAML shape.
- **Pluralization.** Rosey has no built-in pluralization. Each plural form needs its own `data-rosey` key, or adjust the component logic.

---
