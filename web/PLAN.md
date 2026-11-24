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

- [x] responsive shell: activity bar / bottom nav, drawer sidebar, tab strip
- [x] Welcome tab: recents, open by path
- [x] Explorer panel (tree API)
- [x] file view (textarea), save with If-Match

## M2

- [x] SSE client, report expanded dirs and open files to the watch API
- [x] changed-on-disk handling: clean tabs update silently, dirty tabs get a reload / keep-mine prompt
- [x] PWA: `vite-plugin-pwa`, manifest, icons (`vpx scripts/gen-icons.ts`)

## M3

- [ ] Source Control panel: Staged / Changes groups, status letters, stage/unstage/discard, commit box
- [ ] diff view, branch indicator, pull/push

## M4

- [ ] CodeMirror 6, command palette button, search, offline shell
