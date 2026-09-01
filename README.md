# CloudCannon Agent Skills

Agent skills for working with [CloudCannon](https://cloudcannon.com) sites: migrating an existing SSG site onto CloudCannon, configuring it, adding visual editing and snippets, making it multilingual, and maintaining it afterwards. Add the skills to your project, open it in your AI coding agent, and ask.

## Prerequisites

- An AI coding agent that supports skills (e.g. an agent mode in your IDE)
- An SSG site — see [SSG coverage](#ssg-coverage)
- A [CloudCannon](https://cloudcannon.com) account, for the parts a human has to verify

## Getting started

1. Run `npx skills add CloudCannon/agent-skills` in the root of your project
2. Open your project in your AI coding agent
3. Ask for what you want. Agents pick up skills automatically from the trigger descriptions in each `SKILL.md`, so plain requests usually work — but naming the skill removes any ambiguity:

   > Migrate this site to CloudCannon using the migrate-to-cloudcannon skill. If the skill is not found, look in .agents/, otherwise do not continue.

   > Create CloudCannon configuration files using the cloudcannon-configuration skill. If the skill is not found, look in .agents/, otherwise do not continue.

   > Configure Visual Editing for CloudCannon using the cloudcannon-visual-editing skill. If the skill is not found, look in .agents/, otherwise do not continue.

## Install as a Claude Code plugin

If you use [Claude Code](https://claude.com/claude-code), you can install the skills as a plugin instead of copying them in. Add the marketplace, then install the plugin:

```
/plugin marketplace add CloudCannon/agent-skills
/plugin install agent-skills@cloudcannon
```

The skills are then available namespaced as `agent-skills:<skill-name>` (e.g. `agent-skills:migrate-to-cloudcannon`), and Claude picks them up automatically from their trigger descriptions — same as the copy-in route above.

## Available skills

Skills come in three tiers. The tier tells you how long the skill runs and whether it expects a site that already works.

### Journeys — run once against a site, multi-phase

| Skill                    | When to use                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `migrate-to-cloudcannon` | Migrating a site to CloudCannon end to end — audit, configure, content, editing, build |
| `make-site-multilingual` | Making a site translatable with Rosey, plus the optional CloudCannon connector (RCC)   |

### Capabilities — one CloudCannon feature each

Entered directly when you only need one piece ("add visual editing to my existing site"), or delegated to by a journey at the right phase.

| Skill                        | When to use                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `cloudcannon-configuration`  | `cloudcannon.config.yml`, collections, inputs, structures, collection URLs, the CLI |
| `cloudcannon-snippets`       | MDX components or inline HTML in CloudCannon's Content Editor                       |
| `cloudcannon-visual-editing` | Editable regions, so page content can be edited inline in the Visual Editor         |
| `cloudcannon-dev-server`     | Running the site locally in CloudCannon with `cloudcannon dev`, and verifying it    |

### Operations — short tasks on a site that already works

| Skill            | When to use                                                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| `translate-site` | Filling in or updating Rosey locale files and per-locale content directories |
| `brainstorming`  | A CloudCannon request with more than one sensible answer, before building it |

Not sure where to start? [ARCHITECTURE.md](ARCHITECTURE.md#which-skill-do-i-start-in) has a router.

## SSG coverage

Coverage is per skill: a skill supports an SSG once it has a `<ssg>/` directory covering that SSG's differences.

| Skill                        | Astro | Eleventy | Hugo    |
| ---------------------------- | ----- | -------- | ------- |
| `migrate-to-cloudcannon`     | Yes   | —        | —       |
| `make-site-multilingual`     | Yes   | Yes      | Partial |
| `cloudcannon-configuration`  | Yes   | —        | —       |
| `cloudcannon-snippets`       | Yes   | —        | —       |
| `cloudcannon-visual-editing` | Yes   | —        | —       |
| `cloudcannon-dev-server`     | Yes   | Yes      | Partial |

`translate-site` and `brainstorming` are SSG-agnostic — they work the same everywhere and have no SSG directories.

`cloudcannon-dev-server` is the one skill whose SSG delta is not a `<ssg>/` directory — it is a
detection table in `cc-serve.sh`. Hugo is Partial there because the script cannot detect `public/`
or run `hugo`; it works with `--output public --no-build`.

"Partial" means the SSG directory exists but does not yet cover the whole workflow; each such file carries its own coverage note. More SSGs are planned — each gets a `<ssg>/` directory inside the skills that need one, never a skill of its own.

## How a migration works

`migrate-to-cloudcannon` runs five phases:

1. **Audit** — analyse the site's content structure, components, routing, and build pipeline
2. **Configuration** — generate and customize CloudCannon config files (delegates to `cloudcannon-configuration`, and to `cloudcannon-snippets` if content has MDX components or inline HTML)
3. **Content** — restructure content files if needed so they are CMS-friendly
4. **Visual editing** — add editable regions for inline editing (delegates to `cloudcannon-visual-editing`)
5. **Build and test** — validate the migration end to end

Each phase has a verification checklist. The agent reads docs just-in-time during each phase rather than front-loading everything, and deterministic steps run as scripts to save tokens and improve consistency.

Not every site needs all phases. Small sites may skip content restructuring. Visual editing is optional but high-value.

The other journey, `make-site-multilingual`, is independent of these phases — it applies to a site already on CloudCannon, or to one that never migrates.

## Contributing

[ARCHITECTURE.md](ARCHITECTURE.md) is the map: the tiers, the full file map, and where a new file belongs. [STYLE.md](STYLE.md) is the law: the architectural invariants and the writing rules.

### Key conventions

- **Concerns are skills, SSGs are subdirectories** — a skill owns one concern for every SSG; `<ssg>/` holds only what differs. Never a skill named after an SSG.
- **Living documents** — skills are actively maintained. When an agent uncovers a new pattern or edge case during a migration, update the relevant skill as part of the same task rather than leaving it as a follow-up.
- **Just-in-time reading** — agents read docs as needed during each phase rather than loading everything upfront. The skills are structured to support this.
- **One canonical source per rule** — if a rule appears in two files, one owns it and the other links.

### Development

```sh
npm install     # one-time: install dev dependencies
npm run check   # everything CI runs
npm run format  # format all markdown files in place
```

`npm run check` is formatting plus `scripts/check-links.mjs`, which verifies that every relative link and every `#anchor` resolves, and that each `SKILL.md`'s frontmatter `name` matches its directory. CI runs both on every pull request.

Anchors are the easy thing to break: most internal links point at a specific heading, so rewording a heading silently orphans every link to it. Run `npm run check` before committing.
