# Astro-Specific Patterns

Framework-specific implementation details for making an Astro site multilingual with Rosey/RCC/CloudCannon. Read alongside the main [`SKILL.md`](SKILL.md) workflow and [`tagging.md`](tagging.md). The last section covers **migrating an Astro site off its existing i18n system** (Appendix A of the main skill).

## Root Derivation

For a route that maps one-to-one to a URL, `Astro.url.pathname` in the component that renders `<main>` avoids threading a slug prop through the layout chain:

```astro
<main data-rosey-root={Astro.url.pathname.replace(/^\/|\/$/g, '') || 'index'}>
```

**MUST NOT use it on a route where one template serves many URLs.** Paginated routes (`[...page].astro`) and taxonomy routes are the common cases: `/blog/` derives `blog` while `/blog/2/` derives `blog/2`, so page 2 mints a duplicate, untranslated copy of every key on it — and the default-language site renders perfectly. See [tagging.md § 3e](tagging.md#3e-derive-the-root-from-the-templates-source-identity).

Take an explicit `roseyRoot` prop on the layout and pass it from those routes:

```astro
<main data-rosey-root={roseyRoot ?? Astro.url.pathname.replace(/^\/|\/$/g, '') || 'index'}>
```

| Route shape                                  | Root                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `about.astro`, `[...slug].astro`             | Derived from `Astro.url.pathname`                                                 |
| `blog/[...page].astro` (paginated listing)   | Explicit `roseyRoot="blog"` — every page shares it                                |
| `[locale]/tags/[tag]/[...page].astro`        | Explicit `roseyRoot="tags"` (see [Taxonomy routes](#taxonomy-routes-3i-in-astro)) |
| `[locale]/blog/[...slug].astro` (split post) | Explicit `roseyRoot` stripping the locale prefix                                  |

## Content-Block Namespacing — put rosey attributes _inside_ the item component

> This implements the core rule from [§3g](tagging.md#3g-namespacing-arrays-and-page-builder-blocks). On Astro sites it is the **default** pattern for any array/repeater rendered in a loop — not an edge-case fix.

For CMS page-builder pages using `content_blocks` (or any looped array — testimonials, team members, FAQ entries), use the item's `_uuid` field (populated by CloudCannon's `instance_value: UUID`) as the namespace segment, and place that namespace on **the item component's own root**, not on the `.map()` wrapper in the parent.

### Why the loop wrapper fails

`data-rosey-ns={item._uuid}` is **build-time markup** — it only re-evaluates when the component that emits it re-renders. When an editor **adds or reorders** an array item in CloudCannon, CloudCannon frequently creates the new item by **cloning a sibling's DOM node** rather than re-rendering. If the namespace lives on the loop wrapper, the clone inherits a **stale, duplicated** `data-rosey-ns`: its key collides with the sibling it was cloned from, silently breaking translation of the new item and stale detection until the editor reloads.

### The fix: each array item is its own registered component

Render each item through its own registered component so CloudCannon renders it directly, and put `data-rosey-ns={_uuid}` on that component's root. Put `data-component="<registered-name>"` on the `data-editable="array-item"` element:

```astro
<!-- parent component template -->
<div data-editable="array" data-prop="testimonials">
  {testimonials.map((t) => (
    <div data-editable="array-item" data-component="testimonial-item">
      <TestimonialItem {...t} />
    </div>
  ))}
</div>

<!-- TestimonialItem.astro — registerAstroComponent("testimonial-item", TestimonialItem) -->
<div data-rosey-ns={_uuid}>
  <p data-editable="text" data-prop="message" data-rosey="testimonial:message">{message}</p>
  <!-- …other data-rosey fields, all inside this component… -->
</div>
```

That single `data-component` on the array-item is the whole fix for a uniform sub-array — no `data-component-key`, `data-id-key`, or `<template>` is needed.

The same principle applies to a top-level `content_blocks` loop, where each block is already its own component:

```astro
{blocks.map((block) => (
  <div data-editable="array-item" data-component={block._name}>
    <BlockComponent {...block} />  {/* data-rosey-ns={block._uuid} lives on this component's root */}
  </div>
))}
<!-- key: index:3f43d721-...:heading -->
```

This requires a `_uuid` input in `cloudcannon.config.yml` and `_uuid:` in every structure value — see [§3g](tagging.md#stable-namespace-values-uuids-cloudcannon-sites-rcc-layer). Existing content files need a **seeding pass**, including structure defaults and `src/data/*.json` — follow the procedure in [§3g](tagging.md#seeding-_uuid-into-existing-content-rcc-layer) rather than hand-editing, and grep the built output for `data-rosey-ns="undefined"` afterwards. For a working example, see the [Rosey Astro Starter](https://github.com/CloudCannon/rosey-astro-starter) (`Page.astro` and `cloudcannon.config.yml`).

**Structural wrappers get no namespace.** A grid cell, column, slide, or tab panel that only positions its children MUST NOT carry `data-rosey-ns` — destructure `_uuid` so it doesn't reach the DOM, but don't use it. Otherwise dragging a block between columns re-keys every string inside it ([§3g](tagging.md#rule-the-namespace-goes-on-the-component-that-renders-its-own-text)).

**Fallback (non-CloudCannon):** if `instance_value` isn't available, use `data-rosey-ns={`${block._name}-${i}`}` — but this is fragile, reordering shifts keys, and you lose the clone-safety above.

## Auto-Derive `data-rosey` from `data-prop`

For component-heavy Astro sites where building blocks already use `data-prop` for CloudCannon inline editing, auto-derive `data-rosey` from that attribute:

**MUST sanitise `.` to `_` in the derived key.** Nested props (`price.prefix`, `table.sections.0.rows.1.cells.2`) otherwise produce dotted keys, and **a dotted key renders correctly on the translated site while silently dropping every Visual Editor save** — the connector writes with `slug: "<key>.value"`, so the dot resolves to a nested path that doesn't exist. There is no error. See [§3f](tagging.md#sanitise-dots-out-of-derived-keys-rcc-layer).

Put the derivation in one helper so no call site can skip it:

```ts
// src/utils/roseyKey.ts
export function roseyKeyFromProp(prop: unknown): string | null {
  if (typeof prop !== "string" || prop.trim() === "") return null;
  return prop.replace(/\./g, "_");
}

export function resolveRosey(roseyProp: unknown, effectiveDataProp: unknown) {
  if (roseyProp === false) return {}; // explicit opt-out
  if (typeof roseyProp === "string" && roseyProp) return { "data-rosey": roseyProp };
  const derived = roseyKeyFromProp(effectiveDataProp);
  return derived ? { "data-rosey": derived } : {};
}
```

```astro
---
import { resolveRosey } from "../utils/roseyKey";
const { "data-prop": customDataProp, "data-rosey": roseyProp, ...htmlAttributes } = Astro.props;
const effectiveDataProp = customDataProp ?? (editable ? "text" : null);
const roseyAttributes = resolveRosey(roseyProp, effectiveDataProp);
---
<span class="inner-text" {...textDataAttributes} {...roseyAttributes}>...</span>
```

Key points:

- **Destructure `data-rosey` from props** — prevents it leaking into `...htmlAttributes` and landing on the wrong element
- **`data-rosey={false}` opts out** — use on instances that should not be translated (proper nouns, names)
- **`editable={false}` components** need explicit `data-rosey="key"` since auto-derive depends on `data-prop`

## Markdown Regions: `data-type` and the Bound Input

A `data-rosey` region rendering markdown needs **both** halves, or it is permanently stale and its formatting is uneditable ([§3c](tagging.md#markdown-regions-need-a-matching-data-type-and-a-rich-bound-input-rcc-layer)):

| Astro render call        | `data-type`         |
| ------------------------ | ------------------- |
| `md.render(value)`       | `data-type="block"` |
| `md.renderInline(value)` | `data-type="text"`  |

And the CloudCannon input bound to that field must resolve to `markdown` or `html` — a `text` input stores raw source that can never match the rendered HTML Rosey captured.

**A rich field passed through a `<slot>` bypasses the markdown render entirely**, so no `data-type` value is correct. Render the field inside the component instead of accepting pre-rendered children.

## RTL Language Support

When implementing RTL support (Phase 7 of the main skill) in Astro, add the `dir` detection script at the top of `<head>` in your root layout (e.g. `Layout.astro`):

```astro
<html lang="en">
  <head>
    <script is:inline>
      const rtl = new Set(['ar','he','fa','ur','ps','sd','yi','ku','ckb','dv','ug']);
      const lang = document.documentElement.lang?.split('-')[0];
      if (rtl.has(lang)) document.documentElement.dir = 'rtl';
    </script>
    <meta charset="UTF-8" />
    <!-- ... rest of head -->
  </head>
```

The `is:inline` directive is critical — without it, Astro bundles and defers the script as a module, which runs after paint and causes a flash of LTR content.

## Split-by-Directory for Body Content

When implementing split-by-directory (Phase 8 of the main skill) in Astro:

- Define content collections for each locale in `content.config.ts` with the same schema as the English collection.
- Use a dynamic `[locale]` route: `src/pages/[locale]/blog/[...slug].astro`, with `getStaticPaths` iterating locale codes and fetching from the matching collection.
- **MUST build the path from the entry's file id, not its translated title** — every locale's copy of a post shares one URL path (Phase 8 step 3).
- Suppress auto-derived `data-rosey` on frontmatter fields with `data-rosey={false}`.
- Use snake_case collection names (`blog_fr`, `blog_de`) — consistent with `data_config` keys like `locales_fr`.
- **All-languages-prefixed mode:** these per-locale collections are **the one exception** to the "never prefix your own routes" rule (Phase 1 step 5) — because the SSG, not Rosey, generates them. So the default language also needs its own prefixed route (`/en/blog/...`) and a matching collection URL (Phase 5e): include the default locale in `getStaticPaths` and give its collection an `/en/` `url`. **Ordinary routes must still not be prefixed** — `about.astro` stays at `/about/` and `rosey build` relocates it.

### Per-locale queries

Astro sites avoid the locale-mixing problem in Phase 8 step 6 for free **only if every query names its collection**: `getCollection(blogCollectionFor(locale))`, never a bare `getCollection("blog")` filtered afterwards. Audit RSS endpoints, sitemaps, "recent posts" components, and search-index builders — those are the ones that tend to keep a hardcoded default-language collection name.

### Internal links

Rosey rewrites links only on pages it generates, and these pages already exist at the locale URL, so their links need prefixing in the template (Phase 8 step 7):

```ts
export function localizeUrl(url: string, locale: string, defaultLocale: string) {
  if (!url || locale === defaultLocale) return url; // don't double-prefix
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  if (/\.[a-z0-9]+$/i.test(url)) return url; // /feed.xml lives only at the root
  return `/${locale}${url}`;
}
```

### Rosey-root alignment for locale pages

Split-by-directory locale pages derive `data-rosey-root` from the URL, which includes the locale prefix (`fr/blog/my-post`). Add a `roseyRoot` prop to the page layout and pass the English-equivalent path (`blog/my-post`):

```astro
<main data-rosey-root={roseyRoot ?? derivedSlug}>
```

### Hiding the locale switcher on post pages

Take a `hideLocaleSwitcher` prop on the root layout and turn it into the exclusion list, derived from the locale config:

```astro
---
import { localeCodes } from "../utils/locales";
const { hideLocaleSwitcher } = Astro.props;
const rccExclude = hideLocaleSwitcher ? localeCodes.join(",") : undefined;
---
<div data-rcc data-rcc-exclude={rccExclude}>
```

Astro omits the attribute entirely when the value is `undefined`, so pages that don't opt in are untouched. Set the prop in the **post layout** (`Post.astro`), which both `blog/[slug].astro` and `[locale]/blog/[slug].astro` render through — one place covers every post page.

### Taxonomy routes ([§3i](tagging.md#3i-taxonomy-labels-tags-categories) in Astro)

Taxonomy pages need a per-locale route too — `src/pages/[locale]/tags/[tag]/[...page].astro` — or Rosey generates `/{locale}/tags/*` from the default-language page and lists the wrong posts. Mirror the locale blog listing: loop `localeCodes`, build the term set from `getCollection(blogCollectionFor(locale))`, and paginate per term.

**`paginate()` needs `props`, not just `params`.** Route params don't reach `Astro.props`, so a template reading `const { locale } = Astro.props` gets `undefined` — which silently yields `/undefined/tags/...` pagination links and default-language post links:

```astro
paths.push(...paginate(filteredPosts, {
  params: { locale, tag },
  props: { locale },        // ← without this, locale is undefined in the template
  pageSize,
}));
```

This applies to every paginated `[locale]` route, not just taxonomy ones — worth auditing the whole set at once.

Pass `roseyRoot="tags"` (not the derived `{locale}/tags/{tag}`) so the page heading shares the chip label key from 3i, and give the pagination component a `basePath` that includes both the locale and the term.

## Head/SEO Text ([§3h](tagging.md#3h-head-text-and-attribute-only-text) in Astro)

**`astro-seo` cannot carry `data-*` attributes.** `<SEO>` renders `<title>` via `set:html` with no attribute pass-through, and its `extend.meta` escape hatch whitelists only `name`/`property`/`content`/`httpEquiv`/`media`, silently dropping anything else. So you can't tag its output.

Both tags are rendered conditionally on their prop being truthy, which gives a clean way in: pass `undefined` to suppress `<SEO>`'s version and emit your own next to it.

In the root layout:

```astro
---
// Opt-in, NOT a default — a default would also hit split-by-directory post
// pages, whose head already comes from translated frontmatter (Phase 3h).
const { roseySeo, roseyTitleKey, roseyDescriptionKey } = Astro.props;

const titleKey = roseyTitleKey ?? (roseySeo ? `${pageRoseyRoot}:page_title` : undefined);
const descriptionKey =
  roseyDescriptionKey ?? (roseySeo ? `${pageRoseyRoot}:page_description` : undefined);
---
{titleKey && <title data-rosey={titleKey}>{pageTitle}</title>}
{descriptionKey && (
  <meta
    name="description"
    content={description}
    data-rosey-attrs-explicit={JSON.stringify({ content: descriptionKey })}
  />
)}

<SEO
  title={titleKey ? undefined : pageTitle}
  description={descriptionKey ? undefined : description}
  ...
/>
```

Deriving the key from `pageRoseyRoot` keeps head keys in the same namespace as each page's body keys (`about:page_title` next to `about:heading`). Pages needing a **per-instance** key — taxonomy pages, where every term shares one route — pass an explicit key instead, since a root-derived name would collapse every term onto one key.

**Why title and description are two independent props:** on taxonomy routes their granularities differ — one key per term for the title (`tag_page_titles:markdown`), one shared key for the description (`tag_page_description`). No single derived namespace serves both.

**Thread the props through intermediate layouts.** A `Page.astro`/`Paginated.astro` that spreads `{...frontmatter}` into the root layout won't forward a prop that isn't part of frontmatter — add it explicitly or the opt-in silently does nothing.

**Which Astro routes opt in:**

| Route                                                     | Opt in?                                                                                                                                                   |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[...slug].astro`, `about.astro`, `404.astro`             | Yes — Rosey generates the locale copies                                                                                                                   |
| `[locale]/blog/[...page].astro` (listing)                 | Yes — `getEntry("pages", "blog")` returns the **default-language** entry for every locale, so its head is untranslated even though the page is per-locale |
| `[locale]/blog/[slug].astro` (post)                       | **No** — head comes from the `blog_<locale>` collection entry                                                                                             |
| `[locale]/tags/[tag]/[...page].astro`                     | Yes, but with **explicit** keys — one route serves every term (see 3i)                                                                                    |
| Default-language listing at root (`blog/[...page].astro`) | No — native `/{locale}/blog/` routes exist, so Rosey never generates locale copies of it                                                                  |

**Watch for the composite title.** `pageTitle` is typically `` `${title} | ${site.site_title}` ``, so the head string is never byte-identical to the on-page `<h1>` and Rosey matches whole strings per key. Expect one extra key per page rather than reusing a body key — and never reuse a page-builder block's key, whose namespace embeds a `_uuid` that changes when an editor swaps the block.

Pages with no `seo` frontmatter fall back to a site-wide description, so several distinct `*:page_description` keys can hold the same sentence. Either accept the duplicate translation work or give those pages one shared key.

## Visitor-Facing Locale Picker

When implementing the locale picker (Phase 9 of the main skill) in Astro:

```astro
---
const localeConfig = { fr: "FR", de: "DE" };
const localeCodes = Object.keys(localeConfig);
const defaultLocale = "en";
// Set to false if you built with all-languages-prefixed mode (no --default-language-at-root):
// then the default language also lives under /en/ and its picker link must be prefixed too.
const defaultLanguageAtRoot = true;
const pathname = Astro.url.pathname;

const segments = pathname.split("/").filter(Boolean);
const isLocalePath = localeCodes.includes(segments[0]) || segments[0] === defaultLocale;
const basePath = isLocalePath
  ? "/" + segments.slice(1).join("/") + (segments.slice(1).length ? "/" : "")
  : pathname;

function buildPath(base, locale) {
  if (locale === defaultLocale && defaultLanguageAtRoot) return base || "/";
  return `/${locale}${base.startsWith("/") ? base : `/${base}`}`;
}
---
<nav aria-label="Language">
  <a href={buildPath(basePath, defaultLocale)} data-rosey-ignore hreflang={defaultLocale}>EN</a>
  {localeCodes.map((code) => (
    <a href={buildPath(basePath, code)} data-rosey-ignore hreflang={code}>
      {localeConfig[code]}
    </a>
  ))}
</nav>
<script>
  // (RCC layer) Hide the nav picker inside the Visual Editor — the RCC injects its
  // own floating locale switcher there. Harmless off CloudCannon: inEditorMode is unset.
  if (window.inEditorMode) {
    document
      .querySelectorAll("nav[aria-label='Language']")
      .forEach((nav) => ((nav as HTMLElement).style.display = "none"));
  } else {
    document.querySelectorAll("nav[aria-label='Language'] a").forEach((link) => {
      const match = link.pathname === window.location.pathname;
      link.classList.toggle("active", match);
    });
  }
</script>
```

---

## Migrating an Astro Site Off Its Existing i18n (Appendix A supplement)

Concrete patterns for replacing Astro's built-in i18n (and/or the official docs recipe) with the Rosey stack. Read alongside Appendix A of the main `SKILL.md`.

> **Third-party packages** (`astro-i18next`, `paraglide`) have their own config, runtime APIs, and removal steps beyond this. This focuses on Astro's built-in `i18n` config and the dictionary/`t()` recipe.

### What Astro built-in i18n actually is

**Routing infrastructure only** — locale-aware URL routing, `getRelativeLocaleUrl`, `Astro.preferredLocale`, fallback routing. It does **not** provide a translation runtime, `t()`, or dictionary format; those come from a docs recipe users copy in. A typical site has some of:

| Piece               | Location                                                                             |
| ------------------- | ------------------------------------------------------------------------------------ |
| i18n config         | `i18n: { ... }` in `astro.config.mjs`                                                |
| Dictionary          | `src/i18n/ui.ts` — `{ en: {...}, fr: {...} }`                                        |
| Helpers             | `src/i18n/utils.ts` — `getLangFromUrl()`, `useTranslations()`, `useTranslatedPath()` |
| URL helpers         | `getRelativeLocaleUrl()` / `getAbsoluteLocaleUrl()` from `astro:i18n`                |
| Locale detection    | `Astro.currentLocale` in components                                                  |
| Duplicated pages    | `src/pages/fr/about.astro`, `src/pages/es/about.astro`                               |
| Content collections | `src/content/blog/en/`, `.../fr/` with `[locale]` routes                             |
| Language picker     | uses `getRelativeLocaleUrl()` or manual path construction                            |
| Middleware          | `src/middleware.ts` with i18n logic                                                  |

### Detection (supplements A1)

Look for: an `i18n` key in `astro.config.mjs`; `astro:i18n` imports; `Astro.currentLocale` / `Astro.preferredLocale`; a `src/i18n/` dir with `ui.ts` + `utils.ts`; duplicated page trees (`src/pages/fr/`, `src/pages/es/`).

### Translation extraction (supplements A2)

The recipe stores translations in a TS object:

```ts
// src/i18n/ui.ts
export const ui = {
  en: { "nav.home": "Home", "nav.about": "About", "hero.title": "Welcome to our site" },
  fr: { "nav.home": "Accueil", "nav.about": "À propos", "hero.title": "Bienvenue sur notre site" },
} as const;
```

Target Rosey format — **and change the separator from `.` to `:`** (CloudCannon's data API uses `.` as a path delimiter; Rosey uses `:`):

```json
{
  "nav:home": { "original": "Home", "value": "Accueil" },
  "nav:about": { "original": "About", "value": "À propos" },
  "hero:title": { "original": "Welcome to our site", "value": "Bienvenue sur notre site" }
}
```

Conversion script:

```js
import { ui } from "./src/i18n/ui.ts";
const defaultLang = "en";
const locales = Object.keys(ui).filter((l) => l !== defaultLang);
for (const locale of locales) {
  const result = {};
  for (const [key, enValue] of Object.entries(ui[defaultLang])) {
    result[key.replace(/\./g, ":")] = { original: enValue, value: ui[locale]?.[key] ?? enValue };
  }
  // Write result to rosey/locales/${locale}.json
}
```

Final key names must match the `data-rosey` attributes you add in Phase 3 — plan the naming scheme first.

### Page triage (supplements A3)

- **Structurally identical locale copies** (About, Contact, Home — only UI strings differ): delete the copies, keep the default-language page, add `data-rosey`. Rosey generates the locale copies at build.
- **Bodies that genuinely differ per locale** (blog, docs, case studies): keep as split-by-directory content collections (Phase 8).

### Removal specifics (supplements A3)

Remove the `i18n` block from `astro.config.mjs`. Then:

```diff
- <h1>{t('hero.title')}</h1>
+ <h1 data-rosey="hero:title">Welcome to our site</h1>

- <a href={translatePath('/about/')}>{t('nav.about')}</a>
+ <a href="/about/" data-rosey="nav:about">About</a>

- import { getRelativeLocaleUrl } from 'astro:i18n';
- <a href={getRelativeLocaleUrl('fr', 'about')}>À propos</a>
+ <a href="/about/" data-rosey="nav:about">About</a>
```

Delete `src/i18n/utils.ts` and `src/i18n/ui.ts` and their imports. **Audit `Astro.currentLocale`** across components:

- Date formatting → use the default locale (or move the page to split-by-directory if per-locale formatting matters).
- Conditional rendering → move to split-by-directory, or use `data-rosey` with per-locale content.
- `<html lang>` → hardcode the default (`<html lang="en">`); Rosey sets the correct `lang` on generated pages.

Delete `src/pages/fr/`, `src/pages/es/` for Rosey-only pages; keep `about.astro`, `index.astro` and add `data-rosey`. Remove i18n logic from `src/middleware.ts` (delete the file if that's all it did).

### Locale picker

Replace the `getRelativeLocaleUrl()`-based picker with the Rosey-compatible version above. The critical difference is `data-rosey-ignore` on every `<a>`.

### Fallback behavior change

Astro's `fallback: { fr: "es" }` swaps whole pages to another locale when a page is missing. Rosey has no per-page fallback — it falls back **per key** to the default-language text. Instead of a Spanish page when French is missing, visitors see the French URL with untranslated strings showing in the default language. Flag this to editors.

### Migration gotchas (Astro)

- **Key separator change (`.` → `:`).** Keep it consistent across the extraction script, `data-rosey` attributes, and locale files. Automate it.
- **`Astro.currentLocale` silently disappears.** After removing the `i18n` config it returns `undefined` rather than throwing — conditionals fall through to the else branch. Audit all usages first.
- **`prefixDefaultLocale: true` changes URLs.** Default pages move from `/en/about/` to `/about/` — set up redirects from `/en/*` if there are inbound links.
- **Content collections with `[locale]` routes** convert to the split-by-directory pattern (separate collection per locale, explicit locale routes).
- **Route translation (`routes` in `ui.ts`).** Rosey handles URL translation via `*.urls.json` files — see the Rosey docs.

## Gotchas

- **`Astro.url.pathname` is only safe where one route means one URL.** Paginated and taxonomy routes MUST pass an explicit `roseyRoot`, or page 2 duplicates every key.
- **Array items: rosey attributes go inside the item component, not the loop wrapper.** Otherwise CloudCannon's clone-on-add/reorder produces a stale, duplicated `data-rosey-ns`. Give each item its own registered component with `data-component` on the `data-editable="array-item"`.
- **Structural wrappers get no `data-rosey-ns`.** A grid cell or column that only positions children re-keys everything inside it when a block is dragged between wrappers.
- **Derived keys must have `.` replaced with `_`.** Route it through one helper; a dotted key silently drops Visual Editor saves while the translated site looks correct.
- **A markdown region needs both a matching `data-type` and a rich bound input** — either alone leaves it permanently stale and uneditable. A field passed through a `<slot>` can't have a correct `data-type` at all.
- **Rosey-root alignment for locale pages.** Pass a `roseyRoot` prop that strips the locale prefix; locale route files pass the English-equivalent path.
- **Split-by-directory pages must localize their own hrefs** — skip extensioned paths, and don't prefix on the default language.
- **Name the collection in every query.** `getCollection(collectionFor(locale))`, not a bare default-language collection filtered later — that's how RSS feeds and "recent posts" quietly serve English on `/fr/`.
- **snake_case collection names** (`blog_fr`, `blog_de`) — consistent with CloudCannon conventions.
- **RTL `dir` script needs `is:inline`.** Without it Astro defers the script as a module and RTL pages flash LTR.
- **Locale picker must match the URL-structure mode.** With all-languages-prefixed (no `--default-language-at-root`), the default language lives under `/en/`, so the picker's default-language link is `/en{basePath}` (set `defaultLanguageAtRoot = false` in the snippet above) and path parsing must treat `en` as a locale segment too — otherwise the default-language link points at `/`, which serves the redirect page.
