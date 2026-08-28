---
name: brainstorming
description: >-
  Structured design dialogue before CloudCannon work that has more than one
  sensible answer — a migration's editability tradeoffs, how to model a
  collection or page builder, restructuring content or config, or an ambiguous
  "make this work with CloudCannon". Explores intent and constraints, then
  presents a design for approval before implementation. Not for single
  well-defined tasks, clear bug fixes, or a detailed spec.
---

# Brainstorming

Turn rough ideas into validated designs through structured dialogue before touching code or config.

**Do NOT start implementation until a design is presented and the user approves it.** This applies regardless of perceived simplicity — "simple" tasks are where unexamined assumptions cause the most wasted work.

## Process

### 1. Explore context

Check the project state first: files, config, recent changes, existing patterns. Understand what exists before asking questions.

### 2. Ask clarifying questions

- **One question at a time.** Don't overwhelm with a list.
- **Prefer multiple choice** when there are known options. Open-ended when the space is genuinely open.
- Focus on: purpose, constraints, success criteria, what the user cares about most.

### 3. Propose approaches

Present 2-3 approaches with tradeoffs. Lead with your recommendation and explain why. Be honest about downsides.

If only one approach makes sense, say so and explain why alternatives don't work — don't invent fake options.

### 4. Present design

Once you understand what to build, present the design in sections scaled to complexity:

- A few sentences for straightforward sections
- More detail for sections with genuine tradeoffs
- **Get approval after each section** so the user can course-correct early

Cover: what changes, what stays the same, what the user needs to verify, and any decisions deferred to implementation.

### 5. Transition to implementation

Once the user approves the design, proceed to implementation. For migrations, this means entering the relevant migration phase. For other work, start executing.

## When to use

- **Migrations** — before starting, explore the site structure and discuss editability tradeoffs (page builder vs static pages, what to make editable, content restructuring decisions)
- **Adding features** — before adding snippets, visual editing, or configuration to an existing site
- **Restructuring** — before reorganizing content, collections, or config
- **Ambiguous requests** — when the user says "make this work with CC" without specifying scope

## When not to use

- Single, well-defined tasks with an obvious implementation ("add `snippet: true` to `_editables`")
- Bug fixes where the problem and solution are clear
- The user explicitly says "just do it" or provides a detailed spec

## Contents

This skill is a single file — there are no deep-dives. Once a design is approved, implementation continues in the skill that owns the work:

| Then go to                                                             | For                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| [`migrate-to-cloudcannon`](../migrate-to-cloudcannon/SKILL.md)         | A full migration, entering at Phase 1            |
| [`cloudcannon-configuration`](../cloudcannon-configuration/SKILL.md)   | Collections, Inputs, Structures, Collection URLs |
| [`cloudcannon-visual-editing`](../cloudcannon-visual-editing/SKILL.md) | Editable regions                                 |
| [`cloudcannon-snippets`](../cloudcannon-snippets/SKILL.md)             | MDX components or inline HTML in content         |
| [`make-site-multilingual`](../make-site-multilingual/SKILL.md)         | Rosey and the CloudCannon connector              |

## Key principles

- **One question at a time** — don't overwhelm
- **Multiple choice preferred** — easier to answer than open-ended when options are known
- **YAGNI** — remove unnecessary complexity from designs
- **Explore alternatives** — always consider whether a different approach would be simpler
- **Be honest** — if something seems overcomplicated, say so. Push back on scope creep.
- **Incremental validation** — present design in sections, get approval before moving on

## Common mistakes

| Excuse                                       | Reality                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| "This is too simple to need a design"        | Simple tasks are where assumptions cause the most waste. The design can be short.      |
| "I already know what to do"                  | You know what YOU would do. The user may have different priorities or constraints.     |
| "Asking questions slows things down"         | Wrong assumptions slow things down more. One question now saves rework later.          |
| "The user will tell me if something's wrong" | Users often don't know what to flag until they see the wrong result. Validate upfront. |
| "I'll figure it out as I go"                 | That's how you end up redoing work. Explore the space first.                           |
