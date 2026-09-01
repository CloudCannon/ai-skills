# Reading order

Which docs to read, in which phase, and when to skip them. The phases themselves are in [SKILL.md](SKILL.md).

## Per-phase reading order

### Phase 1: Audit

1. `migrate-to-cloudcannon/SKILL.md` → detect SSG
2. `migrate-to-cloudcannon/astro/overview.md` → phase summary
3. `migrate-to-cloudcannon/astro/audit.md` → full audit procedure

### Phase 2: Configuration

1. `cloudcannon-configuration/SKILL.md` → download the JSON schemas first; this is a gate
2. `cloudcannon-configuration/astro/overview.md` → the Astro reading order
3. `cloudcannon-configuration/cloudcannon-cli-guide.md` → generate baseline
4. `cloudcannon-configuration/astro/configuration.md` → customize config
5. `cloudcannon-configuration/collection-urls.md` → if any collection produces pages
6. `migrate-to-cloudcannon/astro/page-building.md` → if audit identified pages for content collection or page builder
7. `cloudcannon-configuration/structures.md` → if site has array-based components (3+ block types)
8. `cloudcannon-snippets/SKILL.md` → if site uses MDX components or inline HTML in content
9. `cloudcannon-configuration/astro/configuration-gotchas.md` → reference during and after configuration

### Phase 3: Content

1. `migrate-to-cloudcannon/astro/content.md`
2. `cloudcannon-configuration/structures.md` → field completeness rule

### Phase 4: Visual Editing

1. `cloudcannon-visual-editing/SKILL.md` → region types and quick reference
2. `cloudcannon-visual-editing/astro/overview.md` → the Astro reading order
3. `cloudcannon-visual-editing/astro/visual-editing.md` → full Astro integration workflow
4. `migrate-to-cloudcannon/astro/page-building.md` → if page builder (BlockRenderer, array editables)

### Phase 5: Build

1. `migrate-to-cloudcannon/astro/build.md`

## When to read the optional docs

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

Does the site need to serve more than one language?
├─ Yes → read make-site-multilingual (independent of the migration phases)
│        Are there locale files or per-locale content dirs to fill in?
│        ├─ Yes → translate-site
│        └─ No  → finish the Rosey setup first
└─ No  → skip both multilingual skills
```
