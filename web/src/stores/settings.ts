import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PullMode } from "#/lib/api";
import { migrateStorageKey } from "./storage-migration";

export type Theme = "auto" | "light" | "dark";

interface SettingsState {
    theme: Theme;
    pullModeByProject: Record<string, PullMode>;
    setTheme: (theme: Theme) => void;
    setPullMode: (projectId: string, mode: PullMode) => void;
}

/** App-only preferences. Git's own settings live in git config, not here. */
migrateStorageKey("git-scm.settings", "git-csm.settings");
export const useSettings = create<SettingsState>()(
    persist(
        (set) => ({
            theme: "auto",
            pullModeByProject: {},
            setTheme: (theme) => set({ theme }),
            setPullMode: (projectId, mode) =>
                set((state) => ({ pullModeByProject: { ...state.pullModeByProject, [projectId]: mode } })),
        }),
        { name: "git-scm.settings", version: 1 },
    ),
);
