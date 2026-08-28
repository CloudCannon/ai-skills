# Handoff and verification

How to close a migration with the user: who tests what, when to stop, and what to ask for back. Read at the end of Phase 5, or whenever the user stops earlier at a milestone.

## Testing boundaries

| Check                                                              | Owner |
| ------------------------------------------------------------------ | ----- |
| Local build (`npm run build` or whatever `package.json` defines)   | Agent |
| Builds, greps, small scripts, `dist/` inspection                   | Agent |
| Fidelity checks in CloudCannon (preview, inline edit, save-to-git) | Human |

Prefer asking the user to run CloudCannon verification over spinning up long-lived dev servers or heavy end-to-end testing in the agent session.

## When to close with the user

Close after a **meaningful chunk**, not every tiny edit. At minimum: when Phase 5 (Build and test) is done for a first full migration pass. If the user stops earlier (e.g. after configuration only), hand off at that milestone instead.

## What to say

Be direct and brief:

1. A short summary of what changed.
2. A checklist the user can run.
3. One clear ask for feedback.

Skip empty phrases ("let me know if you need anything"). Thanking them once for checking is fine.

## What to ask the user to verify

- **Local build** — the project's real build entrypoint, not a partial command. If it fails, paste the full error output (command, exit code, last ~30 lines of stderr).
- **Checks you already ran** — state them in one line so the user doesn't duplicate work.
- **CloudCannon (human)** — confirm in the hosted environment:
  - Inline text regions can be edited in the preview on representative pages
  - Image regions open the image picker
  - Array regions show add/remove/reorder controls where arrays were wired
  - Cross-file editables (`@file`, shared partials) update the intended source file
  - Saved changes land in the expected files in git

## What to ask the user to send back

Concrete signals: the exact command run, CloudCannon build log snippets if the remote build failed, the page URL and what they clicked if the editor misbehaved, or a short description of what differs from expected.

## Iteration

End with one line that invites the next pass — when they've run those checks, reply with any failures or odd behavior.
