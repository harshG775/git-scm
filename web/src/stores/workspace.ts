import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SidebarPanel = "explorer" | "search" | "git";

export interface Tab {
    path: string;
    /** Unsaved editor buffer; undefined means the file is clean. */
    buffer?: string;
}

interface WorkspaceState {
    tabs: Tab[];
    activePath: string | null;
    sidebarPanel: SidebarPanel;
    sidebarOpen: boolean;

    openFile: (path: string) => void;
    closeFile: (path: string) => void;
    setActive: (path: string) => void;
    setBuffer: (path: string, buffer: string | undefined) => void;
    setSidebarPanel: (panel: SidebarPanel) => void;
    toggleSidebar: () => void;
}

export const useWorkspace = create<WorkspaceState>()(
    persist(
        (set) => ({
            tabs: [],
            activePath: null,
            sidebarPanel: "explorer",
            sidebarOpen: true,

            openFile: (path) =>
                set((s) => ({
                    tabs: s.tabs.some((t) => t.path === path) ? s.tabs : [...s.tabs, { path }],
                    activePath: path,
                })),

            closeFile: (path) =>
                set((s) => {
                    const idx = s.tabs.findIndex((t) => t.path === path);
                    if (idx === -1) return s;
                    const tabs = s.tabs.filter((t) => t.path !== path);
                    const activePath =
                        s.activePath === path ? ((tabs[idx] ?? tabs[idx - 1])?.path ?? null) : s.activePath;
                    return { tabs, activePath };
                }),

            setActive: (path) => set({ activePath: path }),

            setBuffer: (path, buffer) =>
                set((s) => ({
                    tabs: s.tabs.map((t) => (t.path === path ? { ...t, buffer } : t)),
                })),

            setSidebarPanel: (panel) =>
                set((s) =>
                    s.sidebarPanel === panel && s.sidebarOpen
                        ? { sidebarOpen: false }
                        : { sidebarPanel: panel, sidebarOpen: true },
                ),

            toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
        }),
        {
            name: "git-csm:workspace",
            // Persist layout and open tabs (paths only); unsaved buffers are not restored.
            partialize: (s) => ({
                tabs: s.tabs.map((t) => ({ path: t.path })),
                activePath: s.activePath,
                sidebarPanel: s.sidebarPanel,
                sidebarOpen: s.sidebarOpen,
            }),
        },
    ),
);
