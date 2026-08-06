# Translation Scripts

The mechanical half of translation — classification, translation memory, merging, validation — automated so the AI only does the translating. Each part of the skill is a prepare → translate → merge loop; these scripts are the first and last step of each.

Run them with `node` from the project root. Paths below assume the skills were copied to `skills/` — adjust if this skill lives under `.agents/skills/`, `.cursor/skills/`, or a plugin directory. Every script supports `--help`.

## Part 1: Rosey locale files

### `prepare-translation.mjs`

Reads `rosey/locales/<code>.json`, classifies every entry as untranslated / stale / current, and writes a slim task file containing only the work. Builds a translation memory from already-translated entries and auto-applies exact matches straight back to the locale file, then picks tone/register examples for the AI to match.

```bash
node skills/translate-multilingual/scripts/prepare-translation.mjs --locale fr
```

| Flag                  | Meaning                              |
| --------------------- | ------------------------------------ |
| `-l, --locale <code>` | Locale code (required)               |
| `-s, --source <dir>`  | Rosey directory (default: `rosey`)   |
| `-o, --output <path>` | Task file output path                |
| `-e, --examples <n>`  | Number of tone examples (default: 5) |

### `merge-translation.mjs`

Merges the `value` fields from the task file back into the full locale file, sets `original = _base_original` on stale entries to clear the stale flag, and validates that HTML in translated values still matches the original.

```bash
node skills/translate-multilingual/scripts/merge-translation.mjs --locale fr
```

| Flag                  | Meaning                            |
| --------------------- | ---------------------------------- |
| `-l, --locale <code>` | Locale code (required)             |
| `-s, --source <dir>`  | Rosey directory (default: `rosey`) |
| `-i, --input <path>`  | Task file path                     |
| `--dry-run`           | Print changes without writing      |

## Part 2: Split-by-directory content collections

### `prepare-content-translation.mjs`

Compares a source content directory against its locale counterpart and writes a task manifest of the files needing translation, with translatable frontmatter paths and body content extracted and structural fields skipped.

```bash
node skills/translate-multilingual/scripts/prepare-content-translation.mjs \
  --source-dir src/content/blog \
  --locale-dir src/content/blog_fr \
  --locale fr
```

| Flag                  | Meaning                                               |
| --------------------- | ----------------------------------------------------- |
| `--source-dir <dir>`  | Source content directory (e.g. `src/content/blog`)    |
| `--locale-dir <dir>`  | Locale content directory (e.g. `src/content/blog_fr`) |
| `-l, --locale <code>` | Locale code (required)                                |
| `-o, --output <path>` | Task manifest output path                             |

### `merge-content-translation.mjs`

Patches translated frontmatter back into the YAML (preserving structural fields and formatting), replaces body content, validates frontmatter integrity, and deletes the manifest on success. Review anything it warns it couldn't patch.

```bash
node skills/translate-multilingual/scripts/merge-content-translation.mjs \
  --input src/content/.translation-task-fr-content.json
```

| Flag                 | Meaning                       |
| -------------------- | ----------------------------- |
| `-i, --input <path>` | Task manifest path (required) |
| `--dry-run`          | Print changes without writing |
