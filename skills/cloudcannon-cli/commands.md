# Command surface

As of 0.0.19, 35 commands across eight groups. This file maps them; it does not restate their flags, because those change between releases and the package ships an authoritative machine-readable copy.

## Discovering the exact flags

**MUST read the flags from the CLI rather than from memory or from this file.**

**Why:** `@cloudcannon/cli` generates `documentation.json` from its own command definitions at build time and exports it as a public entry point. It is always correct for the installed version; a transcription in a skill file is correct only until the next release.

Fastest, for one command:

```sh
npx @cloudcannon/cli sites files commit --help
```

Machine-readable, for the whole tree:

```sh
# Where the installed copy lives
node -p "require.resolve('@cloudcannon/cli/documentation.json')"

# Every leaf command, with its args and flags
node -e "
const d=require('@cloudcannon/cli/documentation.json');
const out=[];const walk=a=>{for(const c of a||[]){c.subCommands?.length?walk(c.subCommands):out.push(c)}};
walk(d.subCommands);
for(const c of out)console.log(c.fullName, '|', (c.options||[]).map(o=>'--'+o.name).join(' '));
"

# One command in full — description, args, options, defaults
node -e "
const d=require('@cloudcannon/cli/documentation.json');
const f=(a,n)=>{for(const c of a||[]){if(c.fullName===n)return c;const r=f(c.subCommands,n);if(r)return r}};
console.log(JSON.stringify(f(d.subCommands,'cloudcannon sites files commit'),null,2));
"
```

Each entry carries `name`, `fullName`, `description`, `usage`, `args` and `options`, and each option carries its type, default, and whether it is required.

## The groups

| Group         | Commands                                                                                         | Credentials | Owned by                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------- |
| `configure`   | `detect-ssg`, `detect-source`, `detect-collections`, `detect-build-commands`, `generate`         | No          | [`cloudcannon-configuration`](../cloudcannon-configuration/SKILL.md) decides what the output should say |
| `validate`    | `validate`                                                                                       | No          | [`cloudcannon-configuration`](../cloudcannon-configuration/SKILL.md)                                    |
| `dev`         | `dev`                                                                                            | No          | [`cloudcannon-dev-server`](../cloudcannon-dev-server/SKILL.md)                                          |
| `login`       | `login`, `logout`                                                                                | —           | [authentication.md](authentication.md)                                                                  |
| `orgs`        | `list`, `get`, `sites list`, `inboxes list`                                                      | Yes         | This skill                                                                                              |
| `sites`       | `list`, `get`, `create`, `rebuild`, `update-build-config`, `builds list`, four `print-last-*`    | Yes         | This skill                                                                                              |
| `sites files` | `list`, `get`, `upload`, `move`, `clone`, `delete`, `restore`, `discard`, `list-edits`, `commit` | Yes         | [editing-sessions.md](editing-sessions.md)                                                              |
| `builds`      | `print-logs`                                                                                     | Yes         | This skill                                                                                              |
| `inboxes`     | `submissions list`                                                                               | Yes         | This skill                                                                                              |

`configure`, `validate` and `dev` are documented by the skills that own their subject matter. Run them from here; decide their contents there.

## Shared flag patterns

Three shapes repeat across the remote commands. Learn them once rather than per command.

| Pattern            | Flags                                                            | Applies to                                                                                           |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Site addressing    | `--site <name\|id\|uuid\|domain>`                                | Every `sites` and `sites files` command except `list`, `create`                                      |
| Org addressing     | `--org <name\|id\|uuid>`                                         | `orgs get`, `orgs sites list`, `orgs inboxes list`, `sites create`                                   |
| Pagination/sorting | `--page`, `--items`, `--sort-by`, `--sort-direction`, `--filter` | `orgs list`, `orgs sites list`, `orgs inboxes list`, `sites builds list`, `inboxes submissions list` |

**MUST NOT** page through a list by calling the command repeatedly without `--page`. The default returns the first page only, and a short result is indistinguishable from a complete one.

## Output

Read commands print JSON to stdout and nothing else, so they pipe straight into `jq` or `JSON.parse` with no flag:

```sh
npx @cloudcannon/cli sites list | jq -r '.[].name'
```

`sites files list-edits --verbose` prints the full objects the API returned rather than the summarised shape. Reach for it when a field you expect is missing from the default output.

Errors go to stderr, and a failed command sets a non-zero exit code. Check the code rather than testing whether stdout was empty — an empty JSON array is a valid, successful result.

## Changing build configuration

**`sites update-build-config` changes the build settings of an existing site.** It takes `--install-command`, `--build-command`, `--output-path`, `--ssg`, `--preserved-paths`, `--environment-variables`, `--preserve-output`, `--include-git`, `--building-locked`, `--default-locale`, and per-runtime versions (`--node-version`, `--hugo-version`, `--ruby-version`, `--deno-version`).

**Why this matters:** `.cloudcannon/initial-site-settings.json` is read only when CloudCannon first provisions the site, so it cannot be used to change an existing site's build. That does not mean the change requires the dashboard — this command does it from the command line.

**MUST confirm with the user first.** It changes how every subsequent build of a live site runs.

## Creating a site

`sites create <source>` connects a git repository as a new site, taking `--org` and `--name`. The positional source identifies the repository to connect. Confirm before running: it creates real infrastructure under the user's organisation.

## Shell completion

The CLI ships tab completion for zsh, bash and fish via `cloudcannon complete <shell>`, documented in the [CLI README](https://github.com/CloudCannon/cli#shell-completions). It is a convenience for humans and does not appear in `documentation.json`.
