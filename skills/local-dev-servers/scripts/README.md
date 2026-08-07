# Scripts

Node ESM, no dependencies. Every script supports `--help`.

Process inspection uses `lsof`, `ps` and `pgrep`, so these work on macOS and
Linux. `ps -o etimes=` is deliberately avoided — it does not exist on macOS;
process age comes from `lstart`.

## `port.mjs`

What holds a port, what kind of server it is, and whether it is yours.

```sh
node port.mjs 4321
node port.mjs 3000 4321 10101 --root /path/to/project
```

| Flag     | Meaning                                                          |
| -------- | ---------------------------------------------------------------- |
| `--root` | Project root used to attribute processes by `cwd` (default: cwd) |
| `--json` | Emit JSON                                                        |

Exit code 0 when every port is free, 1 when any is occupied.

## `serve.mjs`

Start a server on the port you meant, list what is running, stop it again.

```sh
node serve.mjs start --port 4321 --cmd "npm run dev -- --port 4321" --ready /
node serve.mjs list
node serve.mjs stop --all
```

### `start`

| Flag        | Meaning                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| `--port`    | Port the server must bind. Not a suggestion                                |
| `--cmd`     | Command to run                                                             |
| `--cwd`     | Working directory (default: cwd)                                           |
| `--ready`   | HTTP path polled until it responds; without it, a listening port is enough |
| `--label`   | Name recorded in the registry                                              |
| `--timeout` | Seconds to wait for readiness (default 60)                                 |
| `--reclaim` | Stop an agent-started server already on this port and take it              |
| `--expect`  | Require the identity probe to report this server type                      |

Fails, rather than falling back, when:

- the port is occupied (reporting what holds it, and whether it is reclaimable)
- the command exits immediately (with the tail of its log)
- the server binds a **different** port than requested — it is stopped, because
  verifying against the wrong server is worse than having no server
- `--expect` does not match what answered

### `stop`

| Flag               | Meaning                                    |
| ------------------ | ------------------------------------------ |
| `--port` / `--pid` | Stop one entry                             |
| `--all`            | Stop everything registered on this machine |

Stops the process tree children-first so a wrapper cannot respawn the listener,
then re-checks the port and reports `STILL IN USE` if anything survived.

Only registry entries can be stopped. This is deliberate: an unregistered
process is as likely to be the user's terminal as it is to be litter.

## `sweep.mjs`

Find servers left running from earlier sessions.

```sh
node sweep.mjs
node sweep.mjs --stop-registered --older-than 30
```

| Flag                | Meaning                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `--ports`           | Comma-separated ports to scan (default: common dev + fallback + 9222/9223) |
| `--root`            | Project root for attribution                                               |
| `--stop-registered` | Actually stop registry entries                                             |
| `--older-than`      | With `--stop-registered`, skip entries younger than N minutes              |

Reports everything, stops nothing without `--stop-registered`, and never touches
a process outside the registry.

## `lib/`

| File           | Purpose                                                         |
| -------------- | --------------------------------------------------------------- |
| `procs.mjs`    | Port listeners, command, `cwd`, age, process trees, polite stop |
| `probes.mjs`   | Identity probes and the catch-all-server guard                  |
| `registry.mjs` | The started-server record under `$TMPDIR/agent-dev-servers/`    |
| `args.mjs`     | Flag parsing and `--help`                                       |

`args.mjs` is duplicated from other skills rather than shared — a skill has to
work when installed on its own.
