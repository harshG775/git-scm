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

- [x] Source Control panel: Merge / Staged / Changes groups, status letters, stage/unstage/discard, commit box
- [x] diff view (opens as a tab, `?diff=&staged=`), branch indicator, pull/push, badge on the nav icon

## M4

- [x] Git Graph tab (`?view=graph`): lane layout (`lib/graph.ts`, property-tested), SVG lines, ref badges, uncommitted
      and stash rows, Local/All scope, load more, commit details. Opened from the Source Control and Branches headers.
- [x] thin scrollbars everywhere
- [x] Branches panel as collapsible Local / Remote / Stash sections (open state remembered): create + switch, checkout; fetch and track remote branches; stash, apply, pop, drop

## M5

- [x] Repository sheet from the project/branch crumb: current repository and branch, switch branch, switch to a recent repository or open another folder
- [x] Repository settings: local git config overrides, with inherited global values shown and cleared by empties (`GitConfigForm`, shared with the global settings page)
- [ ] Remotes, just-in-time identity/remote prompts, credentials

- [ ] CodeMirror 6, command palette button, search, offline shell

## Theme and styles fixes

Found by screenshotting every screen in light and dark. `html`/`body` stayed near-black in light mode because the boot skeleton's unlayered `<style>` in `index.html` beats Tailwind's `@layer base` background; Settings (no background of its own) showed it.

- [x] 1. Scope the boot styles to `#boot` so `html`/`body` take their color from the theme tokens
- [x] 2. Make the boot skeleton follow the theme (no dark flash in light mode)
- [x] 3. `theme-color` meta follows the theme (`applyTheme` + the inline script); manifest colors match a real background
- [x] 4. File icons: light and dark variants (pale `-300`/`-400` shades are weak on white)
- [x] 5. Re-run the screenshot sweep in both themes and compare (Settings must be light in light mode)
