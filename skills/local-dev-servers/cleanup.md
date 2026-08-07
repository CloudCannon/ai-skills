# Cleanup

## The registry

Every server started through `serve.mjs` is recorded at
`$TMPDIR/agent-dev-servers/registry.json`, with its port, pid, command, working
directory and start time. Logs go to `$TMPDIR/agent-dev-servers/<port>.log`.

The registry is what makes cleanup possible at all. Without it a server from an
hour ago cannot be distinguished from one a person started, so the only safe
action is to leave it — which is how ports fill up.

```sh
node scripts/serve.mjs list      # what is registered, and is it still alive
```

`list` prunes entries whose process has died, so it doubles as a tidy-up.

## Before you finish a task

**MUST stop what you started.**

```sh
node scripts/serve.mjs stop --all
```

Do this even when the work went well. A left-running server is not neutral: it
holds a port the next session will want, serves a build that will be stale
within minutes, and is indistinguishable from a user's own process once the
session that started it has ended.

Stop a single one with `--port` or `--pid`.

### What gets stopped

`stop` works down the process tree, children first, so a wrapper cannot respawn
what it just lost. `npm run dev` typically means three processes — the shell,
npm, and the server that actually binds the port — and stopping only the one
that was spawned leaves the listener holding the port.

It then checks the port again and reports `STILL IN USE` if anything survived,
rather than claiming success.

SIGTERM first, SIGKILL only after a grace period: SIGKILL skips the server's own
cleanup and can orphan workers and leave the socket in `TIME_WAIT`.

## Orphans from earlier sessions

```sh
node scripts/sweep.mjs                     # report only
node scripts/sweep.mjs --stop-registered   # stop the ones we own
```

`sweep.mjs` scans the ports dev servers and headless browsers habitually use —
including the `+1`/`+2` fallbacks, which appear precisely when something was
already running, and Chrome's 9222.

It reports everything and stops nothing unless asked, and even then only touches
registry entries:

```
5000   an HTTP server of unknown type
       pid 614, 13237m old — another project — leave alone
10101  CloudCannon dev server
       pid 90721, 47m old — this project, started outside an agent session — leave alone
```

Both of those were correctly left alone during development: the first is a macOS
system service, the second a server started outside the registry.

Use `--older-than 30` to skip anything recent when you are unsure whether a
session is still active.

## Headless browsers

A stray Chrome costs far more memory than a stray dev server and is easier to
forget, because nothing is being served from it. Treat it identically: start it
on a known debugging port, register it, stop it at the end.

If a skill starts its own browser (as `cloudcannon-dev-server` does), stopping
it is that skill's responsibility — but `sweep.mjs` scans 9222/9223 as a
backstop.

## When cleanup should not happen

Leave a server running when the user explicitly asked for it, or when they are
going to look at it themselves. Say so plainly and give the stop command:

> Left the dev server on 4321 so you can look at the locale switcher.
> Stop it with `node scripts/serve.mjs stop --port 4321`.

The failure mode is not "a server is running" — it is a server running that
nobody knows about.
