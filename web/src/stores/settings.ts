import { create } from "zustand";
import { persist } from "zustand/middleware";
import { migrateStorageKey } from "./storage-migration";

export type Theme = "auto" | "light" | "dark";

interface SettingsState {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

/** App-only preferences. Git's own settings live in git config, not here. */
migrateStorageKey("git-scm.settings", "git-csm.settings");
export const useSettings = create<SettingsState>()(
    persist(
        (set) => ({
            theme: "auto",
            setTheme: (theme) => set({ theme }),
        }),
        { name: "git-scm.settings", version: 1 },
    ),
);
