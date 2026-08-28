# Setup

## Prerequisites

| Need               | Install                     | Notes                                                                                                     |
| ------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| CloudCannon CLI    | `npm i -g @cloudcannon/cli` | `dev` needs **no** login — it never touches the SDK                                                       |
| Chrome or Chromium | —                           | `browser.mjs` finds it in the usual OS locations, or wherever `CC_CHROME_BIN` points                      |
| `playwright-core`  | `npm i -g playwright-core`  | Not full `playwright`. The scripts attach to a Chrome you launched, so no bundled browsers are downloaded |

Where a global install is not possible, install both anywhere and point
`CC_PLAYWRIGHT_DIR` at the directory holding the resulting `node_modules` — see
[below](#running-in-a-container-or-sandbox).

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
Where there is no display to open a window on, headless is used automatically.

## Running in a container or sandbox

Everything works in a container, but three of the defaults assume a desktop.
Each failure points somewhere other than its cause, so they are worth knowing
before rather than after.

**Chrome is somewhere else, or missing.** `browser.mjs` searches the usual OS
locations. Point `CC_CHROME_BIN` at the binary if it is anywhere else — a
distro Chromium, a Playwright download, Chrome for Testing, or a wrapper
script. It fails immediately if the path does not exist rather than falling
back to a search.

```sh
export CC_CHROME_BIN=/usr/bin/chromium
```

**Chrome needs different flags.** Two container conditions stop it starting,
and both surface as a startup timeout rather than as themselves:

| Condition                                               | Flag                      |
| ------------------------------------------------------- | ------------------------- |
| `chrome-sandbox` not setuid root, or running as root    | `--no-sandbox`            |
| `/dev/shm` 64MB or smaller, the usual container default | `--disable-dev-shm-usage` |

`browser.mjs` detects both and adds them itself, reporting which and why:

```
container detected — added --no-sandbox (chrome-sandbox is not setuid root),
--disable-dev-shm-usage (/dev/shm is 64MB or less)
```

Set `CC_CHROME_FLAGS` for anything else it needs — appended last, so it wins
over the above. `CC_CHROME_NO_AUTO_FLAGS=1` turns the automatic ones off.

**Nothing can be installed globally.** `playwright-core` is resolved from
`CC_PLAYWRIGHT_DIR`, then `npm root -g`, then the working directory, then this
skill's own directory. Setting the variable is what lets these scripts run from
anywhere rather than only from the site:

```sh
export CC_PLAYWRIGHT_DIR=/path/to/wherever/you/installed/it
```

One consequence worth remembering: `dev-status.mjs` compares mtimes on disk, so
it still needs `--root <site>` when run from elsewhere. It reports `UNKNOWN`
rather than guessing, but that is a prompt to pass `--root`, not a pass.

If Chrome still will not start, its output is in
`$TMPDIR/cc-dev-server-driver/chrome.log` and the startup error prints it.

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
