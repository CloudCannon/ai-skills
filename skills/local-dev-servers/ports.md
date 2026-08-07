# Ports and identity

## Claiming a port

```sh
node scripts/port.mjs 4321
node scripts/serve.mjs start --port 4321 --cmd "npm run dev -- --port 4321" --ready /
```

**Pass the port through to the server, not just to `serve.mjs`.** Without it the
server picks its own, and `serve.mjs` can only detect the drift after the fact
and stop it. With it, the server fails loudly on a conflict — which is what you
want.

| SSG             | Default port | Explicit form                        |
| --------------- | ------------ | ------------------------------------ |
| Astro           | 4321         | `astro dev --port 4321`              |
| Vite            | 5173         | `vite --port 5173 --strictPort`      |
| Next.js         | 3000         | `next dev --port 3000`               |
| Eleventy        | 8080         | `eleventy --serve --port 8080`       |
| Hugo            | 1313         | `hugo server --port 1313`            |
| CloudCannon dev | 10101        | `cloudcannon dev <out> --port 10101` |

Vite has `--strictPort`, which makes it fail rather than increment. Prefer it
where available — it turns the rule into the tool's own behaviour.

## What "in use" actually means

`port.mjs` answers the question that matters, which is not "is it busy" but
"whose is it":

```
4321  IN USE — CloudCannon dev server (site "Eleventy Multilingual Starter", output _site)
      pid 90721, 47m old
      cmd node .../cloudcannon dev _site --port 10101
      cwd /Users/…/eleventy-multilingual-starter
      in this project, but NOT started by an agent session.
      Probably yours from a terminal. Ask before stopping it.
```

`cwd` is the attribution key. A port number says nothing about ownership; the
working directory of the listening process says almost everything.

Exit code is 0 when every port is free, 1 when any is occupied — so it composes
into a shell guard.

## Identity probes

A port answering is not proof of identity. Probes ask the server what it is:

| Server          | Path             | Confirmed by                                 |
| --------------- | ---------------- | -------------------------------------------- |
| CloudCannon dev | `/__api/details` | Body contains `outputDir`; reports site name |
| Vite            | `/@vite/client`  | Body contains `vite`                         |
| Next.js 16+     | `/_next/mcp`     | JSON or event-stream content type            |
| Chrome DevTools | `/json/version`  | Body contains `webSocketDebuggerUrl`         |

Anything else that responds is reported as "an HTTP server of unknown type",
with its page title if it has one. That is an honest answer and better than a
confident wrong one.

### Servers that answer everything

**MUST verify a body signature, not merely that a path exists.**
**Why:** some servers return 200 for every path. Against those, "this endpoint
exists" is true of every probe, so the first one in the list claims the server —
a trivial static server was confidently identified as Next.js during
development.

`identify()` guards against this by first requesting a path nothing should
serve. If that returns 200, only probes that check the response body are
trusted.

### Adding a probe

Add an entry to `PROBES` in [lib/probes.mjs](scripts/lib/probes.mjs):

```js
{
  id: "myserver",
  checksBody: true,             // set when `match` inspects the body
  name: "My dev server",
  path: "/__whoami",
  match: (res, body) => res.ok && body.includes("my-server"),
  describe: (body) => JSON.parse(body).projectName,   // optional detail
}
```

Order matters — the list is evaluated top to bottom and the first match wins, so
put specific probes above loose ones. Prefer a body check; a status-only match
needs a path that genuinely 404s elsewhere.

## Requiring a specific server

When you know what should be there, assert it:

```sh
node scripts/serve.mjs start --port 10101 --cmd "cloudcannon dev _site" --expect cloudcannon
```

If the probe reports anything else, the start fails and the process is stopped.
This catches the case where a command silently runs the wrong thing.
