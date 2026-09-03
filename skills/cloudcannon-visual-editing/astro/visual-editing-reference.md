# Visual Editing Reference (Astro)

Astro's deltas only. The generic rules — region types, the `data-prop` path grammar, the anti-pattern table, array and page-builder structure, source editables, the re-render contract — are in [../visual-editing-reference.md](../visual-editing-reference.md); read that first and come here for what Astro does differently.

Read this doc on demand when a checklist item in [visual-editing.md](visual-editing.md) links here — don't read it front to back.

## Astro scope

Only `.astro` and React components can be re-rendered in the visual editor. Vue, Svelte and Solid have no renderer and must be converted or given an editing fallback — see [Non-Astro framework components](#non-astro-framework-components).

## Computed-content triggers in Astro

The [golden rule](../visual-editing-reference.md#golden-rule--computed-content-needs-a-component-wrapper) applies as written. These are the Astro expression forms that trigger it:

| Trigger                              | Example                                           |
| ------------------------------------ | ------------------------------------------------- |
| Conditional / ternary text           | `{inStock ? "In stock" : "Out of stock"}`         |
| Data-file lookup                     | `{locations[slug].street}`                        |
| Icon / asset-path index              | `{iconPaths[t.icon]}`                             |
| Computed class / `class:list` branch | `class:list={[inStock ? "bg-green" : "bg-grey"]}` |
| `set:html` of a derived string       | `<div set:html={md(body)} />`                     |

Registration placement follows [the base rule](../visual-editing-reference.md#where-does-the-registration-go--component-root-or-call-site). In Astro:

❌ Standalone hero with self-marking — sidebar boolean toggles don't update live:

```astro
<!-- page template -->
<Hero {...hero} />
<!-- Hero.astro — WRONG -->
<section data-editable="component" data-component="hero" data-prop="hero">…</section>
```

✅ `<editable-component>` wrapper at the call site:

```astro
<!-- page template -->
<editable-component data-component="hero" data-prop="hero">
  <Hero {...hero} />
</editable-component>
<!-- Hero.astro — plain markup, no data-editable on root -->
<section>…</section>
```

❌ Dynamic `data-prop` swap for a boolean branch:

```astro
<span data-editable="text" data-prop={inStock ? "inStockLabel" : "outOfStockLabel"}>
  {inStock ? inStockLabel : "Out of stock"}
</span>
```

✅ Two complete branches, each with its own static `data-prop`:

```astro
{inStock ? (
  <p class="bg-green-100">
    <span data-editable="text" data-prop="inStockLabel">{inStockLabel}</span>
  </p>
) : (
  <p class="bg-gray-200"><span>Out of stock</span></p>
)}
```

## Guarding optional fields in Astro

The [base guard rule](../visual-editing-reference.md#guard-optional-fields) in Astro form:

```astro
{subtitle && <p set:html={subtitle} data-editable="text" data-prop="subtitle" />}
```

**Dual slot/prop components.** Many Astro widgets accept both slot content (rendered as strings) and structured objects from content collections, branching on `typeof value === 'string'`. When tightening guards per [Content-sourced objects and arrays are never falsy](../visual-editing-reference.md#content-sourced-objects-and-arrays-are-never-falsy), preserve the string branch:

```astro
{(typeof callToAction === 'string' ? callToAction : (callToAction?.text || callToAction?.icon)) && ...}
{(Array.isArray(actions) ? actions.length > 0 : actions) && ...}
```

## Text editing in Astro

See [base § Text editing](../visual-editing-reference.md#text-editing) for host choice and the `data-type` rules.

`data-type="block"` applies to any frontmatter field rendered as HTML — via `set:html` directly, or through a markdown parser like `markdownify()` or `marked()` whose output then goes through `set:html`.

```astro
<h1 set:html={markdownify(title)} class="mb-4" data-editable="text" data-prop="title" />

<div class="content" data-editable="text" data-type="block" data-prop="@content">
  <Content />
</div>
```

**Editables inside slot content need a concrete host.** `<Fragment>` has no DOM node and cannot carry `data-editable` / `data-prop`. The same applies if you abstract slot content into an `.astro` component: a Fragment root, or multiple roots, leaves no single element to attach the region to.

```astro
<!-- Won't work: Fragment can't carry data-editable -->
<Fragment slot="title">{title}</Fragment>

<!-- Works: prefer the custom element -->
<editable-text slot="title" data-prop="title">{title}</editable-text>

<!-- Works: equivalent primitive form -->
<span slot="title" data-editable="text" data-prop="title">{title}</span>
```

## Image editing in Astro

See [base § Image editing](../visual-editing-reference.md#image-editing) for host resolution and the `data-prop-src` versus `data-prop` choice.

Output from `<Image />` (`astro:assets`) is usually not a plain `<img>` you can annotate directly, so the **wrapper + child** pattern is the normal choice in Astro:

```astro
<editable-image data-prop-src="image">
  <ImageMod src={image} width={1200} height={600} alt={title} format="webp" />
</editable-image>
```

For an object image field, bind the whole object:

```astro
<editable-image data-prop="hero_image">
  <img src={hero_image.src} alt={hero_image.alt} />
</editable-image>
```

**Image location and optimization.** Optimized images belong in `src/assets/`, not `public/`. Frontmatter stores the full repo-relative path (e.g. `/src/assets/images/hero.webp`). Components use `import.meta.glob` to resolve the string to `ImageMetadata` at build time — see [content.md § Resolving optimized image paths](../../migrate-to-cloudcannon/astro/content.md#resolving-optimized-image-paths-from-frontmatter). Don't downgrade to `<img>` just because the path comes from frontmatter.

**Upload paths.** Configure per-input upload paths so optimized images go to `src/assets/images` while unoptimized ones use the global `public/` path. The per-input `static: ''` is critical — without it CloudCannon strips the path prefix and `import.meta.glob` can't resolve the image. See [configuration.md § Image path configuration](../../cloudcannon-configuration/astro/configuration.md#image-path-configuration).

## Array editing in Astro

See [base § Array editing](../visual-editing-reference.md#array-editing) for structure, the nesting rule, and when `<template>` blueprints are needed.

```astro
<div data-editable="array" data-prop="features">
  {features.map((feature) => (
    <section data-editable="array-item">
      <h2 data-editable="text" data-prop="title">{feature.title}</h2>
      <editable-image data-prop-src="image">
        <ImageMod src={feature.image} ... />
      </editable-image>
      <p data-editable="text" data-prop="content">{feature.content}</p>
    </section>
  ))}
  <template>
    <div data-editable="array-item">
      <editable-image data-prop-src="img"><img src="" alt="" /></editable-image>
      <h2 data-editable="text" data-prop="title"></h2>
    </div>
  </template>
</div>
```

**Astro 4 has no component re-rendering.** The `editableRegions()` integration is unavailable, so text and image regions still work — they update their own DOM — but component re-rendering does not. Fields that appear on the page but are only editable via the sidebar (`badge`, `tags`, `variant`) won't live-update. Add a `comment` to those inputs explaining that changes need a save and rebuild. On Astro 5+ with component registration they update live and the comments aren't needed.

**Conditional editable prop for cross-collection content.** When a shared component (a card, say) renders both frontmatter-backed array items and programmatic content from another collection fetched via `getCollection`, the editable attributes break on the programmatic items — there's no valid data scope. Add an `editable` prop defaulting to `true` and apply the attributes conditionally:

```astro
---
const { title, desc, editable = true } = Astro.props;
---
<h1>
  {editable ? <editable-text data-prop="title">{title}</editable-text> : title}
</h1>
```

Pass `editable={false}` when rendering cross-collection content that isn't backed by the current page's frontmatter.

## Page builder blocks in Astro

For the three layers, the `array-item` versus `data-component` split, and the wrapper key attributes, see [base § Page builder blocks](../visual-editing-reference.md#page-builder-blocks). For the structural setup — array wrapper, catch-all route, CC config — see [page-building.md](../../migrate-to-cloudcannon/astro/page-building.md).

Our examples use `_type` as the component key; the CloudCannon docs use `_name`. Either works.

### BlockRenderer architecture

**Array-item wrappers belong in the page template, not in BlockRenderer** — otherwise the component's own output double-nests the `array-item` and throws. The correct pattern:

```astro
<!-- Page template (e.g. index.astro) — owns the array-item wrapper -->
<div data-editable="array" data-prop="content_blocks" data-component-key="_type">
  {content_blocks?.map((block) => (
    <div data-editable="array-item" data-component={block._type}>
      <BlockRenderer {...block} />
    </div>
  ))}
</div>
```

**BlockRenderer should be a thin dynamic dispatcher**, not a markup container:

```astro
---
import { componentMap } from '../cloudcannon/componentMap'
const { _type, ...props } = Astro.props
const Component = componentMap[_type]
---
{Component && <Component {...props} />}
```

**Each block type gets its own component file.** If the pristine site had a section as inline markup in a page template, create a component for it during the migration. The component owns its section markup and its editable attributes; BlockRenderer only dispatches.

**`componentMap` is the single source of truth.** Both `BlockRenderer.astro` and `registerComponents.ts` import from `src/cloudcannon/componentMap.ts`. Keys are the `_type` values from content files; values are the actual component imports — not BlockRenderer itself, which would defeat the purpose.

**Registration:** every `_type` value needs a matching `registerAstroComponent` call whose key matches exactly — `_type: call_to_action` → `registerAstroComponent('call_to_action', CallToAction)`, not `'call-to-action'`.

**Shared sub-components.** When a component like `Headline.astro` renders title/subtitle for many widgets, adding `data-editable` there is correct — inside a page builder block the editables scope to the parent component, so `data-prop="title"` resolves to the block's title. For the prop-renaming failure and its three fixes, see [base § Page builder blocks](../visual-editing-reference.md#page-builder-blocks).

## Sub-arrays in Astro

See [base § Sub-arrays within widget components](../visual-editing-reference.md#sub-arrays-within-widget-components) for the rules.

```astro
<!-- Shared UI component: ItemGrid.astro -->
<div class="grid gap-8" data-editable="array" data-prop="items">
  {items.map(({ title, description }) => (
    <div data-editable="array-item">
      <h3 data-editable="text" data-prop="title">{title}</h3>
      <p set:html={description} data-editable="text" data-prop="description" />
    </div>
  ))}
</div>
```

Grep for sibling filenames (`ItemGrid*.astro`) to find variants needing the same treatment, and for `.map(` across widget files to catch arrays rendered inline rather than through a shared component.

## Component prop contract in Astro

Per [base § Component prop contract](../visual-editing-reference.md#component-prop-contract), the value at `data-prop` arrives as spread props. In Astro, destructure field names directly from `Astro.props`, not from a named wrapper:

- **Object-bound:** `<editable-component data-prop="banner"><Hero {...banner} /></editable-component>` → `const { title, image } = Astro.props`
- **Array-bound:** `<editable-component data-prop="plans"><PricingSection {...plans} /></editable-component>` → `const plans = Object.values(Astro.props)`

### Scattered fields — the Zod reshape

The [base rule](../visual-editing-reference.md#scattered-fields-feeding-a-registered-component--nest-the-frontmatter) is to nest the frontmatter. The Astro symptom is `Cannot destructure property 'x' of 'n.props' as it is undefined` in `registerComponents.*.js`, and the fix is in the collection schema:

```ts
// ❌ flat root fields
treatmentHeading: z.string().default("How We Help"),
treatments: z.array(treatmentEntry).default([]),

// ✅ nested object
treatments: z.object({
  heading: z.string().default("How We Help"),
  items: z.array(treatmentEntry).default([]),
}).default({ heading: "How We Help", items: [] }),
```

Then `<TreatmentBlocks {...data.treatments} />` inside `<editable-component data-component="treatment_blocks" data-prop="treatments">`.

## Cross-collection items — `entry.id` and the collection loader

[Base § Cross-collection items](../visual-editing-reference.md#cross-collection-items-on-a-page) covers `@file` usage. In Astro, how `entry.id` maps to a path depends on the loader:

- **Legacy collections** (`type: "content"` in `src/content/config.ts`) include the file extension — `jane-doe.md`.
- **Glob loader** (`glob()` in `src/content.config.ts`) strips it — `jane-doe` — so you must append `.md` when building `@file` paths.

Check which loader the collection uses before constructing paths.

```astro
{teamMembers.map((member) => (
  <div>
    <editable-image data-prop={`@file[/src/content/team/${member.id}].avatar`}>
      <img src={member.data.avatar.src} alt={member.data.avatar.alt} />
    </editable-image>
    <h3 data-editable="text" data-prop={`@file[/src/content/team/${member.id}].name`}>
      {member.data.name}
    </h3>
  </div>
))}
```

The same `entry.id` caveat applies to [listing pages](../visual-editing-reference.md#listing-page-editables-with-file):

```astro
{entries.map(entry => (
  <article
    data-editable="text"
    data-type="block"
    data-prop={`@file[/src/content/work/${entry.id}].@content`}
  >
    <entry.Content />
  </article>
))}
```

## Blog post detail pages

A blog detail page typically has a hero driven by top-level frontmatter plus a markdown body. Use inline primitives for the fields that support them and leave the rest to the sidebar.

```astro
<p>
  {formattedDate} •
  <editable-text data-prop="author">{author}</editable-text>
  {readingTime && ` • ${readingTime}`}
</p>
<h1 data-editable="text" data-prop="title">{title}</h1>
<img data-editable="image" data-prop-src="image" src={image} alt={title} />

<div data-editable="text" data-type="block" data-prop="@content">
  <Content />
</div>
```

**When the author is a select referencing a data file** (see [cc-friendly-conventions.md § Author strategy](../../migrate-to-cloudcannon/astro/cc-friendly-conventions.md#author-strategy)) and the card shows the resolved name/avatar/bio, a plain `<editable-text data-prop="author">` only updates the visible slug — it can't touch the avatar or bio, which come from another file. Use the registered-component pattern in [Cross-collection select inputs](#cross-collection-select-inputs) instead.

**Shared PageHeader components.** When a blog detail page uses a shared `PageHeader`, the editable attributes still need to reach the rendered elements — don't mark the hero sidebar-only just because the component is shared. Add optional prop-path parameters (`titleProp`, `subtitleProp`, `imageProp`) that conditionally render the attributes when provided. Callers pass the frontmatter field name; pages without that field omit the prop.

**Why not wrap the hero in `<editable-component>`?** When the hero fields live at the top level of the frontmatter there's no `data-prop` path to point at. `data-prop=""` resolves the data but the component controls UI treats empty string as falsy, so no edit button renders. `data-prop-*` attributes work but [lowercase their keys](../visual-editing-reference.md#data-prop-paths--pick-one), breaking camelCase names like `pubDate`. Nesting the hero under a `hero:` key would fix it but requires restructuring every content file. For most blog heroes, inline primitives plus sidebar-only fields give a good experience without the complexity.

Dates use the sidebar datetime picker, per [base § What to make editable](../visual-editing-reference.md#what-to-make-editable-vs-what-to-leave-for-the-sidebar):

```yaml
_inputs:
  pub_date:
    type: datetime
    comment: Changes to the publish date appear on the page after saving and rebuilding
```

## Source editables in Astro

[Base § Source editables](../visual-editing-reference.md#source-editables-for-hardcoded-content) covers the mechanism, `data-path` / `data-key`, and when to reach for them.

```astro
<h1
  class="text-4xl font-bold"
  data-editable="source"
  data-path="src/pages/index.astro"
  data-key="hero-title"
>
  Welcome to My Site
</h1>
```

### Including `.astro` pages in collections

Pages with source editables should be in the pages collection so editors can find and open them. Add specific `.astro` filenames to the collection's glob alongside `"*.md"` — only pages that actually have editable regions. Exclude pages with no visually editable content (search, 404, tag listings). Set `_enabled_editors: [visual]` for the collection: `.astro` files can only use the visual editor, since their JS frontmatter isn't parseable as data. See [configuration-gotchas.md § Pages collection](../../cloudcannon-configuration/astro/configuration-gotchas.md#pages-collection-including-astro-pages).

### Identifying source editable candidates during audit

During Phase 1, run hardcoded text through the [audit.md classification census](../../migrate-to-cloudcannon/astro/audit.md#classifying-static-pages-source-editables-vs-content-collection) before reaching for source-editable. Most candidates — homepage heroes, CTA sections, section headings — belong in a page-builder `pages` collection entry. Unique-layout pages with two or more structured sections belong in the page builder; see [page-building.md § When to reach for page builder](../../migrate-to-cloudcannon/astro/page-building.md#when-to-reach-for-page-builder). Footer taglines and other shared-UI text belong in a data file — see [cc-friendly-conventions.md § Shared-UI treatment table](../../migrate-to-cloudcannon/astro/cc-friendly-conventions.md#shared-ui-treatment-table).

## Astro components in source editables

Source editables cannot handle Astro component syntax — the rich text editor strips non-standard JSX. When a presentational component (a styled `<Link>`, say) appears inside content that should be source-editable, choose one of:

1. **Inline as plain HTML + CSS** — replace the component with its HTML equivalent (`<a>` for `<Link>`) and replicate the styling with CSS selectors. Works well for simple wrappers around native elements. Avoid utility classes on the inline HTML; use contextual rules (e.g. `article a { … }`) instead.
2. **Define a snippet** — for components with meaningful props, configure a `_snippets` entry so editors get a structured interface. Enable `snippet: true` in `_editables.content` to expose the toolbar button.

The rule: if the component just wraps a native element with styles, inline it. If it has props, state, or non-trivial rendering, make it a snippet.

## Cross-collection select inputs

[Base § Cross-collection select inputs](../visual-editing-reference.md#cross-collection-select-inputs) states the rule — the lookup must live inside the registered component. This is the Astro wiring.

1. **Data file** keyed by slug.

   ```json
   // src/data/authors.json
   {
     "jane-smith": { "name": "Jane Smith", "avatar": "...", "bio": "..." }
   }
   ```

2. **CC config** — expose the data file under `data_config` (without this, `data.authors` won't resolve in the select), then a `select` input with `value_key: ''` so the frontmatter stores the bare slug.

   ```yaml
   data_config:
     authors:
       path: src/data/authors.json

   _inputs:
     author:
       type: select
       options:
         values: data.authors
         value_key: ""
   ```

3. **Dedicated registered component** that takes the slug and does the lookup internally:

   ```astro
   ---
   import authors from '../data/authors.json'
   const { author } = Astro.props
   const entry = author ? authors[author] : undefined
   ---
   {entry && <!-- render entry.name, entry.avatar, entry.bio -->}
   ```

   ```ts
   // registerComponents.ts
   registerAstroComponent("author-card", AuthorCard);
   ```

4. **Editable wrapper** at the call site:

   ```astro
   <editable-component data-component="author-card" data-prop="author">
     <AuthorCard author={post.data.author} />
   </editable-component>
   ```

**Anti-pattern.** Doing the lookup in the page template and passing the resolved object to a static child breaks silently:

```astro
<!-- WRONG: lookup runs at build time; nothing on the page binds to the slug -->
const author = authors[post.data.author]
<PageHeader author={author} />
```

**Reference fields are objects, not strings.** `reference()` fields are `{collection, id}` at runtime. Comparing `entry.id === ref` is string-vs-object and always false. Use `getEntry(ref)` for a single ref, or a membership test for an array:

```ts
entry.data.locations.some((ref) => ref.id === currentLocationId);
```

Type props as `{collection: string; id: string}[]`, never `string[]`.

## Conditional editable-image on shared components

Per [the base rule](../visual-editing-reference.md#conditional-editable-image-on-shared-components), gate the image region on an optional prop:

```astro
{resolvedImage && imagePropPath ? (
  <editable-image data-prop-src={imagePropPath}>
    <Image src={resolvedImage} ... />
  </editable-image>
) : resolvedImage ? (
  <Image src={resolvedImage} ... />
) : null}
```

## Component re-rendering

See [base § Component re-rendering](../visual-editing-reference.md#component-re-rendering) for what re-runs and what doesn't.

### Astro components

For page builder sites, add the component to `src/cloudcannon/componentMap.ts` — `registerComponents.ts` registers it automatically (see [setup steps in visual-editing.md](visual-editing.md#setup-steps)). For standalone components not in the page builder, register directly:

```typescript
import { registerAstroComponent } from "@cloudcannon/editable-regions/astro";
import CallToAction from "@/layouts/partials/CallToAction.astro";

registerAstroComponent("call-to-action", CallToAction);
```

`getCollection` / `getEntry` work inside registered components because `astro:content` is shimmed by the integration, so self-contained components that fetch their own data work correctly in the visual editor — you don't need to pass fetched data as props. `import.meta.glob` also resolves eagerly at build time and works fine.

### Non-Astro framework components

Only `.astro` and React components are supported.

**Decision: convert or provide an editing fallback.**

- **Convert** — rewrite as `.astro` or React. Prefer `.astro` unless the component needs complex client-side state, in which case React is a good choice. Simpler (no duplication) and gives full visual editing support. Default recommendation.
- **Editing fallback** — if conversion isn't practical (third-party framework library with no equivalent, large complex component, team preference), keep the original and use `ENV_CLIENT` to render a fallback in the visual editor.

#### React components

React components should generally stay as React. Use `registerReactComponent`:

```typescript
import { registerReactComponent } from "@cloudcannon/editable-regions/react";
import Announcement from "@/components/Announcement";

registerReactComponent("announcement", Announcement);
```

To make nested content editable within a React component you may need to refactor it slightly so there are suitable elements to attach editable attributes or web components to. The component handles overall re-rendering; inner text and images should still be individually editable where possible.

**Hydration gotcha.** Content inside a React island's hydrated DOM can be overwritten when React rehydrates. If an editable region modifies static server-rendered HTML but React then replaces that DOM with its own output, the editor's changes appear to do nothing. Content controlled by React state may not be a good candidate for inline editable regions.

#### Editing fallbacks (Vue, Svelte, Solid, or complex components)

An editing fallback is a display-only `.astro` component that visually resembles the real one and supports editable attributes. It needs no interactivity. The live site still uses the real component; only the visual editor's renderer is swapped.

```astro
<!-- src/layouts/helpers/AnnouncementDisplay.astro -->
---
const { enable, text, link_text, link_url } = Astro.props;
---
{enable && text && (
  <div class="announcement-banner">
    <p>{text} {link_text && link_url && <a href={link_url}>{link_text}</a>}</p>
  </div>
)}
```

```typescript
// registerComponents.ts
import AnnouncementDisplay from "@/layouts/helpers/AnnouncementDisplay.astro";
registerAstroComponent("announcement", AnnouncementDisplay);
```

```astro
<!-- Base.astro — live site uses the real component -->
<editable-component data-component="announcement" data-prop="@data[announcement]">
  <Announcement client:load {...announcementData} />
</editable-component>
```

**When to use one:** Vue, Svelte or Solid components that can't be converted; components using third-party DOM libraries (Swiper, GSAP); Web Components with shadow DOM that don't serialize cleanly; anything too complex for the editor to re-render directly.

**Keep the fallback in sync.** It duplicates markup, so mirror structural changes. Keep both in the same directory with clear names (`Announcement.vue` + `AnnouncementDisplay.astro`).

### Use `ENV_CLIENT` editing fallbacks when

`ENV_CLIENT` in Astro is a Vite `define`, read as `import.meta.env.ENV_CLIENT`. See [base § Detecting the editor](../visual-editing-reference.md#detecting-the-editor-and-skipping-build-only-logic) for what it does and does not affect.

- **Vue, Svelte, Solid components** — these throw runtime errors in editable regions, even nested inside supported wrappers.
- **Components with complex DOM management** (Swiper carousels and similar) — their JS conflicts with editable region DOM manipulation.
- **Server-only APIs** — `getImage` from `astro:assets`, or `fetch` to external APIs at render time. Guard with `ENV_CLIENT` for a simplified client-side path that skips optimization.
- **React islands** that fetch, submit forms, or load third-party scripts — gate with `window.inEditorMode`, rendering the same markup but skipping API calls and script loads.

### Astro-specific caveats on component regions

- Astro components importing `astro:content` or `astro:assets` need the integration's Vite plugin, which shims those modules for client-side rendering.
- React components inside registered Astro components (e.g. `react-icons`) need the React framework renderer. Add `import "@cloudcannon/editable-regions/astro-react-renderer"` to `registerComponents.ts` — a side-effect import registering a catch-all React renderer. Without it, any React component encountered during re-rendering fails with "NoMatchingRenderer". Its `check` function unconditionally returns `true`, so it acts as a fallback for all unmatched components — import it **after** any other framework renderers.
- The React renderer covers React only. There are no equivalents for Vue, Svelte or Solid; those always error and must be converted or given fallbacks.
- **Runtime `fetch()` in islands** isn't blocked by editable-regions, but preview iframes often differ from production (CORS, auth cookies, relative URLs). Test in the visual editor if the UI depends on it.

## How the Astro integration works

Understanding the internals helps when debugging unexpected behaviour.

**Build-time** (`@cloudcannon/editable-regions/astro-integration`) — an Astro integration registering a Vite plugin for the client build. The plugin:

1. Sets `ENV_CLIENT = true` for tree-shaking server-only code. **Only in the editable-regions client bundle**, not the normal production build: code guarded with `import.meta.env.ENV_CLIENT` in `.astro` template expressions still runs normally (with `ENV_CLIENT` falsy) in production SSR output. For initial-render concerns like hiding animation classes, use `.cms-editor-active` CSS overrides instead.
2. Patches Astro's `astro:build` Vite plugin to force SSR transforms on client code — this is what makes `renderToString()` work in the browser.
3. Adds `vite-plugin-editable-regions`, which intercepts `astro:*` virtual module imports and resolves them to local shims: `astro:content`, `astro:assets` and `astro:env/server`.

Without this, Astro components importing from `astro:content` or `astro:assets` would fail to bundle for the client.

**Runtime** (`@cloudcannon/editable-regions/astro`) — `registerAstroComponent(key, AstroComponent)` creates a wrapper that:

1. Constructs a fake Astro `SSRResult` (renderers, metadata, crypto key for server islands, slot handling).
2. Calls Astro's `renderToString()` in the browser with the new props.
3. Parses the resulting HTML into a document fragment.
4. Triggers any queued client-side renders (React islands use `data-editable-region-csr-id`).
5. Strips Astro scaffolding (`<astro-island>`, `<link>`, server island metadata).
6. Returns the clean HTML element.

The wrapper is stored in `window.cc_components[key]`, where the component region finds it.

**Runtime shims provided by editable-regions:**

- `Astro.props` — passed through from CloudCannon's prop data
- `Astro.slots` — shimmed with `has()` and `render()` via `renderSlotToString`
- `Astro.request` — shimmed as `new Request(window.location.href)`, one new instance per `createAstro` call

## Schema file gates prop forwarding — the Astro diagnosis

[Base § Schema file gates prop forwarding](../visual-editing-reference.md#schema-file-gates-prop-forwarding-on-re-render) states the rule. In Astro, fields that parse cleanly through the Zod content schema are still stripped if absent from the CloudCannon schema shape.

### Concrete example

Entry `src/content/pages/home.md`:

```yaml
postsSection:
  categorySlug: news # used by the component to filter posts
  heading: Latest News
```

`PostsListing.astro` reads `categorySlug` from `Astro.props`. In the visual editor, `Astro.props` contained only `heading`.

- ❌ Did not help: declaring `postsSection.categorySlug` as a hidden `_input` in `cloudcannon.config.yml`.
- ✅ Fixed it: adding `categorySlug: ""` inside the `postsSection:` block in `.cloudcannon/schemas/page.md`.

### Debug snippet

Drop this at the top of a section component, reload the editor, and read off which keys survived:

```astro
---
const debug = { allPropKeys: Object.keys(Astro.props), allProps: Astro.props };
---
<pre style="background:#fffbe6;border:2px solid #f59e0b;padding:12px;font-size:12px;white-space:pre-wrap;word-break:break-all;">
{JSON.stringify(debug, null, 2)}
</pre>
```

## Scroll-reveal animations in Astro

[Base § Scroll-reveal and entrance animations](../visual-editing-reference.md#scroll-reveal-and-entrance-animations) covers the cause and the `.cms-editor-active` fix. The Astro-side supplementary guard:

```astro
<!-- WidgetWrapper.astro or equivalent -->
<div class:list={[{ reveal: animate && !import.meta.env.ENV_CLIENT }]}>
  <slot />
</div>
```

## Module compatibility in the editable-regions client bundle

The `editableRegions()` integration builds a client bundle that re-renders registered components in the browser. Most modules work without special handling.

**Shimmed `astro:*` modules** — `astro:content`, `astro:assets` and `astro:env/server` get browser-safe shims. Components importing from these work automatically.

**Other `astro:*` modules** — `astro:actions`, `astro:transitions`, `astro:i18n`, `astro:middleware` and `astro:env/client` aren't shimmed, but aren't blocked either. The resolver passes them to Astro's own Vite plugins, which handle them normally.

**Third-party virtual modules** — modules like `virtual:astro-icon` aren't intercepted at all, since the resolver only handles `astro:*` prefixed imports. Their own Vite plugins resolve them in the same build pipeline. As long as the emitted module is browser-safe, they work. Most Vite virtual modules emit static data or pure JS at build time, so this is the common case.

**What doesn't work** — components using Node-only APIs at runtime (filesystem access, `process.env`, native binaries) fail in the browser context. Vue, Svelte and Solid have no renderers and need editing fallbacks.

### `astro-icon`

A common example of a third-party virtual module that works. Register components using `<Icon>` normally — no editing fallbacks needed. `virtual:astro-icon`'s Vite plugin emits serialized JSON at build time, `@iconify/utils` is pure JS, and `Astro.request` is shimmed, so the whole chain is browser-safe.

**Sprite dedup quirk:** `Icon.astro` uses `Astro.request` as a `WeakMap` key for sprite deduplication. Since editable-regions creates a new `Request` per component, every icon renders its full `<symbol>` instead of reusing `<use href>`. This affects only the visual editor preview and is cosmetically irrelevant.

**Build-time issues** (astro-icon specific, unrelated to editable-regions):

1. **Missing `src/icons/` directory** — `astro-icon` always tries to load a `local` icon set from `src/icons/`. If the directory doesn't exist the build fails with `Unable to load the "local" icon set!`. Fix: create an empty `src/icons/`.
2. **Empty icon props in `<template>` blueprints** — Astro renders `<template>` contents server-side. If a blueprint passes an empty icon name the build fails with `Unable to locate "" icon!`. Guard on a truthy name:

```astro
{icon && <Icon aria-hidden="true" name={icon} />}
```

This applies to any component rendered inside a `<template>` array blueprint where prop values may be empty.

## Troubleshooting

Astro-specific symptom → fix rows are in [troubleshooting.md](troubleshooting.md); generic ones are in [../troubleshooting.md](../troubleshooting.md).
