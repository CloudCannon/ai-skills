# Eleventy-Specific Patterns

Framework-specific implementation details for making an Eleventy (11ty) site multilingual with Rosey/RCC/CloudCannon. Read alongside the main [`SKILL.md`](SKILL.md) workflow and [`tagging.md`](tagging.md).

**Reference implementation:** [`CloudCannon/eleventy-multilingual-starter`](https://github.com/CloudCannon/eleventy-multilingual-starter) — all-languages-prefixed URLs, split-by-directory blog, per-locale taxonomy, translated head.

## Root Derivation

**MUST derive `data-rosey-root` from `page.filePathStem`, not `page.url`.** `filePathStem` comes from the input file, so it is identical across every pagination page of a template ([`Template.js:841`](https://github.com/11ty/eleventy) copies the parent's onto each paginated entry).

**Why:** `page.url` is the computed permalink. `page.url | replace: '/', ''` turns `/blog/1/` into `blog1` — which also collides with a real `/blog1/` page — and the split/join alternative gives `blog-1`. Either way, page 2 of a listing gets its own root and a duplicate, untranslated copy of every key on it. See [tagging.md § 3e](tagging.md#3e-derive-the-root-from-the-templates-source-identity).

Compute it once in a global data file rather than in each template:

```js
// src/_data/eleventyComputed.js
const localeDirRe = new RegExp(`^([^/]+)_(${localeCodes.join("|")})(/|$)`);

module.exports = {
  rosey_root: (data) => {
    if (data.rosey_root_override) return data.rosey_root_override;

    const stem = (data.page && data.page.filePathStem) || "";
    const key = stem
      .replace(/^\/pages\//, "") // strip your input subdirectory, if any
      .replace(/^\/+/, "")
      .replace(localeDirRe, "$1$3"); // blog_fr/my-post -> blog/my-post

    return key === "" || key === "index" ? "index" : key;
  },
};
```

```liquid
<main data-rosey-root="{{ rosey_root }}">
```

Two things this buys beyond pagination safety:

- **The `localeDirRe` rewrite satisfies Phase 8 step 5 for free** — a split-by-directory page at `blog_fr/my-post` resolves to root `blog/my-post`, matching its English equivalent's keys with no per-route override.
- **`rosey_root_override` is the escape hatch** for routes where the file identity isn't the right key — one template serving many taxonomy terms, for instance.

> On a genuinely flat site with no pagination and no locale directories, `{% assign rosey_slug = page.url | replace: '/', '' %}` with an `index` fallback still works. It just stops working the moment a listing gets a second page, so prefer `filePathStem`.

## Content-Block Namespacing — keep rosey attributes inside the block, not the loop

> This implements the core rule from [§3g](tagging.md#3g-namespacing-arrays-and-page-builder-blocks) of the main skill. The `data-rosey-ns` / `data-rosey` attributes belong on the block partial (the thing rendered per item), not left dangling on the parent's `{% for %}` wrapper, so that CloudCannon's clone-on-add/reorder can't produce a stale, duplicated namespace.

For sites using `content_blocks`, the shared page template loops the blocks; use each block's `_uuid` (from CloudCannon's `instance_value: UUID`) as the namespace segment:

```liquid
{% for block in content_blocks %}
  <div data-rosey-ns="{{ block._uuid }}">
    {% include block._name %}
  </div>
{% endfor %}
```

This requires a `_uuid` input in `cloudcannon.config.yml` and `_uuid:` in every structure value — see [§3g](tagging.md#stable-namespace-values-uuids-cloudcannon-sites-rcc-layer). One change covers all blocks across all pages. The `data-rosey` leaf keys themselves live inside each included block partial.

**Fallback (non-CloudCannon):** block name + index — fragile, reordering shifts keys:

```liquid
{% assign block_ns = block._name | append: "-" | append: forloop.index0 %}
<div data-rosey-ns="{{ block_ns }}">
```

### If using Bookshop

> **Skip this if the site doesn't use Bookshop.** Most Eleventy sites don't — the patterns above work with any component system.

For Bookshop sites, the shared `page.eleventy.liquid` template renders blocks via `{% bookshop %}`. The same UUID namespacing applies:

```liquid
{% for block in content_blocks %}
  <div data-rosey-ns="{{ block._uuid }}">
    {% bookshop "{{ block._bookshop_name }}" bind: block %}
  </div>
{% endfor %}
```

Fallback for Bookshop sites without `instance_value`:

```liquid
{% assign block_ns = block._bookshop_name | split: "/" | last | append: "-" | append: forloop.index0 %}
<div data-rosey-ns="{{ block_ns }}">
```

## Taxonomy and Collection Scoping

**MUST NOT use Eleventy's automatic frontmatter tag collections on a split-by-directory site.** `collections[tag]` is built **project-globally** — `TemplateCollection.js:58-65` filters every template in the project with no directory scoping — so the moment `blog_fr/*.md` carries `tags: [seo]`, a `collections.seo` lookup returns French and English posts together and the French tag page lists English content. This is Phase 8 step 6 in Eleventy terms.

Precompute one collection entry per `(tag, locale)` from that locale's own posts:

```js
// .eleventy.js
const postsFor = (api, code) =>
  api.getFilteredByGlob(`src/pages/${postsDirFor(code)}/**/*.md`).sort(byDateDesc);

eleventyConfig.addCollection("tagPages", (api) => {
  const pages = [];
  for (const code of localeCodes) {
    const byTag = new Map();
    for (const post of postsFor(api, code)) {
      for (const tag of post.data.tags || []) {
        const slug = String(tag).toLowerCase();
        if (!byTag.has(slug)) byTag.set(slug, []);
        byTag.get(slug).push(post);
      }
    }
    for (const [tag, posts] of byTag) {
      pages.push({ locale: code, tag, posts, url: `${localePrefix(code)}/blog/tags/${tag}/` });
    }
  }
  return pages;
});
```

Then paginate the precomputed collection at `size: 1`, so one template serves every locale and its shared strings get **one** Rosey key rather than one per locale:

```yaml
pagination:
  data: collections.tagPages
  size: 1
  alias: tagPage
permalink: "{{ tagPage.url }}"
```

Do the same for the blog listing, RSS feeds, sitemaps, and "recent posts" — any ambient query mixes languages once per-locale directories exist.

**Pagination trap:** read prev/next from your **own** alias (`tagPage.previous` / `tagPage.next`, computed when you build the collection), not Eleventy's `pagination.href.next`. Eleventy paginates the flat array of page-objects, so at a locale boundary `pagination.href.next` walks straight into the next language.

## Localizing Internal Links

Split-by-directory pages already sit at the locale URL, so Rosey never rewrites their links (Phase 8 step 7). Add a filter with both guards:

```js
// .eleventy.js
eleventyConfig.addLiquidFilter("localizeUrl", function (url, locale) {
  if (!url || !locale || locale === DEFAULT_LOCALE) return url; // guard 2
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  if (/\.[a-z0-9]+$/i.test(url)) return url; // guard 1
  return `/${locale}${url}`;
});
```

```liquid
<a href="{{ '/blog/' | localizeUrl: locale }}">{{ ... }}</a>
```

| Guard                                   | Why                                                                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Skip anything with a file extension     | `/feed.xml`, `/sitemap.xml` and assets are emitted **once** at the root, so `/fr/feed.xml` 404s. Rosey skips them for the same reason. |
| Return unchanged for the default locale | The same shared template renders `/blog/x/` as well, where prefixing would double-prefix.                                              |

## Split-by-Directory for Body Content

When implementing split-by-directory (Phase 8) in Eleventy:

- Create per-locale directories (`blog_fr/`, `blog_de/`) alongside the English blog directory.
- Give each one a directory data file (`blog_fr/blog_fr.11tydata.js`) that sets `locale`, the posts collection name, and the permalink prefix. Factor the shared body into one module so all locales stay in step.
- **MUST build the permalink from `page.fileSlug`, not `title | slugify`.** Every locale's copy of a post must share the English URL path:

  ```js
  permalink: (data) => `${localePrefix(code)}/blog/${data.page.fileSlug}/`;
  ```

  **Why:** a translated title gives `/fr/blog/edition-en-markdown/` while the picker, `hreflang`, and tag links all point at `/fr/blog/markdown-editing/`. It also breaks `translate-multilingual`'s pairing of source to locale copy, which matches on filename. The stock CloudCannon Eleventy starter uses `title | slugify` — change it.

- `localePrefix` MUST return `""` for the default locale. Eleventy builds the default language at the root and `rosey build` relocates it; emitting `/en` here gives `/en/en/` (Phase 1 step 5).
- Suppress `data-rosey` on frontmatter-driven fields by conditionally omitting the attribute when `locale` is set — including in the `<head>` partial, via a `rosey_seo: false` in the directory data.

## Visitor-Facing Locale Picker

When implementing the locale picker (Phase 9 of the main skill) in Eleventy, use `page.url | split: "/"` to parse the path and detect the current locale. The first meaningful segment is at index 1 (`path_segments[1]`) since index 0 is empty from the leading `/`. The URL construction logic (parse path, detect locale prefix, strip/prepend) is the same as the main skill — adapt using Liquid filters. Honor the Phase 1 step 5 mode: with all-languages-prefixed (no `--default-language-at-root`), treat the default language code as a locale segment too and prefix its link (`/en{basePath}`), since its pages live under `/en/`, not `/`.

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

## Gotchas

### Eleventy

- **Root derivation uses `page.filePathStem`, not `page.url`.** `page.url` is the computed permalink, so paginated pages get different roots and duplicate every key. Keep an override variable for taxonomy routes.
- **The stock CloudCannon Eleventy starter ships `source: src`.** So effectively every Eleventy site built from it hits the locale-file resolution collision — CloudCannon can't reach root-level `rosey/locales/`. See [troubleshooting.md](troubleshooting.md#cloudcannon-cant-reach-roseylocales).
- **The stock starter also derives post permalinks from `title | slugify`.** That forks the URL path per locale. Switch to `page.fileSlug` before creating locale directories.
- **`collections[tag]` is project-global.** Eleventy's automatic tag collections have no directory scoping, so they mix locales silently. Precompute per-`(tag, locale)` collections instead.
- **`pagination.href.next` crosses locale boundaries** when paginating a precomputed multi-locale collection at `size: 1`. Carry prev/next on your own collection entries.
- **Locale-picker path parsing.** `page.url | split: "/"`; the first meaningful segment is index 1.
- **Block namespacing lives on the block, not the loop.** Put `data-rosey-ns="{{ block._uuid }}"` on the per-block wrapper/partial so it re-renders per item; don't rely on a shared parent element that CloudCannon can clone.

### Bookshop (skip if site does not use Bookshop)

- **`page.eleventy.liquid` is the ideal block-namespacing point.** Use `{{ block._uuid }}` (from `instance_value: UUID`) for stable keys; fall back to `{% assign block_ns = block._bookshop_name | split: "/" | last | append: "-" | append: forloop.index0 %}` (fragile). One change covers all blocks.
- **Button `data-rosey` captures SVG icon markup.** On an `<a>`/`<button>` containing both text and a Bookshop icon, Rosey captures the full `innerHTML` including the rendered SVG and live-edit comments — polluting the source and, on translated pages, injecting the icon twice. Wrap just the text in a `<span data-rosey="button_text">` and leave the icon outside. On an already-translated site, moving the tag also needs a delete-and-reseed of the affected locale keys — see [troubleshooting.md](troubleshooting.md#moving-a-tag-on-an-already-translated-site-needs-a-delete-and-reseed).
