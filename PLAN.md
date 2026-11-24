# git csm

Mobile-first PWA for source control + code browsing. Go server in Termux serves the app over localhost HTTPS.
UX modeled on VS Code (Welcome tab, Explorer, file tabs, built-in SCM view).

## Stack
- `web/`: React, Vite+ (`vp`), TanStack Router + Query, Zustand, shadcn + Tailwind v4, CodeMirror 6 (planned)
- `server/`: Go stdlib; shells out to `git`; embeds the web build (`go:embed`)
- Plain two-folder repo, no JS monorepo. REST/JSON, hand-written types.

## Decisions
- No fixed root: open a project by path from the Welcome tab. Recents + config in `~/.git-csm/config.json`.
- Every client path goes through one guard that rejects paths outside the project root.
- State: server data in Query, UI/session in Zustand, active file in the URL.
- Git: `git status --porcelain=v2 -z --branch`. VS Code's `extensions/git` (MIT) is a behavior reference only.
- UI: drawer sidebar + bottom nav on phones, VS Code layout at `md+`. Snap-scroll tab strip. 44px touch targets.
- Dev: `vp dev` (:3000) proxies `/api` to Go (:8080). Prod: one binary, optional TLS (`--cert --key`).

## Milestones
- [x] Scaffolds: web (router, query, store, shadcn), server (health, embedded SPA), Makefile
- [ ] M1 backend: config file, projects API, path guard (+tests), tree, file read/write
- [ ] M2 shell: responsive layout, Welcome tab, Explorer, tabs, textarea file view, PWA
- [ ] M3 SCM: status, stage/unstage/discard/commit, diff, SCM panel, branch, pull/push
- [ ] M4 polish: CodeMirror, command palette, search, HTTPS on phone, offline shell

## Open
- OpenAPI (`huma`) later? WebSocket vs SSE for live updates? Terminal in scope?
