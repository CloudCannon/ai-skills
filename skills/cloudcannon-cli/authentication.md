# Authentication

Every command in the `orgs`, `sites`, `builds` and `inboxes` groups needs credentials. `configure`, `validate` and `dev` need none — see [SKILL.md § Local and remote](SKILL.md#local-and-remote).

Without credentials, a remote command exits 1 with:

```
You must log in to run this command. Either run cloudcannon login to authorize with your
CloudCannon account, or provide an API key through the CLOUDCANNON_API_KEY environment variable.
```

## The three methods, in precedence order

The CLI takes the first that is present. Precedence is not the same as "environment beats disk" — a stored login outranks `CLOUDCANNON_API_KEY`.

| Order | Method          | Set by                                            | Use for                          |
| ----- | --------------- | ------------------------------------------------- | -------------------------------- |
| 1     | User access key | `CC_ACCESS_KEY_ID` **and** `CC_ACCESS_KEY_SECRET` | CI, containers, scripted runs    |
| 2     | Stored login    | `cloudcannon login`                               | A person at an interactive shell |
| 3     | API key         | `CLOUDCANNON_API_KEY`                             | Scoped automation                |

## Which identity am I actually using?

**MUST confirm the identity before a write command in any scripted or automated context.**

Nothing in the CLI's output reports which method won, and the chain resolves silently — a credential that is incomplete, malformed, or outranked is skipped rather than raising. The check costs one call:

```sh
npx @cloudcannon/cli orgs list
```

**Why:** the failure this protects against is not a command that errors, it is a command that succeeds as somebody else. In a clean CI runner there is no stored login, so a bad credential fails closed. Wherever an ambient credential exists — a developer's laptop, a self-hosted runner, a long-lived container — it falls back to that instead, and the write lands under the wrong account.

Two habits make the chain deterministic rather than ambient:

- Assert the variables you rely on, so a missing one fails the script rather than falling through: `: "${CC_ACCESS_KEY_ID:?not set}"`
- `cloudcannon logout` on shared or automated machines, so there is no stored credential to fall back to

For version-specific quirks in how the chain resolves, see [troubleshooting.md § Authentication](troubleshooting.md#authentication).

## Logging in

```sh
cloudcannon login                                              # opens a browser
cloudcannon login --access-key-id <id> --access-key-secret <secret>   # non-interactive
cloudcannon logout                                             # deletes the stored credential
```

`login` writes `auth.json` into a per-user data directory:

| Platform | Location                                                                                  |
| -------- | ----------------------------------------------------------------------------------------- |
| Unix     | `$XDG_DATA_HOME/cloudcannon/auth.json`, falling back to `$HOME/.local/share/cloudcannon/` |
| Windows  | `%LOCALAPPDATA%\cloudcannon\`, falling back to `%USERPROFILE%\AppData\Local\cloudcannon\` |

**Why it matters for agents:** the file is outside the repository, so a working `cloudcannon sites list` in one environment says nothing about whether CI is authenticated. Containers and fresh sandboxes start logged out.

## In CI

**MUST use `CC_ACCESS_KEY_ID` / `CC_ACCESS_KEY_SECRET` from the runner's secret store.** There is no interactive browser, and the data directory does not persist between jobs.

```sh
export CC_ACCESS_KEY_ID=ccu_...
export CC_ACCESS_KEY_SECRET=ccs_...
npx @cloudcannon/cli sites list
```

**MUST NOT** write credentials into a file the repository tracks, pass them on a command line in shared CI logs, or echo them for debugging. Use `--access-key-id` / `--access-key-secret` only where the shell history and process list are the user's own.

## Recognising a malformed key

`cloudcannon login` validates the shape before storing it, and rejects it locally with `Access key id is invalid` or `Access key secret is invalid`. **Keys supplied through `CC_ACCESS_KEY_ID` / `CC_ACCESS_KEY_SECRET` are not shape-checked** — they go straight to the server, so a truncated value there surfaces as an authentication failure at request time rather than as a local error. Current keys are prefixed — `ccu_` for the id, `ccs_` for the secret — and older keys of a different shape are still accepted. A local rejection means the value is malformed or truncated, most often by a partial copy or a shell mangling the paste; it does not mean the key was revoked.

An `AuthenticationError` at request time is the opposite: the shape was fine and the server refused it. Log out and back in, or reissue the key.

## Handling credentials as an agent

**MUST NOT read, print, echo, or copy a credential value.** Running a command that _uses_ a credential is not the same as reading one, and only the first is ever necessary.

| Do                                                                  | Not                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| Ask the user to run `cloudcannon login`, then run commands normally | Read `auth.json`, a `.env`, or any file holding a key    |
| Check whether credentials work with `orgs list`                     | Print an environment variable to confirm it is set       |
| Let the user export the key pair in the shell you inherit           | Pass `--access-key-id` / `--access-key-secret` yourself  |
| Report "not authenticated" and stop                                 | Obtain, generate, or place a credential to get unblocked |

**Prefer `cloudcannon login` over a `.env` file.** It writes the credential to a per-user data directory outside the repository, so it is nowhere an agent working in that repository would read. A `.env` puts the secret _inside_ the working directory, which is exactly where file-reading tools operate — it is the weaker option for this purpose, not the stronger one.

Where a `.env` is used anyway, the CLI cannot load it: it has no built-in `.env` support, and Node refuses `--env-file` inside `NODE_OPTIONS`. It has to be sourced into the shell first, by the user:

```sh
set -a; . ./.env; set +a      # user runs this; the agent does not read the file
npx @cloudcannon/cli sites list
```

Keep it gitignored, and treat it as the fallback rather than the default.

**This does not block the skill.** The local half needs no credentials at all, the read-only remote commands work fine with a credential the agent never sees, and every write command needs the user's confirmation anyway — see [SKILL.md § The rule that costs the most](SKILL.md#the-rule-that-costs-the-most).

## Pointing at another API

`CLOUDCANNON_API_ORIGIN` overrides the API origin the client talks to. Leave it unset against production.
