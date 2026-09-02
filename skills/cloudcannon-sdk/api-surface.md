# The API surface

The package ships its own complete reference. This file tells you how to read it; it does not copy it.

## Reading the method list

**MUST read method signatures from the installed package rather than from memory or from this file.**

**Why:** `@cloudcannon/sdk` ships a per-method README and generated `.d.ts` files that are always correct for the installed version. A transcription in a skill file is correct only until the next release, and the version an agent is working against is the only one that matters.

Three sources, in the order to reach for them:

| Source                     | Answers                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `README.md`                | What a method does, its options, and an example response shape |
| `dist/index.d.ts`          | The root client, every exported type, and the error classes    |
| `dist/src/<resource>.d.ts` | One sub-client's exact signatures and its option types         |

**Resolve the package directory first — subpath imports do not work.** `exports` declares `"."` and nothing else, so `require.resolve('@cloudcannon/sdk/README.md')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. Resolve the entry point and walk up instead:

```sh
SDK=$(node -p "require('node:path').resolve(require.resolve('@cloudcannon/sdk'), '../..')")

grep -n '^#### ' "$SDK/README.md"      # every documented method, with its line
cat "$SDK/dist/index.d.ts"             # root client, exported types, error classes
cat "$SDK/dist/src/site.d.ts"          # one sub-client's exact signatures
```

To read one method's full entry, take its line number from the `grep` and print the section:

```sh
sed -n '560,600p' "$SDK/README.md"     # site.updateBuildConfig
```

As of 0.0.13 that is 62 documented methods across ten sub-clients, and `site` alone holds 29 of them.

## The raw escape hatch

`client.fetch` is a typed call onto any CloudCannon API endpoint, including the ones no sub-client wraps. It injects the auth headers, sets `Content-Type: application/json`, and types the URL and body against the OpenAPI schema.

```js
const resp = await client.fetch("/sites/site-uuid");

if (resp.status === 200) {
  const site = await resp.json();
} else if (resp.status === 404) {
  // handle not found
}
```

```js
const resp = await client.fetch("/orgs/org-uuid/sites", {
  method: "POST",
  body: { site_name: "My New Site" },
});
```

**Reach for it only when no sub-client method covers the endpoint.** The wrapped methods parse responses, apply the paginated shape, and raise typed errors; `fetch` does none of that and hands you the status code to branch on yourself.

**MUST confirm with the user before a `fetch` that writes.** The gate is about which endpoint is being called, not about which wrapper reached it — a `POST`, `PUT`, `PATCH` or `DELETE` through `fetch` is a write to a live site. See [SKILL.md § The rule that costs the most](SKILL.md#the-rule-that-costs-the-most).

### The two rules that break a `fetch` call

**MUST NOT include the `/api/v0` prefix in the path.** The client prepends it. `/sites/uuid` is correct; `/api/v0/sites/uuid` is not, and TypeScript rejects it as an invalid URL rather than explaining why.

**`fetch` throws on 401 and on nothing else.** An expired or invalid credential raises `AuthenticationError`; every other error status — 402, 403, 404, 422 — comes back as a response for you to branch on. The typed error classes the sub-clients raise are not raised here, so an unchecked `404` reads as success.

### Finding an endpoint

`dist/schema.d.ts` is the generated OpenAPI schema — the authority on what exists. Its `paths` keys carry the `/api/v0` prefix that `fetch` omits, so strip it:

```sh
# Every endpoint, in the shape fetch expects
grep -oE "^    '/api/v0[^']*'" "$SDK/dist/schema.d.ts" | tr -d "' " | sed 's|^/api/v0||'

# Which HTTP methods one endpoint supports, and the operation behind each
grep -A 18 "'/api/v0/sites/{site_uuid}/archives'" "$SDK/dist/schema.d.ts"
```

Each path block lists `get`, `post`, `put`, `patch`, `delete`; a verb set to `never` is not available on that endpoint. The named `operations[…]` entry is the key to look up in the `operations` interface for the request and response types.

As of 0.0.13 the schema describes 168 paths and 240 operations against 62 wrapped methods, so most of the API is reachable only this way. The largest unwrapped groups are site sub-resources, organisation management, users, base domains and projects.
