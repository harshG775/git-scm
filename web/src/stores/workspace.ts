import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SidebarPanel = "explorer" | "search" | "git" | "branches";
export type TabKind = "file" | "diff";
/** Collapsible sections of the Branches panel. */
export type BranchSection = "local" | "remote" | "stash";

export interface Tab {
    /** A file tab's id is its path; a diff tab's id comes from `diffId`. */
    id: string;
    kind: TabKind;
    path: string;
    /** Diff tabs only: staged (HEAD vs index) or working tree (index vs disk). */
    staged?: boolean;
    /** Unsaved editor text; undefined means the tab is clean. */
    buffer?: string;
    /** The file changed on disk while `buffer` holds unsaved edits: the user must pick a side. */
    changedOnDisk?: boolean;
}

export const diffId = (path: string, staged: boolean) => `diff:${staged ? "s" : "w"}:${path}`;

// The active tab lives in the URL (`?file=` or `?diff=`), not here.
interface WorkspaceState {
    projectId: string | null;
    tabs: Tab[];
    /** Expanded Explorer directories (also reported to the server's watch API). */
    expanded: string[];
    sidebarPanel: SidebarPanel;
    /** Desktop sidebar column visibility (persisted). */
    sidebarOpen: boolean;
    /** Phone drawer visibility (transient). */
    drawerOpen: boolean;
    /** Source Control commit message draft, kept while switching panels. */
    commitMessage: string;
    /** Which Branches sections are expanded (like VS Code's accordion: several can be open). */
    branchSections: Record<BranchSection, boolean>;

    /** Switch project; tabs and expanded dirs belong to one project, so they reset on change. */
    enterProject: (id: string) => void;
    openFile: (path: string) => void;
    openDiff: (path: string, staged: boolean) => void;
    /** Closes a tab and returns the tab that should be active afterwards (null if none are left). */
    closeTab: (id: string, activeId: string | null) => Tab | null;
    /** Setting `undefined` makes the tab clean, which also clears any changed-on-disk flag. */
    setBuffer: (path: string, buffer: string | undefined) => void;
    markChanged: (path: string, changed: boolean) => void;
    toggleDir: (path: string) => void;
    setCommitMessage: (message: string) => void;
    toggleBranchSection: (section: BranchSection) => void;
    /** Activity-bar / bottom-nav tap. Tapping the open panel collapses it, as in VS Code. */
    selectPanel: (panel: SidebarPanel, desktop: boolean) => void;
    closeDrawer: () => void;
}

const isFileTab = (t: Tab, path: string) => t.kind === "file" && t.path === path;

export const useWorkspace = create<WorkspaceState>()(
    persist(
        (set, get) => ({
            projectId: null,
            tabs: [],
            expanded: [],
            sidebarPanel: "explorer",
            sidebarOpen: true,
            drawerOpen: false,
            commitMessage: "",
            branchSections: { local: true, remote: false, stash: false },

            enterProject: (id) => {
                if (get().projectId !== id)
                    set({ projectId: id, tabs: [], expanded: [], drawerOpen: false, commitMessage: "" });
            },

            openFile: (path) =>
                set((s) =>
                    s.tabs.some((t) => t.id === path) ? s : { tabs: [...s.tabs, { id: path, kind: "file", path }] },
                ),

            openDiff: (path, staged) =>
                set((s) => {
                    const id = diffId(path, staged);
                    return s.tabs.some((t) => t.id === id)
                        ? s
                        : { tabs: [...s.tabs, { id, kind: "diff", path, staged }] };
                }),

            closeTab: (id, activeId) => {
                const { tabs } = get();
                const idx = tabs.findIndex((t) => t.id === id);
                if (idx === -1) return tabs.find((t) => t.id === activeId) ?? null;
                const rest = tabs.filter((t) => t.id !== id);
                set({ tabs: rest });
                if (activeId !== id) return rest.find((t) => t.id === activeId) ?? null;
                return rest[idx] ?? rest[idx - 1] ?? null;
            },

            setBuffer: (path, buffer) =>
                set((s) => ({
                    tabs: s.tabs.map((t) =>
                        isFileTab(t, path)
                            ? { ...t, buffer, changedOnDisk: buffer === undefined ? false : t.changedOnDisk }
                            : t,
                    ),
                })),

            markChanged: (path, changed) =>
                set((s) => ({ tabs: s.tabs.map((t) => (isFileTab(t, path) ? { ...t, changedOnDisk: changed } : t)) })),

            toggleDir: (path) =>
                set((s) => ({
                    expanded: s.expanded.includes(path) ? s.expanded.filter((p) => p !== path) : [...s.expanded, path],
                })),

            setCommitMessage: (commitMessage) => set({ commitMessage }),
            toggleBranchSection: (section) =>
                set((s) => ({ branchSections: { ...s.branchSections, [section]: !s.branchSections[section] } })),

            selectPanel: (panel, desktop) =>
                set((s) => {
                    const open = desktop ? s.sidebarOpen : s.drawerOpen;
                    const key = desktop ? "sidebarOpen" : "drawerOpen";
                    return s.sidebarPanel === panel && open ? { [key]: false } : { sidebarPanel: panel, [key]: true };
                }),

            closeDrawer: () => set({ drawerOpen: false }),
        }),
        {
            name: "git-csm:workspace",
            version: 2,
            // v1 stored tabs as `{ path }` only.
            migrate: (persisted, version) => {
                const state = persisted as { tabs?: { path: string }[] };
                if (version < 2 && Array.isArray(state.tabs)) {
                    state.tabs = state.tabs.map((t) => ({ id: t.path, kind: "file", path: t.path })) as never;
                }
                return state as never;
            },
            // Unsaved buffers and the transient drawer state are deliberately not restored.
            partialize: (s) => ({
                projectId: s.projectId,
                tabs: s.tabs.map(({ id, kind, path, staged }) => ({ id, kind, path, staged })),
                expanded: s.expanded,
                sidebarPanel: s.sidebarPanel,
                sidebarOpen: s.sidebarOpen,
                commitMessage: s.commitMessage,
                branchSections: s.branchSections,
            }),
        },
    ),
);
