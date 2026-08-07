# Addressing a component

The hard part of checking work in the Visual Editor is naming the thing you want
to look at. A component is usually somewhere inside a nested array, its markup
differs per site, and CSS selectors break the moment layout changes.

Every `ve-*` script therefore takes an **address** instead of a selector.
Addresses come from [ve-components.mjs](scripts/ve-components.mjs) — run it
first, copy an address out, pass it to anything else.

```sh
node scripts/ve-components.mjs
# content_blocks.0.buttons.1   array-item   components/buttons/secondary
node scripts/ve-screenshot.mjs --path content_blocks.0.buttons.1 --out button.png
```

## The region model

A **region** is one addressable thing, normalised across the systems that
produce one. Scripts operate on regions, so none of them care which system a
component came from — and a single site can mix all three.

| Source                                     | Marked up as                                                                                                | Resolves to                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------ |
| CloudCannon editable regions               | `[data-editable="text\|image\|array\|array-item\|component\|source"]`                                       | Element subtree                |
| CloudCannon editable regions, element form | `<editable-text>`, `<editable-image>`, `<editable-component>`, `<editable-array-item>`, `<editable-source>` | Element subtree                |
| Rosey                                      | `[data-rosey]` that is not also a region                                                                    | Element subtree                |
| Bookshop                                   | `<!--bookshop-live ...-->` marker pair                                                                      | **Node range**, not an element |

**MUST index both markup forms.** `<editable-component>` is equivalent to
`<div data-editable="component">`.
**Why:** matching only `[data-editable]` silently misses every component on a
site that uses the element form — the page looks like it has no components
rather than like something failed. The full attribute reference lives in
[cloudcannon-visual-editing/editable-regions.md](../cloudcannon-visual-editing/editable-regions.md).

**Rosey elements are indexed separately.** RCC creates its own inline editors for
`[data-rosey]`, so a translatable element need not be a CloudCannon region at
all. Without indexing these, the elements RCC actually operates on would have no
address.

## Paths are composed, not read

**`data-prop` is relative to its enclosing region, never the absolute path.**

On a real hero block:

| Element           | `data-prop`            |
| ----------------- | ---------------------- |
| array wrapper     | `content_blocks`       |
| array item        | `0`                    |
| heading inside it | `heading.heading_text` |

The absolute path `content_blocks.0.heading.heading_text` exists nowhere in the
DOM — it is only the join of every `data-prop` from the root down.
`collectRegions` composes it by walking ancestors.

**Why it matters:** reading `data-prop` off an element and treating it as a path
gives you `0`, which addresses nothing. This is the single easiest thing to get
wrong here.

## Address forms

All of these are accepted by every `ve-*` script.

| Form                     | Example                                 | Resolves via                                                                                                          |
| ------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `--path`                 | `--path content_blocks.0.buttons.1`     | The composed data path. **Primary form** — it is the CMS's own address and matches the key path in the inputs sidebar |
| `--path` (Rosey)         | `--path rosey:button_text:3`            | Rosey keys, namespaced so they can never collide with a data path                                                     |
| `--selector`             | `--selector ".hero h2"`                 | Plain CSS, when you genuinely want markup                                                                             |
| `--component` / `--kind` | `--component hero`, `--kind array-item` | Filters on `ve-components.mjs` for finding an address                                                                 |

### Disambiguation

A path alone is not always unique, so addresses are qualified in two steps:

- `content_blocks.0#array-item` and `content_blocks.0#image` — an image region
  nested directly in an array item has no `data-prop` of its own, so it composes
  to the **same path** as the item. The `#kind` suffix separates them, and is
  only added when the clash is between different kinds.
- `rosey:button_text:3` — repeats of one kind get an occurrence number.

## Identity: prefer `data-id` over index

Array items carry `data-id`, whose value is the field named by the wrapper's
`data-id-key` (usually `_uuid`):

```
data-editable="array-item"  data-prop="1"  data-id="cd883c9e-…"  data-component="components/buttons/secondary"
```

`content_blocks.0.buttons.1` is positional and moves when items are reordered.
When checking behaviour across a reorder, match on `id` from
`ve-components.mjs --json` instead. This is also why array wrappers declaring
`data-id-key: _uuid` matter — see
[rosey-index-key degradation](../make-site-multilingual/troubleshooting.md).

## Special cases

**`source` regions carry `data-path` + `data-key`, not `data-prop`.** They edit a
whole raw file rather than frontmatter, so they have no frontmatter path to
compose. `ve-components.mjs` reports them as `filePath` / `fileKey`.

**Bookshop instances have no host element.** They are delimited by comment
pairs, so a region resolves to the nodes _between_ the markers. Scripts handle
this: screenshot clips to the union box, tree lists the markers separately,
click targets the first interactive descendant. `ve-tree.mjs` prints bookshop
markers below the outline rather than inside it, because comments are not
children.

## Addresses do not survive an edit

**MUST re-resolve an address after any mutation.**
**Why:** editing re-renders the component subtree. The element is replaced, and
the `data-cc-addr` stamp that `collectRegions` applied goes with it — a locator
held across an edit resolves to nothing. `ve-type.mjs` re-resolves before
reporting the new value for exactly this reason.

This is also why typing is done with one `insertText` rather than key-by-key: a
per-keystroke re-render detaches the element after the first character, and the
edit silently dies with one letter written.
