# Configuration (Astro) — entry point

Astro-specific configuration guidance. The cross-SSG rules live one level up: [`../SKILL.md`](../SKILL.md) owns the CloudCannon CLI, Collections, Inputs, Structures and Select Data; the files here carry only what differs for Astro.

**MUST:** download the JSON schemas before writing any configuration — see [`../SKILL.md`](../SKILL.md#do-this-before-writing-any-configuration). Training data hallucinates keys.

## Reading order

| Order | File                                                 | Read when                                                            |
| ----- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| 1     | [configuration.md](configuration.md)                 | Always — the main Phase 2 workflow, schemas, inputs, add options     |
| 2     | [collection-urls.md](collection-urls.md)             | Any collection produces pages (the `slug` and `trailingSlash` traps) |
| 3     | [configuration-gotchas.md](configuration-gotchas.md) | During and after configuration — reference, not a front-to-back read |

## Cross-SSG deep-dives

| File                                                       | Covers                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| [../structures.md](../structures.md)                       | Structures — inline vs split, previews, field completeness |
| [../collection-urls.md](../collection-urls.md)             | URL placeholders, filters, troubleshooting                 |
| [../cloudcannon-cli-guide.md](../cloudcannon-cli-guide.md) | CloudCannon CLI commands and options                       |
