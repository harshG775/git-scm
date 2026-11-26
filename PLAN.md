# git csm

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
| DELETE | `/api/projects/{id}` | forget a project; the directory is untouched |
| GET | `/api/p/{id}/tree?path=` | one directory level |
| GET | `/api/p/{id}/file?path=` | returns `ETag` |
| PUT | `/api/p/{id}/file?path=` | needs `If-Match`; 412 if changed on disk |
| GET | `/api/p/{id}/git/status` | branch, ahead/behind, staged, changes, untracked |
| GET | `/api/p/{id}/git/diff?path=&staged=` | |
| POST | `/api/p/{id}/git/{stage,unstage,discard}` | `{paths}`; 204 |
| GET | `/api/p/{id}/git/log?scope=local\|all&limit=` | commits newest first, each before its parents, with `parents[]`, `refs[]`; plus `uncommitted`, `stashes[]` (with `base`), `hasMore` |
| GET | `/api/p/{id}/git/branches` | `{isRepo, head, detached, branches[]}`; current first, then most recent |
| POST | `/api/p/{id}/git/branches` | `{name}`; creates at HEAD and switches; 204 |
| POST | `/api/p/{id}/git/checkout` | `{name}`; existing local branch only; 422 with git's message if refused |
| GET | `/api/p/{id}/git/remotes` | `{isRepo, remotes[], branches[]}` as of the last fetch; `hasLocal` per branch |
| POST | `/api/p/{id}/git/fetch` | `--all --prune`; returns `{output}` |
| POST | `/api/p/{id}/git/checkout-remote` | `{name: "origin/x"}`; creates a tracking branch and switches |
| GET | `/api/p/{id}/git/stashes` | `{isRepo, stashes[{index, oid, branch, title, auto, time}]}` |
| POST | `/api/p/{id}/git/stash` | `{message, includeUntracked}`; 422 if there is nothing to stash |
| POST | `/api/p/{id}/git/stash/{apply,pop,drop}` | `{index, oid}`; refused if `oid` is no longer at `index` |
| POST | `/api/p/{id}/git/commit` | `{message}`; returns `{oid}`; 422 with git's message on failure |
| POST | `/api/p/{id}/git/{pull,push}` | returns `{output}`; pull is fast-forward only |
| PUT | `/api/p/{id}/watch?client=` | `{dirs, files}` the client has expanded or open; 404 until its stream is open |
| GET | `/api/p/{id}/events?client=` | SSE: `ready`, `git`, `file {path}`, `dir {path}`; `client` is a random id the page picks |

Errors: `{error}` JSON with a matching status code.

## Milestones
- [x] Scaffolds
- [x] M1: server core + web shell (projects, tree, files)
- [x] M2: live updates + conflicts, PWA
- [x] M3: Source Control
- [ ] M4: polish

## Open
- Terminal in scope? (Would need a WebSocket.)
