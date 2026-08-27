# Tagging Templates with `data-rosey`

Phase 3 of [`SKILL.md`](SKILL.md), in full. Add Rosey attributes to the built HTML, working from the outermost layout inward.

**MUST verify on a translated page.** Almost every mistake in this file renders correctly in the default language — Rosey doesn't inject there. Check `/{locale}/`, not `/`.

| §                                                               | Covers                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| [3a](#3a-set-up-data-rosey-root-on-page-containers)             | Page-level namespace                                           |
| [3b](#3b-add-data-rosey-ns-for-component-namespacing)           | `ns` vs `root` semantics                                       |
| [3c](#3c-add-data-rosey-to-translatable-elements)               | Tagging text elements; rich text regions; markdown `data-type` |
| [3d](#3d-handle-shared-and-global-content)                      | Nav, footer, and shared chrome inside `<main>`                 |
| [3e](#3e-derive-the-root-from-the-templates-source-identity)    | Where the root value comes from — and why not the URL          |
| [3f](#3f-component-integration-auto-derive-data-rosey-optional) | Auto-deriving keys from `data-prop`                            |
| [3g](#3g-namespacing-arrays-and-page-builder-blocks)            | Arrays, page-builder blocks, UUID seeding, content-as-key      |
| [3h](#3h-head-text-and-attribute-only-text)                     | Text Rosey can't reach as element content                      |
| [3i](#3i-taxonomy-labels-tags-categories)                       | Tag and category labels                                        |

## 3a. Set up `data-rosey-root` on page containers

Each page needs a root namespace so keys don't collide across pages. Add `data-rosey-root` to a top-level element (typically `<main>`):

```html
<main data-rosey-root="about"></main>
```

For dynamic pages, derive the value at build time — see [3e](#3e-derive-the-root-from-the-templates-source-identity) for where that value must come from:

```html
<!-- The value should resolve to the page's unique slug, e.g. "about", "blog/my-post", "index" -->
<main data-rosey-root="{{ slug }}"></main>
```

## 3b. Add `data-rosey-ns` for component namespacing

**`data-rosey-ns` appends to the current namespace; `data-rosey-root` replaces it.** Use `ns` to nest inside the page's namespace (page-builder blocks, repeated items). Use `root` when a value must be identical everywhere, regardless of which page renders it.

**Why:** this is the premise behind [3d](#3d-handle-shared-and-global-content), [3g](#3g-namespacing-arrays-and-page-builder-blocks) and [3i](#3i-taxonomy-labels-tags-categories). Getting it backwards either fragments one shared string into one key per page, or collapses per-page strings onto one key.

```html
<section data-rosey-ns="hero">
  <h1 data-rosey="title">Welcome</h1>
  <p data-rosey="description">Our product helps you...</p>
</section>
```

This produces keys like `index:hero:title` and `index:hero:description`.

## 3c. Add `data-rosey` to translatable elements

Tag every element containing user-visible text:

```html
<h1 data-rosey="title">Welcome to Our Site</h1>
<p data-rosey="description">We build great products.</p>
<a data-rosey="cta_text" href="/signup">Get Started</a>
```

**Important considerations:**

- `data-rosey` only captures the **text content** (`innerHTML`) of the element.
- **Place it on the innermost text element**, not a wrapper that contains other tags (icons, nested components, SVGs) — otherwise those tags become part of the captured original, and worse, get injected twice on translated pages (see [troubleshooting.md](troubleshooting.md#mixed-text--non-text-children--tag-only-the-text)).
- **Exception — rich text regions: tag the region, not its contents.** Where the text sits inside a CloudCannon rich text region (`data-editable="source"`, or a `text` region with `data-type="text"`/`"block"`), `data-rosey` goes on the **region element itself**, even though that means tagging a wrapper. CloudCannon owns the markup inside a region and can't round-trip a `data-rosey` on it, so the tagged element renders as uneditable. The region's full inner HTML — `<p>` tags included — becomes the captured original, which is correct here: the region holds only prose, so there's no non-text markup to double-inject, and the connector's locale editors are `html` inputs that edit it as rich text. One region, one key. See [cloudcannon-visual-editing/editable-regions.md § Rich text region contents are editor-owned](../cloudcannon-visual-editing/editable-regions.md#rich-text-region-contents-are-editor-owned).
- **Skip proper nouns**: don't tag names, author names, designations, or other identity values that stay the same across locales.
- For elements that already have CloudCannon `data-editable` / `data-prop` attributes, add `data-rosey` alongside them — they serve different purposes.
- Use `data-rcc-ignore` on elements that have `data-rosey` but should not appear in the RCC locale switcher **(RCC layer)**.

### Markdown regions need a matching `data-type` **and** a rich bound input **(RCC layer)**

**MUST:** a `data-rosey` region rendering markdown needs **both** a `data-type` matching how it was rendered **and** a bound CloudCannon input resolving to a rich type (`markdown` or `html`).

**Why:** each alone still goes permanently stale. CloudCannon stores the raw source while Rosey captured rendered HTML, so the two never match — the region shows as out of date forever, and its formatting is uneditable.

| Render call    | `data-type` |
| -------------- | ----------- |
| `md.render`    | `block`     |
| `renderInline` | `text`      |

Two things that break it silently:

- A rich field passed through a **slot** bypasses the markdown render entirely, so no `data-type` is correct.
- **The fix is not retroactive.** Existing entries stay stale until the value is touched, or until you rebuild and re-run `rosey generate`.

Symptom-driven version in [troubleshooting.md](troubleshooting.md#a-markdown-field-is-permanently-stale-and-its-formatting-is-uneditable).

## 3d. Handle shared and global content

Nav and footer sit **outside** `<main>` and so have no `data-rosey-root` ancestor. Use `data-rosey-ns="nav"` / `data-rosey-ns="footer"` for organization — Rosey deduplicates identical keys across pages automatically, so no root is needed. For short link text, use content-as-key ([3g](#choosing-a-namespace-strategy)).

### Shared chrome **inside** `<main>` needs its own root

**MUST** give shared chrome that renders inside `<main>` its own `data-rosey-root`, or it mints one key per page. Pagination controls, breadcrumbs, "Share this article", sidebar headings.

**Why:** inside `<main>` the page's root is in scope, so `ns` (which appends — [3b](#3b-add-data-rosey-ns-for-component-namespacing)) gives `blog:pagination:next` on one page and `about:pagination:next` on the next. `root` replaces the namespace, giving one `pagination:next` translated once.

| Form                           | Use when                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `data-rosey-root="pagination"` | **Default.** The value is shared, and you want its keys grouped under a readable prefix.                                      |
| `data-rosey-root=""`           | The value should be fully global with no namespace at all. This is what produces legitimate colon-less keys (`recent_posts`). |

## 3e. Derive the root from the template's source identity

**MUST** derive `data-rosey-root` from the **template's source identity** (its input file), not from the computed URL.

**Why:** one template can serve many URLs. Paginated routes are the common case: a URL-derived root gives `/blog/` → `blog` and `/blog/2/` → `blog-2`, minting a duplicate, untranslated copy of every key on page 2 — and the default-language site looks perfect. The same applies to one template serving many taxonomy terms. Applies to every SSG.

Strip leading/trailing slashes and fall back to `"index"` for the home page. Provide an explicit override for routes where the derivation can't be right (taxonomy terms, split-by-directory locale pages — see Phase 8 step 5).

**Read the SSG-specific file** (`astro.md`, `eleventy.md`, `hugo.md`) for the exact expression.

## 3f. Component integration: auto-derive `data-rosey` (optional)

> **Applies only to sites that already have component-based inline editing with `data-prop` (editable regions).** Sites without editing infrastructure can skip this — just add `data-rosey` directly as in [3c](#3c-add-data-rosey-to-translatable-elements).

For reusable building-block components that already output `data-prop="title"` for CloudCannon inline editing, auto-derive `data-rosey` from that attribute instead of tagging every instance:

1. **Derive from the editing attribute** — reuse the `data-prop` value as the `data-rosey` key.
2. **MUST sanitise `.` to `_` in the derived key** — see below.
3. **Destructure `data-rosey` from props.** With a rest-spread (`...htmlAttributes`), `data-rosey` must be pulled out explicitly, or it leaks onto the outer wrapper instead of reaching the inner text element.
4. **Support opt-out** via `data-rosey={false}` (or the template equivalent) for values that shouldn't be translated.
5. **Handle non-editable components explicitly** — with no `data-prop` to derive from, hardcoded strings ("Read more", "No results found") need an explicit `data-rosey="key"`.
6. **Place `data-rosey` on the innermost text element**, per 3c.

### Sanitise dots out of derived keys **(RCC layer)**

**MUST** replace `.` with `_` when deriving a key from `data-prop`. Nested props (`price.prefix`, `table.sections.0.rows.1.cells.2`) otherwise produce dotted keys.

**Why:** the connector saves with `slug: "<key>.value"`, so a dotted key resolves to a nested path that doesn't exist and **the edit is silently dropped**. Rosey's own build-time substitution matches the whole key string, so the translated site renders perfectly and only Visual Editor saves misfire — there is no error and no visible symptom.

See `astro.md` for a concrete implementation.

## 3g. Namespacing arrays and page-builder blocks

For CMS page-builder pages that use `content_blocks` (or any repeated/looped items — testimonials, team members, FAQ entries), each item needs a `data-rosey-ns` value that is **unique and stable**: it must not change when items are reordered, inserted, or deleted.

### Rule: put rosey attributes _inside_ each item's component, not on the loop element

This is the single most important authoring rule for arrays, and getting it wrong fails silently.

`data-rosey` and `data-rosey-ns={item._uuid}` are **build-time markup** — they only get their correct value when the component that emits them actually re-renders. When you put the namespace on the **element that does the looping** (the `.map()` / `{% for %}` wrapper in the parent) and an editor **adds or reorders** an array item in CloudCannon, CloudCannon often creates the new item by **cloning a sibling's DOM node** rather than re-rendering. The cloned item inherits a **stale, duplicated** `data-rosey-ns`, so its key collides with the sibling it was cloned from — silently breaking translation of the new item and stale detection, until the editor is reloaded.

The fix: make **each array item its own registered component**, and put the rosey namespace/keys **on that component's own root**, so CloudCannon renders each item directly and every item carries its own live `_uuid`. Put `data-component="<registered-name>"` on the `data-editable="array-item"` element — that single attribute is the whole fix for a uniform sub-array (no `data-component-key`, `data-id-key`, or `<template>` needed). See `astro.md` for the full before/after example.

> Rule of thumb: **if a loop renders items, the `data-rosey`/`data-rosey-ns` attributes belong inside the item's component, never on the parent's loop wrapper.**

### Rule: the namespace goes on the component that renders its own text

**MUST NOT** put `data-rosey-ns` on a purely **structural** wrapper — a grid cell, column, slide, or tab panel that only positions its children.

**Why:** the children already carry their own `_uuid`, so a wrapper segment adds a second namespace level that describes _where the block currently sits_ rather than _what it is_. Drag the block into a different wrapper and every key inside it changes, orphaning every translation. The block itself never changed.

Destructure `_uuid` in structural components anyway, so it doesn't leak onto the DOM as an attribute.

### Choosing a namespace strategy

| The array holds                                               | Use                                            | Why                                                                                           |
| ------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Objects** (blocks, testimonials, FAQ entries)               | `_uuid` (CloudCannon) — see below              | There is a field to hang a stable identifier on, and CloudCannon can populate it on creation. |
| **Plain strings** (feature bullets, table cells, chip labels) | **Content-as-key** — slugify the string itself | There is nowhere to hang a `_uuid`, and index keys remap on the first insert.                 |
| Objects, **no CloudCannon**                                   | Type + index, reluctantly                      | Fragile: inserting or reordering shifts every key after the change point.                     |

**Content-as-key** (`data-rosey={text.toLowerCase().replace(/\s+/g, "-")}` → `nav:about`) has one bonus and one trade-off: repeated values share a single translation, but **renaming the source text orphans the key** and mints a fresh untranslated one, rather than flagging the existing translation as stale. `write-locales` cleans up the orphan.

**Type + index is not a degraded option for plain-string arrays — it is wrong.** Insert one string at the top and every subsequent key shifts by one, silently remapping every translation to the wrong string. Reach for it only for object arrays on non-CloudCannon sites, where nothing better exists.

### Stable namespace values: UUIDs (CloudCannon sites) **(RCC layer)**

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

### Seeding `_uuid` into existing content **(RCC layer)**

CloudCannon only populates `_uuid` on creation, so existing content needs a seeding pass.

**Why it matters:** an unseeded item silently falls back to an index namespace — or renders `data-rosey-ns="undefined"`, which **collides across every unseeded item on the page**. It builds cleanly and passes a prose "the keys look right" review, then remaps every translation on the first reorder.

- **Edit line-level; never round-trip through a YAML library.** It reflows `>-` block scalars, drops comments, and produces an unreviewable diff.
- **Anchor on the discriminator key** (`_component` / `_name` / `_bookshop_name`), idempotently — skip any mapping that already has a `_uuid` sibling. Confine the pass to frontmatter.
- **Expect the anchor to miss things.** Array items with no discriminator that still carry text get skipped silently — counters, icon lists, image `alt` values.
- **Cover structure _defaults_ and data files** (`src/data/*.json`, `*.structure-value.yml`) too. A frontmatter-only pass leaves those unseeded, so the gap reappears the next time an editor adds a block.
- **Verify, per file:** every mapping with a discriminator has a `_uuid` and vice versa; all UUIDs are unique; and no rendered page contains `data-rosey-ns="undefined"` or an empty ns.

For a working example, see the [Rosey Astro Starter](https://github.com/CloudCannon/rosey-astro-starter).

**Read the SSG-specific file** for code examples in your framework.

## 3h. `<head>` text and attribute-only text

Two cases where the visible text isn't the element's own content, so a plain `data-rosey` can't reach it.

### `<head>`: `<title>` and meta description

Easy to miss, because nothing looks broken: the page body translates, the browser tab and search snippet stay in the default language.

**Rosey does scan `<head>`.** Untagged head text is copied verbatim onto generated pages, so a `<title>` without a key stays in the default language forever. Tag it like anything else:

```html
<title data-rosey="about:page_title">About | My Site</title>
```

**MUST use `data-rosey-attrs-explicit` for attribute text; MUST NOT use `data-rosey-attrs`.** The explicit form takes a JSON object mapping attribute name to key and produces exactly one key per attribute:

```html
<meta
  name="description"
  content="A starter template."
  data-rosey-attrs-explicit='{"content":"about:page_description"}'
/>
```

**Why:** the comma-separated `data-rosey-attrs` **also emits an empty key for the element's (non-existent) inner text** — `data-rosey-attrs="content"` + `data-rosey="page_desc"` produces both `page_desc.content` and a junk `page_desc` → `""`. It is also the only thing in the skill that produces a **dotted** key, which collides with the [3f](#sanitise-dots-out-of-derived-keys-rcc-layer) sanitisation rule and with Phase 6's dotted-key assertion.

Head elements sit **outside** the `<main data-rosey-root=...>` container, so they get no namespace from it. Their keys are global — spell the namespace into the key string (`about:page_title`) to keep them grouped alongside that page's body keys in the locale editors.

**Tag both `<title>` and the description.** The title is the high-value half (browser tab, search-result heading) and needs only a plain `data-rosey`. The description is invisible on the page and drags in the `attrs-explicit` JSON form — but it's one more tagged element and one more key, and an untranslated snippet in every locale is a real gap. Title-only is defensible for a throwaway demo; **don't quietly ship it on a production site** — ask first.

Watch for pages with **no `seo` frontmatter** — they fall back to a site-wide description, so several `*:page_description` keys end up holding the same sentence. Give those one shared key rather than making translators repeat themselves.

#### Which pages need head keys

Triage by **where the head text comes from**, not by whether the page is translated:

| Page                                                                                                                                             | Needs head keys?                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Default-language page that Rosey generates locale copies of (Home, About, 404)                                                                   | **Yes** — generation copies head text verbatim       |
| A per-locale route that reads its title/description from the **default-language** source (a listing page fetching the shared `pages/blog` entry) | **Yes** — easy to overlook, since it's a locale page |
| Split-by-directory page whose head comes from its own translated frontmatter (Phase 8 post pages)                                                | **No — actively harmful**                            |

The last row is the trap: those heads are already correct from the locale collection file, and a key gives you a second, winning source of truth. See [troubleshooting.md](troubleshooting.md#a-split-by-directory-pages-translated-title-reverted-to-english).

So make head keys **opt-in per page**, never a layout-wide default: a default would land on Phase 8 post pages, the one place they must not go.

#### Don't expect an SSG i18n convention to cover this

Astro's built-in i18n (and equivalents elsewhere) provide routing, URL helpers, fallback, and locale detection — **not** content or head translation; their docs put that explicitly out of scope. The usual SSG answer is either localized frontmatter per page (which is Phase 8, and needs no keys) or a build-time per-locale dictionary lookup. **That lookup is impossible on Rosey-generated pages**: the template renders once, in the default language, so there is no locale in scope to look anything up with. Head tagging isn't a workaround for missing tooling — it's the only mechanism available on those pages.

Note that head text can't be inline-edited in the Visual Editor (it isn't on the page), so these keys are reachable only through the locale files / locales collection. That's expected — flag it to editors rather than trying to engineer around it.

**Read the SSG-specific file** — head tags are often rendered by an SEO component/plugin that won't pass through `data-*` attributes.

### Attribute-only visible text (icon buttons, arrows, social links)

Where an element's only human-readable text lives in an **attribute** — `aria-label` on an icon button, `title` on a pagination arrow, a social link with nothing but an SVG inside — a plain `data-rosey` captures the SVG markup instead of text, polluting the source and double-injecting on translated pages.

Two valid choices. Pick one deliberately:

| Choice                                             | Result                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `data-rosey-attrs-explicit='{"aria-label":"..."}'` | The label is translated. Right for anything a screen-reader user depends on to navigate.     |
| Skip the element entirely                          | It stays in the default language. **Legitimate** — but make it a decision, not an oversight. |

Skipping is defensible for decorative icon-only buttons and social links, where the label is a brand name or the icon carries the meaning. It is not defensible for pagination and navigation controls. Whichever you pick, note it — an unlabelled skip looks identical to a missed element in review.

## 3i. Taxonomy labels (tags, categories)

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

Taxonomy pages also need **per-locale routes** so each lists that locale's posts; without them Rosey generates the locale copies from the default-language page, listing the wrong posts. See the SSG-specific file. Their `<title>` needs a key **per term**, which is why head keys support explicit overrides — a root-derived name would give every term page one title. One route serving many terms is also why [3e](#3e-derive-the-root-from-the-templates-source-identity) matters here.
