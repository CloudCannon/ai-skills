# Editing sessions

The staged-changes model is documented in [`cloudcannon-cli/editing-sessions.md`](../cloudcannon-cli/editing-sessions.md) — read it first. Staged versus committed, discard versus delete, and the review-before-commit rule are the same product behaviour whichever client reaches it, and that file owns them.

This file covers only what differs when you drive a session through the SDK.

## What the SDK exposes that the CLI hides

The CLI resolves a session for you on every mutating command. The SDK makes the session an object you hold, which is the point — and the extra surface.

| Concern             | CLI                      | SDK                                                                                                      |
| ------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Getting a session   | Implicit, per command    | `site.createEditingSession()`, `getLatestEditingSession()`, `getEditingSessions()`                       |
| One-shot file write | `sites files upload`     | `site.uploadFile(path, content, options?)`                                                               |
| Staged operations   | `sites files move`, …    | `client.editingSession(uuid).moveFile()`, `cloneFile()`, `deleteFile()`, `restoreFile()`, `createFile()` |
| Batch operations    | Several positional paths | The plural pair of each — `moveFiles()`, `deleteFiles()`, one request                                    |
| Per-file operations | `sites files discard`    | `client.editingSessionFile(uuid).discard()`, `unlock()`, contributions                                   |

`site.createEditingSession()` is what the CLI calls before every mutating command — it resolves an open session or opens one. Use `getLatestEditingSession()` for read-only review, which is what the CLI's `list-edits` does.

## Committing

`session.commit()` takes an optional body, and neither half of it is documented in the shipped README.

```js
const session = await client.site(siteUuid).createEditingSession();
const sessionClient = client.editingSession(session.uuid);

// Commit everything staged — the CLI's --all
await sessionClient.commit({ message: "Update pricing copy" });
```

**MUST confirm with the user before committing.** The commit pushes to the site's real git repository and can trigger a build — see [SKILL.md § The rule that costs the most](SKILL.md#the-rule-that-costs-the-most).

**`include` is keyed by editing-session-file UUID, not by path.** To commit a subset, call `session.getFiles()`, map each file's `path` (or `source_path`, for a move) to its `uuid`, and pass `{ [uuid]: true }`:

```js
const files = await sessionClient.getFiles();
const include = {};
for (const file of files) {
  const key = file.path ?? file.source_path;
  if (wanted.has(key) && file.uuid) include[file.uuid] = true;
}
await sessionClient.commit({ message, include });
```

**Why:** passing paths as `include` keys is silently wrong — the keys do not match anything, so the scope is not what you asked for. Omitting `include` entirely commits the whole session.

**A path with no matching session file means the change was never staged.** Check for it rather than committing a partial set; the CLI treats it as an error and names the missing paths.

**MUST NOT read the commit response as confirmation the commit landed.** `commit()` resolves to `{ socket_message_id }` — the work is dispatched asynchronously, and the id identifies the notification, not a commit. Verify with a read if it matters. `site.createBackup()` returns the same shape for the same reason.

**The SDK does not refuse an empty commit.** "Site has no pending edits to commit" is a check the CLI performs before calling the API, not an API error. Call `session.getFiles()` and check it is non-empty yourself.

## Writing one file

`site.uploadFile(path, content, options?)` is the whole flow in one call — it takes S3 upload credentials, uploads the content, and registers the file in an editing session.

```js
await client.site(siteUuid).uploadFile("content/posts/hello.md", "# Hello", {
  type: "text/markdown",
  allow_overwrite: true,
});
```

`content` takes any `BlobPart` — a string, `Buffer`, `Blob`, or `ArrayBuffer`. `type` defaults to `text/plain`, and `allow_overwrite` defaults to refusing an existing path.

**It returns `void`, and it does not commit.** The file is staged. Nothing is on the site until a commit runs.

**`client.getUploadData()` is rarely the right call.** It returns the temporary S3 credentials `uploadFile` already obtains internally. Reach for it only when uploading outside the `uploadFile` flow entirely.

## Paths

Paths are site-absolute. **The SDK passes your path string through unchanged** — the normalisation that makes `./src/index.md` and `/src/index.md` equivalent at the command line is done by the CLI before it calls the SDK, not by the SDK. Normalise it yourself where the path comes from user input or a local filesystem walk: strip a leading `./`, then add a leading `/`.
