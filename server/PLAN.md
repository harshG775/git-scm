# Server plan

Go stdlib, `net/http`. Shells out to the `git` binary. Embeds the web build from `internal/ui/dist`.
API shape: see [../PLAN.md](../PLAN.md).

## Decisions
- Config + recent projects in `~/.git-csm/config.json`, created on first run.
- Path guard: one function resolves every client path (incl. symlinks) and rejects anything outside the project root.
- Git status: `git status --porcelain=v2 -z --branch`. VS Code's `extensions/git` (MIT) is a behavior reference.
- ETag = content hash (not mtime). `PUT` needs `If-Match`: 428 if missing, 412 if stale. Saves are serialized and the
  check is repeated just before the atomic rename.
- Live updates: while a client is connected, poll every ~2-3s: `git status` hash, mtimes of watched files,
  listings of watched dirs. Push changes over SSE. `fsnotify` only if polling is too slow.
- Git runs with literal pathspecs (no globbing), no prompts, and detached from the terminal (`Setsid`), so a
  password prompt can never hang the server. Mutations are serialized per project. Failures return git's own
  message as 422. Pull is `--ff-only`; the first push sets `origin` as upstream. Diffs are capped at 1 MiB.
- No login, so the browser's origin rules are the protection (`internal/guard`): every request must name a
  localhost or IP-literal Host (blocks DNS rebinding; others via `--allow-hosts`), and any Origin must be the
  server itself (blocks cross-site POSTs). The Vite dev proxy forwards only same-origin requests (see
  `vite.config.ts`). Anything new that is dangerous (terminal, credentials) depends on this.
- Flags: `--addr`, `--cert`, `--key`. Graceful shutdown.

## Done
- [x] `/api/health`, embedded SPA with index fallback, optional TLS, Makefile

## M1
- [x] config load/save
- [x] projects API
- [x] path guard + tests (`..`, absolute paths, symlinks out of root)
- [x] tree API
- [x] file read/write with ETag / If-Match

## M2
- [x] watch API + SSE `/events` with polling loop; stops when no clients
- [x] static serving for the PWA: manifest MIME, no-cache shell, immutable `assets/`, 404 for missing assets

## M3
- [x] git status parser + tests (incl. unborn branch, renames, conflicts, subdirectory projects)
- [x] stage, unstage, discard, commit, diff
- [x] pull, push

## M4
- [x] branches: list, create (+switch), checkout (git's refusal message passed through; names validated)
- [x] remote branches (list, fetch --prune, checkout as tracking branch) and stash (push, list, apply, pop, drop).
  Stash actions carry the stash's commit id and are refused if the list shifted, so a stale screen can never
  act on the wrong stash. `stash --include-untracked` needs git's own pathspec magic, so it runs without
  `GIT_LITERAL_PATHSPECS`. The poller also hashes the stash count and all branch tips, so outside `git stash`,
  `git fetch` and `git branch` reach the panels.
- [ ] move Vite `outDir` to `internal/ui/dist` to drop the copy step
