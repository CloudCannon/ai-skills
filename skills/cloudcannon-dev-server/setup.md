# Setup

## Prerequisites

| Need               | Install                     | Notes                                                                                                     |
| ------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| CloudCannon CLI    | `npm i -g @cloudcannon/cli` | `dev` needs **no** login — it never touches the SDK                                                       |
| Chrome or Chromium | —                           | `browser.mjs` finds it in the usual OS locations                                                          |
| `playwright-core`  | `npm i -g playwright-core`  | Not full `playwright`. The scripts attach to a Chrome you launched, so no bundled browsers are downloaded |

`playwright-core` is CommonJS. Import it with a default import — a named
`import { chromium }` throws `SyntaxError` under ESM.

## What `cloudcannon dev` does and does not do

**MUST build the site yourself before serving it.**
**Why:** `cloudcannon dev <dir>` only serves `<dir>`. It never runs the SSG build
and never runs `.cloudcannon/postbuild`. Serving a stale directory shows you an
old site with no indication anything is wrong.

```sh
cloudcannon dev _site --port 10101
```

| Flag                             | Default | Notes                                                           |
| -------------------------------- | ------- | --------------------------------------------------------------- |
| `--port`                         | `10101` |                                                                 |
| `--live-sync` / `--no-live-sync` | on      | Push disk changes into the app                                  |
| `--app-sync` / `--no-app-sync`   | on      | Accept writes from the app. With it off, every POST returns 403 |
| `--verbose`                      | off     | Log every request                                               |

The positional output path must resolve **inside** the current directory, and
the source root is always the working directory — there is no `--source` flag.
Run it from the site root.

## Build and serve

[cc-serve.sh](scripts/cc-serve.sh) does all of it: detects the output directory,
builds, runs the postbuild chain in a subshell, then serves.

```sh
bash scripts/cc-serve.sh /path/to/site --port 10101
```

**The postbuild must run in a subshell.** CloudCannon _sources_ that file in
production, so options it sets leak into the caller — a top-level
`set -euo pipefail` inside it kills the run.

### Output directories

| SSG      | Build           | Output   |
| -------- | --------------- | -------- |
| Astro    | `npm run build` | `dist`   |
| Eleventy | `npm run build` | `_site`  |
| Hugo     | `hugo`          | `public` |

For a Rosey site the postbuild rewrites the output in place — `rosey generate` →
`rosey-cloudcannon-connector write-locales` → (`install-client` for non-bundled
SSGs) → `mv` to `_untranslated_site` → `rosey build`. Serve the **final**
directory, which is still `_site` / `dist`.

## The browser

One long-lived Chrome, started once per session:

```sh
node scripts/browser.mjs start     # --headless to hide it
node scripts/browser.mjs status
node scripts/browser.mjs stop
```

It uses a **dedicated profile** under the system temp directory, never the real
Chrome profile — driving the user's live session would carry their cookies and
logins. Every other script attaches over CDP on port 9222 and detaches when it
exits, leaving the browser (and the editor's state) alive for the next one.

Headed is the default because the CloudCannon app is heavy and occasionally
renders differently headless. Prefer headed when a screenshot is the evidence.

## Ports

| Port  | What                                                                                 |
| ----- | ------------------------------------------------------------------------------------ |
| 10101 | Dev server: the CMS app, the `/__api` surface, and the built site, all on one origin |
| 9222  | Chrome DevTools protocol                                                             |

Override with `--port` / `--cdp-port`, or `CC_DEV_PORT` / `CC_CDP_PORT`.

## Verify the setup

```sh
node scripts/dev-status.mjs --check /en/
node scripts/browser.mjs start
node scripts/ve-open.mjs --path src/pages/index.md --collection pages --url /en/
```

The last command should end with `site frame ready — N editable region(s)
present`. If N is 0, see [troubleshooting.md](troubleshooting.md).
