# Skill authoring guide

Two kinds of rule live here. **Repo architecture** governs where a file goes; **writing style** governs what goes in it. Architecture comes first, because bad prose costs one file while a misplaced rule gets copied and then drifts.

Skills are consumed by AI agents with limited context windows. Prose is low signal per token — agents skim past paragraphs and miss rules buried inside them. Every addition to a skill should earn its tokens.

## Repo architecture

### A skill is a capability or a journey — never an SSG

**MUST NOT:** name a skill after an SSG (`migrate-hugo`, `troubleshoot-astro`). SSG-specific content lives in a `<ssg>/` directory inside the skill that already owns the concern.

**Why:** an SSG-named skill has to re-state every CloudCannon-side rule it touches, and the copies drift apart. One concern, one home, N thin SSG deltas.

There are exactly two axes, and each is expressed differently:

| Axis                                                           | Expressed as                           |
| -------------------------------------------------------------- | -------------------------------------- |
| Concern — configuration, snippets, visual editing, translation | The skill                              |
| SSG — Astro, Hugo, Eleventy, …                                 | A `<ssg>/` directory inside that skill |

**Common miss:** a rule that feels SSG-specific usually is not. "A collection that produces pages needs a `url` pattern" is a CloudCannon rule; "Astro's `build.format` decides whether that pattern needs a trailing slash" is the Astro delta. Split them and the base file stays reusable.

### The base file owns the rule; the SSG file owns the delta

**MUST:** state the generic rule in the skill-root file. `<ssg>/<same-name>.md` carries only what differs, and links back to the base in its opening line.

**MUST:** give every `<ssg>/` directory an `overview.md` — the entry point an agent reads first.

**MUST NOT:** restate a base rule inside an SSG file for convenience.

**Why:** with one SSG the duplication is invisible. At four it is the main source of contradictory guidance, because only one copy ever gets updated.

Canonical example: `cloudcannon-configuration/collection-urls.md` owns placeholders, filters and troubleshooting; `cloudcannon-configuration/astro/collection-urls.md` covers only the glob-loader `slug` quirk and the `trailingSlash` rule, and links back in its first line.

### Every skill belongs to one of three tiers

**MUST:** pick the tier before creating a skill. It fixes the name, the entry shape, and whether the skill keeps state.

| Tier           | What it is                                                        | Named                   | Keeps state                     | Today                                                                             |
| -------------- | ----------------------------------------------------------------- | ----------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| **Journey**    | Long, multi-phase, run once against a site                        | Verb-first              | Yes — `.cloudcannon/migration/` | `migrate-to-cloudcannon`, `make-site-multilingual`                                |
| **Capability** | One CloudCannon feature; delegated to, or entered directly        | `cloudcannon-<feature>` | No                              | `cloudcannon-configuration`, `cloudcannon-snippets`, `cloudcannon-visual-editing` |
| **Operation**  | Short, symptom- or task-driven, against a site that already works | Verb-first              | No                              | `translate-site`                                                                  |

**Why:** the tiers have genuinely different shapes — a journey needs phase gates and handoff notes, an operation needs a symptom table and an exit. Choosing the tier first stops an operation from growing migration scaffolding it will never use.

### Troubleshooting lives with the capability it is about

**MUST:** put symptom → cause → fix tables in the owning skill's `troubleshooting.md`, with SSG-specific rows in `<ssg>/troubleshooting.md`.

**MUST NOT:** create a general troubleshooting skill that owns rules. A front door that only dispatches to the owning skill is fine; one that explains fixes is not.

**Why:** a fix explained away from the rule it belongs to is a second copy of that rule. This is "One canonical source per rule" (below) applied to the repo layout rather than to prose.

### SKILL.md is a router, and has a budget

**MUST:** keep `SKILL.md` under roughly 150 lines.

**MUST:** include `## When to use`, `## When not to use`, and a `## Contents` table. See [SKILL.md entrypoint shape](#skillmd-entrypoint-shape) for the full structure.

**Why:** `SKILL.md` is matched against the user's request before anything else is read. Skills here share vocabulary — configure, collection, content, build — so anti-triggers are the cheapest defence against routing to the wrong skill, and they only work if every skill carries them.

### Adding a new SSG

**MUST:** work through this list. Adding an SSG touches five skills; doing it ad hoc is how coverage ends up uneven without anyone noticing.

| Skill                        | Needs a `<ssg>/` directory?                     | Files                                                                       |
| ---------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| `migrate-to-cloudcannon`     | Yes — the phase guides are SSG-specific         | `overview.md`, `audit.md`, `content.md`, `build.md`, `page-building.md`     |
| `cloudcannon-configuration`  | Yes — schema and URL derivation differ          | `overview.md`, `configuration.md`, `collection-urls.md`, `<ssg>-gotchas.md` |
| `cloudcannon-visual-editing` | Yes — component re-rendering is framework-bound | `overview.md`, `visual-editing.md`, `visual-editing-reference.md`           |
| `cloudcannon-snippets`       | Only if the SSG has its own component syntax    | `overview.md`                                                               |
| `make-site-multilingual`     | Yes — root derivation and the pipeline differ   | `overview.md`                                                               |
| `translate-site`             | No — it operates on files, not templates        | —                                                                           |
| `brainstorming`              | No                                              | —                                                                           |

Then:

- Add a row to the SSG detection table in each affected `SKILL.md`
- Add a row to the coverage matrix in [README.md](README.md)
- Add the file lines to the file map in [ARCHITECTURE.md](ARCHITECTURE.md)
- Run `npm run check`

**Partial coverage is allowed, silent partial coverage is not.** If an SSG directory does not yet cover the whole workflow, say so in a coverage note at the top of its `overview.md` and mark it Partial in the README matrix.

**Why:** the first SSG after Astro is the one that proves whether a rule in a base file was ever really generic. Expect to move rules up out of `astro/` as you go — that is the axis working, not a mistake.

## Writing style

### Core rules

- **Front-load the rule, defer the reason.** First sentence states the rule imperatively. Second sentence (or a `**Why:**` line) explains. No multi-paragraph preambles before a rule.
- **One canonical source per rule.** If a rule appears in 2+ files, one file owns it and the others link. Summary tables in `SKILL.md` entrypoints link to deep-dives; they do not re-explain.
- **Tables for if/then logic.** Any prose shaped like "if X do Y; if Z do W" becomes a table with columns for condition, action, and (if useful) reason or when-to-use.
- **Checklists for procedures.** Imperative bullets starting with a verb — `Run`, `Verify`, `Remove`, `Add`. No narrative intros ("First, let's…", "Now we need to…").
- **MUST / MUST NOT for critical rules.** Rules where getting it wrong breaks the migration get a `**MUST**` or `**MUST NOT**` callout at the top of their section.
- **Include a `**Why:**` when the rule isn't self-evident.** **Why:** the reason lets agents judge edge cases the rule didn't anticipate; without it, rules get over- or under-applied. If the reason is genuinely obvious from the rule, skip it — but bias toward including it.

### SKILL.md entrypoint shape

`SKILL.md` is the first file an agent reads. It must answer three questions fast: when does this skill apply, when does it not, and where do I go next. It links to deep-dives; it does not re-explain them.

Minimum structure:

```markdown
---
name: <skill-name>
description: <one-line description — used for skill matching, so be specific>
---

# <Skill title>

<One- or two-sentence scope statement.>

## When to use

- <concrete trigger>
- <another trigger>

## When not to use

- <anti-trigger — prevents over-application>

## Contents

| File             | Covers         |
| ---------------- | -------------- |
| [foo.md](foo.md) | <what's in it> |
| [bar.md](bar.md) | <what's in it> |
```

**MUST NOT:** restate a rule that lives in a deep-dive. Link to it instead.
**Why:** duplication drifts — when the rule changes in one place but not the other, agents can't tell which is current.

### Gotcha skeleton

Every gotcha in a `*-gotchas.md` file (and every decision section elsewhere) follows this shape:

```markdown
## <Rule stated imperatively>

**MUST / MUST NOT:** <one-line rule>
**Why:** <one-line reason — often a failure mode or past incident>

<minimal code example, if applicable>

**Common miss:** <optional — what agents get wrong here>
```

If a gotcha doesn't fit this shape, that's usually a sign it's two gotchas.

### Anti-patterns

Do not write:

- Long narrative intros ("Let's look at how CloudCannon handles…"). Delete them. The heading is the intro.
- Justification paragraphs after a rule. If the reason is load-bearing, it's a `**Why:**` line. If it isn't, cut it.
- Reference material as prose. Exhaustive lists of attributes, options, or variants go in a table.
- The same rule re-explained in multiple files. Pick one home; the rest link.
- Multi-clause checklist bullets ("Verify X and also Y and remember Z"). One check per bullet.
- Emoji decorations (✅ ❌ 🎉). MUST/MUST NOT and plain prose do the job.

### When you're not sure

If you can't decide between prose and a table: if a future reader will need to scan for a specific case, it's a table. If they need to read it once end-to-end to understand the concept, prose is fine — but keep it short.

If you're adding a new rule and it feels like it belongs in three places: write it in one, and add one-line pointers from the others. Resist the urge to inline it "for convenience."
