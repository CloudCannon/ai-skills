# Reference: observed routes, selectors and DOM shapes

Everything here was observed on a running system rather than read from docs.
The CloudCannon app is served from a CDN and is **not versioned with the CLI**,
so treat this file as expected to drift and re-verify when something stops
resolving.

| Observed on        | Version                                                                               |
| ------------------ | ------------------------------------------------------------------------------------- |
| `@cloudcannon/cli` | 0.0.14                                                                                |
| Chrome             | 151.0.7922.76                                                                         |
| Sites              | `jetstream-multilingual-demo` (Astro 5), `eleventy-multilingual-starter` (Eleventy 3) |
| Date               | 2026-08-07                                                                            |

The Astro site is the richer reference — 129 regions against 19, both markup
forms, `source` regions, and 30 `_inputs` blocks. Prefer it when verifying
anything general; the Eleventy site is the RCC/multilingual reference.

## Routes

```
/                                             the SPA shell (CDN-loaded app)
/app/assets/e2e/omnipage/editor.html          Visual Editor host
/__api/details|megafile|events|file/*         API
/__api/upload/*|move_path|delete_path         API (POST)
/__source/<path>                              raw source
/__output/<path>, or any unmatched path       built output
```

Hash routes:

```
#sites/<id>/dashboard
#sites/<id>/collections/<key>
#sites/<id>/browser
#sites/<id>/collections/<key>:/edit?collection=<key>&path=<%2Fsrc%2F...>&schema=default&editor=visual&url=<%2Fen%2F>
```

The site id was `7`. It is not a constant — discover it from
`a[href^="#sites/"]`.

## Frame chain

```
top                http://localhost:10101/#sites/7/collections/pages:/edit?...
└── editor-iframe  http://localhost:10101/app/assets/e2e/omnipage/editor.html#/__source/_site/en/index.html?editor=visual&iframeIdentifier=<uuid>
    └── editor-iframe  about:blank        ← the site DOM lives here
```

Both inner frames report `name === "editor-iframe"`; the site is the **last**.
Both are same-origin and fully queryable.

## Editable region attributes, as seen in the DOM

From a hero block on the Eleventy starter:

```html
<div
  data-editable="array"
  data-prop="content_blocks"
  data-component-key="_type"
  data-id-key="_uuid"
>
  <div
    data-editable="array-item"
    data-prop="0"
    data-length="4"
    data-component="components/hero"
    data-id="8b6c6715-bec1-4872-a9cd-0f56b06d301e"
  >
    <h1 data-editable="text" data-prop="heading.heading_text" data-rosey="heading" data-type="span">
      …
    </h1>
    <div
      data-editable="text"
      data-prop="subheading.markdown_content"
      data-rosey="subheading"
      data-type="block"
    >
      …
    </div>
    <div data-editable="array" data-prop="buttons" …>
      <div
        data-editable="array-item"
        data-prop="1"
        data-component="components/buttons/secondary"
        data-id="cd883c9e-…"
      >
        <span data-rosey="button_text">CloudCannon</span>
      </div>
    </div>
  </div>
</div>
```

Notes:

- `data-prop` is relative at every level; `data-length` appears on array items.
- `data-type` is `span` or `block`, matching the markdown region rules.
- A `[data-rosey]` element need not be an editable region (`button_text` above).
- The Eleventy site used **zero** `data-cms-bind`, zero `<editable-*>` elements
  and zero bookshop comments. The Astro site uses **both** markup forms
  (`data-editable="array-item"` alongside `<editable-array-item>`,
  `<editable-component>`, `<editable-text>`) plus `data-editable="source"`, so
  those paths are exercised. **Bookshop comment ranges remain unverified** — no
  site checked so far emits them.

## Regions in the CloudCannon editor

| Behaviour           | Detail                                                                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wiring              | CloudCannon sets `contenteditable` on text regions **up front**, not on click. A text region without it was never wired — a static check, no interaction needed                                                            |
| Clicking            | The count of `contenteditable` elements never changes on click; focus landing inside the region is the signal that it took the click                                                                                       |
| `display: contents` | Component wrappers use it constantly and it nests. Such an element has no box at all, so `getBoundingClientRect()` reports 0×0 while its content renders and clicks fine. Measure with a `Range` over the contents instead |
| Binding             | Any kind may bind through `data-prop-*` rather than `data-prop` — a component wrapper commonly carries `data-prop-<slot>` (e.g. `data-prop-sections="pageSections"`) and no `data-prop` at all                             |

## Inputs sidebar (app frame)

| Element                                         | Role                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `c-data-editor-block`                           | One input. Nesting mirrors the data shape                                                  |
| `label.c-label.js-block-label`                  | The input's label                                                                          |
| `label[for]` → `getElementById`                 | The only reliable label→control pairing; the control is a sibling, not a child             |
| `.c-card--clickable`                            | An array item, titled with the structure it matched                                        |
| `.yaml-child-view-container`                    | A drill-down view. Navigating in **adds** a view rather than replacing the parent's blocks |
| `.c-select` / `button[aria-haspopup="listbox"]` | A select input — rendered as a button, so tag name alone reports it as `button`            |

Nested inputs do not exist in the DOM until you navigate into their group.

## RCC DOM

Stable ids injected by `rosey-cloudcannon-connector` 2.0.1:

| Id                                                          | What                                            |
| ----------------------------------------------------------- | ----------------------------------------------- |
| `#rcc-locale-switcher`                                      | The floating action button                      |
| `#rcc-locale-popover`                                       | The locale menu; text read `LocaleOriginalFRDE` |
| `#rcc-fab-badge`, `#rcc-fab-caret`                          | FAB decorations                                 |
| `#rcc-stale-badge`, `#rcc-stale-status`, `#rcc-stale-panel` | Stale UI                                        |
| `#rcc-hide-controls`                                        | Injected `<style>`                              |

On `<html>` during a locale view: `data-rcc-locale-active` — a **boolean**
attribute set with `toggleAttribute`, so it is present-or-absent and never holds
the locale code. The swapped container carries `data-rcc-translation-root`.

`window.inEditorMode` is `true` inside the dev server's Visual Editor, so RCC
activates normally — the local dev server is a faithful environment for it.

## Behaviours worth knowing

| Behaviour            | Detail                                                                              |
| -------------------- | ----------------------------------------------------------------------------------- |
| Directory requests   | Return **500**, not 404. `/en/` fails; `/en/index.html` works                       |
| File API fields      | `content`, `file_size`, `last_modified`                                             |
| Save granularity     | A one-field edit rewrote the whole frontmatter block (14 insertions / 15 deletions) |
| App-initiated writes | Not echoed back on the SSE stream; UI edits are                                     |
| Editing              | Re-renders the subtree, detaching elements and any stamped attributes               |
| Rosey locale keys    | Namespaced with `:` and may contain `.` (`footer:blog`), so not dotted paths        |

## Timings

| Step                              | Headed, small site |
| --------------------------------- | ------------------ |
| SPA boot                          | 5–8s               |
| Open a page in the Visual Editor  | 8–12s              |
| Edit committed to disk after blur | 1–3s               |
