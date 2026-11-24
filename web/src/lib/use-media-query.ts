import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
    return useSyncExternalStore(
        (notify) => {
            const m = window.matchMedia(query);
            m.addEventListener("change", notify);
            return () => m.removeEventListener("change", notify);
        },
        () => window.matchMedia(query).matches,
        () => false,
    );
}

/** Tailwind's `md` breakpoint: phone layout below, VS Code layout above. */
export const useIsDesktop = () => useMediaQuery("(min-width: 768px)");
