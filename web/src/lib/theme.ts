import { useEffect } from "react";
import { useSettings, type Theme } from "#/stores/settings";

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

/** Puts the `dark` class on <html> for the chosen theme; "auto" follows the system. */
export function applyTheme(theme: Theme) {
    const dark = theme === "dark" || (theme === "auto" && prefersDark());
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/** Applies the saved theme and, for "auto", follows the system as it changes. */
export function useTheme() {
    const theme = useSettings((s) => s.theme);
    useEffect(() => {
        applyTheme(theme);
        if (theme !== "auto") return;
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => applyTheme("auto");
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, [theme]);
}
