---
name: cloudcannon-dev-server
description: >-
  Verify CloudCannon work by driving the local CloudCannon dev server. Use when
  you need to see what the Visual Editor actually rendered — whether editable
  regions are live, whether inputs look right, whether an edit reaches disk, or
  whether the RCC locale switcher works — instead of handing verification to a
  human.
---

# Driving the CloudCannon dev server

`cloudcannon dev` runs the real CloudCannon app against local files with no
authentication. This skill provides scripts to build a site, serve it, open a
page in the Visual Editor, find any component on it, act on it, and confirm the
result reached disk.

## When to use this skill

- **Migrating a site** — confirm the regions you wired are actually live, and
  that every page section is reachable in the editor
  ([check-editable-regions.mjs](scripts/check-editable-regions.mjs)).
- **Building a new component** — confirm its inputs render with the labels,
  types and structures you configured
  ([inputs-dump.mjs](scripts/inputs-dump.mjs)).
- **Maintaining or fixing an existing component** — reproduce the reported
  editor behaviour locally instead of guessing from the markup.
- After changing editable regions, inputs, structures, or component markup, to
  see what CloudCannon actually did with it.
- When a build passes but you cannot tell whether the editing experience works.
- Multilingual sites additionally: verify RCC behaviour — locale switcher,
  locale swap, stale markers, write-back ([rcc.md](rcc.md)).

## When NOT to use this skill

- To check something a build, grep, or `dist/` inspection already proves. The
  browser tier is slow — exhaust [Tier 0](#the-verification-ladder) first.
- For final sign-off. Local CloudCannon is not the hosted environment: it has no
  real save-to-git, no build pipeline, and no permissions. A human still
  confirms in the hosted site.
- To author regions or inputs. That belongs to
  [cloudcannon-visual-editing](../cloudcannon-visual-editing/SKILL.md) and
  [cloudcannon-configuration](../cloudcannon-configuration/SKILL.md); this skill
  only inspects the result.

## The verification ladder

Climb only as far as the question needs. Each rung costs more than the last.

| Tier            | Costs | Answers                                                                          |
| --------------- | ----- | -------------------------------------------------------------------------------- |
| 0 — no browser  | ~1s   | Is the server up, is the build current, is a file served, did an edit reach disk |
| 1 — page open   | ~15s  | Does the editor load, what regions exist, what did the console say               |
| 2 — interaction | ~30s+ | Does clicking edit it, does the value round-trip, does the locale swap           |

**MUST run `dev-status.mjs` before any browser work.**
**Why:** `cloudcannon dev` serves an output directory but never builds it. The
most common way to lose a session is inspecting a build from before the change
under test — and nothing on screen says so.

**This skill starts two long-lived processes** — the dev server on 10101 and
Chrome on 9222. Both must be stopped when the task ends, and neither may quietly
move to another port. See [local-dev-servers](../local-dev-servers/SKILL.md) for
the port and cleanup discipline; `node scripts/browser.mjs stop` and stopping
`cloudcannon dev` are the minimum.

## Quick start

```sh
# 1. Build, run the postbuild chain, and serve (leave this running)
bash scripts/cc-serve.sh /path/to/site

# 2. Confirm what is being served, and that it is current
node scripts/dev-status.mjs --check /about/

# 3. Start the browser these scripts attach to (once per session)
node scripts/browser.mjs start

# 4. Open a page in the Visual Editor
node scripts/ve-open.mjs --path src/content/pages/about.md --collection pages --url /about/

# 5. Audit it, see what is on it, then act on one thing
node scripts/check-editable-regions.mjs
node scripts/inputs-dump.mjs
node scripts/ve-components.mjs
node scripts/ve-screenshot.mjs --path sections.0.title --out heading.png

# 6. Clean up when the task is done
node scripts/browser.mjs stop
# and stop the dev server started in step 1
```

## Contents

| File                                           | Covers                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [setup.md](setup.md)                           | Prerequisites, build + serve per SSG, ports, what `cloudcannon dev` does and does not do              |
| [addressing.md](addressing.md)                 | How to name a component on the page — the address forms, and why nesting never has to be hand-derived |
| [driving-the-editor.md](driving-the-editor.md) | The frame model, routing, waits, and which selectors are safe to depend on                            |
| [dev-server-api.md](dev-server-api.md)         | The `/__api` surface — everything checkable without a browser                                         |
| [rcc.md](rcc.md)                               | The RCC / multilingual checklist                                                                      |
| [troubleshooting.md](troubleshooting.md)       | Symptom → cause                                                                                       |
| [reference.md](reference.md)                   | Observed routes, selectors and DOM shapes, with the versions they were seen on                        |
| [scripts/README.md](scripts/README.md)         | Every script and its flags                                                                            |

## Scripts

**Locate the scripts before running them.** The commands above assume this skill
sits at `skills/cloudcannon-dev-server/`. Depending on the install route it may
be under `.agents/skills/`, `.cursor/skills/`, or a plugin directory outside the
project — adjust the path to wherever this skill's `scripts/` actually sits.

| Script                                                                            | Purpose                                                                       |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [cc-serve.sh](scripts/cc-serve.sh)                                                | Build, run `.cloudcannon/postbuild`, start the dev server                     |
| [dev-status.mjs](scripts/dev-status.mjs)                                          | What is served, is it stale, do these URLs resolve                            |
| [watch-writes.mjs](scripts/watch-writes.mjs)                                      | Stream file events — proves an edit reached disk                              |
| [read-file.mjs](scripts/read-file.mjs) / [write-file.mjs](scripts/write-file.mjs) | Read/write source files as the CMS sees them                                  |
| [browser.mjs](scripts/browser.mjs)                                                | Start/stop the Chrome the other scripts attach to                             |
| [ve-open.mjs](scripts/ve-open.mjs)                                                | Open a file in the Visual Editor                                              |
| [ve-components.mjs](scripts/ve-components.mjs)                                    | Index every addressable region on the page                                    |
| [ve-tree.mjs](scripts/ve-tree.mjs)                                                | Outline the nesting rather than the flat list                                 |
| [ve-query.mjs](scripts/ve-query.mjs)                                              | Inspect one region in detail, including its ancestors                         |
| [ve-screenshot.mjs](scripts/ve-screenshot.mjs)                                    | Capture the editor or a single region                                         |
| [ve-click.mjs](scripts/ve-click.mjs) / [ve-type.mjs](scripts/ve-type.mjs)         | Act on a region                                                               |
| [ve-console.mjs](scripts/ve-console.mjs)                                          | Console, page errors, failed requests                                         |
| [ve-eval.mjs](scripts/ve-eval.mjs)                                                | Run arbitrary JS in the editor — the escape hatch                             |
| [check-editable-regions.mjs](scripts/check-editable-regions.mjs)                  | Audit every region: bound, wired, reachable, stable keys                      |
| [inputs-dump.mjs](scripts/inputs-dump.mjs)                                        | What inputs CloudCannon rendered, and which structure each array item matched |
| [check-rcc.mjs](scripts/check-rcc.mjs)                                            | The RCC checklist — multilingual sites only                                   |

## Common mistakes

| Excuse                                           | Reality                                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| "The editor shows the new text, so it saved."    | The DOM changed. Only `watch-writes.mjs` or `read-file.mjs` proves the file changed.                                   |
| "I'll write a CSS selector for that component."  | Markup nesting varies per site and per component. Use an address from `ve-components.mjs`; it survives layout changes. |
| "`/en/` returns 500, the server is broken."      | The dev server has no directory-index resolution. Request `/en/index.html`.                                            |
| "I rebuilt, so the editor is showing my change." | The editor caches the page it loaded. Re-run `ve-open.mjs` after a rebuild.                                            |
| "I'll add a flag to the script for this case."   | Reach for `ve-eval.mjs` first. Add a flag only once the same query recurs.                                             |
