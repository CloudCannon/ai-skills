# Troubleshooting

Symptom → cause → fix for the SDK itself. For the same operations run as shell commands, see [`cloudcannon-cli/troubleshooting.md`](../cloudcannon-cli/troubleshooting.md).

## Errors the SDK raises

Every error class extends `ApiError` and carries `.status`, `.url`, `.errors` and `.options`, so a bare `catch` can branch on the status or on the class.

| Class                      | HTTP | Means                                                       |
| -------------------------- | ---- | ----------------------------------------------------------- |
| `AuthenticationError`      | 401  | The credential was refused. Also carries `.authHeaders`     |
| `PaymentRequiredError`     | 402  | The feature is not on the organisation's plan               |
| `ForbiddenError`           | 403  | Authenticated, but not permitted on this resource           |
| `NotFoundError`            | 404  | No such resource — or the identifier was not a UUID         |
| `UnprocessableEntityError` | 422  | Validation failed. `.errors` holds the field-level messages |
| `ApiError`                 | any  | The base class. Catch it last                               |

**Read `.errors` on a 422 before retrying.** It is the only place the API says which field was rejected; the message alone does not.

## Client and imports

| Symptom                                                         | Cause                                                                           | Fix                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Every call fails with `AuthenticationError` on a fresh client   | No credential was passed. The SDK reads none from disk or the environment       | Pass `key` or `userAccessKey` — [client.md](client.md#the-sdk-reads-no-credentials-of-its-own) |
| A `cloudcannon login` that works at the shell does nothing here | The credential chain is a CLI feature                                           | Read the credential in your own code and pass it in                                            |
| `ERR_PACKAGE_PATH_NOT_EXPORTED`                                 | `exports` declares `"."` only — no subpath imports, including `package.json`    | Resolve the entry point and walk up — [api-surface.md](api-surface.md#reading-the-method-list) |
| `ERR_REQUIRE_ESM`, or `require` returns `undefined`             | The package is ESM-only                                                         | `import CloudCannonClient from '@cloudcannon/sdk'`, or `await import()`                        |
| Requests go somewhere unexpected, or the URL is malformed       | `apiOrigin` was given a scheme. The client builds `https://<apiOrigin>/api/v0…` | Pass a bare host, or leave it unset                                                            |
| A valid `key` appears to be ignored                             | `getCustomAuthHeaders` is set, and it replaces the default headers entirely     | Set one or the other                                                                           |

## Addressing and results

| Symptom                                                   | Cause                                                                                 | Fix                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `NotFoundError` on a site you can see in the dashboard    | A name, id, or domain was passed where a UUID is required                             | Resolve it first — [resources.md](resources.md#finding-a-site-by-name)                   |
| `client.sites is not a function`                          | There is no cross-organisation site list                                              | List per organisation with `client.org(uuid).sites()`                                    |
| A list looks complete but is missing records              | Paginated endpoints return one page                                                   | Check `total_pages`, then page with `page` and `items`                                   |
| A filter is ignored                                       | `filters` is a nested object, not top-level options                                   | `{ filters: { search } }`, not `{ search }`                                              |
| `[object Response]`, or a field missing from a result     | The method returns a raw `Response`                                                   | `.json()` or `.text()` it — [resources.md](resources.md#what-a-method-returns)           |
| A write resolved but nothing seems to have happened       | Several write methods return `void`; a resolved promise is the only signal            | Verify with a read                                                                       |
| An upload succeeded but the file is not on the site       | It is staged in an editing session                                                    | [editing-sessions.md](editing-sessions.md#committing)                                    |
| A scoped commit committed the wrong files, or everything  | `include` keys are session-file UUIDs, not paths, and an absent `include` commits all | [editing-sessions.md § Committing](editing-sessions.md#committing)                       |
| `commit()` resolved, but the repository has no new commit | The response is a `socket_message_id`; the commit is dispatched asynchronously        | Poll with a read rather than trusting the response                                       |
| A `client.fetch` path is rejected by TypeScript           | The path carried the `/api/v0` prefix the client adds itself                          | Drop the prefix — [api-surface.md](api-surface.md#the-two-rules-that-break-a-fetch-call) |
| A `client.fetch` 404 was treated as a success             | `fetch` throws only on 401; other statuses come back as a response                    | Branch on `resp.status`                                                                  |

## Version note

The behaviour above was read from `@cloudcannon/sdk@0.0.13` — its shipped README, its generated `.d.ts` files, and the CLI's use of it. **No call in this skill has been executed against a live account.** Check the installed version's own documentation before relying on a detail that looks version-specific: [api-surface.md](api-surface.md#reading-the-method-list).
