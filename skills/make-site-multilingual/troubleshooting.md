# Multilingual Troubleshooting

Symptom-driven diagnosis for a Rosey/RCC site. Preventative one-line rules live in [`SKILL.md` § Gotchas](SKILL.md#gotchas); authoring rules live in [`tagging.md`](tagging.md).

**Start here: almost every multilingual bug renders correctly in the default language.** Rosey doesn't inject translations on the default-language pages, so a polluted key, a stale namespace, or a double-prefixed URL is invisible at `/`. Reproduce on `/{locale}/` — and, on an RCC site, in the Visual Editor — before concluding anything works.

## Symptom → cause → fix

| Symptom                                                                        | Likely cause                                                                                | Fix                                                                                                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| URLs like `/en/en/about/`                                                      | Your own routes/permalinks add the default-language prefix, and `rosey build` adds it again | Remove the prefix from your routes — see `SKILL.md` Phase 1 step 5                                                               |
| Page 2 of a paginated listing has a duplicate, untranslated copy of every key  | `data-rosey-root` derived from the computed URL, so `/blog/2/` became root `blog-2`         | Derive from the template's source identity — [tagging.md § 3e](tagging.md#3e-derive-the-root-from-the-templates-source-identity) |
| Shared chrome produces `blog:pagination:next`, `about:pagination:next`, …      | `data-rosey-ns` on a shared component inside `<main>`, where `ns` appends to the page root  | Use `data-rosey-root` instead — [tagging.md § 3d](tagging.md#shared-chrome-inside-main-needs-its-own-root)                       |
| A block loses its translation when an editor drags it to a different column    | `data-rosey-ns` on a structural wrapper, so the key encodes where the block sits            | Remove it — [tagging.md § 3g](tagging.md#rule-the-namespace-goes-on-the-component-that-renders-its-own-text)                     |
| `data-rosey-ns="undefined"` in the output; several items share one translation | Array items with no `_uuid` seeded                                                          | [Unseeded `_uuid`](#data-rosey-nsundefined-in-the-output)                                                                        |
| Browser tab and search snippet stay in the default language                    | Untagged `<head>` text, which Rosey copies verbatim onto generated pages                    | Tag it — [tagging.md § 3h](tagging.md#head-title-and-meta-description)                                                           |
| A split-by-directory post's translated title reverted to English               | The page was given head keys it must not have                                               | [Head keys on split pages](#a-split-by-directory-pages-translated-title-reverted-to-english)                                     |
| Edits save in the Visual Editor but silently never persist                     | A dotted `data-rosey` key                                                                   | [VE saves vanish](#edits-save-in-the-visual-editor-but-never-persist)                                                            |
| A markdown region is permanently stale and its bold/links are uneditable       | Missing or mismatched `data-type`, or a non-rich bound input                                | [Markdown staleness](#a-markdown-field-is-permanently-stale-and-its-formatting-is-uneditable)                                    |
| `base.json` originals contain `<svg`, `<!--bookshop-live-->`, or nested markup | `data-rosey` on a wrapper holding more than text                                            | [Mixed children](#mixed-text--non-text-children--tag-only-the-text)                                                              |
| An icon still renders twice after you moved the tag onto an inner `<span>`     | Locale files still hold the polluted `value`                                                | [Delete and reseed](#moving-a-tag-on-an-already-translated-site-needs-a-delete-and-reseed)                                       |
| A locale page's keys don't match any locale entry (`fr/blog/my-post:*`)        | The root was derived from the prefixed URL                                                  | [Split-by-directory root alignment](#split-by-directory-pages-derive-the-wrong-rosey-root)                                       |
| The French tag page lists English posts                                        | An ambient content query that isn't scoped to one locale                                    | Scope every query — `SKILL.md` Phase 8                                                                                           |
| Links on `/fr/` jump back to English; `/fr/feed.xml` 404s                      | Split-by-directory pages don't get Rosey's link rewriting                                   | [Internal links on split pages](#links-on-a-split-by-directory-locale-page-go-to-the-wrong-language)                             |
| The locale picker's links 404, or the wrong item is highlighted                | Picker doesn't match the URL mode, or is missing `data-rosey-ignore`                        | [The locale picker](#the-locale-pickers-links-are-broken-or-mis-highlighted)                                                     |
| CloudCannon can't find `rosey/locales/*.json`; "Missing data_config" warnings  | A `source` key in `cloudcannon.config.yml`                                                  | [`source` breaks locale resolution](#cloudcannon-cant-reach-roseylocales)                                                        |
| A source post was edited after translating, and later runs skip it forever     | Part 2's classification is binary — no stale state                                          | [Silently skipped forever](#a-split-by-directory-file-is-skipped-on-every-later-translation-run)                                 |

## `data-rosey-ns="undefined"` in the output

**Cause:** array items whose `_uuid` was never seeded. CloudCannon populates `_uuid` only when an item is _created_, so content that predates the input keeps rendering `undefined`.

**Why it's worse than a cosmetic bug:** `undefined` is not unique. Every unseeded item on the page shares the namespace, so their keys collide and they all receive the same translation.

**Fix:** run the seeding pass in [tagging.md § Seeding `_uuid` into existing content](tagging.md#seeding-_uuid-into-existing-content-rcc-layer), then rebuild and re-run `rosey generate` + `write-locales`.

**Common miss:** the seeding pass anchors on a discriminator key (`_component`/`_name`/`_bookshop_name`), so array items that carry text but have no discriminator — counters, icon lists, image `alt` values — are skipped silently and still render `undefined`. Grep the built output for `data-rosey-ns="undefined"` rather than trusting the pass.

## A split-by-directory page's translated title reverted to English

**Cause:** the page was given head keys (`data-rosey` on `<title>`). Its head already comes from its own translated frontmatter, so the key is a second source of truth — and Rosey's wins.

```
frontmatter:      Édition en Markdown | Starter
rosey fr.json:    TRADUCTION | Starter
built /fr/ page:  TRADUCTION | Starter     ← frontmatter translation is now dead
```

With the key _untranslated_ Rosey leaves the existing text alone, so this stays invisible until someone translates that key. Worse, one key used on both `/blog/x/` and `/fr/blog/x/` **silently collapses to a single entry** with one `original` — the default-language one.

**Fix:** remove the head keys from split-by-directory post pages and delete the orphaned keys from every locale file. Make head keys opt-in per page, never a layout-wide default ([tagging.md § Which pages need head keys](tagging.md#which-pages-need-head-keys)).

**Common miss:** a _listing_ route that reads its title from the shared default-language entry **does** still need keys. Triage by where the head text comes from, not by whether the page is per-locale.

## Edits save in the Visual Editor but never persist

**Cause:** the `data-rosey` key contains a `.` — usually auto-derived from a nested `data-prop` (`price.prefix`).

**Why:** the connector saves with `slug: "<key>.value"`, so a dotted key resolves to a nested path that doesn't exist and the write is dropped. There is no error. Rosey's build-time substitution matches the whole key string, so the **translated site still renders correctly** — only saving is broken.

**Fix:** sanitise `.` to `_` in the key derivation ([tagging.md § 3f](tagging.md#sanitise-dots-out-of-derived-keys-rcc-layer)), rebuild, and re-run `rosey generate` + `write-locales`. Old dotted keys are orphaned and cleaned up automatically.

**Common miss:** `data-rosey-attrs` (the comma-separated form) also emits dotted keys legitimately. If you see one, check whether it came from there before hunting for a derivation bug — and switch that element to `data-rosey-attrs-explicit`, which the skill requires.

## A markdown field is permanently stale and its formatting is uneditable

**Cause:** the region is missing a `data-type`, has one that doesn't match how the markdown was rendered, or its bound CloudCannon input doesn't resolve to a rich type (`markdown`/`html`).

**Why:** CloudCannon stores the raw markdown source while Rosey captured the rendered HTML. The two can never match, so the entry shows as out of date on every build, and the editor has no rich input to edit the formatting with.

**Fix:** set both, per [tagging.md § Markdown regions](tagging.md#markdown-regions-need-a-matching-data-type-and-a-rich-bound-input-rcc-layer) — `md.render` → `data-type="block"`, `renderInline` → `data-type="text"`, and a `markdown` or `html` input on the bound field.

**The fix is not retroactive.** Existing entries stay stale until the value is touched, or until you rebuild and re-run `rosey generate`.

**Common miss:** a rich field passed through a **slot** bypasses the markdown render entirely, so no `data-type` value is correct — restructure so the component renders the field itself.

## Mixed text + non-text children — tag only the text

**Cause:** a `data-rosey` element whose contents are more than text — icons, SVGs, nested components, Bookshop includes.

**Why:** the markup is captured into the source (`base.json` fills with icon `<span>`s, `<!--bookshop-live-->` comments, SVGs) and then, **on translated locales only**, rendered **twice**: Rosey injects the stored `innerHTML` (which contains the icon) into the element while the template still renders the icon as a sibling. The default locale looks fine because Rosey doesn't inject there.

**Fix:** wrap just the text in an inline `<span data-rosey="...">` and move the tag onto it. Then adjust the parent's layout for the extra inline element — a `flex`/`gap` parent usually needs no change, but a parent that relied on the text being a bare text node (an inline `<label>` with a trailing `<span class="required">*</span>`, a button with `justify-content: space-between`) will shift.

```html
<!-- before: captures the SVG -->
<a data-rosey="cta_text" href="/signup">Get Started <svg>…</svg></a>

<!-- after -->
<a href="/signup"><span data-rosey="cta_text">Get Started</span> <svg>…</svg></a>
```

**Common miss:** on an already-translated site, moving the tag doesn't clear the polluted value — see the next section.

## Moving a tag on an already-translated site needs a delete-and-reseed

**Cause:** editing where a `data-rosey` tag sits does not fix existing locale files.

**Why:** keys are name-based, not content-hashed, so the moved tag keeps the same key ID. `write-locales` then refreshes `_base_original` (now clean) but preserves `value` (old, polluted) — the amber "out of date" badge shows, but the stale `value` keeps injecting the doubled icon.

**Fix:** delete the affected keys from every `rosey/locales/*.json`, then rebuild in this order:

```bash
npm run build
npx rosey generate --source dist
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist
```

With the keys absent, `write-locales` reseeds `value` from the now-clean `original` (text only). Those entries show as untranslated afterward — expected, since the old values were never real translations.

**Common miss:** this works _because_ keys survive the tag move. If keys were content-hashed, the move would mint new keys and orphan the old ones — a different cleanup (see `SKILL.md` Appendix B's remap).

## Split-by-directory pages derive the wrong Rosey root

**Cause:** a page built at `/fr/blog/my-post/` derives root `fr/blog/my-post`, which won't match locale entries keyed `blog/my-post:*`.

**Fix:** pass a `roseyRoot` override that strips the locale prefix, so locale pages use the English-equivalent path (`blog/my-post`). Deriving from the template's source identity ([tagging.md § 3e](tagging.md#3e-derive-the-root-from-the-templates-source-identity)) makes this nearly free — the rewrite `blog_fr/my-post` → `blog/my-post` satisfies it directly.

## Links on a split-by-directory locale page go to the wrong language

**Cause:** Rosey rewrites internal links only on the pages **it** generates. Split-by-directory pages already exist at the locale URL, so their links pass through untouched and point back at the default language.

**Fix:** prefix internal links yourself in those templates, with two guards:

| Guard                                      | Why                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| **Skip paths with a file extension**       | `/feed.xml` and `/sitemap.xml` are emitted once at the root; prefixing them 404s.     |
| **Don't prefix on default-language pages** | The same shared template renders `/blog/x/` too, and prefixing there double-prefixes. |

For reference, Rosey's own rewriting covers root-relative `<a href>` values on generated pages, and leaves extensioned paths, `<link rel="stylesheet">` hrefs, and `import()` strings alone.

## The locale picker's links are broken or mis-highlighted

Three separate causes:

- **Links to locale URLs get double-prefixed.** Every picker `<a>` needs `data-rosey-ignore` — without it, Rosey rewrites the "switch to default language" link on generated pages and breaks it.
- **The active item is wrong.** Build-time HTML always reflects the default-language perspective, so the highlight needs a small client-side script.
- **Links 404.** The picker must match the Phase 1 step 5 URL mode. In all-languages-prefixed mode the default language lives under `/{defaultLang}/`, so its link must be prefixed too and path parsing must treat the default code as a locale segment; otherwise the default-language link points at `/`, which serves only the redirect page.

See the SSG-specific file for a working picker.

## CloudCannon can't reach `rosey/locales/`

**Cause:** a `source` key in `cloudcannon.config.yml`. With `source: src`, all `data_config` / `collections_config` / `paths` / `file_config` paths resolve relative to it, and CloudCannon cannot reach root-level `rosey/locales/` — there is no `../` support.

**Fix:** remove `source` and prepend its value to the affected paths. Leave `schemas.*.path` alone (root-relative). `npx rosey-cloudcannon-connector init` does this automatically.

**Common miss:** the stock CloudCannon Eleventy starter ships `source: src`, so effectively every Eleventy site built from it hits this. Also check the paths `init` doesn't rewrite — re-read the config it produced and confirm every `source`-relative path moved.

## A split-by-directory file is skipped on every later translation run

**Cause:** you edited the source-language post _after_ its locale copy was translated. [`translate-multilingual`](../translate-multilingual/SKILL.md) Part 2 classifies a file as either untranslated or already-translated — the classification is **binary**, with no stale state and no amber badge.

**Why it's silent:** the locale copy still differs from source, so it stays classified "already translated" and every later run skips it. The Part 1 locale JSON _does_ have staleness detection; Part 2 does not.

**Fix:** re-translate that file explicitly, or diff it against the source file to find what changed. Prevention: finish source-copy edits **before** translating.
