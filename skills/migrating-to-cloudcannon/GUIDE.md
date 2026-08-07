# Human Traversal Guide

How to navigate the migration skill and its companion skills — for humans reviewing agent behaviour or learning the doc structure.

## Before you start

See [SKILL.md](SKILL.md) for the model-selection rule.

## Skill Architecture

The migration is split across four skills:

| Skill                        | Purpose                                                         | Standalone?                              |
| ---------------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| `migrating-to-cloudcannon`   | Orchestrator — phases, SSG detection, handoff                   | No — orchestrates the others             |
| `cloudcannon-configuration`  | CC config, CloudCannon CLI, structures, collection URLs, inputs | Yes — "configure my site for CC"         |
| `cloudcannon-snippets`       | Snippet config for MDX components and inline HTML               | Yes — "add snippets to my CC site"       |
| `cloudcannon-visual-editing` | Editable regions, Visual Editor setup                           | Yes — "add visual editing to my CC site" |

### Related standalone skills

Three more skills live in this repo but are **not** part of the five-phase migration. The two multilingual skills apply to a site already on CloudCannon, or to one that never migrates. `cloudcannon-dev-server` is different: it is not a phase, but it can be used during any of them to check work in the real Visual Editor.

| Skill                    | Purpose                                                   | Read when                                                    |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------ |
| `make-site-multilingual` | Rosey setup, `data-rosey` tagging, the RCC editing layer  | The site needs to be translatable                            |
| `translate-multilingual` | AI translation of locale JSON and per-locale content dirs | Rosey is already set up and the locale files need filling in |
| `cloudcannon-dev-server` | Driving the local CloudCannon to verify work              | You need to see what the Visual Editor actually rendered     |
| `local-dev-servers`      | Port discipline and cleanup for any long-running process  | You are about to start a dev server or browser, or stop one  |

## File Map

```
── migrating-to-cloudcannon (orchestrator) ────────────────────
SKILL.md                                ENTRY POINT — phases, SSG table, handoff, naming conventions
GUIDE.md                                THIS FILE — orientation for humans
astro/overview.md                       ENTRY POINT for Astro — phase links
astro/audit.md                          Phase 1: site analysis
astro/content.md                        Phase 3: content restructuring
astro/build.md                          Phase 5: build verification
astro/cc-friendly-conventions.md        Pre-migration scaffolding conventions
astro/page-building.md                  Phase 2/4: pages collection, page builder, BlockRenderer
scripts/README.md                       Script inventory
scripts/*.sh                            Automation scripts (audit, rename)

── cloudcannon-configuration ──────────────────────────────────
SKILL.md                                Entry point — CloudCannon CLI, collections, inputs, structures
cloudcannon-cli-guide.md                CloudCannon CLI commands and options
structures.md                           Structures — inline vs split, previews, field completeness
collection-urls.md                      URL patterns — placeholders, trailing slash, troubleshooting
astro/configuration.md                  Phase 2: CC config, schemas, inputs, add options
astro/configuration-gotchas.md          Phase 2 gotchas: icon fields, numeric values, etc.

── cloudcannon-snippets ───────────────────────────────────────
SKILL.md                                Entry point — when/why/which approach
snippets.md                             Snippet concepts — config patterns, raw HTML snippets
astro.md                                Astro-specific: MDX stack, auto-import
template-based.md                       Template-based snippet workflow
raw.md                                  Raw snippet syntax, all parser types
built-in-templates.md                   MDX templates vs import bundle, parser internals
gotchas.md                              Snippet pitfalls and debugging

── cloudcannon-visual-editing ─────────────────────────────────
SKILL.md                                Entry point — region types, workflow, checklist
editable-regions.md                     Region types, attribute reference, decision tree
editable-regions-internals.md           ON DEMAND — lifecycle trace, JS API, quirks
astro/visual-editing.md                 Phase 4: workflow, census, checklists
astro/visual-editing-reference.md       Phase 4: pattern reference (read on demand)
scripts/setup-editable-regions.sh       Installs package, wires Astro integration

── make-site-multilingual (outside the migration phases) ──────
SKILL.md                                Entry point — the 9 phases, RCC layer, gotchas, v1→v2 upgrade
tagging.md                              Phase 3 in full — every data-rosey/-ns/-root authoring rule
troubleshooting.md                      Symptom → cause → fix for builds that translate wrongly
astro.md                                Astro-specific: root derivation, head/SEO, taxonomy routes
eleventy.md                             Eleventy-specific tagging, taxonomy scoping, link localization
hugo.md                                 Hugo-specific tagging and pipeline (partial — see its coverage note)

── translate-multilingual (outside the migration phases) ──────
SKILL.md                                Entry point — locale JSON (Part 1), content dirs (Part 2)
scripts/README.md                       Script inventory
scripts/*.mjs                           prepare/merge for locale files and content

── cloudcannon-dev-server (usable during any phase) ───────────
SKILL.md                                Entry point — the verification ladder, Tier 0 → 2
setup.md                                Prerequisites, build + serve, ports
addressing.md                           Naming a component on the page
driving-the-editor.md                   Frame model, routing, selector stability
dev-server-api.md                       The /__api surface — checks with no browser
rcc.md                                  RCC / multilingual checklist
troubleshooting.md                      Symptom → cause
reference.md                            Observed routes and DOM, with versions
scripts/README.md                       Script inventory

── local-dev-servers (usable during any phase) ────────────────
SKILL.md                                Entry point — the three rules
ports.md                                Claiming a port, identity probes
cleanup.md                              Registry, end-of-task cleanup, orphans
scripts/README.md                       Script inventory
```

## Reading Order Per Phase

### Phase 1: Audit

1. `migrating-to-cloudcannon/SKILL.md` → detect SSG
2. `migrating-to-cloudcannon/astro/overview.md` → phase summary
3. `migrating-to-cloudcannon/astro/audit.md` → full audit procedure

### Phase 2: Configuration

1. `cloudcannon-configuration/cloudcannon-cli-guide.md` → generate baseline
2. `cloudcannon-configuration/astro/configuration.md` → customize config
3. `cloudcannon-configuration/collection-urls.md` → if any collection produces pages
4. `migrating-to-cloudcannon/astro/page-building.md` → if audit identified pages for content collection or page builder
5. `cloudcannon-configuration/structures.md` → if site has array-based components (3+ block types)
6. `cloudcannon-snippets/SKILL.md` → if site uses MDX components or inline HTML in content
7. `cloudcannon-configuration/astro/configuration-gotchas.md` → reference during and after configuration

### Phase 3: Content

1. `migrating-to-cloudcannon/astro/content.md`
2. `cloudcannon-configuration/structures.md` → field completeness rule

### Phase 4: Visual Editing

1. `cloudcannon-visual-editing/SKILL.md` → overview and quick reference
2. `cloudcannon-visual-editing/astro/visual-editing.md` → full Astro integration workflow
3. `migrating-to-cloudcannon/astro/page-building.md` → if page builder (BlockRenderer, array editables)

### Phase 5: Build

1. `migrating-to-cloudcannon/astro/build.md`

## Decision Tree: When to Read Optional Docs

```
Does the site use MDX components in content?
├─ Yes → read cloudcannon-snippets skill
│        Does a component have nested children (e.g. Tabs > Tab)?
│        ├─ Yes → read raw.md (repeating parser)
│        └─ No  → template-based.md may suffice
└─ No  → skip all snippet docs

Does the site have inline HTML in .md files (<figure>, <video>, etc.)?
├─ Yes → read cloudcannon-snippets/raw.md
└─ No  → skip

Does the site have static pages with structured/repeated data editors need CRUD over?
├─ Yes → read astro/page-building.md (pages collection, even without a page builder)
└─ No  → skip

Does the site have 3+ reusable block components?
├─ Yes → read astro/page-building.md + cloudcannon-configuration/structures.md
└─ No  → skip page builder, use schema-based pages

Is the visual editor behaving unexpectedly?
├─ Yes → read cloudcannon-visual-editing/editable-regions-internals.md
└─ No  → editable-regions.md is sufficient

Is a page not loading in the visual editor?
├─ Yes → check cloudcannon-configuration/collection-urls.md § Troubleshooting
└─ No  → skip

Do you need to SEE what the visual editor rendered, rather than reason about it?
├─ Yes → read cloudcannon-dev-server (drives the real editor locally)
│        Is the question answerable from the build, a grep, or dist/?
│        ├─ Yes → do that instead; the browser tier is ~30x slower
│        └─ No  → cloudcannon-dev-server/SKILL.md § The verification ladder
└─ No  → skip

Are you about to start a dev server, preview server, or headless browser?
├─ Yes → read local-dev-servers (claim the port you meant; clean up after)
└─ No  → skip

Is a port already in use, or did a server come up on an unexpected port?
├─ Yes → local-dev-servers/ports.md — never fall back to another port
└─ No  → skip

Does the site need to serve more than one language?
├─ Yes → read make-site-multilingual (independent of the migration phases)
│        Are there locale files or per-locale content dirs to fill in?
│        ├─ Yes → translate-multilingual
│        └─ No  → finish the Rosey setup first
└─ No  → skip both multilingual skills
```

## Maintainers: extending these skills

**New shell scripts** — Place in the relevant skill's `scripts/` directory, document in its `scripts/README.md`, and reference from the relevant phase doc.

**New SSG** — Add an `astro/`-style directory in each domain skill that needs SSG-specific content (configuration, visual-editing, snippets) and in the migration skill (audit, content, build phases). Add a row to the supported SSGs table in the migration SKILL.md.
