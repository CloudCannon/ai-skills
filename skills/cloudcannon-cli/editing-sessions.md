# Editing sessions

`sites files` does not write to a repository directly. Every change lands in an **editing session** — CloudCannon's staged-changes area for a site — and stays there until it is committed or discarded. This is the same mechanism the CMS itself uses when someone edits a page in the app.

**MUST treat an uncommitted change as invisible to the site.** An upload that succeeded is not live, is not in git, and will not appear in a build until `commit` runs.

## The lifecycle

| Step    | Command                                         | Effect                                          |
| ------- | ----------------------------------------------- | ----------------------------------------------- |
| Inspect | `sites files list --site <site>`                | The site's committed files                      |
| Change  | `upload`, `move`, `clone`, `delete`, `restore`  | Stages the change in an editing session         |
| Review  | `sites files list-edits --site <site>`          | What is pending, and has not yet been committed |
| Publish | `sites files commit --site <site> --all -m "…"` | Pushes the session to the repository            |
| Abandon | `sites files discard --site <site> <path>`      | Drops a staged change without committing it     |

**MUST run `list-edits` between staging and committing.** It is the only command that shows what `commit --all` is about to push, and it costs one call.

## The commands

| Command                     | Arguments                     | Notes                                                              |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `list`                      | —                             | Committed files on the site                                        |
| `get <path>`                | `--output <file>`             | Writes to stdout without `--output`                                |
| `upload <localPath> <path>` | `--type`, `--allow-overwrite` | Fails on an existing path unless `--allow-overwrite` is set        |
| `move <src> <dest>`         | `--allow-overwrite`           |                                                                    |
| `clone <src> <dest>`        | `--allow-overwrite`           |                                                                    |
| `delete <target>…`          | `--discard-unsaved`           | Accepts several paths as positional arguments                      |
| `restore <target>…`         | —                             | Undoes a staged delete                                             |
| `discard <target>…`         | —                             | Drops a staged change entirely, including the file's session edits |
| `list-edits`                | `--verbose`                   | `--verbose` prints the raw API objects                             |
| `commit [path]…`            | `--all`, `--message`          | Requires either explicit paths or `--all`                          |

Paths are site-absolute. A leading `./` is stripped and a leading `/` added, so `./src/index.md` and `/src/index.md` address the same file.

## Committing

**MUST confirm with the user before committing.** The commit pushes to the site's real git repository and, depending on the site's configuration, can trigger a build.

```sh
npx @cloudcannon/cli sites files list-edits --site my-site
npx @cloudcannon/cli sites files commit --site my-site --all --message "Update pricing copy"
```

`commit` refuses two situations rather than guessing:

| Situation                            | Message                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Neither `--all` nor a path was given | `you must either provide a list of files to commit or use the --all flag` |
| The session holds no pending edits   | `Site has no pending edits to commit`                                     |

Prefer committing explicit paths over `--all` when the session may hold changes made by someone else in the CMS. `--all` does not distinguish yours from theirs.

## Which session am I in?

Every mutating command opens or resolves a session by `POST`ing to the site's editing-sessions endpoint before it acts; `list-edits` reads the site's _latest_ session. In a normal sequence — stage, review, commit — these are the same session, which is why `list-edits` is a reliable review step.

**Do not infer more than that.** Whether repeated commands reuse one open session or start a new one is decided by the API, not by the CLI, and it is not something this skill has verified. If it matters — a long-running task, or a site someone else is editing at the same time — confirm with `list-edits` rather than assuming, and commit explicit paths.

## Discard versus delete

They are not opposites, and the names invite the mistake.

| Command   | Acts on            | Result                                                     |
| --------- | ------------------ | ---------------------------------------------------------- |
| `delete`  | A file on the site | Stages a deletion. Committing it removes the file from git |
| `discard` | A staged change    | Throws the pending change away. The site is left as it was |
| `restore` | A staged deletion  | Un-stages the deletion, so the file survives the commit    |

`delete --discard-unsaved` combines the two: it removes the file and drops any unsaved session edits to it at the same time.
