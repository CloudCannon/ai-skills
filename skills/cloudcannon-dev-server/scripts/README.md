# Scripts

Node scripts are ESM with zero dependencies beyond `playwright-core` (browser
scripts only). Every script supports `--help`.

Run them from this directory, or with an absolute path.

## Tier 0 — no browser

### `cc-serve.sh`

Builds a site and serves it under the local CloudCannon. `cloudcannon dev` never
builds, so this is the entry point.

```sh
bash cc-serve.sh /path/to/site --port 10101
```

| Flag             | Meaning                         |
| ---------------- | ------------------------------- |
| `--port`         | Dev server port (default 10101) |
| `--no-build`     | Skip the SSG build              |
| `--no-postbuild` | Skip `.cloudcannon/postbuild`   |

Runs the postbuild in a subshell — CloudCannon sources that file in production,
so shell options set inside it would otherwise leak into the caller.

### `dev-status.mjs`

What is being served, whether it is stale, and whether given URLs resolve.
**Run this before any browser work.**

```sh
node dev-status.mjs --check /en/ --check /_rcc/locales.json
```

| Flag      | Meaning                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| `--check` | URL path that must resolve (repeatable). Trailing-slash paths retry as `index.html` |
| `--root`  | Site root for the staleness comparison (default cwd)                                |
| `--port`  | Dev server port                                                                     |

Exits non-zero if unreachable or any check fails.

The staleness comparison resolves the server's source paths under `--root`, so
it only works when that is the site directory. Pointed anywhere else it prints
`UNKNOWN` and says so — it never reports a build fresh without having checked.
Relevant whenever `CC_PLAYWRIGHT_DIR` is being used to run these scripts from
outside the site.

### `watch-writes.mjs`

Proves an editor action reached disk. Start it before making the edit — the
baseline is taken at startup.

```sh
node watch-writes.mjs --timeout 20 --until rosey/locales/fr.json
```

| Flag         | Meaning                                                    |
| ------------ | ---------------------------------------------------------- |
| `--until`    | Poll this path; exit 0 when its bytes change, 1 on timeout |
| `--timeout`  | Seconds to watch (default 15)                              |
| `--interval` | Seconds between polls (default 0.25)                       |
| `--output`   | Stream mode only: also report `output-change` events       |

Without `--until` it streams the SSE event feed instead. That feed omits the
dev server's own writes, so it never shows a Visual Editor save; only `--until`
sees those.

### `read-file.mjs` / `write-file.mjs`

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

## Tier 1 — browser session

### `browser.mjs`

The Chrome every other browser script attaches to. Uses a dedicated profile
under the temp directory, never the real one.

```sh
node browser.mjs start [--headless] [--cdp-port 9222]
node browser.mjs status
node browser.mjs stop
```

| Variable                  | Meaning                                                         |
| ------------------------- | --------------------------------------------------------------- |
| `CC_CHROME_BIN`           | Chrome/Chromium binary to use instead of the usual OS locations |
| `CC_CHROME_FLAGS`         | Extra Chrome flags, space separated, appended last              |
| `CC_CHROME_NO_AUTO_FLAGS` | Skip the container flags below                                  |

Headless is forced when there is no display to open a window on. Inside a
container it also adds `--no-sandbox` and `--disable-dev-shm-usage` when it
detects they are needed, and prints which and why. See
[setup.md](../setup.md#running-in-a-container-or-sandbox).

## Tier 2 — the editor

All of these attach to the running browser and detach on exit, leaving the
editor's state alive for the next call.

### `ve-open.mjs`

Opens a file in the Visual Editor by URL — no clicking through the file browser.

```sh
node ve-open.mjs --path src/pages/index.md --collection pages --url /en/
```

| Flag                                 | Meaning                                      |
| ------------------------------------ | -------------------------------------------- |
| `--path`                             | Source file, repo-relative                   |
| `--collection`                       | Collection key from `cloudcannon.config.yml` |
| `--url`                              | Site path to preview (e.g. `/en/`)           |
| `--editor`                           | `visual` (default) or `content`              |
| `--schema`, `--site-id`, `--timeout` | Overrides                                    |

### `ve-components.mjs`

Indexes every addressable region on the open page. **Start here** — the address
column feeds every other script.

```sh
node ve-components.mjs
node ve-components.mjs --kind array-item
node ve-components.mjs --rosey --json
```

| Flag          | Meaning                               |
| ------------- | ------------------------------------- |
| `--kind`      | Filter by `data-editable` kind        |
| `--component` | Filter by component name substring    |
| `--rosey`     | Only translatable elements            |
| `--visible`   | Only regions with a non-zero box      |
| `--json`      | Raw JSON (includes `id`, the `_uuid`) |

### `ve-tree.mjs`

The nesting rather than the flat list.

```sh
node ve-tree.mjs --root "content_blocks.0#array-item" --depth 4
```

| Flag      | Meaning                     |
| --------- | --------------------------- |
| `--root`  | Limit to a region's subtree |
| `--depth` | Maximum nesting (default 6) |
| `--all`   | Include non-CMS elements    |

Bookshop markers are listed below the outline, because comment nodes are not
children and cannot appear in it.

### `ve-query.mjs`

One region in detail, including its true DOM ancestors — or any CSS match, with
the address of the region it belongs to.

```sh
node ve-query.mjs --path content_blocks.0.buttons.1
node ve-query.mjs --selector "h1" --all
```

### `ve-screenshot.mjs`

```sh
node ve-screenshot.mjs --path content_blocks.0.buttons.1 --out button.png
node ve-screenshot.mjs --frame app --out chrome.png
```

| Flag                    | Meaning                                    |
| ----------------------- | ------------------------------------------ |
| `--path` / `--selector` | What to capture (default: the whole frame) |
| `--frame`               | `site` (default), `app`, `host`            |
| `--out`                 | Output path (default `ve-shot.png`)        |
| `--full`                | Full scrollable page                       |

Bookshop ranges have no host element, so their capture is clipped to the union
box of the nodes between the markers.

A target taller or wider than the preview pane would otherwise come back part
blank — Playwright's capture-beyond-viewport only applies to the top-level page,
and the preview is an iframe, so anything below the frame's own viewport is
never painted. The script grows the browser viewport to fit, captures, and puts
it back, saying so when it does:

```
captured sections.1 (array-item) -> region.png (viewport grown to 1625x1174 to fit)
```

Past 8000px it stops growing and warns that the image is truncated rather than
reporting a clean capture.

### `ve-click.mjs` / `ve-type.mjs`

```sh
node ve-click.mjs --text "Save" --frame app
node ve-type.mjs --path content_blocks.0.heading.heading_text --text "New heading"
```

| Flag                               | Meaning                                  |
| ---------------------------------- | ---------------------------------------- |
| `--path` / `--selector` / `--text` | Target                                   |
| `--frame`                          | `site` (default), `app`, `host`          |
| `--append`                         | `ve-type.mjs`: append instead of replace |
| `--wait`                           | Settle time in ms                        |

`ve-type.mjs` uses a single `insertText` and re-resolves the address afterwards —
typing key-by-key re-renders the component per keystroke and the edit dies after
one character.

Replacing deletes the selection before inserting, rather than typing over it.
Typing over a selection makes the browser carry that selection's formatting onto
the new text: replacing a heading containing
`<span class="highlight-text">` wrote `<font color="#5429ff">new text</font>` to
disk, and CloudCannon then marked that `font` tag `contenteditable="false"`, so
the region stopped being editable too. `execCommand("removeFormat")` does not
help; deleting first does. The script also compares the resulting markup, not
just the text, and warns if a region gains formatting the typed string did not
contain — `textContent` is identical either way, which is why this went unseen.

### `ve-console.mjs`

Console output, page errors and failed requests across every frame. Reloads by
default, because listeners only see what happens after they attach.

```sh
node ve-console.mjs --watch 20 --grep RCC
```

| Flag          | Meaning                           |
| ------------- | --------------------------------- |
| `--watch`     | Seconds to listen (default 15)    |
| `--grep`      | Only lines containing this string |
| `--errors`    | Only errors and failed requests   |
| `--no-reload` | Do not reload first               |

Calls out named failure modes, including a 404 on `/_rcc/locales.json`, and
checks whether RCC actually finished starting up.

That check reads the DOM (`#rcc-locale-switcher`, injected at the end of RCC's
`init()`) rather than the logs. RCC's `Ready — N locales` line is verbose-gated
and absent on any page without `data-rcc-verbose`, so its absence means nothing
on its own.

### `ve-eval.mjs`

The escape hatch. Runs arbitrary JS in a frame and prints JSON.

```sh
node ve-eval.mjs --expr "document.querySelectorAll('[data-rosey]').length"
node ve-eval.mjs --file ./query.js --frame app
```

Return plain data — DOM nodes cannot cross the boundary.

## Tier 3 — composites

Thin compositions of the primitives above. Read them as worked examples and copy
from them when checking something they do not cover.

### `check-editable-regions.mjs`

Audits every region on the open page. The check for migration work and for
maintaining components — mostly static analysis, so it is fast.

```sh
node check-editable-regions.mjs
node check-editable-regions.mjs --click sections.0.title
```

| Flag      | Meaning                                                  |
| --------- | -------------------------------------------------------- |
| `--click` | Also click this region and confirm focus lands inside it |
| `--json`  | Emit findings as JSON                                    |

Errors: a region that binds nothing, a text region CloudCannon did not make
contenteditable (i.e. it was never wired up), two regions sharing an address, a
source region missing `data-path`/`data-key`.

Warnings: array wrappers without `data-id-key` (positional keys), array items
without `data-id` (identity not seeded), regions that render nothing, markdown
regions with no `data-type`.

Exits non-zero on any error.

### `inputs-dump.mjs`

What CloudCannon rendered from your `_inputs`/schema config — the question the
YAML cannot answer.

```sh
node inputs-dump.mjs
node inputs-dump.mjs --into "Hero Split"
```

| Flag     | Meaning                                                       |
| -------- | ------------------------------------------------------------- |
| `--grep` | Only inputs whose label contains this string                  |
| `--into` | Navigate into the array item whose card starts with this text |
| `--json` | Emit JSON                                                     |

Array inputs list their items by **the structure each one matched**, which is
where a bad structure match becomes visible.

Nested inputs are not in the DOM until you navigate into their group —
CloudCannon swaps child views rather than expanding inline — hence `--into`.

### `check-rcc.mjs`

The RCC checklist, for multilingual sites. Skip it entirely on a site without
Rosey.

```sh
node check-rcc.mjs --locale fr --expect fr,de
```

| Flag       | Meaning                                                |
| ---------- | ------------------------------------------------------ |
| `--locale` | Locale to switch into (default: first in the manifest) |
| `--expect` | Comma-separated locales the switcher must offer        |

Exits non-zero on any failure.

## `lib/`

| File            | Purpose                                                          |
| --------------- | ---------------------------------------------------------------- |
| `args.mjs`      | Flag parsing (repeats accumulate into arrays), `--help`, output  |
| `devserver.mjs` | The `/__api` client, including SSE and the directory-index retry |
| `session.mjs`   | Playwright resolution, CDP attach, the frame chain               |
| `regions.mjs`   | Region discovery, path composition, addressing                   |
