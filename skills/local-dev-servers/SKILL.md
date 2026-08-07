---
name: local-dev-servers
description: >-
  Start, identify and clean up local dev servers. Use whenever you are about to
  run a dev server, preview server, or headless browser — or when a port is
  already in use, a server came up on an unexpected port, or long-running
  processes need stopping at the end of a task.
---

# Running local servers

Agents are careless with background processes: they start servers and leave them
running, then start another one that silently lands on a different port, and
spend the rest of the session verifying the wrong thing.

Three rules fix nearly all of it.

## The rules

### 1. Bind the port you meant, or stop

**MUST NOT accept a fallback port.**
**Why:** the thing already on your intended port is usually your own server from
earlier in the session. Landing on 3001 means every check that follows verifies
the old build on 3000 — and nothing on screen says so. A failed start you
understand beats a running server you do not.

Most dev servers auto-increment by default, so the drift is silent. `serve.mjs`
treats it as a failure and stops the process.

### 2. Identify before you trust

**MUST confirm what answered, not just that something did.**
**Why:** a port responding proves only that a socket is open. It could be a
different framework, a different project, or a stale instance of yours.

Ask the server what it is. `port.mjs` probes for known signatures — the
CloudCannon dev server answers `/__api/details` with its site name and output
directory, a Chrome debugging port answers `/json/version`, Vite serves
`/@vite/client`. (Next.js 16+ exposes `/_next/mcp` for the same reason: so an
agent can identify a server rather than infer it from a port number.)

### 3. Register what you start; stop what you registered

**MUST clean up before finishing the task.**
**Why:** cleanup is only possible if starting was recorded. An unregistered
server from an hour ago is indistinguishable from one a person opened in a
terminal, and the safe move is then always "leave it alone" — which is exactly
how a machine accumulates twelve dead dev servers.

## Never kill what you cannot attribute

**MUST NOT stop a process that is not in the registry.**
**Why:** it is as likely to be a terminal the user has open, or another
project's server, as it is to be litter. Stopping someone's running work to free
a port is a worse outcome than failing to start.

`port.mjs` classifies every listener into one of three, and only the first is
ever stopped automatically:

| Classification             | Meaning                               | Action                                       |
| -------------------------- | ------------------------------------- | -------------------------------------------- |
| Agent-started              | In the registry                       | Stoppable — `serve.mjs stop`, or `--reclaim` |
| This project, unregistered | `cwd` matches, but nothing started it | Report and ask                               |
| Another project            | `cwd` elsewhere                       | Leave alone; pick another port               |

## Quick start

```sh
# What is on the port, and is it mine?
node scripts/port.mjs 4321

# Start on that exact port, or fail explaining why
node scripts/serve.mjs start --port 4321 --cmd "npm run dev" --ready /

# What have I got running?
node scripts/serve.mjs list

# Clean up — do this before you finish
node scripts/serve.mjs stop --all
```

Pass the port through explicitly in the command so the server cannot pick its
own: `--cmd "npm run dev -- --port 4321"`.

## When to use this skill

- Before starting any dev server, preview server, or headless browser.
- When a start fails with "port in use", or a server reports it chose a
  different port.
- When checks disagree with the code and a stale server is a plausible cause.
- At the end of any task that started a background process.

## When NOT to use this skill

- For short-lived foreground commands (a build, a test run). This is for
  processes that outlive the command that started them.
- To kill processes you did not start. See above — that is the one thing this
  skill exists to prevent.

## Contents

| File                                   | Covers                                                           |
| -------------------------------------- | ---------------------------------------------------------------- |
| [ports.md](ports.md)                   | Choosing and claiming ports, identity probes, adding a probe     |
| [cleanup.md](cleanup.md)               | The registry, end-of-task cleanup, orphans from earlier sessions |
| [scripts/README.md](scripts/README.md) | Every script and its flags                                       |

## Scripts

**Locate the scripts before running them.** Paths here assume this skill sits at
`skills/local-dev-servers/`. Depending on the install route it may be under
`.agents/skills/`, `.cursor/skills/`, or a plugin directory outside the project.

| Script                         | Purpose                                                               |
| ------------------------------ | --------------------------------------------------------------------- |
| [port.mjs](scripts/port.mjs)   | What holds a port, what kind of server it is, and whether it is yours |
| [serve.mjs](scripts/serve.mjs) | Start on the intended port or fail; list; stop                        |
| [sweep.mjs](scripts/sweep.mjs) | Find servers left running and clean up the ones you own               |

## Common mistakes

| Excuse                                                   | Reality                                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| "Port 3000 was busy so I used 3001."                     | You are now testing against the server on 3000. Free the port or stop.            |
| "Something responded, so the server is up."              | Something responded. Probe it — it may be last week's server.                     |
| "I'll leave it running in case it's needed again."       | The next session cannot tell it from a user's terminal, so it never gets stopped. |
| "I'll kill whatever is on the port."                     | It may be the user's work. Only registry entries are safe to stop.                |
| "The task is done, the server will exit with the shell." | Detached processes outlive the shell. That is the whole problem.                  |
