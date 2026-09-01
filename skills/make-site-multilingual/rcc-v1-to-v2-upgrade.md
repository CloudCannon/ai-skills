# Upgrading from RCC v1 to v2

A distinct, mostly self-contained path for sites already running RCC v1 (form-based YAML editing, `generateRoseyId`, `data-rosey-tagger`). Follow this **instead of** [setup.md](setup.md), not alongside it.

Use this when the site already runs RCC **v1** (form-based Data Editor with YAML files). Both versions use the npm name `rosey-cloudcannon-connector`. This is a distinct path from the main workflow — follow it end to end.

**Prerequisites:** the site is on RCC v1 (`rosey-cloudcannon-connector@^1.x`), builds to static HTML, and its `rosey/locales/*.json` are up to date (run a final v1 build if unsure).

## B1. Audit the v1 setup

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

## B2. Update dependency and postbuild

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

## B3. Update CloudCannon config

Remove the `collections_config.translations` entry (pointed at `rcc.yaml` / `translations/**`). Add `data_config` entries per locale (`locales_{code}`, same codes as the v1 `rcc.yaml`). Optionally add the browsable `locales` collection (see main Phase 5d). Update `collection_groups` to reference `locales` instead of `translations`.

## B4. Add the client-side script and boundary

v1 had no client-side component. Add the RCC import and (if nav/footer are translatable) the `data-rcc` boundary — see main Phase 5a/5b.

## B5. Replace `generateRoseyId` with static keys

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

## B6. Fix locale picker links

Add `data-rosey-ignore` to the picker's `<a>` tags (v1 didn't need this — it had no client-side URL rewriting).

## B7. Clean up v1 artifacts

Delete `rosey/rcc.yaml`, `rosey/translations/`, `rosey/smartling-translations/`, `rosey/outgoing-smartling-translations.json`. Remove `declare module 'rosey-cloudcannon-connector/utils'` from `env.d.ts`.

**Keep:** `rosey/base.json`, `rosey/locales/*.json` (your translations), and `rosey/base.urls.json` / `rosey/locales/*.urls.json` — these are **native Rosey** URL-translation files consumed by `rosey build`, not RCC artifacts. v2 has no UI for editing them, but **do not delete them** if they hold translated URLs.

## B8. Remap translation keys

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

## B9. Verify

Run the full Phase 6 sequence, including the **6a assertions** and the translated-page read. Upgrade-specific checks:

- **No key remains that only exists in a locale file.** After the remap and after dropping `--keep-unused`, any locale key absent from `base.json` is an orphan whose translation is dead.
- **Spot-check a key that v1 derived from content.** Its `value` should have survived the remap onto the new static key — matching by `original` is the only link between them, so a collision (two old keys sharing one original) will have picked the wrong one.
- **`git diff rosey/base.json`** should show keys renamed, not lost: the count before and after the upgrade ought to be comparable. A large drop means `data-rosey-tagger`'s per-element keys were replaced by one block-level key without anyone deciding to do that ([see the trade-off](#gotchas)).

Then push to CloudCannon, confirm the locale-switcher FAB appears, switch locale, make an edit, and confirm it survives a reload.

## Gotchas

- **Key remapping is the biggest risk.** Back up locale files first. Matching by `original` text fails when two old keys share the same original (`common:Blog` and `blog:Blog` both `"original": "Blog"`) — review collisions by hand.
- **`--keep-unused` is required for the first build.** Otherwise `write-locales` deletes the old keys before you can remap them.
- **`data-rosey-tagger` removal is a trade-off.** v1 tagged individual elements inside rendered markdown; v2 wraps the block in one `data-rosey`. For large bodies, prefer split-by-directory (Phase 8).
- **Nav/footer `data-rosey-ns`.** The v1 starter uses `data-rosey-ns="common"`; preserve that namespace when replacing `generateRoseyId`, or keys collide across pages.
- **`_base_original` distinguishes live from orphaned keys** — every key in `base.json` gets it after `write-locales`, making cleanup scriptable.
- **`*.urls.json` are native Rosey, not RCC** — don't delete them; v2 has no UI for URL translations, so edit them manually.
- **`write-locales` auto-detection and `.urls.json`.** Older builds could mis-detect `fr-FR.urls` as a locale and warn "Missing data_config". Fixed in v2 by filtering `*.urls.json`; on older builds pass `--locales` explicitly.

---
