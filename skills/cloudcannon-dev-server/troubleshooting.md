# Troubleshooting

Symptom → cause → fix for the dev server itself. Configuration problems belong to
[cloudcannon-configuration](../cloudcannon-configuration/SKILL.md); regions that are marked up
but inert belong to [cloudcannon-visual-editing](../cloudcannon-visual-editing/SKILL.md).

## Serving

| Symptom                                             | Cause                                                                                                        | Fix                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `/en/` returns 500                                  | The dev server has no directory index; EISDIR surfaces as a 500                                              | Request `/en/index.html`, or use `dev-status.mjs`, which retries automatically                                 |
| Everything looks right but the change is absent     | The output directory was never rebuilt                                                                       | `dev-status.mjs` reports STALE. `cloudcannon dev` never builds                                                 |
| Build reported fresh, but whole routes 404          | Freshness is mtime only — a bare `npm run build` writes a _newer_ output that skips `.cloudcannon/postbuild` | Build through `cc-serve.sh`, and pass `--check` for a URL only the postbuild produces                          |
| `dev-status.mjs` reports `build: UNKNOWN`           | It resolves the server's source paths under `--root`, which defaults to cwd                                  | Pass `--root <site directory>`. `UNKNOWN` means staleness was **not** checked — it is not a pass               |
| Nothing is reachable on 10101                       | The server is not running, or it took another port                                                           | Check the `cc-serve.sh` output for the port it reported, and pass `--port` to the scripts or set `CC_DEV_PORT` |
| `cloudcannon: command not found` from `cc-serve.sh` | It execs `cloudcannon dev`, so the CLI must be on `PATH`                                                     | `npm i -g @cloudcannon/cli`, or `PATH="$PWD/node_modules/.bin:$PATH"` for a local install                      |
| The output path is rejected as outside the project  | `cloudcannon dev` requires the output path to resolve inside the working directory                           | Run it from the site root; there is no `--source` flag                                                         |

## Writing

| Symptom                                        | Cause                                                                   | Fix                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Edit visible on screen, file unchanged         | Nothing committed the value                                             | Blur after editing, and allow ~1–3s before reading back                                                                        |
| `403 App sync is disabled`                     | Server started with `--no-app-sync`                                     | Restart without it                                                                                                             |
| `write-file.mjs` produced no `file-edit` event | App-initiated writes are deliberately not echoed                        | Read the file back instead of watching the stream — see [dev-server-api.md § Events](dev-server-api.md#events)                 |
| The diff is much larger than the edit          | CloudCannon reserialises the whole frontmatter on save                  | Expected. Diff the field you changed                                                                                           |
| YAML comments vanished after an unrelated edit | Same reserialisation — comments are not part of the parsed data         | Not recoverable from the editor. Keep guidance in `_inputs[].comment` in `cloudcannon.config.yml`, not in frontmatter comments |
| A JSON key lookup returns nothing              | Rosey locale keys contain colons and dots, so they are not dotted paths | `read-file.mjs --key` tries the literal key first; quote it: `--key "footer:blog"`                                             |

## Multilingual sites

| Symptom                                     | Cause                                                                         | Fix                                                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `/_rcc/locales.json` 404s                   | The manifest was never written, or Rosey's default `--exclusions` stripped it | It is written by `write-locales`; the postbuild must override the exclusions — see [make-site-multilingual](../make-site-multilingual/SKILL.md) |
| The `/{locale}/` tree is missing entirely   | The build skipped `.cloudcannon/postbuild`                                    | Build through `cc-serve.sh`                                                                                                                     |
| A page has no editable regions at `/about/` | Rosey moves the editable pages under the default locale                       | The copy with the regions is `/en/about/`; `/about/` serves a redirect stub. Use the collection's `url` from `cloudcannon.config.yml`           |

## Scripts

| Symptom                               | Cause                                    | Fix                                            |
| ------------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| `Cannot find module './lib/...'`      | Run from the wrong directory             | Use an absolute path, or `cd` into `scripts/`  |
| A script exits 1 with no other output | `--check` failed, or `--until` timed out | Both exit non-zero by design; re-run verbosely |
