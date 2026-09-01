# The dev server HTTP API

Everything here is unauthenticated and needs no browser. Exhaust this tier before opening the
editor — it is faster and far more deterministic than reading the screen.

All routes are on one origin, `http://localhost:10101` by default.

| Route                  | Method | Returns                                                          |
| ---------------------- | ------ | ---------------------------------------------------------------- |
| `/__api/details`       | GET    | `{ sourceFiles, outputDir, siteName, userName }`                 |
| `/__api/megafile`      | GET    | NDJSON of every non-binary source file with content, size, mtime |
| `/__api/file/<path>`   | GET    | `{ content, file_size, last_modified }`                          |
| `/__api/upload/<path>` | POST   | Writes the body to disk as the app would                         |
| `/__api/move_path`     | POST   | `{ paths: [{ source, target }], allow_overwrite }`               |
| `/__api/delete_path`   | POST   | `{ paths: [{ target }] }`                                        |
| `/__api/events`        | GET    | SSE stream of file changes                                       |
| `/__source/<path>`     | GET    | Raw source file contents                                         |
| `/__output/<path>`     | GET    | A file from the built output                                     |
| anything else          | GET    | Falls through to the built output                                |

The field names are `file_size` and `last_modified` — not `size` / `mtime`.

## No directory index

**A request for a directory returns 500, not 404.**
**Why:** the server opens the path as a file; on a directory that raises EISDIR, which surfaces
as a 500. `/en/` fails, `/en/index.html` succeeds. A 500 here means "that is a directory", not
"the server is broken".

`fetchOutput()` in [lib/devserver.mjs](scripts/lib/devserver.mjs) retries a trailing-slash path
as `index.html`, so `dev-status.mjs --check /en/` works.

## Events

`/__api/events` is a Server-Sent Events stream, debounced by 200ms.

| Event                                       | Fires when                                                            |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `file-create` / `file-edit` / `file-delete` | A **source** file changes on disk                                     |
| `output-change`                             | Files in the output directory change; batched into `{ paths: [...] }` |

**Writes the dev server makes are not echoed back.**
**Why:** it marks its own writes and suppresses the corresponding watcher event, so neither
`write-file.mjs` nor a save made in the editor produces a `file-edit`. The stream reports
external writes only. Verified with a control — one editor edit and one shell write to the same
file in one capture window; only the shell write appeared.

`/__api/file` does reflect those writes immediately, so persistence has to be proven by reading
the file back rather than by waiting for an event.

## Proving an edit persisted

An editor showing new text proves only that the DOM changed. Two things prove the file changed:

```sh
# 1. Watch while the edit happens — start it first, the baseline is taken at startup
node scripts/watch-writes.mjs --timeout 30 --until src/pages/index.md

# 2. Read the file back
node scripts/read-file.mjs src/pages/index.md
```

`--until` polls that path and exits 0 as soon as its bytes change, 1 on timeout. Without it the
script streams the event feed, which is only useful for watching what a build or an external
tool touches.

**Saving rewrites the whole frontmatter block.**
**Why:** CloudCannon reserialises the YAML rather than patching the key. A one-field edit came
back as 14 insertions and 15 deletions. Diff for the value you changed; do not treat surrounding
churn as a bug. Comments are not part of the parsed data, so they are dropped — keep editor
guidance in `_inputs[].comment` in `cloudcannon.config.yml`, never in frontmatter comments.

## Locale files

Rosey locale keys are namespaced with a colon and may contain dots, so they are not dotted paths:

```sh
node scripts/read-file.mjs rosey/locales/fr.json --key "footer:blog"
# { "original": "Blog", "value": "Blog", "_base_original": "Blog" }
```

`--key` tries the whole flag as one literal key before falling back to dotted traversal, so both
styles work.
