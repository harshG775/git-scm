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
