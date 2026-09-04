# Repo architecture

How this repo is organised, and where a new file belongs — for humans reviewing agent behaviour, and for contributors adding to it.

The rules this layout implements live in [STYLE.md § Repo architecture](STYLE.md#repo-architecture). This file is the map; STYLE.md is the law.

## The shape in one paragraph

Skills are organised by **concern**, never by SSG. A skill owns one concern for every SSG; SSG-specific content lives in a `<ssg>/` directory inside it, holding only what differs. That keeps N SSGs × M concerns from becoming N×M copies of the same rule. Every skill belongs to one of three tiers, and the tier fixes its name, its shape, and whether it keeps state.

## Skills by tier

### Journeys

Long, multi-phase, run once against a site. They keep state in `.cloudcannon/migration/`.

| Skill                    | Purpose                                             | Entry point                                        |
| ------------------------ | --------------------------------------------------- | -------------------------------------------------- |
| `migrate-to-cloudcannon` | Full migration of an existing SSG site, five phases | [SKILL.md](skills/migrate-to-cloudcannon/SKILL.md) |
| `make-site-multilingual` | Rosey setup plus the optional RCC editing layer     | [SKILL.md](skills/make-site-multilingual/SKILL.md) |

### Capabilities

One CloudCannon feature each. Reference-shaped — delegated to by a journey, or entered directly on a site that is already migrated.

| Skill                        | Purpose                                                             | Entry point                                            |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| `cloudcannon-configuration`  | `cloudcannon.config.yml`, collections, inputs, structures           | [SKILL.md](skills/cloudcannon-configuration/SKILL.md)  |
| `cloudcannon-snippets`       | MDX components and inline HTML in the Content Editor                | [SKILL.md](skills/cloudcannon-snippets/SKILL.md)       |
| `cloudcannon-visual-editing` | Editable regions for the Visual Editor                              | [SKILL.md](skills/cloudcannon-visual-editing/SKILL.md) |
| `cloudcannon-dev-server`     | Build, serve and verify a site under `cloudcannon dev`              | [SKILL.md](skills/cloudcannon-dev-server/SKILL.md)     |
| `cloudcannon-cli`            | The CloudCannon CLI, and operations on hosted sites                 | [SKILL.md](skills/cloudcannon-cli/SKILL.md)            |
| `cloudcannon-sdk`            | The CloudCannon API from code, and the surface the CLI cannot reach | [SKILL.md](skills/cloudcannon-sdk/SKILL.md)            |

### Operations

Short, symptom- or task-driven, run against a site that already works.

| Skill            | Purpose                                                           | Entry point                                |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| `translate-site` | AI translation of Rosey locale files and per-locale content       | [SKILL.md](skills/translate-site/SKILL.md) |
| `brainstorming`  | Design dialogue before CloudCannon work with more than one answer | [SKILL.md](skills/brainstorming/SKILL.md)  |

## Which skill do I start in?

| The site…                                             | Start at                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| is not on CloudCannon yet                             | `migrate-to-cloudcannon` — it orchestrates the capabilities  |
| is on CloudCannon, and needs one capability added     | that capability skill directly                               |
| is on CloudCannon, and one feature is misbehaving     | the capability skill that owns it — each has its own gotchas |
| needs to serve more than one language                 | `make-site-multilingual`, then `translate-site`              |
| is being generated in this task (e.g. from WordPress) | `migrate-to-cloudcannon` § Chaining with upstream skills     |
| has a request with more than one sensible answer      | `brainstorming` first, then the skill that owns the work     |

## File map

```
── migrate-to-cloudcannon (journey) ──────────────────────────
SKILL.md                                ENTRY POINT — phases, handoff readiness, common mistakes
reading-order.md                        Which docs to read in which phase, and when
chunking.md                             Splitting a large migration across conversations
handoff.md                              Closing with the user — testing boundaries, what to ask
astro/overview.md                       ENTRY POINT for Astro — phase links
astro/audit.md                          Phase 1: site analysis
astro/content.md                        Phase 3: content restructuring
astro/build.md                          Phase 5: build verification
astro/page-building.md                  Phase 2/4: pages collection, page builder, BlockRenderer
astro/cc-friendly-conventions.md        Pre-migration scaffolding conventions
scripts/*.sh                            Automation (audit, rename)

── make-site-multilingual (journey) ──────────────────────────
SKILL.md                                ENTRY POINT — the two layers, starting point, SSG detection
setup.md                                The main workflow — nine phases, plus the checklist
tagging.md                              Phase 3 in full — every data-rosey/-ns/-root authoring rule
gotchas.md                              Preventative one-line rules
troubleshooting.md                      Symptom → cause → fix for builds that translate wrongly
migrating-from-i18n.md                  Replacing an existing i18n system, before setup
rcc-v1-to-v2-upgrade.md                 RCC v1 → v2, an alternative to setup
astro/overview.md                       Astro: root derivation, head/SEO, taxonomy routes
eleventy/overview.md                    Eleventy: tagging, taxonomy scoping, link localization
hugo/overview.md                        Hugo: tagging and pipeline (partial — see its coverage note)

── cloudcannon-configuration (capability) ────────────────────
SKILL.md                                ENTRY POINT — the schema gate, invalid keys, symptoms
json-schemas.md                         Querying the authoritative schemas
troubleshooting.md                      Symptom → fix, when configuration is already wrong
cloudcannon-cli-guide.md                Generating and validating config with the CLI
structures.md                           Inline vs split, previews, field completeness
collection-urls.md                      URL patterns — placeholders, trailing slash, troubleshooting
astro/overview.md                       ENTRY POINT for Astro — reading order
astro/configuration.md                  Phase 2: config, schemas, inputs, add options
astro/collection-urls.md                Astro: glob-loader slug, trailingSlash
astro/configuration-gotchas.md          Astro: icon fields, numeric values, etc.

── cloudcannon-snippets (capability) ─────────────────────────
SKILL.md                                ENTRY POINT — when/why/which approach
snippets.md                             Concepts — config patterns, raw HTML snippets
template-based.md                       Template-based snippet workflow
raw.md                                  Raw snippet syntax, all parser types
built-in-templates.md                   MDX templates vs import bundle, parser internals
gotchas.md                              Preventative rules — pitfalls and workarounds
troubleshooting.md                      Symptom index, routing to the rule that owns each fix
astro/overview.md                       ENTRY POINT for Astro — MDX stack, auto-import

── cloudcannon-visual-editing (capability) ───────────────────
SKILL.md                                ENTRY POINT — region types, workflow, checklist
editable-regions.md                     Region types, attribute reference, decision tree
editable-regions-internals.md           ON DEMAND — lifecycle trace, JS API, quirks
troubleshooting.md                      Symptom → fix, when regions misbehave
astro/overview.md                       ENTRY POINT for Astro — reading order
astro/visual-editing.md                 Phase 4: workflow, census, checklists
astro/visual-editing-reference.md       ON DEMAND — pattern reference, do not read front to back
scripts/setup-editable-regions.sh       Installs package, wires Astro integration

── cloudcannon-dev-server (capability) ───────────────────────
SKILL.md                                ENTRY POINT — the build-first rule, quick start, scripts
setup.md                                Prerequisites, what `cloudcannon dev` does, build/serve, ports
dev-server-api.md                       The `/__api` surface, events, proving a write landed
troubleshooting.md                      Symptom → cause → fix for the server itself
scripts/*.mjs, cc-serve.sh              Build/serve, freshness, read/write, write proof

── cloudcannon-cli (capability) ──────────────────────────────
SKILL.md                                ENTRY POINT — local/remote split, the live-site rule
commands.md                             The command surface, and querying documentation.json
authentication.md                       Credential methods, precedence, storage, CI
editing-sessions.md                     `sites files` — staging, committing, discarding
troubleshooting.md                      Symptom → cause → fix

── cloudcannon-sdk (capability) ──────────────────────────────
SKILL.md                                ENTRY POINT — routing, the write gate, requirements
client.md                               Constructing the client; why it reads no credentials itself
resources.md                            Sub-client hierarchy, UUID addressing, pagination, return types
api-surface.md                          Reading the shipped method list; the raw client.fetch escape hatch
editing-sessions.md                     Writing files to a hosted site through the SDK
troubleshooting.md                      Symptom → cause → fix

── translate-site (operation) ────────────────────────────────
SKILL.md                                ENTRY POINT — which part applies
locale-files.md                         Part 1 — rosey/locales/{code}.json (most sites)
content-directories.md                  Part 2 — per-locale content directories
scripts/*.mjs                           prepare/merge for locale files and content

── brainstorming (operation) ─────────────────────────────────
SKILL.md                                Single file — design dialogue, then hand off
```

## Maintainers: extending these skills

**New rule** — one file owns it; everything else links. If it feels like it belongs in three places, write it once and add one-line pointers. See [STYLE.md](STYLE.md).

**New shell script** — put it in the relevant skill's `scripts/` directory, document it in that skill's `scripts/README.md`, and reference it from the phase doc that runs it.

**New SSG** — follow the checklist in [STYLE.md § Adding a new SSG](STYLE.md#adding-a-new-ssg). Never create a skill named after an SSG.

**New skill** — pick its tier first (journey, capability, or operation); the tier fixes the name and the entry shape. Start from a skeleton in [templates/](templates/), then add it to the tier tables above and to the README.

**Every change** — `npm run check` must pass. It verifies formatting, that every relative link and `#anchor` resolves, and that each `SKILL.md`'s frontmatter `name` matches its directory.

**Any change touching the CLI or the SDK** — `npm run check:claims` must also pass. It reads the shipped `@cloudcannon/cli` and `@cloudcannon/sdk` packages and verifies that every flag and method the skills mention still exists. It needs those packages present, which is why it is separate from `npm run check`.

`--install` fetches the pinned versions under a temp prefix outside the repo and runs the check against them:

```sh
npm run check:claims -- --install
```

**MUST NOT install them into this repo's `node_modules`.** Doing so re-resolves its own `devDependencies`, which can move prettier a minor version. A minor prettier release is free to change how it normalises quotes in YAML samples, and the next `npm run format` then rewrites unrelated files. The check needs no dependencies of its own, so it has no reason to touch the tree at all.

To check against a copy already on disk — a release candidate, or a local build — point the check at it instead. It reports the version, and warns when it is not the one the claims were verified against:

```sh
npm run check:claims -- --cli-dir ../cli --sdk-dir ../sdk   # or CC_CLI_DIR / CC_SDK_DIR
```

CI runs the same `--install` command, so a PR fails only when a doc is wrong and never because a package shipped. **The pins live in one place: `documentedPackages` in `package.json`.** Bump them there deliberately, and re-check the claims when you do.

### Before bumping a pin

`check:claims` runs one direction only: every flag and method the skills name has to exist. It is blind to the opposite case — surface the package gained that the skills have never mentioned. Nothing fails, because there is no claim to falsify.

```sh
npm run diff:surface                      # pinned → latest published
npm run diff:surface -- --cli-to 0.0.20   # a specific version
```

It diffs `documentation.json` and the SDK's `.d.ts` files between the two versions and says, for each name that appeared or vanished, whether the skills already cover it:

```
  + dev --host                                         documented at skills/cloudcannon-dev-server/setup.md:28
  + sites update-build-config --environment-variables  UNDOCUMENTED
```

**Don't reach for the changelog instead.** Neither package ships one, and their GitHub releases are generated from PR titles, so a release that adds two flags can read "Add some requested options". Read the PR bodies for _semantics_ — a default that changed, a flag that means something new — and let the diff cover existence, which is all `check:claims` can police.
