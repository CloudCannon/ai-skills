---
name: cloudcannon-visual-editing
description: >-
  Use when adding Visual Editor support to a CloudCannon site, setting up
  editable regions, debugging visual editing issues, or making page sections
  editable in the CloudCannon preview.
---

# CloudCannon Visual Editing

`@cloudcannon/editable-regions` makes page elements interactive in CloudCannon's Visual Editor. This skill covers the editable regions API, integration setup, and SSG-specific patterns for wiring up text, image, array, and component editables.

## When to use

- Adding Visual Editor support to a new or existing CloudCannon site
- Making page sections editable (text, images, arrays, components)
- Setting up component re-rendering for live preview
- Debugging editable regions that aren't appearing or updating
- Adding editable regions to shared partials backed by data files

## When not to use

- **The field has no `_inputs` entry or the collection is unconfigured** — configure it first with [`cloudcannon-configuration`](../cloudcannon-configuration/SKILL.md). An editable region with no matching Input errors in the editor.
- **Editors need to insert new markup inside rich text** — that is [`cloudcannon-snippets`](../cloudcannon-snippets/SKILL.md). Editable regions edit what is already rendered.
- **A page will not open in the Visual Editor at all** — that is usually a wrong collection `url`, not a region problem. See [cloudcannon-configuration/collection-urls.md](../cloudcannon-configuration/collection-urls.md).

## Contents

| Doc                                                            | When to read                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [editable-regions.md](editable-regions.md)                     | Start here. Region types, attribute reference, when to use components vs primitives |
| [editable-regions-internals.md](editable-regions-internals.md) | Only when debugging. Lifecycle traces, JavaScript API reference                     |
| [troubleshooting.md](troubleshooting.md)                       | Symptom → fix, when regions do not appear, update, or write where expected          |

**SSG-specific:**

Enter through the SSG's `overview.md`; it gives the reading order for that SSG's files.

| SSG   | Doc                                                                    | Purpose                                                                    |
| ----- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Astro | [astro/overview.md](astro/overview.md)                                 | **Start here for Astro** — reading order and what each file covers         |
| Astro | [astro/visual-editing.md](astro/visual-editing.md)                     | Setup workflow, section census, infrastructure + completeness checklists   |
| Astro | [astro/visual-editing-reference.md](astro/visual-editing-reference.md) | Pattern reference (read sections on demand as the checklist links to them) |

**Scripts:**

| Script                                                                 | Purpose                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [scripts/setup-editable-regions.sh](scripts/setup-editable-regions.sh) | Installs package, wires Astro integration, creates `registerComponents.ts` stub |

**Other skills:**

| Skill                                                        | When to read                                                                                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [make-site-multilingual](../make-site-multilingual/SKILL.md) | The site is multilingual. Translation keys (`data-rosey`) must sit on region hosts rather than inside them, and component regions need explicit key passthrough |

## Quick reference

| Region type  | Use for                     | Key attributes                                                           |
| ------------ | --------------------------- | ------------------------------------------------------------------------ |
| `text`       | Inline rich text            | `data-editable="text"` `data-prop` `data-type`                           |
| `image`      | Image picker                | `data-editable="image"` `data-prop` (or `data-prop-src`/`data-prop-alt`) |
| `array`      | List CRUD                   | `data-editable="array"` `data-prop` on container                         |
| `array-item` | Each list item              | `data-editable="array-item"` on each child                               |
| `component`  | Re-rendering sections       | `data-editable="component"` `data-component` `data-prop`                 |
| `source`     | Hardcoded text in templates | `data-editable="source"` `data-path` `data-key`                          |

**Rule of thumb:** Use `component` when a section has conditional elements, style bindings, or derived content. Nest primitives (`text`, `image`, `array`) inside components for inline editing.

## Workflow

1. **Setup** — Run the setup script, verify integration, add conditional `registerComponents` import
2. **Census** — Document every visible section on every key page with treatment decisions
3. **Implement** — Work through sections, adding editable attributes per the census
4. **Verify** — Run the completeness checklist in the SSG-specific workflow doc

## Checklist reinforcement

The SSG-specific workflow docs contain detailed completeness checklists. These are not optional.

- **Read the checklist BEFORE starting** so you know what to aim for
- **You are not done until every checklist item is verified**
- Every section in the census must have editable regions OR a documented `sidebar-only` justification with a specific technical reason
- Don't mark arrays as done without nested editables on their items — CRUD controls alone are not sufficient

## Common mistakes

| Excuse                                                      | Reality                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Text editables are enough for this page"                   | Check images, arrays, and components too. Text-only is a half-finished job.                                                                                                                                                                                                                                  |
| "This component is too complex for editable regions"        | If it renders data from a content collection, it should be editable. Simplify the component or wrap it in `editable-component` for sidebar re-rendering.                                                                                                                                                     |
| "The footer/nav doesn't need editables"                     | Shared partials need data-file-backed editables. Every visible section needs a treatment.                                                                                                                                                                                                                    |
| "Array items just need add/remove controls"                 | Without nested text/image editables on items, editors can't edit field values inline.                                                                                                                                                                                                                        |
| "I'll register components later"                            | Unregistered components can't re-render. Wire them as you go.                                                                                                                                                                                                                                                |
| "Source editables aren't needed — this text rarely changes" | If it's visible, it should be editable -- but the _mechanism_ depends on the page. Page-builder `pages` collection entry for unique-layout pages with 2+ sections; data file for shared UI; `data-editable="source"` only for long-form prose.                                                               |
| "I'll source-editable any hardcoded string on a page"       | Source-editable is for long-form prose only. If the page has 2+ structured sections, it belongs in a page-builder `pages` collection. See [migrate-to-cloudcannon/astro/page-building.md § When to reach for page builder](../migrate-to-cloudcannon/astro/page-building.md#when-to-reach-for-page-builder). |
