# CloudCannon Agent Skills

Agent skills that help AI coding agents migrate existing SSG sites to [CloudCannon](https://cloudcannon.com). Copy the skills into your project, open it in your AI coding agent, and ask it to migrate your site.

## Prerequisites

- An AI coding agent that supports skills (e.g. an agent mode in your IDE)
- An existing SSG site (see [supported SSGs](#supported-ssgs))
- A [CloudCannon](https://cloudcannon.com) account (for final verification)

## Getting started

1. Run `npx skills add CloudCannon/agent-skills` in the root of your project
2. Open your project in your AI coding agent
3. Ask the agent to migrate your site to CloudCannon, following a suggested prompt:

   For a full migration:

   > Migrate this site to CloudCannon using the migrating-to-cloudcannon skill. If the skill is not found, look in .agents/, otherwise do not continue.

   Or, for creating configuration:

   > Create CloudCannon configuration files using the cloudcannon-configuration skill. If the skill is not found, look in .agents/, otherwise do not continue.

   Or, for setting up Visual Editing:

   > Configure Visual Editing for CloudCannon using the cloudcannon-visual-editing skill. If the skill is not found, look in .agents/, otherwise do not continue.

The agent should pick up skills automatically based on their trigger descriptions in `SKILL.md`.

## Install as a Claude Code plugin

If you use [Claude Code](https://claude.com/claude-code), you can install all seven skills as a plugin instead of copying them in. Add the marketplace, then install the plugin:

```
/plugin marketplace add CloudCannon/agent-skills
/plugin install agent-skills@cloudcannon
```

The skills are then available namespaced as `agent-skills:<skill-name>` (e.g. `agent-skills:migrating-to-cloudcannon`), and Claude picks them up automatically based on their trigger descriptions — same as the copy-in route above.

## Supported SSGs

| SSG   | Status    |
| ----- | --------- |
| Astro | Supported |

More SSGs are planned. Each SSG has its own directory within the relevant skills containing SSG-specific guidance.

## Available skills

The tooling is split across composable skills that can be used together or independently.

| Skill                        | Purpose                       | When to use                                                                                   |
| ---------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| `migrating-to-cloudcannon`   | Full migration orchestrator   | Migrating a site to CloudCannon end-to-end (audit, configure, content, visual editing, build) |
| `cloudcannon-configuration`  | CloudCannon config setup      | Setting up `cloudcannon.config.yml`, collections, inputs, structures, or the CloudCannon CLI  |
| `cloudcannon-snippets`       | Snippet configuration         | Configuring MDX components or inline HTML for CloudCannon's Content Editor                    |
| `cloudcannon-visual-editing` | Visual Editor support         | Adding editable regions so page content can be edited inline in CloudCannon's Visual Editor   |
| `brainstorming`              | Structured design exploration | Exploring intent, requirements, and tradeoffs before implementation                           |
| `make-site-multilingual`     | Rosey multilingual setup      | Making a site translatable with Rosey, plus the CloudCannon connector (RCC) editing layer     |
| `translate-multilingual`     | AI translation                | Filling in or updating Rosey locale files and per-locale content directories                  |

For a full migration, start with `migrating-to-cloudcannon` -- it orchestrates the other skills at the right time. The standalone skills (`cloudcannon-configuration`, `cloudcannon-snippets`, `cloudcannon-visual-editing`) are useful when you only need one piece, e.g. "add visual editing to my existing CloudCannon site".

The two multilingual skills sit outside the five-phase migration flow -- they apply to a site that is already on CloudCannon, or to one that never migrates. Use `make-site-multilingual` to set up Rosey, then `translate-multilingual` to fill in the translations.

## How it works

A full migration runs through five phases:

1. **Audit** -- Analyze the site's content structure, components, routing, and build pipeline
2. **Configuration** -- Generate and customize CloudCannon config files (delegates to `cloudcannon-configuration` and optionally `cloudcannon-snippets`)
3. **Content** -- Restructure content files if needed so they're CMS-friendly
4. **Visual editing** -- Add editable regions for inline editing in CloudCannon's Visual Editor (delegates to `cloudcannon-visual-editing`)
5. **Build and test** -- Validate the migration works end-to-end

Each phase has a verification checklist. The agent reads docs just-in-time during each phase rather than front-loading everything. Deterministic steps are automated as scripts to save tokens and improve consistency.

Not every site needs all phases. Small sites may skip content restructuring. Visual editing is optional but high-value.

## Contributing

### Repo structure

```
skills/
  migrating-to-cloudcannon/         # Migration orchestrator
  cloudcannon-configuration/        # Config skill (standalone)
  cloudcannon-snippets/             # Snippets skill (standalone)
  cloudcannon-visual-editing/       # Visual editing skill (standalone)
  brainstorming/                    # Design exploration skill
  make-site-multilingual/           # Rosey + RCC setup (standalone, outside the migration phases)
    tagging.md                      # Phase 3 in full — data-rosey authoring rules
    troubleshooting.md              # Symptom-driven diagnosis
  translate-multilingual/           # AI translation of locale files and content (standalone)
```

### Key conventions

- **Living documents** -- Skills are actively maintained. When an agent uncovers a new pattern or edge case during a migration, update the relevant skill as part of the same task rather than leaving it as a follow-up.
- **Just-in-time reading** -- Agents read docs as needed during each phase rather than loading everything upfront. The skills are structured to support this.
- **Architecture and writing style** -- [STYLE.md](STYLE.md) governs both: where a file goes (skills are concerns, SSGs are subdirectories, every skill has a tier) and what goes in it (front-load rules, prefer tables and checklists over prose, one canonical source per rule).

For a detailed walkthrough of how agents traverse the skill files, see [GUIDE.md](skills/migrating-to-cloudcannon/GUIDE.md).

### Development

Markdown files are formatted with [Prettier](https://prettier.io). CI runs `prettier --check` on every pull request and fails if anything is unformatted.

```sh
npm install           # one-time: install dev dependencies
npm run format        # format all markdown files in place
npm run format:check  # preview what CI will check (no changes written)
```

Run `npm run format` before committing changes to any markdown file.
