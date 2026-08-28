# Chunking large migrations

How to split a migration across several conversations when one would run out of context. Evaluate this at the end of Phase 1, against `.cloudcannon/migration/audit.md`.

**Chunking is a suggestion, not a wall.** Nothing halts between phases — the agent tells the user context is heavy and lets them choose. See [SKILL.md § Per-phase workflow](SKILL.md#per-phase-workflow) for the gates that apply either way.

Migrations can run end-to-end in one conversation, but on larger sites context fills up — quality drops in later phases (especially Phase 4 visual editing) when the agent is recalling decisions from earlier phases through a long backscroll. Chunking into fresh conversations is a way to avoid that.

**Chunking is a suggestion, not a wall.** The agent doesn't _halt_ between phases — it tells the user "context is heavy; consider opening a fresh conversation for Phase N" and lets the user choose. If the user keeps going in the same conversation, that's fine.

## When to suggest a fresh conversation

At the end of Phase 1, evaluate the sizing thresholds against `.cloudcannon/migration/audit.md`:

| Signal                                | Threshold | Source                                                                       |
| ------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| Total pages                           | > 30      | Audit § Pages and routing                                                    |
| Hardcoded `.astro` → YAML conversions | > 15      | Audit census table rows recommending page-builder or fixed-schema collection |
| Distinct collections                  | > 5       | Audit § Content collections + new collections from census                    |

If any 2 thresholds are tripped, write `.cloudcannon/migration/plan.md` using the template below, then suggest to the user that later phases run in fresh conversations. Phase 4 (visual editing) is the most context-hungry — it's the most likely candidate for a fresh start.

| Shape                         | When                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Vertical (per-collection)** | Page-builder pages or unique-shape collections dominate — each unit has its own schema/visual-editing decisions |
| **Horizontal (per-phase)**    | Collections are mostly uniform — repetitive per-collection work benefits from one mental model at a time        |

## `.cloudcannon/migration/plan.md` template

```markdown
# Migration plan

## Sizing

- Total pages: <n> (threshold >30: <tripped|ok>)
- Hardcoded → YAML conversions: <n> (threshold >15: <tripped|ok>)
- Distinct collections: <n> (threshold >5: <tripped|ok>)
- Tripped: <count>/3 → <chunked recommended|single-pass fine>

## Shape (if chunking)

<vertical|horizontal> — because: <one-line reason>

## Chunks

Each chunk is intended as a single agent run, ideally in a fresh conversation
once context is heavy. The agent reads `.cloudcannon/migration/audit.md` + this file + the
listed phase doc, then works the listed scope.

| #   | Scope                            | Phase(s) | Inputs                     | Output artefact                           |
| --- | -------------------------------- | -------- | -------------------------- | ----------------------------------------- |
| 1   | <e.g. all collections — config>  | 2        | audit.md                   | cloudcannon.config.yml + configuration.md |
| 2   | <e.g. blog collection — content> | 3        | audit.md, configuration.md | content.md (blog section)                 |
| 3   | <...>                            | ...      | ...                        | ...                                       |

## Global decisions locked in chunk 1 (do not revisit)

- Collection URL patterns
- Shared structures (`_structures`)
- Snippet configs (if MDX/inline HTML)
- `registerComponents.ts` setup
```

**Resumption brief** (paste into a fresh conversation): "Read `.cloudcannon/migration/audit.md`, `.cloudcannon/migration/plan.md`, and the phase doc(s) listed for chunk N. Work chunk N's scope. Write the output artefact and stop."

**Repetition → script rule:** After migrating 2 entries of the same shape, write a throwaway script for the rest. 23 hand-conversions of the same article shape is wasted tokens and an error multiplier.
