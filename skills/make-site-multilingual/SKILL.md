---
name: make-site-multilingual
description: >-
  Get a site ready for Rosey translation, with the CloudCannon connector (RCC)
  as an optional visual-editing layer. Use when the user wants to add
  multilingual support, internationalize a site, set up Rosey, replace an
  existing i18n system (astro-i18n, next-intl, path-based routing, etc.), or
  upgrade from RCC v1 to v2.
---

# Get a Site Ready for Rosey (+ the RCC)

Step-by-step workflow for making a single-language site translatable with **Rosey**, and — optionally — wiring up the **Rosey CloudCannon Connector (RCC)** so editors can translate inline in CloudCannon's Visual Editor.

## When to use

- A single-language site needs to become translatable (the main workflow, Phase 1 onward)
- The site already has an i18n system (astro-i18n, next-intl, dictionaries + `t()`) that should be replaced with Rosey (Appendix A)
- The site runs RCC v1 and should move to v2 (Appendix B)
- A Rosey-ready site needs the CloudCannon inline-translation layer added (Phase 5)

## When not to use

- **Filling in translations** on a site that is already Rosey-ready — that's [`translate-multilingual`](../translate-multilingual/SKILL.md)
- **General CloudCannon configuration** unrelated to locales — that's [`cloudcannon-configuration`](../cloudcannon-configuration/SKILL.md)
- **Setting up editable regions themselves** — that's [`cloudcannon-visual-editing`](../cloudcannon-visual-editing/SKILL.md). This skill covers only where `data-rosey` and regions interact.

## Contents

| File                                     | Covers                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| **SKILL.md** (this file)                 | The phase-by-phase workflow, the two migration appendices, and framework-agnostic gotchas |
| [tagging.md](tagging.md)                 | **Phase 3 in full** — every `data-rosey` / `-ns` / `-root` authoring rule                 |
| [troubleshooting.md](troubleshooting.md) | Symptom → cause → fix for things that build cleanly and translate wrongly                 |
| [astro.md](astro.md)                     | Astro implementations, plus the Astro i18n migration supplement                           |
| [eleventy.md](eleventy.md)               | Eleventy implementations, incl. taxonomy scoping and link localization                    |
| [hugo.md](hugo.md)                       | Hugo implementations (partial — see the coverage note in that file)                       |

## The two layers

Keep these separate in your head. They are installed together but do different jobs, and only the first is required.

1. **Rosey-ready (required).** Rosey is an open-source, framework-agnostic tool that operates on your **built HTML**. You tag translatable elements with `data-rosey`, and a postbuild pipeline generates a key/value file per locale (`rosey/locales/{code}.json`) and builds translated copies of the site at `/{locale}/` URLs. This works on any SSG with no CMS. Once a site is Rosey-ready, translations can be filled in by **AI** (see the [`translate-multilingual`](../translate-multilingual/SKILL.md) skill), by hand, or by any external service.

2. **The RCC visual-editing layer (optional).** The RCC is a client-side script that bridges those locale files to CloudCannon's Visual Editor, giving editors a floating locale switcher and inline ProseMirror editors on every `data-rosey` element, with stale-translation detection. It **requires CloudCannon** as the CMS. If the site isn't on CloudCannon, skip every RCC/CloudCannon step and translate the locale files another way.

The bulk of this skill (tagging, the pipeline, locale files) is the required Rosey layer. Steps that belong only to the optional RCC layer are marked **(RCC layer)**.

## Which starting point are you in?

| Situation                                                                                          | Where to go                                                                                               |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Single-language site, no translation system yet                                                    | Start at **Phase 1** below (the main workflow)                                                            |
| Site already uses an i18n system (astro-i18n, next-intl, path-based routing, dictionaries + `t()`) | Do **Appendix A: Migrating from an existing i18n system** first, then return to the main workflow         |
| Site already uses **RCC v1** (form-based YAML editing, `generateRoseyId`, `data-rosey-tagger`)     | Follow **Appendix B: Upgrading from RCC v1 to v2** instead — it is a distinct, mostly self-contained path |

## SSG detection and framework-specific guidance

After auditing the site (Phase 1), identify the SSG and read the matching file in this directory for framework-specific implementation details:

| SSG             | File to read                          |
| --------------- | ------------------------------------- |
| Astro           | `astro.md` in this skill directory    |
| Eleventy (11ty) | `eleventy.md` in this skill directory |
| Hugo            | `hugo.md` in this skill directory     |

These files contain root derivation patterns, content-block namespacing examples, the array-item component rule, split-by-directory details, locale picker examples, and framework-specific gotchas. The phases below reference them where needed.

---

## Phase 1: Audit the site

Before touching code, understand what needs to be translated.

1. **Find all translatable text.** Search templates, components, and layouts for user-visible text:
   - Headings, paragraphs, button labels, link text, alt text
   - Text in markdown frontmatter that renders into HTML (titles, descriptions)
   - Text in global data files (navigation labels, footer text, company info)
   - Hardcoded strings in template files

2. **Identify the build output directory.** Common values: `dist/`, `_site/`, `build/`, `out/`. Check the framework config (e.g., `astro.config.mjs`, `eleventy.js`).

3. **Map out the page/content structure.** Understand how pages are generated — dynamic routes, content collections, data-driven pages, page-builder arrays. This determines how you set `data-rosey-root` and `data-rosey-ns` values.

4. **Confirm the target locales** with the user (e.g., `fr,de,es`) and the default/source language (usually `en`).

5. **Decide the URL structure — ask the user, don't assume.** Rosey can serve the default language either at the site root or under its own locale prefix. This is the `--default-language-at-root` flag on `rosey build`, and the choice changes URLs, redirects, the locale picker, and CloudCannon collection paths — so settle it before wiring anything up.

   | Mode                       | `rosey build` flag                       | Default-language URLs             | Root `/`                                                                    | Other locales |
   | -------------------------- | ---------------------------------------- | --------------------------------- | --------------------------------------------------------------------------- | ------------- |
   | **Default at root**        | `--default-language-at-root` **present** | `/about/`, `/blog/my-post/`       | The default-language home page                                              | `/fr/about/`  |
   | **All languages prefixed** | flag **omitted**                         | `/en/about/`, `/en/blog/my-post/` | A generated **redirect page** that sends visitors to their preferred locale | `/fr/about/`  |
   - **Default at root** keeps existing URLs stable — good for an established site (no SEO churn, no broken inbound links) — and needs no change to CloudCannon collection `url`s. This is the historical default of this skill.
   - **All languages prefixed** treats every language equally: the default language lives under `/{defaultLang}/*` just like the others, and `/` becomes a locale-detecting redirect served at `index.html`. Cleaner symmetry, but **every existing default-language URL moves under the prefix** — so set up redirects for inbound links, and **every visitor-facing collection `url` in `cloudcannon.config.yml` must gain the `/{defaultLang}/` prefix** (e.g. `/[slug]/` → `/en/[slug]/`; see Phase 5e).

   **MUST NOT add the default-language prefix in your own routes or permalinks.** In all-languages-prefixed mode the SSG still builds the default language at the **root**; `rosey build` is what relocates it to `/{defaultLang}/` and leaves a redirect behind. Prefix it yourself and you get `/en/en/about/`. The only SSG routes that legitimately carry a locale prefix are per-locale split-by-directory collections (Phase 8).

   Record the choice. It feeds the postbuild command (Phase 4), the CloudCannon collection URLs (Phase 5e), verification (Phase 6), and the locale picker (Phase 9). The rest of this skill uses **`{defaultLang}`** to mean the actual default-language code (e.g. `en`) wherever the prefix appears.

6. **Detect Bookshop (most sites don't use it).** Look for `bookshop.config.cjs`, a `_bookshop/` or `component-library/bookshop/` directory, `{% bookshop %}` tags, or `_bookshop_name` in content files. If none are found, **skip all Bookshop-specific notes** throughout this skill. Bookshop is a legacy component framework — most CloudCannon sites use editable regions instead.

## Phase 2: Install dependencies

**Fastest path (recommended for agents):** run the setup wizard non-interactively. It handles installation, the postbuild pipeline, and CloudCannon config in one command with no prompts:

```bash
npx rosey-cloudcannon-connector init --yes --locales fr,de
```

Override any default as needed:

```bash
npx rosey-cloudcannon-connector init --yes \
  --locales fr,de,es \
  --default-language en \
  --build-dir dist \
  --rosey-dir rosey \
  --content-at-root \
  --collection
```

The manual steps below (Phases 3–4) are still needed for tagging templates. If you ran `init`, the postbuild pipeline (Phase 4) and CloudCannon config (Phase 5) are already done — skip to Phase 3 for tagging, then Phase 6 to verify.

> **Re-read the config `init` rewrote.** Its `source`-removal pass doesn't reach every `source`-relative path — confirm each one moved before relying on it. See the [`source` gotcha](troubleshooting.md#cloudcannon-cant-reach-roseylocales).

> **Reconcile the URL-structure choice (Phase 1 step 5).** `init` writes a postbuild that serves the default language at root (`--default-language-at-root`). If the user chose **all languages prefixed**, remove that flag from `.cloudcannon/postbuild` and add the `/{defaultLang}/` prefix to collection URLs (Phase 5e) before the first build.

**Interactive mode** (if a human is running it):

```bash
npx rosey-cloudcannon-connector init
```

**Manual install** (skip the wizard entirely):

```bash
npm install rosey
npm install rosey-cloudcannon-connector
```

> `rosey` alone is enough for the required Rosey layer. `rosey-cloudcannon-connector` provides the `write-locales`/`init` CLIs used by the pipeline _and_ the optional client-side RCC. Install both even if you're only building the Rosey layer — the CLIs are used regardless.

## Phase 3: Tag templates with `data-rosey`

**[`tagging.md`](tagging.md) owns this phase in full.** Read it before tagging anything; the rules below are the ones most often got wrong, not a summary.

- **`data-rosey-ns` appends to the current namespace; `data-rosey-root` replaces it** (§3b). Every key-grouping decision in the phase follows from this one distinction.
- **`data-rosey` goes on the innermost text element** (§3c). A wrapper holding icons or nested components captures that markup into the source and injects it twice — on translated pages only.
- **For looped items the namespace goes inside the item's own component** (§3g), never on the parent's loop wrapper, and never on a purely structural wrapper.
- **Derive `data-rosey-root` from the template's source identity, not the computed URL** (§3e). One template can serve many URLs; a URL-derived root silently duplicates every key on page 2 of a paginated listing.

| §                                                                         | Covers                                                         |
| ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [3a](tagging.md#3a-set-up-data-rosey-root-on-page-containers)             | Page-level namespace                                           |
| [3b](tagging.md#3b-add-data-rosey-ns-for-component-namespacing)           | `ns` vs `root` semantics                                       |
| [3c](tagging.md#3c-add-data-rosey-to-translatable-elements)               | Tagging text elements; rich text regions; markdown `data-type` |
| [3d](tagging.md#3d-handle-shared-and-global-content)                      | Nav, footer, and shared chrome inside `<main>`                 |
| [3e](tagging.md#3e-derive-the-root-from-the-templates-source-identity)    | Where the root value comes from                                |
| [3f](tagging.md#3f-component-integration-auto-derive-data-rosey-optional) | Auto-deriving keys from `data-prop`                            |
| [3g](tagging.md#3g-namespacing-arrays-and-page-builder-blocks)            | Arrays, page-builder blocks, UUID seeding, content-as-key      |
| [3h](tagging.md#3h-head-text-and-attribute-only-text)                     | `<head>` and attribute-only text                               |
| [3i](tagging.md#3i-taxonomy-labels-tags-categories)                       | Tag and category labels                                        |

**Read the SSG-specific file** alongside it — root derivation, block namespacing, and head tagging all have framework-specific expressions.

## Phase 4: Make the site Rosey-ready (the pipeline)

This is the required core: a postbuild pipeline that generates locale files and builds translated copies of the site. If you ran `init`, this is already in `.cloudcannon/postbuild` — verify it and move on.

Create/update `.cloudcannon/postbuild` (adjust `--source dist` to your build output dir). On first run, add `--locales fr,de` to create the initial locale files; subsequent runs auto-detect:

```bash
#!/usr/bin/env bash

npx rosey generate --source dist
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist
mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language en --default-language-at-root --exclusions "\.(html?)$"
```

**The `--default-language-at-root` flag encodes the Phase 1 step 5 choice:**

- **Default at root** (flag **present**, as above) — default-language pages stay at `/about/`; other locales build at `/{locale}/about/`.
- **All languages prefixed** (flag **omitted**) — the last line becomes:
  ```bash
  npx rosey build --source _untranslated_site --dest dist --default-language en --exclusions "\.(html?)$"
  ```
  Now `rosey build` **relocates** the default language to `/en/about/`, alongside `/fr/about/`, and generates a locale-detecting **redirect page at the root `index.html`**. Your SSG still builds it at the root — don't prefix your own routes (Phase 1 step 5). If you chose this mode, also prefix collection URLs (Phase 5e).

Keep `--default-language en` in both modes — it names the source language regardless of where it's served.

What each step does:

1. `rosey generate` — scans built HTML and writes `rosey/base.json` (all keys + original text).
2. `write-locales` — creates/updates `rosey/locales/{code}.json` (preserving existing translations, removing keys no longer in `base.json`). It also writes the locale manifest to `dist/_rcc/locales.json`, which the RCC reads at runtime.
3. `mv` — moves the untranslated build aside.
4. `rosey build` — rebuilds the site with translations injected at `/{locale}/` URLs (and, without `--default-language-at-root`, moves the default language to `/{defaultLang}/` and writes the root redirect). `--exclusions "\.(html?)$"` overrides Rosey's default (`\.(html?|json)$`) so JSON assets like `_rcc/locales.json` and `_cloudcannon/info.json` flow through.

> `write-locales` also accepts `--keep-unused` to preserve locale keys no longer in `base.json`. Not needed for greenfield setup — it's used during migration (Appendix A/B) to remap old translations before cleanup.

> **Not on CloudCannon?** The `.cloudcannon/postbuild` filename is a CloudCannon convention, but the four commands are plain shell — run them in any CI step or build hook. `write-locales` and `rosey build` don't require CloudCannon.

## Phase 5: Add the RCC + CloudCannon layer (optional)

> **(RCC layer)** — skip this entire phase if the site isn't on CloudCannon. The site is already translatable via the Phase 4 pipeline; fill in the locale files with the [`translate-multilingual`](../translate-multilingual/SKILL.md) skill or any other method.

### 5a. Import the RCC in the root layout

Lazy-load the RCC so it only runs inside the CloudCannon editor. Place it in `<body>`, after the main content:

```html
<script>
  if (window?.inEditorMode) {
    import("rosey-cloudcannon-connector");
  }
</script>
```

### 5b. Set the snapshot boundary

The RCC clones a boundary container when switching locales. Default is `<main>`. Because nav/footer text is usually translatable too, wrap nav + main + footer in a `data-rcc` element:

```html
<body>
  <div data-rcc>
    <header />
    <main><slot /></main>
    <footer />
  </div>
  <!-- RCC script here, OUTSIDE the boundary -->
</body>
```

`<body>` itself **cannot** be the boundary — it hosts the RCC's own UI, CloudCannon's editing infrastructure, and `<script>` tags. If only `<main>` is translatable, omit `data-rcc` and rely on the fallback.

### 5c. Add `data_config` for locale files

Phases 5c–5e all write `cloudcannon.config.yml`. The [`cloudcannon-configuration`](../cloudcannon-configuration/SKILL.md) skill owns that file — in particular [§ Do this before writing any configuration](../cloudcannon-configuration/SKILL.md#do-this-before-writing-any-configuration), which requires downloading the JSON schemas first. Follow it rather than writing keys from memory.

In `cloudcannon.config.yml`, add an entry per locale. The key **must** follow `locales_{code}`:

```yaml
data_config:
  locales_fr:
    path: rosey/locales/fr.json
  locales_de:
    path: rosey/locales/de.json
```

This is what the RCC's JS API reads to bind inline editors to locale data.

### 5d. (Optional) Expose locales as a browsable collection

For translations that don't appear visually on a page (HTML attributes, `<head>` values, alt text) or for bulk editing, expose the locale files as a CloudCannon collection:

```yaml
collections_config:
  locales:
    path: rosey/locales
    name: Locales
    icon: translate
    disable_add: true
    disable_add_folder: true
    disable_file_actions: true
    _inputs:
      value:
        type: html
        label: Translation
        cascade: true
      original:
        hidden: true
        cascade: true
      _base_original:
        disabled: true
        cascade: true
```

`data_config` exposes data for programmatic use (the RCC's API, select inputs); `collections_config` is what gives editors a browsable sidebar interface. They're independent.

### 5e. Prefix collection URLs (all-languages-prefixed mode only)

> **Skip this entirely if you kept `--default-language-at-root`** — default-language URLs didn't move, so collection URLs are already correct. This applies whenever you omitted the flag (Phase 1 step 5), even without the RCC — it's a plain CloudCannon-config concern.

When every language is prefixed, the default-language pages move from `/about/` to `/{defaultLang}/about/`. CloudCannon resolves each collection's edit/preview URL (and the Visual Editor iframe) from its `url` config, so **every collection that renders visitor-facing pages must gain the `/{defaultLang}/` prefix**. Without it, CloudCannon opens the old root URL — which now serves only the redirect page — and inline editing breaks.

**This is a config change, not a routing change.** The collection `url` describes where `rosey build` puts the page; your SSG routes still emit it at the root (Phase 1 step 5).

For `url` placeholders, trailing-slash rules, and troubleshooting a page that won't load in the Visual Editor, see [`cloudcannon-configuration/collection-urls.md`](../cloudcannon-configuration/collection-urls.md).

Prepend the literal default-language code to each collection's existing `url` (here `en`):

```yaml
collections_config:
  pages:
    path: src/pages
    url: "/en/[slug]/" # was '/[slug]/'
  blog:
    path: src/content/blog
    url: "/en/blog/[full_slug]/" # was '/blog/[full_slug]/'
```

- Prefix **every** visitor-facing page collection, not just some — mismatched collections send editors to dead URLs.
- **Leave the `locales` data collection (5d) alone** — it's a data-file browser, not a rendered page, so it has no `url`.
- Per-locale split-by-directory collections (Phase 8) are already prefixed with their own locale (`/fr/blog/...`); in this mode the **default-language** split collection also needs `/{defaultLang}/blog/...`.

## Phase 6: Generate and verify

**MUST verify on a translated page, not `/`.** Almost every multilingual bug renders correctly in the default language, because Rosey doesn't inject translations there — a polluted key, a stale namespace, a duplicated pagination root and a dropped Visual Editor save all look perfect at `/`. See [troubleshooting.md](troubleshooting.md).

1. **Build locally:** `npm run build`
2. **Generate the base file:** `npx rosey generate --source dist`
3. **Create locale files** (first time, name the locales; later runs auto-detect):
   ```bash
   npx rosey-cloudcannon-connector write-locales --source rosey --dest dist --locales fr,de
   ```
4. **Run the 6a assertions against `rosey/base.json`.**
5. **Verify locale files** (`rosey/locales/fr.json`) — keys match `base.json`; `original`/`value` populated.
6. **Test the full pipeline** (drop `--default-language-at-root` if you chose all-languages-prefixed mode):
   ```bash
   mv ./dist ./_untranslated_site
   npx rosey build --source _untranslated_site --dest dist --default-language en --exclusions "\.(html?)$" --default-language-at-root
   ```
7. **Open a translated page.** Not just the directory listing — read `dist/{locale}/index.html` and one deep page (a post, a paginated listing page 2), and confirm: the text is translated, no icon or SVG markup appears twice, internal links point inside the locale, and there is no `/{defaultLang}/{defaultLang}/` anywhere in the output. Confirm `dist/_rcc/locales.json` exists and parses. **In all-languages-prefixed mode**, also confirm the default language lives at `dist/{defaultLang}/` and the root `dist/index.html` is the generated redirect, not the home page.
8. **(RCC layer)** Push to CloudCannon, open a page in the Visual Editor, confirm the locale-switcher FAB appears, switch locale, make an edit, **reload and confirm the edit survived** — a save that silently doesn't persist is the [dotted-key failure](troubleshooting.md#edits-save-in-the-visual-editor-but-never-persist).

### 6a. Assertions on `rosey/base.json`

Each maps to a specific failure that builds cleanly.

| Assert                                                                                  | Catches                                                                                                                                      |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| No key contains `.`                                                                     | The §3f dotted-key Visual Editor save failure. Sound because §3h requires `data-rosey-attrs-explicit`, the only other source of dotted keys. |
| Every UUID segment corresponds to a `_uuid` present in content                          | Unseeded or stale namespaces. Note that **nesting legitimately produces two UUID segments in one key**, so don't assert one-per-key.         |
| No key contains `undefined`; no namespace segment is empty                              | Unseeded `_uuid` — and `undefined` collides across every unseeded item.                                                                      |
| No `original` value contains `<svg`, `<!--`, or a nested component's markup             | Mixed-children pollution, before it reaches translators.                                                                                     |
| `JSON.parse(dist/_rcc/locales.json).locales` is a non-empty array of the expected codes | A wrong `--exclusions` yielding a file that exists upstream but is missing or empty in `dist`. Existence alone is insufficient.              |

### 6b. Commit `rosey/base.json` as the baseline

Two further checks — "is every colon-less key intentional?" and "is the key count plausible?" — can't be evaluated in the abstract. Make them diffable instead:

**Commit `rosey/base.json` to git.** After any later build, `git diff rosey/base.json` **is** the assertion, and every hunk must be explainable:

| Diff hunk                                      | Means                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| A new key with no `:`                          | A missing `data-rosey-root` — the element fell out of its namespace.       |
| Key count moved by an order of magnitude       | A tagging pass silently didn't run, or a root changed and duplicated keys. |
| A changed `original` on a key nobody edited    | Two render sites now disagree — see the taxonomy label helper (§3i).       |
| A new UUID segment where content didn't change | A namespace on a structural wrapper, re-keyed by an editor's drag.         |

Legitimate colon-less keys do exist — a `data-rosey-root=""` global, and `<head>` keys that sit outside `<main>`. The point is that a _new_ one is a signal.

## Phase 7: RTL language support (if applicable)

If any target locale is right-to-left (Arabic, Hebrew, Farsi, Urdu, etc.), add RTL support. The RCC auto-sets `dir="rtl"` on the clone container in the Visual Editor, but production needs its own setup.

### 7a. Add the `dir` detection script

Add an inline `<script>` at the top of `<head>` in the root layout — it must run before first paint to avoid a flash of LTR content:

```html
<script>
  const rtl = new Set(["ar", "he", "fa", "ur", "ps", "sd", "yi", "ku", "ckb", "dv", "ug"]);
  const lang = document.documentElement.lang?.split("-")[0];
  if (rtl.has(lang)) document.documentElement.dir = "rtl";
</script>
```

This uses the same pattern as dark-mode detection scripts — negligible performance impact. In Astro, it needs `is:inline` (see `astro.md`).

### 7b. Audit CSS for physical properties

Replace physical direction properties with logical equivalents:

- `margin-left`/`margin-right` → `margin-inline-start`/`margin-inline-end`
- `padding-left`/`padding-right` → `padding-inline-start`/`padding-inline-end`
- `border-left`/`border-right` → `border-inline-start`/`border-inline-end`
- `text-align: left`/`right` → `text-align: start`/`end`
- `float: left`/`right` → `float: inline-start`/`inline-end`
- `left`/`right` positioning → `inset-inline-start`/`inset-inline-end`

For Tailwind: `ms-*`/`me-*`, `ps-*`/`pe-*`, `text-start`/`text-end`.

### 7c. Mirror directional icons

```css
[dir="rtl"] .icon-arrow {
  transform: scaleX(-1);
}
```

## Phase 8: Split-by-directory for body content (optional)

For pages with large body content (blog posts, articles, docs), a single Rosey key per body is impractical. Instead, create a **separate content collection per locale** and let the SSG build those pages natively at `/{locale}/...` URLs. Rosey still runs in postbuild and **merges** with the pre-existing locale pages — it respects the existing body content and only translates `data-rosey` elements (shared UI strings).

### When to use it

- Long-form body content, or bodies with rich components/formatting
- Editors want CloudCannon's Content Editor rather than the Visual Editor's inline translation

### How it works

1. **Create per-locale content directories** mirroring the default-language collection (`blog/` → `blog_fr/`, `blog_de/`). Seed with copies of the English files.
2. **Register the locale collections with the SSG**, same schema as the English collection.
3. **Create locale routes** so the SSG builds `/{locale}/blog/{slug}/`. **MUST derive the slug from the filename, never from the translated title.** Every locale's copy of a post shares one URL path. A title-derived slug forks the path per locale and breaks the locale picker, `hreflang`, tag links, step 5's root-stripping, and `translate-multilingual`'s same-filename pairing of source to locale copy.
4. **Extract shared rendering logic** and pass `locale` for locale-aware links, dates, and collection selection.
5. **Align Rosey roots** — locale pages must set `data-rosey-root` to the **English-equivalent** path (`blog/my-post`, not `fr/blog/my-post`) via a `roseyRoot` override that strips the locale prefix. Deriving the root from source identity ([§3e](tagging.md#3e-derive-the-root-from-the-templates-source-identity)) makes this nearly free.
6. **Scope every content query to one locale.** Once per-locale directories exist, any ambient query mixes languages: taxonomy term collections, RSS feeds, sitemaps, "recent posts" sidebars, search indexes. Build per-`(term, locale)` groupings from that locale's own content. **Why:** the query still returns results and the page still builds — a French tag page just quietly lists English posts. Verified on Astro and Eleventy; SSGs with native i18n routing may scope by language already, so check before hand-rolling it.
7. **Prefix internal links on these pages yourself.** Rosey rewrites links only on pages it generates, and these already exist at the locale URL. Two non-obvious guards: **skip paths with a file extension** (`/feed.xml` is emitted once at the root, so prefixing 404s) and **don't prefix on default-language pages** (the same shared template renders `/blog/x/`, where prefixing double-prefixes). See [troubleshooting.md](troubleshooting.md#links-on-a-split-by-directory-locale-page-go-to-the-wrong-language).
8. **Suppress `data-rosey` on body content and frontmatter-driven fields** (title, description, tags) — those are translated in the locale collection files. Keep `data-rosey` on shared UI (breadcrumbs, sidebar headings, share buttons). **This includes the `<head>`** — don't give these pages head keys ([§3h](tagging.md#which-pages-need-head-keys)); their `<title>`/description already come from the translated frontmatter, and a Rosey value overwrites it. But do check whether a _listing_ route reads its title from the shared default-language entry — those still need keys.
9. **(RCC layer)** Add CloudCannon collections for each locale (`blog_fr`, `blog_de`) with `url: /{locale}/blog/[full_slug]/`.
10. **Create a locale config utility** — one file mapping locale codes to collection names, date locale strings, and display labels.
11. **(RCC layer) Hide the locale switcher on these pages** — see below.

#### Hide the locale switcher on split-by-directory pages **(RCC layer)**

This is the place to use **`data-rcc-exclude`**. Put it on the snapshot boundary listing **every** locale, and the RCC skips injecting its switcher entirely:

```html
<div data-rcc data-rcc-exclude="fr,de"></div>
```

Build the list from the locale config rather than hardcoding it, so adding a language doesn't leave one locale switchable on these pages.

**Why it matters.** These pages are translated by editing the locale's own content file, so the switcher offers a locale with nothing to switch — the body is frontmatter-driven and carries no keys. An editor picks FR, sees the post unchanged, and reports translation as broken. Shared UI on the page (nav, footer, "Recent posts") _is_ keyed, but those keys are global and translatable from any other page, so nothing is lost by hiding the switcher here.

**Do it in the shared post layout, not the route**, so it covers the default-language page too — `/blog/my-post/` has the same problem as `/fr/blog/my-post/`.

**A content-editor default doesn't protect you.** Setting `_enabled_editors` to prefer the content editor only changes which editor opens first; editors can still switch to the Visual Editor and hit this. The exclusion is the actual fix.

Note the difference from **`data-rcc-ignore`**, which opts a _single_ `data-rosey` element out of switching (§3c). `data-rcc-exclude` works per page, on the boundary, and takes locale codes.

The locale collection files themselves get translated with the [**`translate-multilingual`**](../translate-multilingual/SKILL.md) skill (its content-collections workflow). **Read the SSG-specific file** for routing, collection setup, and suppression details.

## Phase 9: Visitor-facing locale picker (optional)

**Ask the user first:** "Would you like a visitor-facing locale picker (language switcher) added, or do you already have one / prefer to bring your own?" If they decline, remind them that any links to locale URLs need `data-rosey-ignore` (see gotcha).

If they want one, create a picker component that:

- Parses the current URL to detect the active locale (is the first path segment a known locale code?)
- Strips the locale prefix to get the base path
- Builds each locale's URL according to the Phase 1 step 5 mode:
  - **Default at root:** `/{locale}{basePath}` for non-default locales, `{basePath}` for the default.
  - **All languages prefixed:** `/{locale}{basePath}` for **every** locale, including the default (its links point at `/{defaultLang}{basePath}`, not `/`).
- Adds **`data-rosey-ignore`** on every `<a>` (critical — prevents Rosey double-prefixing locale URLs)
- Adds `hreflang` attributes for SEO
- Includes a small client-side script to fix the active-state highlight on Rosey-generated pages

Place it in both desktop and mobile nav. **Read the SSG-specific file** for a code example, and [troubleshooting.md](troubleshooting.md#the-locale-pickers-links-are-broken-or-mis-highlighted) when its links misbehave.

### Hide the picker inside the editor **(RCC layer)**

> Skip this if the site isn't on CloudCannon / has no RCC layer. The guard is harmless everywhere (`window.inEditorMode` is only ever set by CloudCannon), so you can leave it in regardless.

When the RCC layer is installed, it injects its **own** floating locale switcher into the Visual Editor. A second, nav-based picker in the editor is confusing — and switching locale through the nav picker fights the RCC's snapshot/clone locale mechanism (§5b). So the visitor-facing picker must **hide itself in the editor** by checking `window.inEditorMode` — the same flag used to lazy-load the RCC in Phase 5a.

Add this to the picker's client-side script: the editor branch hides every `nav[aria-label="Language"]`, and the existing active-state highlight logic moves into the `else` branch (visitor pages only). See the SSG-specific file for the exact code.

---

## Checklist

- [ ] URL structure confirmed with the user (default-at-root vs all-languages-prefixed) and the `rosey build` flag matches
- [ ] No SSG route or permalink adds the `{defaultLang}` prefix itself; no `/{defaultLang}/{defaultLang}/` in the output
- [ ] **(all-languages-prefixed)** Collection `url`s prefixed with `/{defaultLang}/`; root redirect page verified
- [ ] All user-visible text elements have `data-rosey` attributes
- [ ] Each page/route has a `data-rosey-root` derived from the template's source identity, not the computed URL
- [ ] Paginated listings share one root — page 2 has no duplicate keys
- [ ] Reusable sections / array items use `data-rosey-ns` for namespacing — **placed inside each item's component**, not on the loop element and not on a structural wrapper
- [ ] No `data-rosey-ns="undefined"` and no empty namespace segment in the output
- [ ] No `data-rosey` key contains a `.`
- [ ] Every markdown region has a matching `data-type` **and** a rich bound input **(RCC layer)**
- [ ] Root `<html>` tag has `lang="{defaultLanguage}"` set (e.g. `<html lang="en">`)
- [ ] `<title>` **and** meta description tagged (§3h) on pages Rosey generates copies of — and **not** on split-by-directory pages whose head comes from translated frontmatter
- [ ] Attribute-only text uses `data-rosey-attrs-explicit`, or is deliberately and knowingly skipped
- [ ] Pages falling back to a site-wide description share one `page_description` key rather than repeating the same sentence per page
- [ ] No page renders two `<title>` tags (check if you suppressed an SEO component's version to emit your own)
- [ ] `.cloudcannon/postbuild` (or CI hook) runs the full Rosey pipeline
- [ ] `write-locales --dest` generates the locale manifest at `{build_dir}/_rcc/locales.json`
- [ ] `rosey/base.json` generates with correct keys, passes the 6a assertions, and is **committed** as the baseline
- [ ] A translated page has been opened and read — not just `/`
- [ ] **(split-by-directory)** Every content query is scoped to one locale; internal links are prefixed with the extension and default-language guards
- [ ] **(RCC layer)** RCC imported conditionally in the root layout (`window?.inEditorMode`)
- [ ] **(RCC layer)** `data-rcc` boundary set if nav/footer need translation
- [ ] **(RCC layer)** `cloudcannon.config.yml` has `data_config` entries for each locale (`locales_{code}`)
- [ ] **(RCC layer)** An edit made in the Visual Editor survives a reload

---

## Appendix A: Migrating from an existing i18n system

Use this when the site already has an i18n system (astro-i18n, astro-i18next, next-intl, i18next, vue-i18n, path-based routing, dictionaries + `t()`, etc.). The goal is to get to a **clean single-language site**, then apply the main workflow. Astro has a companion supplement (`astro.md` in this directory) with concrete before/after code.

### A1. Identify the current method

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

### A2. Extract existing translations

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

### A3. Remove the old infrastructure

Do this **after** extracting translations, **before** adding Rosey — and don't run two systems at once.

1. Remove i18n packages from `package.json`, reinstall.
2. Remove i18n config from the framework config file.
3. Remove locale routing (`[locale]` segments, middleware, redirects).
4. Replace `t("key")` calls with the source-language text (the text Rosey will tag).
5. Remove duplicate content folders (keep the source language only) — **but triage first**: pages whose locale copies differ only in UI strings become Rosey-only pages; pages whose _body_ genuinely differs per locale should become split-by-directory collections (Phase 8).
6. Remove old-format translation files (Rosey generates its own).
7. Clean up unused i18n imports.

**Verify the site builds and renders correctly in the source language.** This is your clean baseline.

### A4. Apply the Rosey stack

Run the main workflow (Phases 2–6). Fastest: `npx rosey-cloudcannon-connector init --yes --locales fr,de`, then tag templates and (RCC layer) add the import.

### A5. Import extracted translations

After `write-locales` generates the locale files, merge your Phase A2 translations in: for each key that matches a key Rosey generated in `base.json`, set the `value`. Keys that don't match need manual review — the naming scheme differs. (During this remap, `write-locales --keep-unused` can preserve old keys until you've copied their values across.)

### A6. Verify

Run the full Phase 6 sequence, including the **6a assertions** and the translated-page read. Two checks matter more here than in a greenfield setup:

- **Every extracted translation landed on a live key.** Any key still holding a value but absent from `base.json` means the naming scheme didn't line up — those are silently dead translations, not a cleanup task for later.
- **`git diff rosey/base.json`** against the first post-migration build: the key count should be in the same order of magnitude as the number of strings the old dictionary held. A large shortfall means a page tree or component set never got tagged.

Then (RCC layer) test in the Visual Editor, including that an edit survives a reload.

### Appendix A gotchas

- **Key mapping is the hardest part.** Old systems use arbitrary keys (`home.hero.title`); Rosey keys come from DOM attributes. Plan the naming scheme first.
- **Don't remove and add simultaneously.** Get to a clean single-language site before adding Rosey.
- **Duplicated content folders lose structure.** Map translated frontmatter fields by how they render in HTML, not their YAML shape.
- **Pluralization.** Rosey has no built-in pluralization. Each plural form needs its own `data-rosey` key, or adjust the component logic.

---

## Appendix B: Upgrading from RCC v1 to v2

Use this when the site already runs RCC **v1** (form-based Data Editor with YAML files). Both versions use the npm name `rosey-cloudcannon-connector`. This is a distinct path from the main workflow — follow it end to end.

**Prerequisites:** the site is on RCC v1 (`rosey-cloudcannon-connector@^1.x`), builds to static HTML, and its `rosey/locales/*.json` are up to date (run a final v1 build if unsure).

### B1. Audit the v1 setup

| Signal                    | Where                                                                   |
| ------------------------- | ----------------------------------------------------------------------- |
| `generateRoseyId` imports | `from "rosey-cloudcannon-connector/utils"` across `src/`                |
| `data-rosey-tagger`       | templates — v1's auto-tagger                                            |
| `rcc.yaml`                | `rosey/rcc.yaml` — v1 config (locales, Smartling, namespace pages)      |
| `translations/` YAML      | `rosey/translations/{locale}/*.yaml`                                    |
| `translations` collection | `collections_config.translations` in `cloudcannon.config.yml`           |
| Postbuild                 | `.cloudcannon/postbuild` — look for `tag`, `generate`                   |
| Smartling                 | `rosey/smartling-translations/`, `outgoing-smartling-translations.json` |
| URL translations          | `rosey/base.urls.json`, `rosey/locales/*.urls.json`                     |
| TS declarations           | `env.d.ts` with `declare module 'rosey-cloudcannon-connector/utils'`    |

### B2. Update dependency and postbuild

Set `"rosey-cloudcannon-connector": "^2.0.0"` in `package.json` and reinstall.

Replace the postbuild:

```bash
# v1
npx rosey-cloudcannon-connector tag --source dist
npx rosey generate --source dist
npx rosey-cloudcannon-connector generate
mv ./dist ./untranslated_site
npx rosey build --source untranslated_site --dest dist --default-language-at-root
```

```bash
# v2
npx rosey generate --source dist
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist
mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language en --default-language-at-root --exclusions "\.(html?)$"
```

Changes: drop `tag` (no more auto-tagger); replace `generate` with `write-locales`; add `--exclusions "\.(html?)$"`; add `--default-language en`; underscore-prefix the untranslated dir. Keep any non-RCC commands (Bookshop, Pagefind) in place.

> **Preserve the existing URL layout.** Match `--default-language-at-root` to whatever the v1 build used — the v1 example above keeps it, so the default language stays at root. Only drop the flag if the user deliberately wants to switch to all-languages-prefixed (Phase 1 step 5), which moves the default language to `/{defaultLang}/*`, adds a root redirect, and requires prefixing every collection `url` (Phase 5e) — a URL change that breaks inbound links, so confirm it first.

> **First migration build only:** add `--keep-unused` to `write-locales` so old translated keys survive long enough to remap (B7). Remove it once remapping is done — otherwise `write-locales` deletes keys not in `base.json` and destroys the old translations before you can copy them.

### B3. Update CloudCannon config

Remove the `collections_config.translations` entry (pointed at `rcc.yaml` / `translations/**`). Add `data_config` entries per locale (`locales_{code}`, same codes as the v1 `rcc.yaml`). Optionally add the browsable `locales` collection (see main Phase 5d). Update `collection_groups` to reference `locales` instead of `translations`.

### B4. Add the client-side script and boundary

v1 had no client-side component. Add the RCC import and (if nav/footer are translatable) the `data-rcc` boundary — see main Phase 5a/5b.

### B5. Replace `generateRoseyId` with static keys

Usually the biggest change. Replace each call site:

```astro
<!-- v1 → v2 -->
<h1 data-rosey={generateRoseyId(heading.text)}>{heading.text}</h1>
<h1 data-rosey="heading">{heading.text}</h1>

<a data-rosey={generateRoseyId(link.text)}>{link.text}</a>
<a data-rosey={link.text.toLowerCase().replace(/\s+/g, "-")}>{link.text}</a>

<span data-rosey={generateRoseyId(tag)}>{tag}</span>
<span data-rosey={tag}>{tag}</span>

<div data-rosey-ns="rcc-markdown" data-rosey-tagger set:html={content} />
<div data-rosey="markdown" set:html={content} />
```

For arrays/blocks, follow the **[§3g rule](tagging.md#3g-namespacing-arrays-and-page-builder-blocks)** — put the key/namespace inside each item's component, not on the loop wrapper. Delete every `import { generateRoseyId } from "rosey-cloudcannon-connector/utils"`.

### B6. Fix locale picker links

Add `data-rosey-ignore` to the picker's `<a>` tags (v1 didn't need this — it had no client-side URL rewriting).

### B7. Clean up v1 artifacts

Delete `rosey/rcc.yaml`, `rosey/translations/`, `rosey/smartling-translations/`, `rosey/outgoing-smartling-translations.json`. Remove `declare module 'rosey-cloudcannon-connector/utils'` from `env.d.ts`.

**Keep:** `rosey/base.json`, `rosey/locales/*.json` (your translations), and `rosey/base.urls.json` / `rosey/locales/*.urls.json` — these are **native Rosey** URL-translation files consumed by `rosey build`, not RCC artifacts. v2 has no UI for editing them, but **do not delete them** if they hold translated URLs.

### B8. Remap translation keys

Because keys changed from content-derived to static, old translations are now orphaned. After the first v2 build (run with `write-locales --keep-unused`, which populates `_base_original` on new keys):

```javascript
const locale = JSON.parse(readFileSync(localePath, "utf-8"));

// Build lookup: original text -> value (prefer entries that have a translation)
const byOriginal = new Map();
for (const [key, entry] of Object.entries(locale)) {
  const orig = (entry.original || "").trim();
  if (!orig) continue;
  const existing = byOriginal.get(orig);
  if (!existing || (!existing.value && entry.value))
    byOriginal.set(orig, { key, value: entry.value });
}
// Fill empty values from matching originals
for (const [, entry] of Object.entries(locale)) {
  if (!entry.value && byOriginal.has(entry.original?.trim()))
    entry.value = byOriginal.get(entry.original.trim()).value;
}
// Remove orphaned keys (no _base_original = not in current base.json)
for (const key of Object.keys(locale))
  if (locale[key]._base_original === undefined) delete locale[key];
```

Then remove `--keep-unused` from the postbuild so future builds clean up stale keys normally.

### B9. Verify

Run the full Phase 6 sequence, including the **6a assertions** and the translated-page read. Upgrade-specific checks:

- **No key remains that only exists in a locale file.** After the remap and after dropping `--keep-unused`, any locale key absent from `base.json` is an orphan whose translation is dead.
- **Spot-check a key that v1 derived from content.** Its `value` should have survived the remap onto the new static key — matching by `original` is the only link between them, so a collision (two old keys sharing one original) will have picked the wrong one.
- **`git diff rosey/base.json`** should show keys renamed, not lost: the count before and after the upgrade ought to be comparable. A large drop means `data-rosey-tagger`'s per-element keys were replaced by one block-level key without anyone deciding to do that ([see the trade-off](#appendix-b-gotchas)).

Then push to CloudCannon, confirm the locale-switcher FAB appears, switch locale, make an edit, and confirm it survives a reload.

### Appendix B gotchas

- **Key remapping is the biggest risk.** Back up locale files first. Matching by `original` text fails when two old keys share the same original (`common:Blog` and `blog:Blog` both `"original": "Blog"`) — review collisions by hand.
- **`--keep-unused` is required for the first build.** Otherwise `write-locales` deletes the old keys before you can remap them.
- **`data-rosey-tagger` removal is a trade-off.** v1 tagged individual elements inside rendered markdown; v2 wraps the block in one `data-rosey`. For large bodies, prefer split-by-directory (Phase 8).
- **Nav/footer `data-rosey-ns`.** The v1 starter uses `data-rosey-ns="common"`; preserve that namespace when replacing `generateRoseyId`, or keys collide across pages.
- **`_base_original` distinguishes live from orphaned keys** — every key in `base.json` gets it after `write-locales`, making cleanup scriptable.
- **`*.urls.json` are native Rosey, not RCC** — don't delete them; v2 has no UI for URL translations, so edit them manually.
- **`write-locales` auto-detection and `.urls.json`.** Older builds could mis-detect `fr-FR.urls` as a locale and warn "Missing data_config". Fixed in v2 by filtering `*.urls.json`; on older builds pass `--locales` explicitly.

---

## Gotchas

> **Symptom-driven entries live in [`troubleshooting.md`](troubleshooting.md)** — go there when something builds cleanly but translates wrongly. The rules below are preventative.

### Universal (framework-agnostic)

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

### Editable regions / component inline editing

> Applies only to sites using editable regions (`data-prop`, `data-editable`). The RCC works without them — skip if your original text has no inline editing. Editable regions themselves are owned by the [`cloudcannon-visual-editing`](../cloudcannon-visual-editing/SKILL.md) skill; the notes below cover only where `data-rosey` and regions interact.

- **Shared components need explicit `data-rosey` passthrough** to the inner text element — a rest-spread would land it on the outer tag.
- **Destructure `data-rosey`** alongside `data-prop` to prevent it leaking onto the outer wrapper.
- **Sanitise `.` to `_` in keys derived from `data-prop`** — a dotted key renders correctly and silently drops every Visual Editor save ([§3f](tagging.md#sanitise-dots-out-of-derived-keys-rcc-layer)).
- **Per-instance opt-out** — `data-rosey={false}` (JSX) or a template conditional for values that shouldn't be translated.
- **Non-editable components need explicit `data-rosey`** — with no `data-prop`, auto-derive produces nothing.
- **Rich-text body content: target the inner text element** (e.g. `<editable-text data-prop="@content">`), not a parent wrapper.
- **Markdown regions need a matching `data-type` and a rich bound input**, or they are permanently stale and their formatting is uneditable ([§3c](tagging.md#markdown-regions-need-a-matching-data-type-and-a-rich-bound-input-rcc-layer)).

### SSG-specific gotchas

Framework-specific gotchas live in `astro.md`, `eleventy.md`, `hugo.md`. Read the one matching your project.
