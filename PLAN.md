# git scm

Mobile-first PWA for source control + code browsing. Go server in Termux serves the app over localhost HTTPS.
UX modeled on VS Code (Welcome tab, Explorer, file tabs, built-in SCM view).

- Backend plan: [server/PLAN.md](server/PLAN.md)
- Frontend plan: [web/PLAN.md](web/PLAN.md)

## Shared
- Plain two-folder repo, no JS monorepo. REST/JSON, hand-written types (OpenAPI via `huma` maybe later).
- No fixed root: open a project by path from the Welcome tab; it gets an `id`. All paths are relative to the project.
- External edits (nvim, file manager, git in Termux): server polls, pushes SSE events, client invalidates queries.
- Dev: `vp dev` (:3000) proxies `/api` to Go (:8080). Prod: `make build` makes one binary with the web app embedded.

## API contract
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | |
| GET, POST | `/api/projects` | list recents; open/add `{path}` returns `{id, name, path}` |
| GET | `/api/directories?path=` | list browsable directories under the server user's home and shared storage roots |
| DELETE | `/api/projects/{id}` | forget a project; the directory is untouched |
| GET | `/api/p/{id}/tree?path=` | one directory level |
| GET | `/api/p/{id}/file?path=` | returns `ETag` |
| PUT | `/api/p/{id}/file?path=` | needs `If-Match`; 412 if changed on disk |
| GET | `/api/p/{id}/git/status` | branch, ahead/behind, staged, changes, untracked |
| GET | `/api/p/{id}/git/diff?path=&staged=` | |
| POST | `/api/p/{id}/git/{stage,unstage,discard}` | `{paths}`; 204 |
| GET | `/api/p/{id}/git/log?scope=current\|local\|all&limit=` | commits newest first, each before its parents, with `parents[]`, `refs[]`; `current` follows HEAD, `local` includes all local branches, `all` also includes remote branches and tags; plus `uncommitted`, `stashes[]` (with `base`), `hasMore` |
| GET | `/api/p/{id}/git/branches` | `{isRepo, head, detached, branches[]}`; current first, then most recent |
| POST | `/api/p/{id}/git/branches` | `{name, from?}`; creates at HEAD (or at `from`: branch, remote branch, tag, commit) and switches; 204 |
| POST | `/api/p/{id}/git/checkout` | `{name}`; existing local branch only; 422 with git's message if refused |
| GET | `/api/p/{id}/git/remotes` | `{isRepo, remotes[], branches[]}` as of the last fetch; `hasLocal` per branch |
| POST | `/api/p/{id}/git/fetch` | `--all --prune`; returns `{output}` |
| POST | `/api/p/{id}/git/checkout-remote` | `{name: "origin/x"}`; creates a tracking branch and switches |
| GET | `/api/p/{id}/git/stashes` | `{isRepo, stashes[{index, oid, branch, title, auto, time}]}` |
| POST | `/api/p/{id}/git/stash` | `{message, includeUntracked}`; 422 if there is nothing to stash |
| POST | `/api/p/{id}/git/stash/{apply,pop,drop}` | `{index, oid}`; refused if `oid` is no longer at `index` |
| POST | `/api/p/{id}/git/commit` | `{message, amend?}`; returns `{oid}`; with `amend` an empty message keeps the old one; 422 with git's message on failure |
| POST | `/api/p/{id}/git/undo-commit` | moves the branch back one commit, changes stay staged; returns `{message}`; refused for a root, merge or pushed commit |
| GET | `/api/p/{id}/git/numstat` | `{staged, changes}`: `{path: {added, removed}}`; no entry for untracked or binary files |
| GET | `/api/p/{id}/git/tags` | `{isRepo, tags[{name, oid, time, subject}]}` newest first |
| POST | `/api/p/{id}/git/branches/rename` | `{name, to}`; 204 |
| POST | `/api/p/{id}/git/branches/delete` | `{name, force?}`; git refuses an unmerged branch without `force`; 204 |
| POST | `/api/p/{id}/git/remote-branches/delete` | `{name: "origin/x"}`; returns `{output}` |
| POST | `/api/p/{id}/git/tags/delete`, `/git/tags/push` | `{name}`; push returns `{output}` |
| POST | `/api/p/{id}/git/merge` | `{name}`; a merge that conflicts is aborted and returns 422 listing the files |
| POST | `/api/p/{id}/git/pull` | optional `{operation}`: `fetch-all`, `pull-ff`, `pull-ff-only` (default), or `pull-rebase`; returns `{output}` |
| POST | `/api/p/{id}/git/push` | returns `{output}` |
| PUT | `/api/p/{id}/watch?client=` | `{dirs, files}` the client has expanded or open; 404 until its stream is open |
| GET | `/api/p/{id}/events?client=` | SSE: `ready`, `git`, `file {path}`, `dir {path}`; `client` is a random id the page picks |
| GET, PUT | `/api/p/{id}/git/config` | repository git config overrides: GET returns `{path, values}`, PUT `{key, value}`; an empty value removes the override |

Errors: `{error}` JSON with a matching status code.

## Milestones
- [x] Scaffolds
- [x] M1: server core + web shell (projects, tree, files)
- [x] M2: live updates + conflicts, PWA
- [x] M3: Source Control
- [ ] M4: polish
- [ ] M5: Settings (below) — global config, repository overrides, and the repository sheet are done; remotes, prompts, and credentials remain

## Open
- Terminal in scope? (Would need a WebSocket.)

## M5: Settings and git config

Git's own config is the source of truth: the server reads and writes it with `git config`, and git decides
which value wins (repo over global over system). The app never keeps a copy. App-only preferences (theme,
confirm destructive actions, do not disturb) are not git config and live in the browser's localStorage.

**Only an allowlist of keys is editable**, and values are validated (no newlines, enums checked). Some keys
run programs (`alias.*` with `!`, `core.sshCommand`, `core.hooksPath`, `core.fsmonitor`, `credential.helper`),
so letting the API set arbitrary keys would be remote code execution. Allowed: `user.name`, `user.email`,
`init.defaultBranch`, `pull.rebase`, `push.autoSetupRemote`, `core.autocrlf`.

| Phase | Status | What | Where in the UI |
| --- | --- | --- | --- |
| 1 | Done | Global git config (identity, defaults) + app theme | Settings page, opened from a gear on the Welcome page |
| 2 | Done | This repository: local overrides, with the inherited global value shown | Repository sheet → dedicated `/projects/{id}/settings` page |
| 3 | Planned | Remotes: list, add, change URL, remove | Sheet, plus an "Add remote" button in the empty Remotes card |
| 4 | Planned | Just-in-time prompts | Notice above the commit box when no identity is set; "Set identity" / "Add remote" actions on the failure toast |
| 5 | Partial | Entry point inside a project: current repository, switch branch, change repository, repository settings | Repository name or branch in the sidebar header opens the Repository sheet; remotes and identity actions still to come |
| 6 | Later | Credentials for HTTPS push (token) or showing the SSH public key | Later, needs its own design |

API: `GET /api/git/config` returns `{path, values}` for the global file; `PUT /api/git/config` takes
`{key, value}` (empty value unsets the key). The repository scope uses `GET/PUT /api/p/{id}/git/config` with
the same shape; an empty value removes the local override so the global value applies again.

