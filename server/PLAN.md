# Server plan

Go stdlib, `net/http`. Shells out to the `git` binary. Embeds the web build from `internal/ui/dist`.
API shape: see [../PLAN.md](../PLAN.md).

## Decisions
- Config + recent projects in `~/.git-csm/config.json`, created on first run.
- Path guard: one function resolves every client path (incl. symlinks) and rejects anything outside the project root.
- Git status: `git status --porcelain=v2 -z --branch`. VS Code's `extensions/git` (MIT) is a behavior reference.
- ETag = mtime + size. `PUT` without a matching `If-Match` returns 412.
- Live updates: while a client is connected, poll every ~2-3s: `git status` hash, mtimes of watched files,
  listings of watched dirs. Push changes over SSE. `fsnotify` only if polling is too slow.
- Flags: `--addr`, `--cert`, `--key`. Graceful shutdown.

## Done
- [x] `/api/health`, embedded SPA with index fallback, optional TLS, Makefile

## M1
- [ ] config load/save
- [ ] projects API
- [ ] path guard + tests (`..`, absolute paths, symlinks out of root)
- [ ] tree API
- [ ] file read/write with ETag / If-Match

## M2
- [ ] watch API + SSE `/events` with polling loop; stop when no clients

## M3
- [ ] git status parser + tests
- [ ] stage, unstage, discard, commit, diff
- [ ] pull, push

## M4
- [ ] move Vite `outDir` to `internal/ui/dist` to drop the copy step
