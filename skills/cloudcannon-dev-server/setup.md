# Setup

Prerequisites, what `cloudcannon dev` actually does, and how to build and serve a site for it.

## Prerequisites

| Need            | Install                     | Notes                                             |
| --------------- | --------------------------- | ------------------------------------------------- |
| Node            | —                           | 24+, as the CLI requires                          |
| CloudCannon CLI | `npm i -g @cloudcannon/cli` | `dev` needs **no** login — it never calls the API |

Where a global install is not possible, `npx @cloudcannon/cli dev` works, as does a local
install plus `PATH="$PWD/node_modules/.bin:$PATH"`.

## What `cloudcannon dev` does and does not do

**MUST build the site yourself before serving it.**
**Why:** `cloudcannon dev <dir>` only serves `<dir>`. It never runs the SSG build and never runs
`.cloudcannon/postbuild`. Serving a stale directory shows an old site with no indication
anything is wrong.

```sh
cloudcannon dev _site --port 10101
```

| Flag                             | Default     | Notes                                                           |
| -------------------------------- | ----------- | --------------------------------------------------------------- |
| `--host`                         | `127.0.0.1` | Bind address only                                               |
| `--port`                         | `10101`     |                                                                 |
| `--live-sync` / `--no-live-sync` | on          | Push disk changes into the app over SSE                         |
| `--app-sync` / `--no-app-sync`   | on          | Accept writes from the app. With it off, every POST returns 403 |
| `--verbose`                      | off         | Log every request — method, path, status, duration              |

The positional output path must resolve **inside** the current directory, and the source root is
always the working directory — there is no `--source` flag. Run it from the site root.

## Build and serve

[cc-serve.sh](scripts/cc-serve.sh) does all of it: detects the output directory, builds, runs the
postbuild chain in a subshell, then serves.

```sh
bash scripts/cc-serve.sh /path/to/site --port 10101
```

**MUST run the postbuild in a subshell.**
**Why:** CloudCannon _sources_ that file in production, so options it sets leak into the caller —
a top-level `set -euo pipefail` inside it kills the run. `cc-serve.sh` already does this; a
hand-rolled equivalent must too.

### Output directories

`cc-serve.sh` reads `paths.output` from `cloudcannon.config.yml` first, which works for any SSG.
Failing that, it detects two:

| SSG      | Detected by                            | Output  | Build           |
| -------- | -------------------------------------- | ------- | --------------- |
| Astro    | `astro.config.mjs` / `astro.config.ts` | `dist`  | `npm run build` |
| Eleventy | `.eleventy.js` / `eleventy.config.js`  | `_site` | `npm run build` |

**MUST pass `--output` for any other SSG, and build it yourself.**
**Why:** detection covers only the two above, and the build step is a hardcoded `npm run build`.
A Hugo site matches neither, so it exits with `could not determine the output directory` — and
even given the directory it would run the wrong build command.

```sh
hugo
bash scripts/cc-serve.sh . --no-build --output public
```

Setting `paths.output` in `cloudcannon.config.yml` is the better fix where the site has one, since
it removes the guesswork for every tool rather than just this script.

For a Rosey site the postbuild rewrites the output in place — `rosey generate` →
`rosey-cloudcannon-connector write-locales` → (`install-client` for non-bundled SSGs) → `mv` to
`_untranslated_site` → `rosey build`. Serve the **final** directory, which is still `_site` /
`dist`. See [make-site-multilingual](../make-site-multilingual/SKILL.md) for the pipeline itself.

**MUST build through `cc-serve.sh` on a Rosey site, not a bare `npm run build`.**
**Why:** the bare build skips `.cloudcannon/postbuild`, so `/_rcc/locales.json` and the whole
`/{locale}/` tree are never generated — and because it still writes a _newer_ output directory,
freshness checks read as clean. See [troubleshooting.md](troubleshooting.md).

## Ports

| Port    | What                                                                                 |
| ------- | ------------------------------------------------------------------------------------ |
| `10101` | Dev server: the CMS app, the `/__api` surface, and the built site, all on one origin |

Override with `--port` on both `cc-serve.sh` and the scripts, or set `CC_DEV_PORT`.

## Running in a container or sandbox

The server itself needs nothing special. Two things are worth knowing:

- **Nothing can be installed globally.** Install the CLI anywhere and run it through `npx`, or
  prepend `node_modules/.bin` to `PATH` — `cc-serve.sh` execs `cloudcannon dev`, so it has to be
  resolvable.
- **`dev-status.mjs` compares mtimes on disk**, so it needs `--root <site>` when run from
  anywhere but the site directory. It reports `UNKNOWN` rather than guessing — that is a prompt
  to pass `--root`, not a pass.

## Verify the setup

```sh
bash scripts/cc-serve.sh /path/to/site
node scripts/dev-status.mjs --root /path/to/site --check /
```

`dev-status.mjs` should report the served output directory, `build: output is at least as new as
the sources`, and `ok 200` for each `--check`. Anything else is covered in
[troubleshooting.md](troubleshooting.md).
