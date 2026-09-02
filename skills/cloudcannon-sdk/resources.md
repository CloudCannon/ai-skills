# Resources

The client is a tree. The root lists organisations; every other resource is reached by handing its UUID to a factory method on the root.

## Addressing a resource

**MUST resolve a UUID before constructing a sub-client.** `client.site()`, `client.org()`, `client.build()` and the rest take a UUID and nothing else. A name, a numeric id, or a domain is not accepted and is not resolved.

**Why:** the CLI's `--site` accepts a name, id, UUID, or domain, so an agent that has used the CLI arrives expecting the same. It does not fail at the call — it fails on the first request, as a 404 that reads like a missing site or a permissions problem rather than a wrong argument.

Site name resolution is a CLI feature built on top of the SDK, not part of it. `/snowbox/cli/src/sites/resolve.ts` is the reference implementation.

## Finding a site by name

**MUST NOT look for `client.sites()`.** There is no cross-organisation site list. Sites are listed per organisation, so finding one by name means listing organisations first.

Procedure:

- List organisations with `client.orgs()`
- For each, call `client.org(uuid).sites({ filters: { search: name } })`
- Collect the matches across all organisations, then disambiguate

```js
const { items: orgs } = await client.orgs();

const matches = [];
for (const org of orgs) {
  const { items } = await client.org(org.uuid).sites({ filters: { search: name } });
  matches.push(...items);
}
```

**MUST treat more than one match as an error, not as a first-match.** `search` is a substring match, so a short name matches broadly. The CLI refuses an ambiguous identifier and prints the candidates rather than guessing; do the same.

**Skip the search when the value is already a UUID.** Pass it straight to `client.site()`. A numeric id goes through `filters: { id }` instead of `filters: { search }`, and a `.cloudvent.net` domain is matched on its first label.

Organisations resolve the same way through `client.orgs({ filters: { search } })`, except that a UUID can go directly to `client.org(uuid).get()`.

## The sub-clients

| Reached by                        | Covers                                                                    |
| --------------------------------- | ------------------------------------------------------------------------- |
| `client` (root)                   | Listing organisations; upload credentials; the raw `fetch`                |
| `client.org(uuid)`                | Sites, inboxes and DAMs in an organisation; creating and connecting sites |
| `client.site(uuid)`               | Everything about one site — the largest sub-client by a wide margin       |
| `client.build(uuid)`              | One build's details                                                       |
| `client.sync(uuid)`               | One sync's details                                                        |
| `client.backup(uuid)`             | Downloading one backup archive                                            |
| `client.inbox(uuid)`              | Form submissions in an inbox                                              |
| `client.siteInbox(uuid)`          | Updating one site-to-inbox connection                                     |
| `client.editingSession(uuid)`     | Staged file operations, and committing them                               |
| `client.editingSessionFile(uuid)` | One staged file — contributions, locking, discarding                      |

The editing-session pair has its own file: [editing-sessions.md](editing-sessions.md).

## What the CLI cannot reach

The reason to use the SDK rather than shelling out. None of these have a CLI command:

| Surface               | Methods                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Backups               | `site.listBackups`, `site.createBackup`, `backup.download`                                                            |
| Syncs                 | `site.getSyncs`, `site.triggerPull`, `sync.get`                                                                       |
| DAMs                  | `org.getDams`, `org.createDam`, `site.getDamConnections`, `site.connectDam`                                           |
| Site scans            | `site.getScan`                                                                                                        |
| Screenshots           | `site.getScreenshotHashes`, `site.getScreenshot`                                                                      |
| Provider connections  | `site.connectSourceProvider`, `updateSourceProvider`, `disconnectSourceProvider`, and the output-provider equivalents |
| Repositories          | `org.getRepositories`                                                                                                 |
| Whole-site operations | `site.copy`, `site.delete`, `site.update`                                                                             |
| Inbox management      | `org.createInbox`, `site.connectInbox`, `siteInbox.update`                                                            |

**MUST confirm before calling any of the write methods above.** `site.delete` and `site.copy` in particular have no CLI equivalent to have accustomed anyone to a confirmation step — see [SKILL.md § The rule that costs the most](SKILL.md#the-rule-that-costs-the-most).

## Pagination, sorting and filtering

List methods share one options shape and one response shape.

```js
const page = await client.org(orgUuid).sites({
  page: 1,
  items: 50,
  sort_attribute: "name",
  sort_direction: "ASC",
  filters: { search: "docs" },
});
// { items, current_page, total_items, total_pages }
```

**MUST NOT treat the first page as a complete list.** The default response is one page. Read `total_pages` or `total_items` before concluding a result set is exhausted — a short page and a last page are indistinguishable otherwise.

`page`, `items`, `sort_attribute` and `sort_direction` are the same everywhere. `filters` is endpoint-specific, and it is a nested object rather than top-level keys — `{ filters: { search } }`, not `{ search }`. Which filters an endpoint accepts is in the shipped README; see [api-surface.md](api-surface.md#reading-the-method-list).

`current_page`, `total_items` and `total_pages` are optional in the response type. Treat a missing value as unknown rather than as zero.

## What a method returns

Most methods return a parsed value. A handful return the raw `fetch` `Response`, and the asymmetry is not signposted in the method name.

| Method                  | Returns    | Consume with                              |
| ----------------------- | ---------- | ----------------------------------------- |
| `site.getFile(path)`    | `Response` | `.text()`, or `.arrayBuffer()` for binary |
| `site.getScreenshot(…)` | `Response` | `.arrayBuffer()`                          |
| `backup.download()`     | `Response` | Stream the body — archives are large      |
| `build.get()`           | `Response` | `.json()`                                 |
| `sync.get()`            | `Response` | `.json()`                                 |
| Everything else         | Parsed     | Use it directly                           |

**MUST check the method's return type before using the result.** `await site.getFile(path)` is a `Response`, not a string; treating it as one yields `[object Response]` rather than an error.

Several write methods return `void` — `site.delete`, `site.rebuild`, `site.uploadFile`, `site.triggerPull`. **A resolved promise is the only success signal they give.** There is nothing in the return value to inspect, so verify the effect with a subsequent read if it matters.
