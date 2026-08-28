# Translating split-by-directory content collections

Part 2 of two. Translates per-locale content directories (`blog_fr/`, `blog_de/` …) — body content plus per-post frontmatter. Read [`SKILL.md`](SKILL.md) first to confirm which part applies.

**MUST:** do [locale-files.md](locale-files.md) as well. A split-by-directory page takes its body from here and its shared UI from the locale JSON.

Only needed if the project has per-locale content directories (e.g. `src/content/blog_fr/`, `src/content/blog_de/`). These are MDX/MD files with YAML frontmatter that the SSG renders natively per locale.

## The clean boundary with Part 1

On a split-by-directory page, the two systems never touch the same element:

- **Content collection files (Part 2):** body content and post-specific frontmatter (title, heading, description, image alt). Rendered natively from the locale file. These have **no** `data-rosey` attributes — adding `data-rosey` to content already translated via a collection would create two systems fighting over one element.
- **Rosey locale JSON (Part 1):** shared UI in layout/component templates — header, footer, nav, breadcrumbs, sidebar headings like "Recent Posts". These use `data-rosey` because they're shared across pages and aren't in any post's frontmatter.

Rule of thumb: **frontmatter or body → content collection (Part 2); shared layout/component UI → Rosey (Part 1).** Fully translating a split-by-directory page needs both parts.

## Prerequisites

- Per-locale content directories exist (`src/content/blog_fr/`, `src/content/blog_de/`).
- A source-language directory with the same slugs exists (`src/content/blog/`).
- The user has said which locale(s) to translate.

## Workflow overview

Same prepare → translate → merge shape as Part 1, with content-specific scripts. If the scripts aren't available, use the **Manual Fallback** at the end of Part 2.

## Phase 2.1: Prepare

First identify the source and locale directories: look for `{collection}_{locale}/` dirs in the content dir (usually `src/content/`), and check `cloudcannon.config.yml` for per-locale collections or a locale config file (often `src/lib/locales.ts`).

Then, per locale collection:

```bash
node skills/translate-site/scripts/prepare-content-translation.mjs \
  --source-dir src/content/blog \
  --locale-dir src/content/blog_fr \
  --locale fr
```

The script:

- Compares each locale file against the source file with the same filename
- Marks files **untranslated** (frontmatter text + body still match source) vs **already translated** (skip)

> **MUST finish source-post edits before translating.** This classification is **binary** — there is no stale state and no equivalent of Part 1's `_base_original`. Edit a source post _after_ its locale copy is translated and the copy still differs from source, so it stays classified "already translated" and is **silently skipped on every later run**, with nothing flagging it. Remedy: re-translate that file explicitly, or diff it against its source file to find what changed. See [make-site-multilingual/troubleshooting.md](../make-site-multilingual/troubleshooting.md#a-split-by-directory-file-is-skipped-on-every-later-translation-run).

- Extracts **translatable frontmatter fields** (title, headings, descriptions, alt text) by dot-notation path
- Skips **structural fields** (dates, image paths, tags, booleans, CMS metadata, URLs)
- Writes a task manifest to `src/content/.translation-task-{code}-content.json`

Flags: `--source-dir <dir>` (required), `--locale-dir <dir>` (required), `--locale <code>` (required), `--output <path>`.

## Phase 2.2: Translate

For each file with `"status": "untranslated"` in the manifest:

**Frontmatter** — mirror `translatable_frontmatter` into a `translated_frontmatter` object with the same keys and translated values:

```json
{
  "translatable_frontmatter": {
    "title": "Visual Translation Editing with the RCC",
    "post_hero.heading": "Visual Translation Editing with the RCC",
    "seo.page_description": "How the Rosey CloudCannon Connector enables..."
  },
  "translated_frontmatter": {
    "title": "Édition visuelle des traductions avec le RCC",
    "post_hero.heading": "Édition visuelle des traductions avec le RCC",
    "seo.page_description": "Comment le Rosey CloudCannon Connector permet..."
  }
}
```

Translate: `title`, headings (`*.heading`, `*.subheading`), descriptions (`*.description`, `*.page_description`), image alt text (`*_alt`, `*.image_alt`, `*.featured_image_alt`), and any other human-readable text. The script already excluded CMS metadata (`_schema`, `_name`, `_uuid`), dates, image paths, tags, author names, URLs, booleans.

**Body** — if the manifest includes `body`, add `translated_body` with the translated markdown:

```json
{
  "body": "The Rosey CloudCannon Connector (RCC) is a client-side script...",
  "translated_body": "Le Rosey CloudCannon Connector (RCC) est un script côté client..."
}
```

Body rules:

- Preserve markdown formatting (bold, italic, links, lists, blockquotes)
- Keep link URLs unchanged — translate only link text, not `href`
- Keep code blocks in the source language (code examples, CLI commands, HTML snippets)
- Preserve MDX components — keep component syntax, translate only text inside
- Keep technical terms and product names (Rosey, CloudCannon, Bookshop)

**Match tone/register** with existing translations (Rosey locale JSON or other translated content) — same formal/informal and terminology consistency as Part 1.

Write the manifest back with `translated_frontmatter` / `translated_body` added.

## Phase 2.3: Merge

```bash
node skills/translate-site/scripts/merge-content-translation.mjs \
  --input src/content/.translation-task-fr-content.json
```

The script patches translated frontmatter into the YAML (preserving structural fields and formatting), replaces body content, validates frontmatter integrity, and deletes the manifest after a successful merge. Flags: `--input <path>` (required), `--dry-run`. Review any fields it warns it couldn't patch.

## Part 2 checklist

- [ ] Identify source and locale content directories
- [ ] Run `prepare-content-translation.mjs` per locale collection; review counts
- [ ] Translate all `translatable_frontmatter` (add `translated_frontmatter`)
- [ ] Translate body (add `translated_body`)
- [ ] Preserve markdown formatting, code blocks, link URLs, MDX components
- [ ] Match tone/register
- [ ] Write the manifest back; run `merge-content-translation.mjs`; check warnings
- [ ] Review the `git diff`

## Manual fallback (Part 2)

1. **Detect collections** — find `{collection}_{locale}/` dirs, a locale config file, or per-locale entries in `cloudcannon.config.yml`; the source collection is the one with no locale suffix.
2. **Classify files** — compare each locale file against the source file with the same slug. Untranslated = frontmatter text + body identical to source. Report counts.
3. **Translate** each untranslated file. Frontmatter: translate title/headings/descriptions/alt text; leave `_schema`/`_name`/`_uuid`, dates, image paths, tags, author names, URLs, booleans. Body: translate prose/headings/list items; preserve formatting, code blocks, link URLs, MDX components.
4. **Write back in place** — preserve exact YAML structure (field order, nesting, indentation), the file extension (`.mdx`/`.md`), any MDX imports, and a trailing newline.

## Edge cases

- **Tags/categories as slugs** (`rosey`, `visual-editing`) — used for URLs/filtering; do **not** translate.
- **Code blocks** (fenced ` ``` `) — stay in the source language.
- **Brand names in alt text** — translate the alt text but keep brand names.
- **Files with no source equivalent** — skip.
- **Partially translated files** — translate only the untranslated parts.
