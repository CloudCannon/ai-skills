# Verifying RCC in the Visual Editor

`window.inEditorMode` is true inside the dev server's Visual Editor, so RCC runs
exactly as it does on a hosted site. Everything below can be checked locally.

For what RCC _should_ do, see
[make-site-multilingual](../make-site-multilingual/SKILL.md). This file is only
about observing it.

## The checklist

[check-rcc.mjs](scripts/check-rcc.mjs) runs all of this. Read it and copy from
it when checking something it does not cover.

```sh
node scripts/ve-open.mjs --path src/pages/index.md --collection pages --url /en/
node scripts/check-rcc.mjs --locale fr --expect fr,de
```

| #   | Check                                                         | Fails when                                   |
| --- | ------------------------------------------------------------- | -------------------------------------------- |
| 1   | `/_rcc/locales.json` returns 200                              | The manifest was stripped from the build     |
| 2   | `window.inEditorMode` is true                                 | Not actually in the Visual Editor            |
| 3   | `#rcc-locale-switcher` exists                                 | The client never initialised                 |
| 4   | `[data-rosey]` elements present                               | Nothing on the page is translatable          |
| 5   | The popover lists every expected locale                       | A locale is missing from the manifest        |
| 6   | Switching swaps the content                                   | Locale files are empty, or keys do not match |
| 7   | `html[data-rcc-locale-active]` is set                         | The locale view did not engage               |
| 8   | `[data-rcc-translation-root]` exists                          | The container swap failed                    |
| 9   | RTL locales set `dir="rtl"`                                   | RTL handling regressed                       |
| 10  | Switching back removes the marker and leaves no orphaned root | Restore is leaking state                     |

## Check 1 first, always

**A 404 on `/_rcc/locales.json` silently disables the switcher.**
**Why:** with no manifest there are no locales, so RCC initialises and then does
nothing. The page looks like a broken editor rather than a missing file, and
this is the single most common RCC failure.

The manifest is written by `rosey-cloudcannon-connector write-locales`. It goes
missing when the postbuild does not override Rosey's default `--exclusions`,
which strips JSON:

```sh
npx rosey build --source _untranslated_site --dest _site \
  --default-language en --exclusions "\.(html?)$"
```

Check it without a browser at all:

```sh
node scripts/dev-status.mjs --check /_rcc/locales.json
```

## `data-rcc-locale-active` is boolean

**MUST assert presence, not value.**
**Why:** it is set with `toggleAttribute`, so it is present or absent and never
carries the locale code. `getAttribute(...) === "fr"` always fails, which reads
as a locale-switching bug when nothing is wrong.

Read the active locale from `[data-rcc-translation-root]` instead.

## Addressing translatable elements

`[data-rosey]` elements that are not also editable regions are indexed under a
`rosey:` prefix so they can never collide with a data path:

```sh
node scripts/ve-components.mjs --rosey
# rosey:button_text:3   rosey   rosey=button_text   "GitHub"
# content_blocks.0.heading.heading_text  text  rosey=heading  "…"
```

Duplicate Rosey keys across a page are normal — the same `heading` key appears
once per block. They get occurrence numbers (`rosey:heading:2`). Editing one
instance should update its siblings; check with two `ve-query.mjs` calls before
and after.

## Proving a translation was written

An edit in a locale view must patch `.value` and leave `original` and
`_base_original` alone:

```sh
node scripts/read-file.mjs rosey/locales/fr.json --key "footer:blog"
# { "original": "Blog", "value": "Blog", "_base_original": "Blog" }

node scripts/watch-writes.mjs --timeout 30 --until rosey/locales/fr.json &
# …edit the element in the locale view…
node scripts/read-file.mjs rosey/locales/fr.json --key "footer:blog"
```

Locale keys are namespaced with a colon and may contain dots, so pass the whole
key as one string rather than treating it as a dotted path.

## Stale translations

The stale UI has its own ids — `#rcc-stale-badge`, `#rcc-stale-status`,
`#rcc-stale-panel` (which contains "Mark all as reviewed"). To check stale
handling, make a source string diverge from `_base_original`, rebuild, reopen
the editor, and assert the badge count and that the panel lists the element.

## Two delivery paths

RCC reaches the browser differently depending on the SSG, and both should be
checked:

| Path        | Sites                  | Client arrives via                                           |
| ----------- | ---------------------- | ------------------------------------------------------------ |
| Bundled     | Astro                  | A bare `import("rosey-cloudcannon-connector")` in the layout |
| Non-bundled | Eleventy, Hugo, Jekyll | `install-client` copies `/_rcc/client.mjs`, loaded by URL    |

For the non-bundled path also confirm the file is served:

```sh
node scripts/dev-status.mjs --check /_rcc/client.mjs --check /_rcc/locales.json
```
