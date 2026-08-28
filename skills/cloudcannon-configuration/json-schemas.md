# Querying the CloudCannon JSON schemas

The schemas are the only authoritative source for configuration keys. Download them before writing any configuration — see [`SKILL.md`](SKILL.md#do-this-before-writing-any-configuration) for the gate and the download commands.

**MUST NOT:** commit the schema files. They are large generated reference files, not project artefacts — add `.cloudcannon/migration/*.schema.json` to `.gitignore`.
**Why:** the migration phase docs live in the same folder and _are_ intentional, so a blanket ignore on `.cloudcannon/migration/` would lose them.

**MUST NOT:** add a `# yaml-language-server: $schema=...` comment to `cloudcannon.config.yml`.

## Query recipes

Before writing any key, check it exists:

```bash
# List all valid keys for a section (e.g. collections_config entries)
jq '.definitions["collections_config.*"].properties | keys' .cloudcannon/migration/cloudcannon-config.latest.schema.json

# Check whether a specific key exists
jq '.definitions["collections_config.*"].properties.disable_file_actions' .cloudcannon/migration/cloudcannon-config.latest.schema.json

# List all valid input type values
jq '[.definitions | to_entries[] | select(.key | test("Input$")) | .key]' .cloudcannon/migration/cloudcannon-config.latest.schema.json

# List valid keys for _editables.content (BlockEditable)
jq '.definitions.BlockEditable.properties | keys' .cloudcannon/migration/cloudcannon-config.latest.schema.json

# List valid keys on a structure value item
jq '.definitions["type.structure.values.[*]"].properties | keys' .cloudcannon/migration/cloudcannon-config.latest.schema.json
```

No `jq`? Use Node:

```bash
node -e "const s=require('./.cloudcannon/migration/cloudcannon-config.latest.schema.json'); console.log(Object.keys(s.definitions['collections_config.*'].properties))"
```
