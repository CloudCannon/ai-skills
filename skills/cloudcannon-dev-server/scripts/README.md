# Scripts

Node scripts, ESM, with no dependencies at all — nothing here opens a browser.
Every script supports `--help`.

Run them from this directory, or with an absolute path.

## `cc-serve.sh`

Builds a site and serves it under the local CloudCannon. `cloudcannon dev` never builds, so this
is the entry point.

```sh
bash cc-serve.sh /path/to/site --port 10101
```

| Flag             | Meaning                                                   |
| ---------------- | --------------------------------------------------------- |
| `--port`         | Dev server port (default 10101)                           |
| `--output`       | Output directory, for an SSG whose layout is not detected |
| `--no-build`     | Skip the SSG build                                        |
| `--no-postbuild` | Skip `.cloudcannon/postbuild`                             |

Output detection reads `paths.output` from `cloudcannon.config.yml`, then falls back to
recognising Astro and Eleventy. Any other SSG needs `--output`, and `--no-build` plus its own
build command — the build step here is a hardcoded `npm run build`.

Runs the postbuild in a subshell — CloudCannon sources that file in production, so shell options
set inside it would otherwise leak into the caller.

## `dev-status.mjs`

What is being served, whether it is stale, and whether given URLs resolve. **Run this before
trusting anything the server shows you.**

```sh
node dev-status.mjs --root /path/to/site --check /en/ --check /_rcc/locales.json
```

| Flag      | Meaning                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| `--check` | URL path that must resolve (repeatable). Trailing-slash paths retry as `index.html` |
| `--root`  | Site root for the staleness comparison (default cwd)                                |
| `--port`  | Dev server port                                                                     |

Exits non-zero if unreachable or any check fails.

The staleness comparison resolves the server's source paths under `--root`, so it only works
when that is the site directory. Pointed anywhere else it prints `UNKNOWN` and says so — it
never reports a build fresh without having checked.

## `watch-writes.mjs`

Proves an edit reached disk. Start it before making the edit — the baseline is taken at startup.

```sh
node watch-writes.mjs --timeout 20 --until rosey/locales/fr.json
```

| Flag         | Meaning                                                    |
| ------------ | ---------------------------------------------------------- |
| `--until`    | Poll this path; exit 0 when its bytes change, 1 on timeout |
| `--timeout`  | Seconds to watch (default 15)                              |
| `--interval` | Seconds between polls (default 0.25)                       |
| `--output`   | Stream mode only: also report `output-change` events       |

Without `--until` it streams the SSE event feed instead. That feed omits the dev server's own
writes, so it never shows a save made in the editor; only `--until` sees those.

## `read-file.mjs` / `write-file.mjs`

Read and write source files through the API, as the CMS sees them.

```sh
node read-file.mjs rosey/locales/fr.json --key "footer:blog"
node read-file.mjs src/pages/index.md --meta
node write-file.mjs src/_data/site.json --from ./patched.json
```

| Flag                               | Meaning                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `--key`                            | JSON only. Tries the literal key first, then a dotted path |
| `--meta`                           | Size and modified time instead of contents                 |
| `--content` / `--from` / `--stdin` | Content source for `write-file.mjs`                        |

## `lib/`

| File            | Purpose                                                          |
| --------------- | ---------------------------------------------------------------- |
| `args.mjs`      | Flag parsing (repeats accumulate into arrays), `--help`, output  |
| `devserver.mjs` | The `/__api` client, including SSE and the directory-index retry |
