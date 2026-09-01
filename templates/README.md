# Templates

Skeletons for new skills. **This directory sits outside `skills/` on purpose** — the plugin loader treats every directory under `skills/` as a skill, so a template placed there would ship to users as one.

To use one, copy it to `skills/<name>/SKILL.md` and fill in every `<…>` placeholder. Then run `npm run check`, which verifies the frontmatter `name` matches the directory.

| Template                                   | Tier       | For                                                           |
| ------------------------------------------ | ---------- | ------------------------------------------------------------- |
| [operation-SKILL.md](operation-SKILL.md)   | Operation  | A short, symptom- or task-driven skill against a working site |
| [capability-SKILL.md](capability-SKILL.md) | Capability | One CloudCannon feature, reference-shaped                     |

There is deliberately no journey template. Journeys are rare, long, and stateful — copy the shape of an existing one ([`migrate-to-cloudcannon`](../skills/migrate-to-cloudcannon/SKILL.md) or [`make-site-multilingual`](../skills/make-site-multilingual/SKILL.md)) rather than starting from a skeleton.

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the tiers and [STYLE.md](../STYLE.md) for the rules a new skill must follow.
