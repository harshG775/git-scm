import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "auto" | "light" | "dark";

interface SettingsState {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

/** App-only preferences. Git's own settings live in git config, not here. */
export const useSettings = create<SettingsState>()(
    persist(
        (set) => ({
            theme: "auto",
            setTheme: (theme) => set({ theme }),
        }),
        { name: "git-csm.settings", version: 1 },
    ),
);
