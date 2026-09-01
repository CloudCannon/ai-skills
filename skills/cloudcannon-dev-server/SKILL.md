---
name: cloudcannon-dev-server
description: >-
  Use when running a CloudCannon site locally with `cloudcannon dev` — building
  and serving it, confirming the output being served is current rather than
  stale, reading or writing source files the way the CMS sees them, and proving
  an edit made in the editor actually reached disk.
---

# The CloudCannon dev server

`cloudcannon dev` runs the real CloudCannon app against local files with no login, on one origin. This skill covers building and serving a site for it, and everything checkable over its HTTP API without a browser.

## When to use

- Previewing a site in CloudCannon before it is deployed anywhere
- Confirming what the server is serving, and whether it is stale
- Proving an edit made in the editor reached disk, rather than only the DOM
- Reading or writing source files as the CMS sees them
- A page 404s or 500s locally and you need to know whether that is the site or the server

## When not to use

- **Authoring collections, inputs or structures** — that is [`cloudcannon-configuration`](../cloudcannon-configuration/SKILL.md). This skill serves the result; it does not decide it.
- **Authoring editable regions** — that is [`cloudcannon-visual-editing`](../cloudcannon-visual-editing/SKILL.md).
- **Driving the editor in a browser** — clicking regions, dumping inputs, screenshotting. Not covered here; ask the user to check in the editor.
- **Final sign-off.** Local CloudCannon has no real save-to-git, no build pipeline and no permissions. A human still confirms on the hosted site.

## The rule that costs the most sessions

**MUST build the site yourself before serving it, and confirm freshness before trusting anything you see.**

**Why:** `cloudcannon dev <dir>` only serves `<dir>`. It never runs the SSG build and never runs `.cloudcannon/postbuild`. A stale directory looks exactly like a current one — nothing on screen says otherwise.

```sh
bash scripts/cc-serve.sh /path/to/site     # build, postbuild, serve
node scripts/dev-status.mjs --check /about/
```

## SSG coverage

The server itself is SSG-agnostic — it serves a directory. `cc-serve.sh` is not: it detects
Astro and Eleventy, and reads `paths.output` from `cloudcannon.config.yml` for anything else.
Any other SSG needs `--output` and its own build command — see
[setup.md § Output directories](setup.md#output-directories).

## Quick start

```sh
# 1. Build and serve (leave this running)
bash scripts/cc-serve.sh /path/to/site

# 2. Confirm what is served, and that it is current
node scripts/dev-status.mjs --check /about/

# 3. Read a source file as the CMS sees it
node scripts/read-file.mjs src/pages/index.md

# 4. Prove an edit reached disk
node scripts/watch-writes.mjs --timeout 20 --until src/pages/index.md
```

Then open `http://localhost:10101` in a browser to use the editor.

## Contents

| File                                     | Covers                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| [setup.md](setup.md)                     | Prerequisites, what `cloudcannon dev` does and does not do, build and serve per SSG, ports |
| [dev-server-api.md](dev-server-api.md)   | The `/__api` surface — every route, the event stream, proving a write landed               |
| [troubleshooting.md](troubleshooting.md) | Symptom → cause → fix                                                                      |
| [scripts/README.md](scripts/README.md)   | Every script and its flags                                                                 |

## Scripts

**Locate the scripts before running them.** The commands above assume this skill sits at `skills/cloudcannon-dev-server/`. Depending on the install route it may be under `.agents/skills/`, `.cursor/skills/`, or a plugin directory outside the project — adjust the path to wherever this skill's `scripts/` actually sits.

| Script                                       | Purpose                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| [cc-serve.sh](scripts/cc-serve.sh)           | Build, run `.cloudcannon/postbuild`, start the dev server               |
| [dev-status.mjs](scripts/dev-status.mjs)     | What is served, is it stale, do these URLs resolve                      |
| [watch-writes.mjs](scripts/watch-writes.mjs) | `--until <path>` proves an edit reached disk; bare, streams file events |
| [read-file.mjs](scripts/read-file.mjs)       | Read a source file as the CMS sees it                                   |
| [write-file.mjs](scripts/write-file.mjs)     | Write a source file as the CMS would                                    |

## Common mistakes

| Excuse                                           | Reality                                                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| "I rebuilt, so the server is showing my change." | Confirm it. `dev-status.mjs` compares mtimes; a rebuild that skipped the postbuild still reads as newer. |
| "`/en/` returns 500, the server is broken."      | The dev server has no directory index. Request `/en/index.html`, or let `dev-status.mjs` retry it.       |
| "The editor shows the new text, so it saved."    | The DOM changed. Only `watch-writes.mjs --until <path>` or `read-file.mjs` proves the file did.          |
| "No `file-edit` event fired, so nothing wrote."  | The server suppresses its own writes. Read the file back instead of watching the stream.                 |
| "The diff is huge, something corrupted it."      | CloudCannon reserialises the whole frontmatter on save. Diff the field you changed.                      |
