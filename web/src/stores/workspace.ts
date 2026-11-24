import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SidebarPanel = "explorer" | "search" | "git";

export interface Tab {
    path: string;
    /** Unsaved editor text; undefined means the tab is clean. */
    buffer?: string;
    /** The file changed on disk while `buffer` holds unsaved edits: the user must pick a side. */
    changedOnDisk?: boolean;
}

// The active file lives in the URL (`?file=`), not here.
interface WorkspaceState {
    projectId: string | null;
    tabs: Tab[];
    /** Expanded Explorer directories (also reported to the server's watch API in M2). */
    expanded: string[];
    sidebarPanel: SidebarPanel;
    /** Desktop sidebar column visibility (persisted). */
    sidebarOpen: boolean;
    /** Phone drawer visibility (transient). */
    drawerOpen: boolean;

    /** Switch project; tabs and expanded dirs belong to one project, so they reset on change. */
    enterProject: (id: string) => void;
    openFile: (path: string) => void;
    /** Closes a tab and returns the path that should become active (null if none are left). */
    closeFile: (path: string, active: string | null) => string | null;
    /** Setting `undefined` makes the tab clean, which also clears any changed-on-disk flag. */
    setBuffer: (path: string, buffer: string | undefined) => void;
    markChanged: (path: string, changed: boolean) => void;
    toggleDir: (path: string) => void;
    /** Activity-bar / bottom-nav tap. Tapping the open panel collapses it, as in VS Code. */
    selectPanel: (panel: SidebarPanel, desktop: boolean) => void;
    closeDrawer: () => void;
}

export const useWorkspace = create<WorkspaceState>()(
    persist(
        (set, get) => ({
            projectId: null,
            tabs: [],
            expanded: [],
            sidebarPanel: "explorer",
            sidebarOpen: true,
            drawerOpen: false,

            enterProject: (id) => {
                if (get().projectId !== id) set({ projectId: id, tabs: [], expanded: [], drawerOpen: false });
            },

            openFile: (path) => set((s) => (s.tabs.some((t) => t.path === path) ? s : { tabs: [...s.tabs, { path }] })),

            closeFile: (path, active) => {
                const { tabs } = get();
                const idx = tabs.findIndex((t) => t.path === path);
                if (idx === -1) return active;
                const rest = tabs.filter((t) => t.path !== path);
                set({ tabs: rest });
                if (active !== path) return active;
                return (rest[idx] ?? rest[idx - 1])?.path ?? null;
            },

            setBuffer: (path, buffer) =>
                set((s) => ({
                    tabs: s.tabs.map((t) =>
                        t.path === path
                            ? { ...t, buffer, changedOnDisk: buffer === undefined ? false : t.changedOnDisk }
                            : t,
                    ),
                })),

            markChanged: (path, changed) =>
                set((s) => ({ tabs: s.tabs.map((t) => (t.path === path ? { ...t, changedOnDisk: changed } : t)) })),

            toggleDir: (path) =>
                set((s) => ({
                    expanded: s.expanded.includes(path) ? s.expanded.filter((p) => p !== path) : [...s.expanded, path],
                })),

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
            // Unsaved buffers and the transient drawer state are deliberately not restored.
            partialize: (s) => ({
                projectId: s.projectId,
                tabs: s.tabs.map((t) => ({ path: t.path })),
                expanded: s.expanded,
                sidebarPanel: s.sidebarPanel,
                sidebarOpen: s.sidebarOpen,
            }),
        },
    ),
);
