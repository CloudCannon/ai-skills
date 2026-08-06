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

These files contain slug derivation patterns, content-block namespacing examples, the array-item component rule, split-by-directory details, locale picker examples, and framework-specific gotchas. The phases below reference them where needed.

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

Add Rosey attributes to the HTML output. Work from the outermost layout inward.

### 3a. Set up `data-rosey-root` on page containers

Each page needs a root namespace so keys don't collide across pages. Add `data-rosey-root` to a top-level element (typically `<main>`) using the page's slug or path:

```html
<main data-rosey-root="about"></main>
```

For dynamic pages, derive the slug from the page's URL at build time (see 3e for SSG-specific patterns):

```html
<!-- The value should resolve to the page's unique slug, e.g. "about", "blog/my-post", "index" -->
<main data-rosey-root="{{ slug }}"></main>
```

### 3b. Add `data-rosey-ns` for component namespacing

Wrap reusable sections with `data-rosey-ns` to namespace their keys:

```html
<section data-rosey-ns="hero">
  <h1 data-rosey="title">Welcome</h1>
  <p data-rosey="description">Our product helps you...</p>
</section>
```

This produces keys like `index:hero:title` and `index:hero:description`.

### 3c. Add `data-rosey` to translatable elements

Tag every element containing user-visible text:

```html
<h1 data-rosey="title">Welcome to Our Site</h1>
<p data-rosey="description">We build great products.</p>
<a data-rosey="cta_text" href="/signup">Get Started</a>
```

**Important considerations:**

- `data-rosey` only captures the **text content** (`innerHTML`) of the element.
- **Place it on the innermost text element**, not a wrapper that contains other tags (icons, nested components, SVGs) — otherwise those tags become part of the captured original, and worse, get injected twice on translated pages (see the "Mixed text + non-text children" gotcha).
- **Exception — rich text regions: tag the region, not its contents.** Where the text sits inside a CloudCannon rich text region (`data-editable="source"`, or a `text` region with `data-type="text"`/`"block"`), `data-rosey` goes on the **region element itself**, even though that means tagging a wrapper. CloudCannon owns the markup inside a region and can't round-trip a `data-rosey` on it, so the tagged element renders as uneditable. The region's full inner HTML — `<p>` tags included — becomes the captured original, which is correct here: the region holds only prose, so there's no non-text markup to double-inject, and the connector's locale editors are `html` inputs that edit it as rich text. One region, one key. See [cloudcannon-visual-editing/editable-regions.md § Rich text region contents are editor-owned](../cloudcannon-visual-editing/editable-regions.md#rich-text-region-contents-are-editor-owned).
- **Skip proper nouns**: don't tag names, author names, designations, or other identity values that stay the same across locales.
- For elements that already have CloudCannon `data-editable` / `data-prop` attributes, add `data-rosey` alongside them — they serve different purposes.
- Use `data-rcc-ignore` on elements that have `data-rosey` but should not appear in the RCC locale switcher **(RCC layer)**.

### 3d. Handle shared/global content

For content shared across pages (navigation, footer), pick a namespace strategy:

- Nav/footer sit outside `<main>` and have no `data-rosey-root` ancestor. Use `data-rosey-ns="nav"` / `data-rosey-ns="footer"` for organization. Rosey deduplicates identical keys across pages automatically, so no root is needed.
- For short link text, use **content-as-key**: slugify the text itself (`data-rosey={link.text.toLowerCase().replace(/\s+/g, "-")}` → `nav:about`, `nav:blog`). Simpler than UUIDs and stable across reordering.

### 3e. SSG-specific slug derivation

The `data-rosey-root` value should be derived from the page's URL path at build time — strip leading/trailing slashes and fall back to `"index"` for the home page. **Read the SSG-specific file** (`astro.md`, `eleventy.md`, `hugo.md`) for the exact pattern.

### 3f. Component integration: auto-derive `data-rosey` (optional)

> **Applies only to sites that already have component-based inline editing with `data-prop` (editable regions).** Sites without editing infrastructure can skip this — just add `data-rosey` directly as in 3c.

For reusable building-block components that already output `data-prop="title"` for CloudCannon inline editing, auto-derive `data-rosey` from that attribute instead of tagging every instance:

1. **Derive from the editing attribute** — reuse the `data-prop` value as the `data-rosey` key.
2. **Destructure `data-rosey` from props.** With a rest-spread (`...htmlAttributes`), `data-rosey` must be pulled out explicitly, or it leaks onto the outer wrapper instead of reaching the inner text element.
3. **Support opt-out** via `data-rosey={false}` (or the template equivalent) for values that shouldn't be translated.
4. **Handle non-editable components explicitly** — with no `data-prop` to derive from, hardcoded strings ("Read more", "No results found") need an explicit `data-rosey="key"`.
5. **Place `data-rosey` on the innermost text element**, per 3c.

See `astro.md` for a concrete implementation.

### 3g. Namespacing arrays and page-builder blocks

For CMS page-builder pages that use `content_blocks` (or any repeated/looped items — testimonials, team members, FAQ entries), each item needs a `data-rosey-ns` value that is **unique and stable**: it must not change when items are reordered, inserted, or deleted.

#### Rule: put rosey attributes _inside_ each item's component, not on the loop element

This is the single most important authoring rule for arrays, and getting it wrong fails silently.

`data-rosey` and `data-rosey-ns={item._uuid}` are **build-time markup** — they only get their correct value when the component that emits them actually re-renders. When you put the namespace on the **element that does the looping** (the `.map()` / `{% for %}` wrapper in the parent) and an editor **adds or reorders** an array item in CloudCannon, CloudCannon often creates the new item by **cloning a sibling's DOM node** rather than re-rendering. The cloned item inherits a **stale, duplicated** `data-rosey-ns`, so its key collides with the sibling it was cloned from — silently breaking translation of the new item and stale detection, until the editor is reloaded.

The fix: make **each array item its own registered component**, and put the rosey namespace/keys **on that component's own root**, so CloudCannon renders each item directly and every item carries its own live `_uuid`. Put `data-component="<registered-name>"` on the `data-editable="array-item"` element — that single attribute is the whole fix for a uniform sub-array (no `data-component-key`, `data-id-key`, or `<template>` needed). See `astro.md` for the full before/after example.

> Rule of thumb: **if a loop renders items, the `data-rosey`/`data-rosey-ns` attributes belong inside the item's component, never on the parent's loop wrapper.**

#### Stable namespace values: UUIDs (CloudCannon sites)

Use CloudCannon's `instance_value: UUID` to auto-assign a stable UUIDv4 when an array item is created. Add a hidden `_uuid` input and include `_uuid:` in every structure value:

```yaml
# cloudcannon.config.yml
_inputs:
  _uuid:
    type: text
    hidden: true
    instance_value: UUID

_structures:
  content_blocks:
    values:
      - label: Hero
        value:
          _name: Hero
          _uuid:
          heading:
```

Then use the UUID as the namespace segment (inside the item component — see the rule above):

```html
<!-- key: index:3f43d721-9c23-...:heading -->
<div data-rosey-ns="{item._uuid}"></div>
```

Existing content files need UUIDs seeded manually — CloudCannon only auto-populates on creation. For a working example, see the [Rosey Astro Starter](https://github.com/CloudCannon/rosey-astro-starter).

#### Fallback: type + index (non-CloudCannon sites)

Without `instance_value`, use the item type + a zero-based index (`data-rosey-ns="{block_type}-{index}"` → `index:hero-0:heading`). **This is fragile** — inserting or reordering shifts keys after the change point and remaps translations to the wrong content. Prefer UUIDs whenever CloudCannon is in play.

**Read the SSG-specific file** for code examples in your framework.

### 3h. Translate `<head>` text (`<title>`, meta description)

Easy to miss, because nothing looks broken: the page body translates, the browser tab and search snippet stay in the default language.

**Rosey does scan `<head>`.** Untagged head text is copied verbatim onto generated pages, so a `<title>` without a key stays in the default language forever. Tag it like anything else:

```html
<title data-rosey="about:page_title">About | My Site</title>
```

For text living in an **attribute** rather than element content, use `data-rosey-attrs-explicit` — a JSON object mapping attribute name to key:

```html
<meta
  name="description"
  content="A starter template."
  data-rosey-attrs-explicit='{"content":"about:page_description"}'
/>
```

Prefer it over the comma-separated `data-rosey-attrs`, which **also emits an empty key for the element's (non-existent) inner text**: `data-rosey-attrs="content"` + `data-rosey="page_desc"` produces both `page_desc.content` and a junk `page_desc` → `""`. `attrs-explicit` produces exactly one key per attribute.

Head elements sit **outside** the `<main data-rosey-root=...>` container, so they get no namespace from it. Their keys are global — spell the namespace into the key string (`about:page_title`) to keep them grouped alongside that page's body keys in the locale editors.

#### How far to go: do both, but know they're separable

**Default to keying both.** Anywhere organic search matters per-locale, an untranslated description is a real gap, and the second half is cheap once the first is in place: one more tagged element and one more key per page.

The two halves are independent, though, so it's worth knowing the trade if someone wants to cut scope:

- **`<title>` is the high-value, low-cost half.** User-visible (browser tab, search-result heading) and needs only a plain `data-rosey` attribute.
- **The meta description** is invisible on the page and a weaker ranking signal, and it's the half that drags in the `attrs-explicit`/JSON-object form — the least obvious thing in this section.

So title-only is a defensible stopping point for a throwaway demo, and adding descriptions later is purely additive. But it isn't the right default: **don't quietly ship title-only on a production site** — if you're tempted to cut it for simplicity, ask first. The complexity saved is roughly one derived key and one tagged element, which is usually not worth an untranslated snippet in every locale.

Watch for pages with **no `seo` frontmatter** — they fall back to a site-wide description, so several `*:page_description` keys end up holding the same sentence. Give those one shared key rather than making translators repeat themselves.

#### Which pages need head keys

Triage by **where the head text comes from**, not by whether the page is translated:

| Page                                                                                                                                             | Needs head keys?                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Default-language page that Rosey generates locale copies of (Home, About, 404)                                                                   | **Yes** — generation copies head text verbatim       |
| A per-locale route that reads its title/description from the **default-language** source (a listing page fetching the shared `pages/blog` entry) | **Yes** — easy to overlook, since it's a locale page |
| Split-by-directory page whose head comes from its own translated frontmatter (Phase 8 post pages)                                                | **No — actively harmful**                            |

**Why the last row is harmful.** Those heads are already correct from the locale collection file. Add a key and you get a second, winning source of truth: when the key has a translation, Rosey **overwrites** the frontmatter value.

```
frontmatter:      Édition en Markdown | Starter
rosey fr.json:    TRADUCTION | Starter
built /fr/ page:  TRADUCTION | Starter     ← frontmatter translation is now dead
```

(With the key _untranslated_ Rosey leaves the existing text alone rather than substituting the default-language base — so this stays invisible until someone translates that key.) Worse, one key used on both `/blog/x/` and `/fr/blog/x/` **silently collapses to a single entry** with one `original` (the default-language one wins). This is Phase 8 step 6 — "suppress `data-rosey` on frontmatter-driven fields" — applied to the head.

So make head keys **opt-in per page**, never a layout-wide default: a default would land on Phase 8 post pages, the one place they must not go.

#### Don't expect an SSG i18n convention to cover this

Astro's built-in i18n (and equivalents elsewhere) provide routing, URL helpers, fallback, and locale detection — **not** content or head translation; their docs put that explicitly out of scope. The usual SSG answer is either localized frontmatter per page (which is Phase 8, and needs no keys) or a build-time per-locale dictionary lookup. **That lookup is impossible on Rosey-generated pages**: the template renders once, in the default language, so there is no locale in scope to look anything up with. Head tagging isn't a workaround for missing tooling — it's the only mechanism available on those pages.

Note that head text can't be inline-edited in the Visual Editor (it isn't on the page), so these keys are reachable only through the locale files / locales collection. That's expected — flag it to editors rather than trying to engineer around it.

**Read the SSG-specific file** — head tags are often rendered by an SEO component/plugin that won't pass through `data-*` attributes.

### 3i. Taxonomy labels (tags, categories)

Taxonomy terms come from content frontmatter as slugs, and the visible label is usually derived from the slug at build time (`markdown` → `Markdown`). Two consequences for translation:

**Keep slugs untranslated; translate only the label.** The slug is the URL (`/fr/tags/markdown/`), and the same slug must appear in every locale's content files so a term's pages line up across languages. (Rosey translates URLs separately, via the `*.urls.json` files.) A term whose slug differs per locale produces disconnected taxonomy pages.

**Give each term one shared key**, so a label is translated once for every chip, heading, and listing that shows it — put a `data-rosey-root` on the container and use the slug as the key:

```html
<div data-rosey-root="tags">
  <a href="/tags/markdown/" data-rosey="markdown">Markdown</a>
</div>
```

**Derive the label through a single helper.** Rosey matches whole strings per key, so two render sites that capitalise differently produce a mismatched original and a permanently stale key. One helper also gives acronyms somewhere to live — naive capitalisation turns `seo` into `Seo`, and that misspelling becomes the English original translators work from:

```ts
const labelOverrides: Record<string, string> = { seo: "SEO" };

export function tagLabel(tag: string): string {
  return labelOverrides[tag] ?? tag.charAt(0).toUpperCase() + tag.slice(1);
}
```

Keep this helper separate from locale config — it only ever produces the **default-language** label. Rosey translates its output via the key, so the helper never needs to know about locales.

**Editing a label invalidates its translations.** Changing the helper's output changes the Rosey original, which marks every translation of that term out of date. Where the translation is still correct (fixing `Seo` → `SEO` when the locale value already said `SEO`), set `_base_original` to the new string in each locale file to pre-clear the review — the equivalent of ticking "mark as reviewed".

Taxonomy pages also need **per-locale routes** so each lists that locale's posts; without them Rosey generates the locale copies from the default-language page, listing the wrong posts. See the SSG-specific file. Their `<title>` needs a key **per term**, which is why 3h has explicit key overrides — a root-derived name would give every term page one title.

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
  Now the default language builds at `/en/about/` alongside `/fr/about/`, and Rosey generates a locale-detecting **redirect page at the root `index.html`**. If you chose this mode, also prefix collection URLs (Phase 5e).

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

1. **Build locally:** `npm run build`
2. **Generate the base file:** `npx rosey generate --source dist`
3. **Create locale files** (first time, name the locales; later runs auto-detect):
   ```bash
   npx rosey-cloudcannon-connector write-locales --source rosey --dest dist --locales fr,de
   ```
4. **Verify `rosey/base.json`** — all expected keys with correct namespacing.
5. **Verify locale files** (`rosey/locales/fr.json`) — keys match `base.json`; `original`/`value` populated.
6. **Test the full pipeline** (drop `--default-language-at-root` if you chose all-languages-prefixed mode):
   ```bash
   mv ./dist ./_untranslated_site
   npx rosey build --source _untranslated_site --dest dist --default-language en --default-language-at-root --exclusions "\.(html?)$"
   ```
   Confirm the translated output in `dist/` and that `dist/_rcc/locales.json` exists. **In all-languages-prefixed mode**, also confirm the default language now lives at `dist/{defaultLang}/` (e.g. `dist/en/index.html`) and that the root `dist/index.html` is the generated redirect page, not the home page.
7. **(RCC layer)** Push to CloudCannon, open a page in the Visual Editor, confirm the locale-switcher FAB appears, switch locale, make an edit, confirm it saves.

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
3. **Create locale routes** so the SSG builds `/{locale}/blog/{slug}/`.
4. **Extract shared rendering logic** and pass `locale` for locale-aware links, dates, and collection selection.
5. **Align Rosey roots** — locale pages must set `data-rosey-root` to the **English-equivalent** path (`blog/my-post`, not `fr/blog/my-post`) via a `roseyRoot` override that strips the locale prefix.
6. **Suppress `data-rosey` on body content and frontmatter-driven fields** (title, description, tags) — those are translated in the locale collection files. Keep `data-rosey` on shared UI (breadcrumbs, sidebar headings, share buttons). **This includes the `<head>`** — don't give these pages head keys (3h); their `<title>`/description already come from the translated frontmatter, and a Rosey value overwrites it. But do check whether a _listing_ route reads its title from the shared default-language entry — those still need keys.
7. **(RCC layer)** Add CloudCannon collections for each locale (`blog_fr`, `blog_de`) with `url: /{locale}/blog/[full_slug]/`.
8. **Create a locale config utility** — one file mapping locale codes to collection names, date locale strings, and display labels.
9. **(RCC layer) Hide the locale switcher on these pages** — see below.

#### Hide the locale switcher on split-by-directory pages **(RCC layer)**

This is the place to use **`data-rcc-exclude`**. Put it on the snapshot boundary listing **every** locale, and the RCC skips injecting its switcher entirely:

```html
<div data-rcc data-rcc-exclude="fr,de"></div>
```

Build the list from the locale config rather than hardcoding it, so adding a language doesn't leave one locale switchable on these pages.

**Why it matters.** These pages are translated by editing the locale's own content file, so the switcher offers a locale with nothing to switch — the body is frontmatter-driven and carries no keys. An editor picks FR, sees the post unchanged, and reports translation as broken. Shared UI on the page (nav, footer, "Recent posts") _is_ keyed, but those keys are global and translatable from any other page, so nothing is lost by hiding the switcher here.

**Do it in the shared post layout, not the route**, so it covers the default-language page too — `/blog/my-post/` has the same problem as `/fr/blog/my-post/`.

**A content-editor default doesn't protect you.** Setting `_enabled_editors` to prefer the content editor only changes which editor opens first; editors can still switch to the Visual Editor and hit this. The exclusion is the actual fix.

Note the difference from **`data-rcc-ignore`**, which opts a _single_ `data-rosey` element out of switching (3c). `data-rcc-exclude` works per page, on the boundary, and takes locale codes.

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

Place it in both desktop and mobile nav. **Read the SSG-specific file** for a code example.

### Hide the picker inside the editor **(RCC layer)**

> Skip this if the site isn't on CloudCannon / has no RCC layer. The guard is harmless everywhere (`window.inEditorMode` is only ever set by CloudCannon), so you can leave it in regardless.

When the RCC layer is installed, it injects its **own** floating locale switcher into the Visual Editor. A second, nav-based picker in the editor is confusing — and switching locale through the nav picker fights the RCC's snapshot/clone locale mechanism (§5b). So the visitor-facing picker must **hide itself in the editor** by checking `window.inEditorMode` — the same flag used to lazy-load the RCC in Phase 5a.

Add this to the picker's client-side script: the editor branch hides every `nav[aria-label="Language"]`, and the existing active-state highlight logic moves into the `else` branch (visitor pages only). See the SSG-specific file for the exact code.

---

## Checklist

- [ ] URL structure confirmed with the user (default-at-root vs all-languages-prefixed) and the `rosey build` flag matches
- [ ] **(all-languages-prefixed)** Collection `url`s prefixed with `/{defaultLang}/`; root redirect page verified
- [ ] All user-visible text elements have `data-rosey` attributes
- [ ] Each page/route has a `data-rosey-root` set to a unique slug
- [ ] Reusable sections / array items use `data-rosey-ns` for namespacing — **placed inside each item's component**, not on the loop element
- [ ] Root `<html>` tag has `lang="{defaultLanguage}"` set (e.g. `<html lang="en">`)
- [ ] `<title>` **and** meta description tagged (3h) on pages Rosey generates copies of — and **not** on split-by-directory pages whose head comes from translated frontmatter
- [ ] Pages falling back to a site-wide description share one `page_description` key rather than repeating the same sentence per page (3h)
- [ ] No page renders two `<title>` tags (check if you suppressed an SEO component's version to emit your own)
- [ ] `.cloudcannon/postbuild` (or CI hook) runs the full Rosey pipeline
- [ ] `write-locales --dest` generates the locale manifest at `{build_dir}/_rcc/locales.json`
- [ ] `rosey/base.json` generates with correct keys; locale files created with correct structure
- [ ] **(RCC layer)** RCC imported conditionally in the root layout (`window?.inEditorMode`)
- [ ] **(RCC layer)** `data-rcc` boundary set if nav/footer need translation
- [ ] **(RCC layer)** `cloudcannon.config.yml` has `data_config` entries for each locale (`locales_{code}`)

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

For large sites, write a one-off Node script that reads the old files and emits Rosey-format locale JSON. **The key mapping is the hard part** — Rosey keys come from the `data-rosey`/`data-rosey-ns`/`data-rosey-root` attributes you'll add, so decide your naming scheme (main workflow Phase 3) before finalizing the mapping.

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

Build, generate, run the full pipeline, spot-check translated pages, and (RCC layer) test in the Visual Editor.

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

For arrays/blocks, follow the **§3g rule** — put the key/namespace inside each item's component, not on the loop wrapper. Delete every `import { generateRoseyId } from "rosey-cloudcannon-connector/utils"`.

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

Build, run the pipeline, push to CloudCannon, confirm the locale-switcher FAB appears, switch locale, make an edit, confirm it saves.

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

### Universal (framework-agnostic)

- **Rosey operates on built HTML.** It doesn't see source files, markdown, or frontmatter directly — only the rendered output.
- **`<head>` is scanned, but untagged head text is copied verbatim (§3h).** Bodies translate while the browser tab and search snippet stay in the default language — nothing looks broken. Tag `<title>` with `data-rosey`, and attribute text with `data-rosey-attrs-explicit='{"content":"key"}'` (plain `data-rosey-attrs` also emits a junk empty key for the element's non-existent inner text). Head elements sit outside `<main>`, so their keys are global — write the namespace into the key.
- **Never give split-by-directory pages head keys (§3h).** Their `<title>`/description already come from translated frontmatter; once the key has a translation Rosey overwrites that value, and one key used at both `/blog/x/` and `/fr/blog/x/` silently collapses to a single entry keeping the default-language `original`.
- **`--default-language-at-root` is a decision, not a default — ask.** Present (default at root): existing URLs stay, no collection-URL changes. Omitted (all languages prefixed): the default language moves to `/{defaultLang}/*`, `/` serves a generated redirect page, and every visitor-facing collection `url` needs the `/{defaultLang}/` prefix (Phase 5e). The choice must be identical in `.cloudcannon/postbuild`, Phase 6's manual test, and Appendix B — a mismatch silently builds the wrong URL layout.
- **All-languages-prefixed: the root `index.html` is a redirect, not a page.** Don't tag it with `data-rosey` or treat it as a content page — Rosey generates it, and it's overwritten each build.
- **All-languages-prefixed: collection URLs must move too.** CloudCannon reads a collection's `url` to open the Visual Editor; if the pages moved to `/{defaultLang}/` but the `url` still says `/[slug]/`, editing opens the redirect page and breaks.
- **`data-rosey` must go on the innermost text element.** Otherwise the captured original includes wrapper tags. **Except inside a CloudCannon rich text region** (`data-editable="source"`, or `text` with `data-type="text"`/`"block"`), where it goes on the region element — a key on a block inside the region can't survive the editor's round-trip and shows up as an uneditable element (§3c).
- **Don't translate names.** Author names, person names, designations are identity values — no `data-rosey`.
- **Key collisions.** Two pages with the same `data-rosey-root` and same element keys collide. Use unique roots (the page slug).
- **Empty `data-rosey-root`.** `data-rosey-root=""` resets the namespace — useful for global components.
- **Nav/footer use `data-rosey-ns`, not `data-rosey-root`** — they sit outside `<main>`. Rosey dedups identical keys across pages automatically.
- **Nav/footer links: content-as-key.** Slugify the link text. Trade-off: renaming text orphans the old key and creates a fresh untranslated entry (forces re-translation rather than flagging stale); `write-locales` auto-cleans orphans. For multi-level navs, add a `data-rosey-ns` of the slugified parent text to avoid collisions.
- **Duplicate desktop/mobile nav share one key.** Both instances can use the same `data-rosey` key; Rosey records multiple occurrences and gives both the same translation — the desired behavior.
- **Put rosey attributes inside each looped item's component (§3g).** On the loop wrapper, they go stale/duplicated when CloudCannon clones an item on add/reorder, breaking new-item translation and stale detection.
- **Stale translation detection.** When `original` ≠ `_base_original`, the RCC shows an amber dashed border and warning badge. Editors update the translation or click "Mark as reviewed".
- **`write-locales` preserves existing translations but removes stale keys.** It adds new keys, removes keys no longer in `base.json`, and never overwrites existing `value` fields on surviving keys.
- **Snapshot boundary** _(RCC layer)_. The RCC clones `[data-rcc]` (or `<main>`) on locale switch; content outside it isn't switched. Most sites want `data-rcc` around nav + main + footer. Never `<body>`.
- **Split-by-directory pages need `data-rcc-exclude` listing every locale** _(RCC layer)_. Otherwise the Visual Editor offers a locale switch that can't change anything — the body has no keys — and editors read that as broken translation. Apply it in the shared post layout so the default-language page is covered too (Phase 8).
- **Rosey's default exclusions block JSON files.** Use `--exclusions "\.(html?)$"` so `_rcc/locales.json` and `_cloudcannon/info.json` flow through to the output.
- **Rosey merges with pre-existing locale pages.** At an already-built locale URL, `rosey build` respects existing content and only translates `data-rosey` elements — the basis of split-by-directory.
- **Rosey rewrites internal links on generated pages, not pre-existing ones.** Copied pages get `<a href>` values prefixed with the locale; split-by-directory pages (already at the locale URL) keep their links as-is.
- **Locale picker links need `data-rosey-ignore`** — without it, Rosey rewrites the "switch to default language" link on generated pages and breaks it.
- **Locale picker active state needs client-side JS** — build-time HTML always reflects the default-language perspective.
- **Hide the nav locale picker in the editor** _(RCC layer)_. When the RCC layer is on, guard the picker's client script with `window.inEditorMode` and hide it — the RCC's floating picker is the switcher inside the Visual Editor, and a second nav-based switcher both confuses editors and conflicts with the RCC's locale clone.
- **Mixed text + non-text children — tag only the text.** A `data-rosey` element whose contents are more than text (icons, SVGs, nested components/Bookshop includes) captures that markup into the source (`base.json` fills with icon `<span>`s, `<!--bookshop-live-->` comments, SVGs) and, on **translated locales only**, renders it **twice**: Rosey injects the stored `innerHTML` (which contains the icon) into the element while the template still renders the icon as a sibling. The default locale looks fine because Rosey doesn't inject there, so the bug hides until you check a translated page. Fix: wrap just the text in an inline `<span data-rosey="...">` and move the tag onto it; adjust the parent's flex/gap/alignment so the inline wrapper doesn't shift icon spacing. **Common miss:** on an already-translated site, moving the tag alone doesn't clear the polluted value — see the next gotcha.
- **Moving a tag on an already-translated site needs a delete-and-reseed.** Editing where a `data-rosey` tag sits (e.g. onto an inner `<span>`) does not fix existing locale files. **Why:** keys are name-based, not content-hashed, so the moved tag keeps the same key ID; `write-locales` then refreshes `_base_original` (now clean) but preserves `value` (old, polluted) — the amber "out of date" badge shows, but the stale `value` keeps injecting the doubled icon. Remedy: delete the affected keys from every `rosey/locales/*.json`, then rebuild in order — build the site, `npx rosey generate`, `npx rosey-cloudcannon-connector write-locales`. With the keys absent, `write-locales` reseeds `value` from the now-clean `original` (text only). Those entries show as untranslated afterward — expected, since the old values were never real translations. **Common miss:** this works _because_ keys survive the tag move; if keys were content-hashed the tag move would mint new keys and orphan the old ones — a different cleanup (see Appendix B's remap).
- **Split-by-directory Rosey-root alignment.** A page built at `/fr/blog/my-post/` derives root `fr/blog/my-post`, which won't match locale entries keyed `blog/my-post:*`. Pass a `roseyRoot` override that strips the locale prefix.
- **Suppress `data-rosey` on frontmatter-driven fields in shared split-by-directory templates**, or Rosey overwrites the natively-translated content.
- **CloudCannon `source` key breaks locale-file resolution** _(RCC layer)_. With `source: src`, all `data_config`/`collections_config`/`paths`/`file_config` paths resolve relative to it, and CC can't reach root-level `rosey/locales/` (no `../` support). Remove `source` and prepend its value to affected paths; leave `schemas.*.path` (root-relative) alone. `init` does this automatically.

### Editable regions / component inline editing

> Applies only to sites using editable regions (`data-prop`, `data-editable`). The RCC works without them — skip if your original text has no inline editing. Editable regions themselves are owned by the [`cloudcannon-visual-editing`](../cloudcannon-visual-editing/SKILL.md) skill; the notes below cover only where `data-rosey` and regions interact.

- **Shared components need explicit `data-rosey` passthrough** to the inner text element — a rest-spread would land it on the outer tag.
- **Destructure `data-rosey`** alongside `data-prop` to prevent it leaking onto the outer wrapper.
- **Per-instance opt-out** — `data-rosey={false}` (JSX) or a template conditional for values that shouldn't be translated.
- **Non-editable components need explicit `data-rosey`** — with no `data-prop`, auto-derive produces nothing.
- **Rich-text body content: target the inner text element** (e.g. `<editable-text data-prop="@content">`), not a parent wrapper.

### SSG-specific gotchas

Framework-specific gotchas live in `astro.md`, `eleventy.md`, `hugo.md`. Read the one matching your project.
