# Driving the editor

## The frame model

The site being edited sits **three frames deep**, and both inner frames are
named `editor-iframe`:

```
top                  the CloudCannon SPA          http://localhost:10101/#...
└── editor-iframe    the Visual Editor host       /app/assets/e2e/omnipage/editor.html#...
    └── editor-iframe  the site itself            about:blank
```

**MUST select the site frame by taking the LAST frame named `editor-iframe`.**
**Why:** the name is not unique. Taking the first gives you the host shim, whose
DOM is a single empty `<iframe>` — queries return nothing and it reads as "the
page has no regions".

The innermost frame's URL is `about:blank` because the host fetches the page
HTML and injects it. It is same-origin and fully queryable.

`siteFrame()` / `waitForSiteFrame()` in
[lib/session.mjs](scripts/lib/session.mjs) encapsulate this. Use `--frame app`
to reach the CloudCannon chrome instead, `--frame host` for the shim.

### Why the host cannot be opened directly

`editor.html` fetches the page, then posts `inject` to its parent and waits for
an `inject-response` carrying the editor JS to run. That script comes from the
CloudCannon app, so opening the host URL on its own produces a blank frame that
never initialises. Reaching the Visual Editor always means going through the SPA.

## Routing

The app routes on the URL hash, so navigation is addressable — no clicking
through the file browser.

| Route                                     | Opens                |
| ----------------------------------------- | -------------------- |
| `#sites/<id>/dashboard`                   | Dashboard            |
| `#sites/<id>/collections/<key>`           | A collection listing |
| `#sites/<id>/browser`                     | File browser         |
| `#sites/<id>/collections/<key>:/edit?...` | A file in an editor  |

The edit route's query parameters:

| Param        | Value                                        |
| ------------ | -------------------------------------------- |
| `collection` | Collection key from `cloudcannon.config.yml` |
| `path`       | Source file path, leading slash, URL-encoded |
| `schema`     | Schema name, usually `default`               |
| `editor`     | `visual` or `content`                        |
| `url`        | Site URL to preview, e.g. `/en/`             |

**MUST discover the site id rather than hardcoding it.** It is an integer that
happened to be `7` on one machine. `ve-open.mjs` reads it from the first
`a[href^="#sites/"]` in the nav after the app boots.

## Waits

The app boots, fetches, and injects, so there is a long window where the site
frame exists but is empty. Waiting for the frame alone is not enough — wait for
it to have children, which is what `waitForSiteFrame()` does.

Rough timings, headed, on a small site:

| Step                                | Time            |
| ----------------------------------- | --------------- |
| SPA boot to interactive             | 5–8s            |
| Opening a page in the Visual Editor | 8–12s           |
| A region edit committing to disk    | 1–3s after blur |

## Selector stability

The CloudCannon app is loaded from `cdn.cloudcannon.com/production-dev-server/`
and is **not versioned with the CLI** — it can change without any local change.
Order of preference when a check can be expressed more than one way:

1. `/__api` responses and the built output — server-side, most stable.
2. The site's own DOM (`data-editable`, `data-prop`, `data-rosey`) — authored in
   the repo, changes only when the site changes.
3. The editor.html contract — shipped inside the CLI, so it moves only on a CLI
   upgrade.
4. RCC's own DOM ids (`#rcc-locale-switcher`, `#rcc-locale-popover`) — owned by
   a package you control.
5. CloudCannon app markup — last resort, and the only category expected to drift.

Anything in category 5 belongs in [reference.md](reference.md) with the version
it was observed on, so drift is a one-file fix.

## Editing

Inline editing re-renders the component subtree, which has two consequences.

**Type with one `insertText`, not key-by-key.** A per-keystroke re-render
detaches the element after the first character and the edit dies having written
one letter. This looked like "typing does not work" until the DOM was inspected
mid-edit.

**Re-resolve addresses after any edit.** The element and its `data-cc-addr` stamp
are both gone. See [addressing.md](addressing.md#addresses-do-not-survive-an-edit).

**Blur commits the value.** Without a blur CloudCannon may never write the file.

## The escape hatch

The scripts cover common shapes. When a page does not fit one, go to
[ve-eval.mjs](scripts/ve-eval.mjs) rather than adding a flag:

```sh
node scripts/ve-eval.mjs --expr "[...document.querySelectorAll('[data-rosey]')].map(e => e.dataset.rosey)"
node scripts/ve-eval.mjs --frame app --expr "document.title"
```

It runs in the site frame by default and prints JSON. Return plain data — DOM
nodes cannot cross the boundary, which is why `collectRegions` stamps
`data-cc-addr` onto elements instead of returning them.
