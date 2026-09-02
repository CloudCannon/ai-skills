# Troubleshooting

Symptom → cause → fix for the CLI itself. For configuration that validates but behaves wrongly, see [`cloudcannon-configuration/troubleshooting.md`](../cloudcannon-configuration/troubleshooting.md).

## Authentication

| Symptom                                                     | Cause                                                                                                                         | Fix                                                                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `You must log in to run this command`                       | No credentials in the environment and no stored login                                                                         | `cloudcannon login`, or set the key pair — [authentication.md](authentication.md)                                          |
| Commands run, but against the wrong account                 | `CC_ACCESS_KEY_ID` / `CC_ACCESS_KEY_SECRET` outrank a stored login                                                            | Unset both, or log in as the intended account and clear the variables                                                      |
| Login looks fine locally, every remote command fails in CI  | The stored credential lives in a per-user data directory outside the repo                                                     | Set `CC_ACCESS_KEY_ID` / `CC_ACCESS_KEY_SECRET` from the runner's secrets                                                  |
| Commands run as a person when a scoped key was intended     | Only one half of the key pair is set. Through 0.0.19 the CLI skips the pair without warning rather than erroring              | Set both halves, or unset both. [Confirm the identity](authentication.md#which-identity-am-i-actually-using) before writes |
| `CLOUDCANNON_API_KEY` appears to be ignored                 | A stored login outranks it                                                                                                    | `cloudcannon logout`, or clear the stored credential for that run                                                          |
| A credential looks set but is not the one being used        | The chain resolves silently — nothing reports which method won                                                                | [Confirm the identity](authentication.md#which-identity-am-i-actually-using) with `orgs list`                              |
| `Access key id is invalid` / `Access key secret is invalid` | `login` rejected the key locally on shape — truncated or mangled paste, not a revoked key. Env-var keys are not shape-checked | Re-copy both halves in full                                                                                                |
| `Failed to authenticate with the CloudCannon API`           | The shape was valid and the server refused it                                                                                 | `cloudcannon logout` then `login`, or reissue the access key                                                               |

## Editing sessions and files

| Symptom                                                                   | Cause                                                               | Fix                                                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| The upload succeeded but the file is not on the site                      | It is staged in an editing session, not committed                   | `sites files list-edits`, then `sites files commit` — [editing-sessions.md](editing-sessions.md) |
| `Site has no pending edits to commit`                                     | Nothing staged, or the changes were staged against a different site | Re-check `--site`, then `sites files list-edits`                                                 |
| `you must either provide a list of files to commit or use the --all flag` | `commit` will not guess a scope                                     | Pass explicit paths, or `--all` once `list-edits` shows what that includes                       |
| `File already exists and allow_overwrite is not set`                      | `upload`, `move` and `clone` refuse to clobber by default           | Re-run with `--allow-overwrite` if overwriting is intended                                       |
| A staged change needs undoing                                             | `discard` drops a pending change; `restore` un-stages a deletion    | See [editing-sessions.md § Discard versus delete](editing-sessions.md#discard-versus-delete)     |

## Commands and output

| Symptom                                                        | Cause                                                                           | Fix                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A flag in a doc or an example does not exist                   | Flags change between releases; the installed version is the only authority      | `--help`, or query `documentation.json` — [commands.md](commands.md#discovering-the-exact-flags) |
| A list looks complete but is missing records                   | List commands return the first page only                                        | Page with `--page` and `--items`                                                                 |
| A command printed nothing and looked broken                    | An empty JSON array is a successful, empty result                               | Check the exit code rather than whether stdout was empty                                         |
| A field you expected is missing from `list-edits`              | The default output is summarised                                                | `sites files list-edits --verbose`                                                               |
| `--site` is not resolving                                      | The value is not a name, ID, UUID, or domain for an accessible site             | `sites list` to find the exact value                                                             |
| Changing `.cloudcannon/initial-site-settings.json` did nothing | It is read only when the site is first provisioned                              | `sites update-build-config` — [commands.md](commands.md#changing-build-configuration)            |
| `validate` passes but the editor behaves wrongly               | Validation is schema-only. It catches unknown keys and bad types, not semantics | See [`cloudcannon-configuration`](../cloudcannon-configuration/SKILL.md)                         |
| `npx @cloudcannon/cli` runs an unexpected version              | `npx` may reuse a cached copy                                                   | `npx @cloudcannon/cli@latest --version`, or install globally                                     |
