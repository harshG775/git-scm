# Web plan

React, Vite+ (`vp`), TanStack Router (router-only) + Query, Zustand, shadcn (base-nova) + Tailwind v4.
API shape: see [../PLAN.md](../PLAN.md).

## Decisions
- State: server data in Query, UI/session in Zustand (`src/stores/workspace.ts`), active file in the URL.
- Mobile-first: drawer sidebar + bottom nav on phones; VS Code layout at `md+`.
  Snap-scroll tab strip, `100dvh`, safe-area insets, 44px touch targets, long-press menus.
- Editor: textarea first, then CodeMirror 6 (lazy-loaded language packs). Not Monaco.
- Live updates: SSE event triggers `invalidateQueries`; refetch on `visibilitychange` to visible.
- Changed on disk: a clean tab reloads silently; a dirty tab prompts reload / keep mine. 412 on save shows the same prompt.

## Done
- [x] router, Query provider + devtools, workspace store, shadcn base, `/api` dev proxy

## M1
- [ ] responsive shell: activity bar / bottom nav, drawer sidebar, tab strip
- [ ] Welcome tab: recents, open by path
- [ ] Explorer panel (tree API)
- [ ] file view (textarea), save with If-Match

## M2
- [ ] SSE client, report expanded dirs and open files to the watch API
- [ ] changed-on-disk prompt
- [ ] PWA: `vite-plugin-pwa`, manifest, icons, `viewport-fit=cover`

## M3
- [ ] Source Control panel: Staged / Changes groups, status letters, stage/unstage/discard, commit box
- [ ] diff view, branch indicator, pull/push

## M4
- [ ] CodeMirror 6, command palette button, search, offline shell
