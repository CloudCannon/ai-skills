# Visual Editing Reference

Pattern reference for editable region types, data paths, component re-rendering, and edge cases. Read this doc on demand when a checklist item links here — don't read it front to back.

Everything here is SSG-agnostic. For the region types, the full attribute table, and the custom-element equivalents, see [editable-regions.md](editable-regions.md). For the JavaScript API, see [editable-regions-internals.md](editable-regions-internals.md). For what differs in one stack, see that SSG's `visual-editing-reference.md` — Astro's is [astro/visual-editing-reference.md](astro/visual-editing-reference.md).

## Quick rules — read before adding regions

1. **Golden rule** — computed content needs an `<editable-component>` wrapper: [§Golden rule](#golden-rule--computed-content-needs-a-component-wrapper)
2. **Standalone wrapper placement** — `<editable-component>` at the call site, not self-marking on the section root: [§Registration placement](#where-does-the-registration-go--component-root-or-call-site)
3. **Frontmatter co-location** — one object key per registered component; no scattered root fields: [§Nested frontmatter](#scattered-fields-feeding-a-registered-component--nest-the-frontmatter)
4. **Editable-region completeness** — every `data-editable` region needs a matching `_inputs` entry.
5. **Shared-data handling** — `@data[key]` prop path, not `data-editable="source"`: [§Shared-data table](#shared-data--computed-content-handling)

## Golden rule — computed content needs a component wrapper

If a field contributes to rendering and the rendering involves any trigger below, extract the section into a registered component and wrap with `<editable-component data-component="<name>" data-prop="<prefix>">`. Primitive `data-editable="text"` updates DOM text only — it cannot re-run an expression.

| Trigger                              | Why a primitive fails                     |
| ------------------------------------ | ----------------------------------------- |
| Conditional / ternary text           | Primitive swaps text, not the branch      |
| Data-file lookup                     | Lookup runs at build; never re-resolves   |
| Icon / asset-path index              | Text swap leaves the looked-up path stale |
| Computed class binding               | Text swap doesn't change classes          |
| Templated HTML from a derived string | Text swap doesn't re-run the renderer     |

The trigger list is the same in every stack; only the syntax that produces the computation differs. See your SSG's reference for its own expression forms.

### Where does the registration go — component root or call site?

| Component is rendered…        | Emit registration as                                                                                                                        | Why                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Inside a page-builder array   | `data-editable="component"` on the component's own root element                                                                             | The `data-editable="array-item"` wrapper provides the parent editable that listener setup needs                             |
| Directly from a page template | `<editable-component data-component="<name>" data-prop="<key>">…</editable-component>` **at the call site**, component root as plain markup | No array-item ancestor exists; without the wrapper, sidebar-only changes (switches, dropdowns) don't propagate to re-render |

**MUST NOT** self-mark a standalone component on its own root element. Sidebar boolean toggles then fail to update live, because there is no array-item ancestor to anchor the region.

**MUST NOT** swap `data-prop` dynamically to follow a boolean branch:

```html
<!-- WRONG: a computed data-prop can't toggle a class-list branch -->
<span data-editable="text" data-prop="{inStock ? 'inStockLabel' : 'outOfStockLabel'}">…</span>
```

Render two complete branches instead, each with its own static `data-prop`.

## Editable type — pick one

| Field shape                                 | Editable type                                                | Section                                                                           |
| ------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Single string/text (frontmatter or body)    | `data-editable="text"` or `<editable-text>`                  | [Text editing](#text-editing)                                                     |
| Single image                                | `data-editable="image"` / `<editable-image>`                 | [Image editing](#image-editing)                                                   |
| Array of items (uniform)                    | `data-editable="array"` + `array-item` children              | [Array editing](#array-editing)                                                   |
| Page builder (heterogeneous blocks)         | `array` + per-item `data-component` + CRUD                   | [Page builder blocks](#page-builder-blocks)                                       |
| Conditional/computed output, style bindings | Register the component; wrap with `<editable-component>`     | [When to use a component editable region](#when-to-use-data-editablecomponent)    |
| Hardcoded string in a template              | `data-editable="source"` (last resort — prefer page-builder) | [Source editables for hardcoded content](#source-editables-for-hardcoded-content) |

Components that fetch, submit forms, or load third-party scripts need an editor-mode branch rather than a region type — see [Detecting the editor and skipping build-only logic](#detecting-the-editor-and-skipping-build-only-logic).

## Data-prop paths — pick one

`data-prop` paths resolve against the file being edited, not against the template's local variables. This is the grammar.

| Context                              | Syntax                    | Example                                           | Where it works                                                                                                             |
| ------------------------------------ | ------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Same file, frontmatter               | Relative key              | `data-prop="title"`, `data-prop="banner.title"`   | Default case.                                                                                                              |
| Same file, markdown body             | `@content`                | `data-prop="@content"` (with `data-type="block"`) | Blog bodies, rich-text body regions.                                                                                       |
| Shared data file (via `data_config`) | `@data[key].path`         | `data-prop="@data[call-to-action].title"`         | Reusable CTAs, testimonials. Key matches `data_config` entry.                                                              |
| Another content file by path         | `@file[/repo/path].field` | `data-prop="@file[/src/content/team/jane].name"`  | Cross-collection items on a listing page. Path must start with `/`.                                                        |
| Inside an `array-item`               | Relative (scope = item)   | `data-prop="title"` resolves to `items[N].title`  | Array children. Do NOT repeat the array's `@data[...]` prefix — see [Arrays inside data files](#arrays-inside-data-files). |
| Pass-through scope                   | Empty string              | `data-prop=""`                                    | Primitive regions only. Breaks `<editable-component>` (empty string treated as falsy).                                     |

**`data-prop-*` lowercases its key.** The suffix after `data-prop-` is read as `propName.substring(4).toLowerCase()`, so a camelCase field name does not survive — `data-prop-pubDate` looks for `pubdate`. Bind camelCase fields with `data-prop` on an object, or rename the field.

## Anti-patterns — MUST NOT

| Anti-pattern                                                                           | What breaks                                                                                      | Fix / see                                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Mix array items with non-array siblings under the same `data-editable="array"` wrapper | CloudCannon includes the siblings in the array and CRUD controls attach to the wrong elements    | [Don't mix array items with non-array siblings](#dont-mix-array-items-with-non-array-siblings)    |
| Pass `data-prop=""` (empty string) to `<editable-component>`                           | Web component treats empty string as falsy and silently skips binding                            | [Empty `data-prop` pass-through](#empty-data-prop-pass-through)                                   |
| Omit `data-component` on nested sub-arrays inside a registered component               | The parent component doesn't re-render when editors change sub-array items                       | [Sub-arrays within widget components](#sub-arrays-within-widget-components)                       |
| Hardcode section titles / buttons inside child components                              | Text isn't editable; editors have nowhere to change it                                           | [Section titles and buttons in child components](#section-titles-and-buttons-in-child-components) |
| Attach `data-editable` directly to a third-party component's output                    | The third-party component's rendered HTML may not accept `data-*` attributes where you need them | [Third-party component fields](#third-party-component-fields)                                     |
| Use build-time cross-collection lookups with a static child component                  | Sidebar changes don't trigger a re-render                                                        | [Component editables backed by data files](#component-editables-backed-by-data-files)             |
| Repeat the parent's `@data[...]` prefix on descendants                                 | Path resolves incorrectly                                                                        | [Arrays inside data files](#arrays-inside-data-files)                                             |
| Use indexed paths on nested array-item editables (`@data[footer].columns[0].heading`)  | Path escapes the item's scope; edits don't round-trip                                            | [Arrays inside data files](#arrays-inside-data-files)                                             |

## Guard optional fields

Every `data-editable` element must be conditionally rendered when its field can be null/undefined — CloudCannon inspects the resolved value at region initialization. Guards belong in the component that renders the element, including shared sub-components. See [structures.md § field completeness](../cloudcannon-configuration/structures.md) for the upstream fix.

### Shared sub-component editables inside page builders

When a shared component renders title/subtitle/tagline for many widgets, adding `data-editable` attributes there is correct — inside a page builder block, editables are scoped to the parent registered component, so `data-prop="title"` resolves to `content_blocks[n].title`.

**Prop alignment pitfall:** if the parent widget passes data through the shared component with a fallback (e.g. `subtitle` falling back to `description`), the editable targets the prop name (`subtitle`), not the fallback source (`description`). Content files must populate the field the editable targets — otherwise the editable binds to null while the visible text comes from the fallback field.

### Content-sourced objects and arrays are never falsy

Content YAML objects with all-null inner fields and empty arrays are truthy in JavaScript. Guard on meaningful inner fields (`image?.src &&`) and array length (`actions?.length > 0 &&`). See [structures.md § Guarding empty objects and arrays](../cloudcannon-configuration/structures.md#guarding-empty-objects-and-arrays-in-components) for the full pattern with examples.

Components that accept both a string and a structured object for the same slot need the string branch preserved when guards are tightened. See your SSG's reference for its own dual-shape idiom.

## Text editing

**Where to put text regions:**

- **Semantic or layout element** — when an existing element is the natural host (`<h1>`, `<p>`, `<li>`), add `data-editable="text"` and `data-prop="<path>"` to it directly.
- **Wrapper-only** — when extra markup exists only to host editable text, prefer `<editable-text>` over `<span data-editable="text">`: same behaviour, clearer intent, fewer clashes with generic `span` rules. See [editable-regions.md § Custom Element Equivalents](editable-regions.md#custom-element-equivalents).
- **Stay primitive when needed** — keep `<span data-editable="text">` when CSS or legacy markup already targets `span`.

For block-level rich text (paragraphs, headings, lists), add `data-type="block"`. The `@content` path targets the file's markdown body, not frontmatter:

```html
<div class="content" data-editable="text" data-type="block" data-prop="@content">…</div>
```

**Choosing `data-type` for HTML-rendered fields.** This applies to any field rendered as HTML, whether inserted directly or produced by a markdown parser. Keep the original element and don't add `data-type` unless there's a reason to. Two signals that `data-type="block"` is needed:

1. **The field's input config allows block-level content.** The CloudCannon input configuration (`_inputs` in `cloudcannon.config.yml` or schema files) is the source of truth for what a field accepts. If the input config permits block-level options (lists, headings), the on-page text editable needs `data-type="block"` to match — otherwise a user adds a list via the sidebar and the on-page editable can't handle it.
2. **The existing content already contains block-level HTML.** Even without explicit input config, if the field already contains `<ul>`, `<ol>`, `<h*>` or similar, add `data-type="block"`.

**MUST host block content on an element that can hold it.** `<p>` cannot nest block elements — browsers auto-close the `<p>` before any `<ul>`/`<ol>`/`<h*>`, breaking the DOM and the editable region. Change to an element that can hold block content, e.g. `<div>`.

Also watch for content working around element limitations — `<br>` tags inside a `<p>` faking a list, or repeated inline markup mimicking separate blocks. That signals the element is semantically wrong. Refactor the element to match what the content represents.

**Editable text needs a single concrete host.** A text region must sit on one real DOM element so `data-editable` / `data-prop` (or the custom-element equivalent) has somewhere to live. A template construct that produces no DOM node, or a component with multiple roots, leaves nothing to attach the region to — use one wrapper element as the output. See your SSG's reference for the constructs that hit this.

## Image editing

Put path attributes (`data-prop`, `data-prop-src`, etc.) on the **image region host**. The library resolves the target like this: if the host is an `<img>`, it edits that element; otherwise it uses the first descendant `<img>` inside the host. So you can use **either** a wrapper (`<editable-image>`, `<div data-editable="image">`, or a layout element that already wraps the picture) **or** `data-editable="image"` directly on a plain `<img>`.

When the host exists **only** for editing, prefer `<editable-image>` over `<div data-editable="image">` — equivalent behaviour, see [editable-regions.md § Custom Element Equivalents](editable-regions.md#custom-element-equivalents). Keep `data-editable="image"` on a real layout `<div>` when that element already carries structure or styling.

Where an image component's output is not a plain `<img>` you can annotate directly, the wrapper-plus-child pattern is the reliable choice.

There are two binding modes, depending on the shape of the data:

**String image path** (most common — the field is a plain string like `"/images/hero.jpg"`). Use `data-prop-src` to bind the image `src`, and optionally `data-prop-alt` / `data-prop-title` when alt and title live in separate fields:

```html
<div data-editable="image" data-prop-src="image">
  <img src="/images/hero.jpg" alt="…" />
</div>
```

The same bindings work directly on a plain `<img>` host, which suits hand-authored HTML:

```html
<img data-editable="image" data-prop-src="image" src="/images/hero.jpg" alt="…" />
```

**Object image field** (the field is an object with `src`, `alt` and `title` properties). Use `data-prop` to bind the whole object at once:

```html
<div data-editable="image" data-prop="hero_image">
  <img src="…" alt="…" />
</div>
```

**MUST NOT** use `data-prop` on a string field — it expects an object. Most templates store images as plain string paths, so `data-prop-src` is correct in the majority of cases.

When the user clicks the image in the visual editor, CloudCannon opens the image picker and the `<img>` src updates live.

Where optimized images and upload paths are concerned, the rules are stack-specific — see your SSG's reference.

### Button/link text

For text inside links or buttons, wrap the label in `<editable-text>` (or `<span data-editable="text">` when CSS or existing markup already targets `span`) rather than putting the region on the `<a>` itself:

```html
<a class="btn" href="/contact/">
  <editable-text data-prop="banner.button.label">Get in touch</editable-text>
</a>
```

## Array editing

Wrap the container with `data-editable="array"` and each item with `data-editable="array-item"`. Child editable regions use paths relative to their array item.

Array items get CRUD controls (reorder, add, delete) automatically. Without a registered component renderer, items won't visually re-render after data changes — the user saves and refreshes. Text and image regions within items still work in real time.

**Choosing where the component boundary goes.** When conditional elements, style bindings, or computed content need live updates, a registered component is needed **somewhere**. Default for a uniform list: wrap the **parent** that owns the whole array in `<editable-component>`, one registration for the section. Alternative: put `data-component` on **each** `array-item` and register each item type separately — the [page builder](#page-builder-blocks) pattern. Parent and per-item boundaries can be combined when the layout needs it. Start with the parent wrap; reach for per-item when item types differ or each row should own its re-render scope.

**MUST nest text and image editables inside array items.** Without them, array items get CRUD controls only — no inline text editing, no live image picking. This applies universally, not just where component re-rendering is unavailable: text and image regions handle their own DOM updates independently of the component system. Every array item should have nested editables on its title, description and image fields at minimum.

**Use `data-prop=""` for plain string array items.** When items are plain strings rather than objects, `data-prop=""` passes the current scope as the editable value. Without it, CloudCannon errors with "Text editable regions require a 'data-prop' HTML attribute but none was provided".

```html
<ul data-editable="array" data-prop="skills">
  <li data-editable="array-item"><editable-text data-prop="">Design</editable-text></li>
</ul>
```

### When HTML `<template>` blueprints are needed

The runtime can create a new array row from three sources, tried in order: the in-flight update DOM, `<template>` children on the wrapper, then registered component rendering. Use this table to decide whether to author a `<template>`:

| Array type                                           | Per-item `data-component` + all types registered? | Can be empty at build time? | `<template>` needed?                                                                               |
| ---------------------------------------------------- | ------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| **Page builder**                                     | Yes                                               | Yes                         | **No** — the component pipeline handles it                                                         |
| **Uniform primitive list**                           | No                                                | Yes                         | **Yes** — one `<template>` so "Add item" has structure                                             |
| **Uniform primitive list**                           | No                                                | No (always has items)       | **Optional** — the runtime can clone the first item                                                |
| **Heterogeneous rows without per-item registration** | No                                                | Varies                      | **Yes** — one `<template>` per variant with `data-id` matching, paired with CloudCannon structures |

When you author a `<template>`, mirror the live item's HTML: same editable attributes, empty content. Include **all** region types used in the row — text, image, nested arrays. For **image** regions include an `<img>` the editor can target, either as the host or wrapped, matching the live item. Nested arrays inside a template row can include their own nested `<template>` elements.

See the [CloudCannon complex array documentation](https://cloudcannon.com/documentation/developer-guides/set-up-visual-editing/visually-edit-complex-arrays-and-page-building/) for the canonical reference.

### Arrays inside data files

When the array lives inside a shared data file, the path on the **parent** array editable is the only place the `@data[key]` prefix appears. Child editables inside each `data-editable="array-item"` use **relative paths** — the same rule as frontmatter-backed arrays. The library uses the array-item context to resolve, so an indexed path such as `@data[footer].columns[0].heading` on a child editable is unrecognised and resolves to undefined.

```html
<!-- DO: data-file array, relative paths inside items -->
<div data-editable="array" data-prop="@data[footer].columns">
  <div data-editable="array-item">
    <h3 data-editable="text" data-prop="heading">Company</h3>
    <ul data-editable="array" data-prop="links">
      <li data-editable="array-item"><editable-text data-prop="label">About</editable-text></li>
    </ul>
  </div>
</div>
```

Nested data-file arrays follow the same rule: the inner array uses its relative key (`links`) and items inside it use relative keys (`label`, `href`). The `@data[...]` prefix never repeats once you are inside an array item — relative paths chain naturally through nested levels.

### Don't mix array items with non-array siblings

A `data-editable="array"` wrapper treats every direct child as an `array-item` — including children that aren't part of the array. Putting a static element (a logo column, a summary block, a "see all" link) as a sibling of the mapped output inside the same array wrapper breaks the array context: the static child has no matching index, and the runtime errors trying to resolve it.

Split the layout container from the array container:

```html
<!-- RIGHT -->
<div class="grid grid-cols-4">
  <div class="contents" data-editable="array" data-prop="@data[footer].columns">
    <div data-editable="array-item">…</div>
  </div>
  <div><!-- static logo + tagline --></div>
</div>
```

## Page builder blocks

Each block needs **three layers**: (1) the array wrapper, (2) array items with component behaviour, (3) nested editables. The common omission is adding the array wrapper but missing the component layer or the nested editables.

**Array items and components are two separate behaviours:**

- `data-editable="array-item"` gives **CRUD controls** — add, remove, reorder, drag-and-drop.
- `data-component` enables **component re-rendering** — nested content re-renders when data changes.

Page builder blocks need **both** on the same element. Without `data-component`, the block's contents won't live-update when the editor changes data via the sidebar. Without `data-editable="array-item"`, there are no CRUD controls.

When a suitable element exists, add both attributes directly. When none does, use the `<editable-array-item>` web component:

```html
<editable-array-item data-component="hero" data-id="hero">…</editable-array-item>
```

`<editable-component>` is for **standalone** component regions that are not inside an array.

**`data-component-key` / `data-id-key` on the array wrapper** tell CloudCannon which data field identifies the component type and the stable identity of each item. They are needed because when the array is empty there are no child elements to read, and CloudCannon still needs to know which field to consult. `data-component` / `data-id` on each child are the resolved runtime values. The key name is arbitrary. Since December 2025 `data-id-key` and `data-id` **default** to the `data-component-key` and `data-component` values, so when the identity field and the component field are the same — the common case — both can be omitted. Full attribute semantics are in [editable-regions.md § Complex array attributes](editable-regions.md#complex-array-attributes-wrapper-vs-item).

**Nested editables** inside widget components go on the elements that render editable fields. Paths are relative to the component's data scope (the array item), so `data-prop="title"` resolves to `content_blocks[n].title`.

**Array-item wrappers belong in the page template, not in the block dispatcher.** CloudCannon wraps each registered component in its own `data-editable="array-item"` element with tracking attributes. If the component's rendered output _also_ starts with a `data-editable="array-item"` element, you get double nesting — `array > array-item > array-item` — and the inner array-item can't find an `array` parent, throwing "Array item editable regions must be nested inside an array editable region."

**Each block type should have its own component file**, owning its section markup and its editable attributes. A dispatcher should be a thin lookup that renders the matching component, never a markup container.

**Every block type must have a matching registration**, and the registered key must match the type value in content exactly — `call_to_action` registers as `call_to_action`, not `call-to-action`.

**Data-prop mismatch when a parent renames fields.** A shared component carries `data-prop="subtitle"`. A widget passes its own `description` field into that `subtitle` slot. CloudCannon resolves `data-prop="subtitle"` against the block's data, looks for `content_blocks[n].subtitle`, and finds nothing — the block has `description`. Result: a "received a value of type 'undefined'" error. Fix options, one per widget:

1. **Make the shared component's `data-prop` configurable** — accept a prop naming the real data key. Cleanest when several widgets map different fields to the same visual slot.
2. **Standardize the field name** — rename the widget's field to match. Only works when the names are genuinely interchangeable.
3. **Move the editable to the parent** — annotate the widget's own markup instead. Means duplicating the annotation per widget.

Prefer option 1 when the shared component serves three or more widgets with different field mappings; option 2 when there is no semantic distinction between the names.

## Sub-arrays within widget components

Widget components often contain their own arrays — an `items` list in a Features widget, an `actions` list of buttons in a Hero, a `steps` timeline. These sub-arrays need `data-editable="array"` / `data-editable="array-item"` just like the top-level page builder array. Without them the user can only edit sub-array items through the sidebar modal — no inline CRUD controls.

Sub-array items **don't need `data-component`** — the parent widget already handles re-rendering its whole subtree. The `array-item` attributes only layer on CRUD controls.

On the array container add `data-editable="array"` and `data-prop` naming the array field. On each item add `data-editable="array-item"`. Inside each item add primitive text and image regions on the editable fields.

Because the sub-array lives inside a registered component, `data-prop="items"` resolves relative to the block's data scope — `content_blocks[n].items` — and item paths resolve to `content_blocks[n].items[m].title`.

**Shared UI components:** when a shared component always receives the array under the same prop name, hardcode `data-prop` to it. If different callers use different field names, accept the prop name as a component parameter instead.

**Don't forget sub-arrays.** This is a common omission — agents add the page builder array and the primitives inside widgets but skip internal arrays. Every array rendered by a widget component should get array editables unless the structure is too complex for inline editing.

**Check all variants of shared UI components.** Templates often ship numbered variants of the same component. Adding editables to one variant doesn't cover the others — each must be checked independently. After wiring one up, search for sibling filenames.

**Watch for inline array rendering.** Adding editability to a shared component cascades to every widget that delegates to it, but some widgets render arrays directly in their own template. Those are easy to miss — after wiring up shared components, search for the stack's iteration idiom across widget files.

## Data path patterns — rules

Syntax for each form is in the [Data-prop paths table](#data-prop-paths--pick-one). The rules below apply on top of the syntax.

### Empty `data-prop` pass-through

**MUST NOT** use `data-prop=""` on `<editable-component>` — the component controls UI treats empty string as falsy and won't render the edit button.

**Use it when** the parent's data _is_ the value the child needs, e.g. an `array` editable inside an array-bound component. Without it, `data-prop="plans"` inside a component already scoped to `plans` would resolve to `plans.plans`.

### Non-source editables for hardcoded pages

When a page template has its own rendering logic but reads its data from a content file, editable regions still use **relative paths** — the collection file provides the data context. `_enabled_editors` and `_schema` settings ensure editors see the right fields.

### Cross-collection items on a page

When a page template fetches items from a different collection — team members on an About page, testimonials on a landing page — add `@file` editables so those items are editable inline:

```html
<h3 data-editable="text" data-prop="@file[/src/content/team/jane].name">Jane</h3>
```

How the item's identifier maps to a file path depends on the stack's collection loader, and whether the file extension is part of it. Check that before constructing `@file` paths — see your SSG's reference.

### Shared-data / computed-content handling

| Trigger                                                                    | Approach                                                                                                                  | When not to                                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Value from a shared data file, rendered on multiple pages                  | Use `data-prop="@data[<key>]..."`, with `<key>` registered in `data_config`. Scopes the edit to the data file.            | Don't use `data-editable="source"` (wrong semantics). Don't use a bare frontmatter-relative prop — mutates shared state from the wrong page. |
| Lookup result that doesn't live-update                                     | Read the lookup inside a registered component wrapped in `<editable-component>` so the whole block re-renders.            | Don't put a primitive `data-editable="text"` on the rendered value — the lookup bakes at build time.                                         |
| Computation or expression won't re-run                                     | Wrap the section root with `<editable-component>` at the call site, so expressions re-evaluate on any child-field change. | Don't use a primitive `data-editable` on computed output — it updates DOM text only.                                                         |
| Multiple pages share a data-file value the editor should be able to change | `data-prop="@data[<key>].dotted.path"` routes through `data_config` and is explicitly data-file-scoped.                   | Don't allow inline editing of shared data through page-frontmatter-relative paths.                                                           |

## When to use `data-editable="component"`

For the decision triggers, see [Golden rule](#golden-rule--computed-content-needs-a-component-wrapper).

1. Does the rendering involve a conditional, a lookup against another data file, an icon-path index, or templated HTML from a derived string? → **Yes:** extract into a registered component, wrap with `<editable-component>` at the call site.
2. Is the value a literal text or image pulled straight from a field? → **No component needed:** a primitive is sufficient.
3. Does the section contain both primitive-ok fields and computed fields? → Use the component wrapper anyway — primitive edits still work inside it, and the computed parts re-render.

### Component prop contract

When `<editable-component>` re-renders, it passes the value at `data-prop` to the component as its props. An object-bound region passes that object's fields; an array-bound region passes the array's entries. Destructure the field names directly rather than expecting a named wrapper object. The exact idiom for reading them, and for recovering an array from the passed props, is stack-specific — see your SSG's reference.

### Scattered fields feeding a registered component — nest the frontmatter

**Symptom:** a destructuring error on re-render naming a property the component expects, or the urge to write an empty prop path, a conditional region, or a defensive destructure guard.

All three template-level workarounds are wrong:

- **Unconditional wrapper with an empty prop path** — throws on re-render.
- **Conditional emission of the region** — silently disables computed-content re-render.
- **Defensive destructure** — hides the broken wrapper.

**Reshape the schema instead.** Nest the scattered fields under a single object key matching the component, then point `data-prop` at that key. No template conditionals, no destructure guards.

For a component used at exactly one call site, hardcode the `data-prop` on the wrapper rather than threading a prefix through as a prop.

## Source editables for hardcoded content

Source editables read and write the raw source file directly. They need no content collection and no data file — just a `data-path` naming the source file and a `data-key` identifying the region within it.

**Source-editable is for long-form prose, not for any hardcoded string.** A unique-layout page with two or more structured sections belongs in a page-builder collection, not pinned to its template source.

### When to use source editables

| Use source-editable when...                                                                    | Use page builder + nested editables instead when... |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| The page is mostly long-form prose and you need one or two inline string edits                 | The page has two or more structured sections        |
| There are one or two pages of this type and editors won't add more                             | Editors might want to add similar pages             |
| The site is genuinely simple — a homepage and a blog, no marketing or landing pages            | The site has multiple unique-layout pages           |
| Refactoring to a content collection would change the rendered HTML in ways the user disallowed | Refactor freely; output should match                |

**Editors must still be able to edit visible text.** "Hardcoded so it's developer-only" is not a valid classification — but the _mechanism_ defaults to a content collection or a page-builder block. Source-editable is the exception, reserved for long-form prose where the layout _is_ the body.

Shared-UI text such as a footer tagline is not a source-editable candidate — it belongs in a data file.

### Syntax

```html
<h1 data-editable="source" data-path="src/pages/index.html" data-key="hero-title">
  Welcome to My Site
</h1>
```

Add `data-type="block"` for multi-paragraph prose.

### How it works

1. CloudCannon reads the full source file via `CloudCannon.file(path).get()`
2. Finds the editable region by locating the `data-key` attribute in the raw source
3. On edit, splices the new content back into the source at the same location
4. Writes the whole file back via `file.set(content)`

### Limitations

- **Template component syntax inside the region will not survive editing.** The rich text editor parses the region's contents into CloudCannon's editor schema and re-serializes on save, so non-standard markup is lost. Keep source editables on elements whose content is plain HTML. This is the same constraint described in [editable-regions.md § Rich text region contents are editor-owned](editable-regions.md#rich-text-region-contents-are-editor-owned).
- **`data-key` must be unique within the file.** Use descriptive keys like `hero-title`, `hero-description`.
- **`data-path` is relative to the project root**, not to the current file.

## Listing page editables with `@file`

For collections without detail pages — data-like entries rendered only on a listing page — use `@file[/path].field` editables to make individual entries editable inline on the listing.

**Path syntax:** `@file` paths must have a leading `/` and are relative to the repository root. `@content` works as the field to address an entry's body.

**`@data` vs `@file` for listing-only content.** When entries never build their own pages and only feed a listing, either keep the `@file[/path]` pattern or consolidate into one structured data file if that stays manageable. If you consolidate, register the file in `data_config` and expose it under Data in the sidebar; `@data[...]` then uses logical keys instead of repo paths. Keep separate files and `@file` when one file would be unwieldy, when you need rich per-entry bodies, or when per-file workflows matter more than the simplification.

**Enabling visual editing for listing pages:** add `visual` to the collection's `_enabled_editors`, and include the listing page in the pages collection glob so editors can open it.

## What to make editable vs. what to leave for the sidebar

| Good for visual editing (inline)                            | Better for sidebar / data editor                |
| ----------------------------------------------------------- | ----------------------------------------------- |
| Page titles, headings, descriptions                         | Navigation menus (nested structures)            |
| Hero/banner content                                         | Social links                                    |
| Images (hero, feature, author avatar)                       | Theme settings (colors, fonts)                  |
| Content body (`@content`)                                   | SEO metadata (`meta_title`, `meta_description`) |
| CTA copy                                                    | Boolean toggles (`draft`, `enable`)             |
| Hardcoded text in page templates                            | URL/link fields                                 |
| Blog metadata visible on the page (author name, date shown) | Taxonomy arrays (categories, tags)              |

**Dates must NOT be text editables.** A text region sets a raw string, which conflicts with a typed date schema. Use the sidebar datetime picker, and add a `comment` on the input so editors know the change appears after saving.

**Computed server-only values** such as reading time can stay in the template as static text — they aren't editable and need no special handling.

## Where does a value belong — frontmatter, structure-value default, or hardcoded?

| Value changes per entry? | Value same across all instances of a type?                                    | Place it in                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Yes                      | —                                                                             | Collection schema frontmatter. Use `type: html` plus editor-style CSS for styled inline spans; decompose multi-semantic values into separate fields.         |
| No                       | Yes — shared default for all page-builder instances of this type              | Structure-value `value:` default. See [structures.md § Deriving structures](../cloudcannon-configuration/structures.md#deriving-structures-from-components). |
| No                       | No — pure presentation (class names, SVG paths, layout `<br>` tags, `&nbsp;`) | Hardcoded in the component template; strip from content. No editable region.                                                                                 |

**Styled inline span via editor-style CSS** (preferred for branding and emphasis) — give the input a stylesheet rather than letting editors paste classed markup:

```yaml
_inputs:
  title:
    type: html
    options:
      styles: .cloudcannon/styles/editor.css
      bold: true
      italic: true
      link: true
```

**Decompose a multi-semantic value** when the pieces have distinct meaning — separate fields, and the component owns the HTML structure:

```json
{ "text": "Star us on", "link_text": "GitHub", "link_url": "https://github.com/..." }
```

not one field holding `"<span class='text-center'>Star us on <a class='underline' href='...'>GitHub</a></span>"`.

## Section titles and buttons in child components

When a component renders a section title or button text from props, register the component and wrap it with `<editable-component>` so `data-prop` paths inside resolve relative to the component's data scope. Use `data-editable="text"` on the heading and `<editable-text>` on the button label.

**Button/link render gates.** A multi-field `&&` chain produces visible empty editable regions when only some fields are filled, or when a string is whitespace-only. Gate on the single user-visible field, trim whitespace, and fall the URL back to a safe default:

```html
<!-- gate on the label, not on label && href -->
<a href="/#contact">Contact us</a>
```

## Third-party component fields

When a third-party component renders props internally and doesn't pass through HTML attributes, editable text and image regions can't be placed on its rendered output. Create a thin wrapper component, register it, and put `data-component` on the array item. On a data change the item re-renders and the wrapper passes the new props through.

For sections built around third-party components that don't expose attributes, extract the whole section into its own registered component so it re-renders on any data change. That covers title, content and order updates together.

## Component editables backed by data files

Use `data-prop="@data[key]"` on `<editable-component>` for a component backed by a data file. See [Shared-data / computed-content handling](#shared-data--computed-content-handling) for the full pattern table.

**Component prop names must match the data file's key names exactly, case-sensitively** — the re-renderer passes data file values straight through as props.

## Cross-collection select inputs

Many sites use a `select` input to reference another data file — `author: <slug>` on a post pointing into an authors data file, `category: <slug>` into categories. The frontmatter stores the slug; the rendered card shows fields from the referenced file.

The select is editable in the sidebar by default, but **the rendered card won't update on change** unless the wiring is right. What works:

1. **A data file keyed by slug.**
2. **`data_config`** exposing that file, so the select's option source resolves, plus a `select` input with `value_key: ''` so the frontmatter stores the bare slug rather than an object.
3. **A dedicated registered component** that takes the slug as a prop and does the lookup **internally**. The lookup must live inside the registered component — not in the page template — because that is the code that re-runs when CloudCannon re-renders.
4. **An editable wrapper at the call site** with `data-prop` pointing at the slug field.

When the editor changes the select, CloudCannon re-renders the component with the new slug, its lookup re-runs, and the displayed fields update live.

**Anti-pattern — silent breakage.** Doing the lookup in the page template and passing the resolved object to a static child: the frontmatter still updates when the editor changes the select, but the displayed object was computed at build time from the _previous_ slug, and nothing re-renders. The sidebar feels broken — the change happens but the page doesn't reflect it. Move the lookup into the registered component.

## Conditional editable-image on shared components

When a shared component is used across collections, not all contexts have the same fields. One collection may store an `image` field while another computes its featured image from an array, so there is no `image` field to bind. Wrapping unconditionally in an image region errors on the pages where the field doesn't exist in the data scope.

Add an optional prop naming the image path, and only render the image region when it is provided. Pages whose data includes the field pass the prop; pages without it omit it.

## Component re-rendering

For full live preview — not just text and image updates — components must be registered so the component region can re-render them in the browser when data changes. Every stack registers through its own `@cloudcannon/editable-regions` integration entry point; the registered key is what `data-component` refers to.

**What re-runs and what doesn't.** Registered components re-render in the browser with the props CloudCannon passes. Parent page-level logic does **not** re-run — top-level data loading in a page template, layout-level fetches, and anything else outside the component. If the component needs data its parent normally loads, pass it via props or load it inside the component.

Text and image regions provide the most value with the least complexity. Component registration is the next step for templates where full live preview is a priority.

### Detecting the editor and skipping build-only logic

`ENV_CLIENT` is a global the integration defines in the editable-regions client bundle, where it is `true`; in a normal production build it is absent or `false`. Branch on it to skip build-only work — server-only APIs, image processing, external fetches at render time — while still rendering the same markup.

**`ENV_CLIENT` does not affect the production HTML.** It only tree-shakes the editable-regions client bundle, so it cannot fix anything about the _initial_ render inside the editor. For that, use the `.cms-editor-active` CSS hook instead.

The access syntax differs per integration — a build-time environment value in some stacks, a template global in others. See your SSG's reference, and [editable-regions-internals.md § Detecting the Visual Editor](editable-regions-internals.md#detecting-the-visual-editor) for all three detection mechanisms and when each applies.

**Components whose JS fights the editor** — carousels and animation libraries that manage their own DOM, components with shadow DOM that doesn't serialize cleanly, or anything too complex for the editor to re-render — need an editing fallback: a display-only component that resembles the real one and carries the editable attributes. The live site keeps the real component; only the editor's renderer is swapped. A fallback duplicates markup, so keep the two side by side and mirror structural changes.

## Schema file gates prop forwarding on re-render

When a registered component is re-rendered inside the visual editor, the **CloudCannon schema file** for that collection determines which fields are forwarded as props. A field that exists in the entry's frontmatter and parses cleanly through the SSG's own content schema is still **stripped from props on re-render** if it is not declared in the CloudCannon schema's shape. This applies to nested fields too — declaring a key at the top level is not enough if the section reads it from a nested object.

**A hidden `_input` in `cloudcannon.config.yml` does not fix this.** `_inputs` control how fields render in the sidebar; they have no effect on which fields are forwarded to a re-rendered component. The schema file is the gate.

### Symptom → diagnosis

The component renders correctly in the production build but is missing data inside the visual editor:

1. Log the keys of the props the component received and view it in the editor preview — console logs aren't reachable from inside the iframe.
2. Compare the surviving keys against the entry's frontmatter on disk. The stripped keys are the diagnostic.
3. Open the relevant schema file under `.cloudcannon/schemas/`. The stripped keys will be absent from its shape, or absent from the relevant nested object.
4. Add the missing keys with sensible default values. Reload the editor — they appear in props immediately, with no save or rebuild required.

## Scroll-reveal and entrance animations

Many templates start elements hidden (`opacity: 0`, a transform, `visibility: hidden`) and reveal them with JS or CSS animation classes. Common class names: `reveal`, `animate-on-scroll`, `aos-*`, `fade-in`, `scroll-fade`.

**Why this breaks in the visual editor:** CloudCannon replaces DOM nodes when re-rendering a registered component. New nodes get the hidden CSS but not the JS-applied "active" class that makes them visible, and the reveal JS typically only runs on page-load events, not on editor re-renders. Symptoms:

- Blocks fade away on initial visual editor load
- All content disappears after editing a field that triggers a re-render
- Multiple blocks vanish when editing one block

**Fix (primary): a CSS override using `.cms-editor-active`.** CloudCannon adds that class to `<body>` when a page loads inside the Visual Editor ([docs](https://cloudcannon.com/documentation/developer-articles/detecting-your-site-is-loaded-in-the-visual-editor/)). Override the hidden state in global CSS:

```css
.cms-editor-active .reveal {
  opacity: 1;
  transform: translateY(0);
  transition: none;
}
```

This is the most reliable approach — pure CSS, no timing issues, and it works on initial load as well as after re-renders. Adapt the selector to whatever class the template uses.

**Fix (supplementary): an `ENV_CLIENT` guard in component code.** Skip the hidden class at render time in the editable-regions client bundle, so re-rendered output never carries it. This does not affect the initial production HTML — the CSS override above is what handles initial render. See [Detecting the editor and skipping build-only logic](#detecting-the-editor-and-skipping-build-only-logic).

**Inline `<script>` runtime checks.** For animation JS in inline scripts, branch on `window.inEditorMode` and mark the elements active immediately:

```javascript
if (window.inEditorMode) {
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("active"));
  return;
}
```

**Audit flag:** flag any scroll-reveal or entrance animation pattern early. Search for `opacity: 0` in CSS, `IntersectionObserver` in JS, and the common class names above, and note the files responsible so they can be patched when regions are wired up.

## Troubleshooting

Symptom → cause → fix for regions that don't appear, don't update, or write to the wrong place is in [troubleshooting.md](troubleshooting.md).
