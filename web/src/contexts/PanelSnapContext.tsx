import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type SnapPanel = "sidebar" | "editor";

type PanelSnapContextValue = {
    activePanel: SnapPanel;
    containerRef: React.RefObject<HTMLDivElement | null>;
    onScroll: () => void;
    snapTo: (panel: SnapPanel) => void;
    togglePanel: () => void;
};

const PanelSnapContext = createContext<PanelSnapContextValue | null>(null);
const PANEL_IDS: SnapPanel[] = ["sidebar", "editor"];

function centeredScrollLeft(container: HTMLElement, panel: HTMLElement) {
    const containerRect = container.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const left =
        container.scrollLeft + panelRect.left - containerRect.left - (container.clientWidth - panelRect.width) / 2;
    return Math.max(0, Math.min(container.scrollWidth - container.clientWidth, left));
}

export function PanelSnapProvider({ children }: { children: React.ReactNode }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [activePanel, setActivePanel] = useState<SnapPanel>("sidebar");
    const activePanelRef = useRef<SnapPanel>("sidebar");
    const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const updateActivePanel = useCallback((panel: SnapPanel) => {
        activePanelRef.current = panel;
        setActivePanel(panel);
    }, []);

    const snapTo = useCallback(
        (panel: SnapPanel) => {
            const container = containerRef.current;
            const target = container?.querySelector<HTMLElement>(`[data-snap-panel="${panel}"]`);
            updateActivePanel(panel);
            if (!container || !target) return;
            container.scrollTo({ left: centeredScrollLeft(container, target), behavior: "smooth" });
        },
        [updateActivePanel],
    );

    const onScroll = useCallback(() => {
        if (scrollTimer.current) clearTimeout(scrollTimer.current);
        scrollTimer.current = setTimeout(() => {
            const container = containerRef.current;
            if (!container) return;

            const center = container.getBoundingClientRect().left + container.clientWidth / 2;
            let nearest: { id: SnapPanel; element: HTMLElement; distance: number } | undefined;
            for (const id of PANEL_IDS) {
                const element = container.querySelector<HTMLElement>(`[data-snap-panel="${id}"]`);
                if (!element) continue;

                const distance = Math.abs(element.getBoundingClientRect().left + element.offsetWidth / 2 - center);
                if (!nearest || distance < nearest.distance) nearest = { id, element, distance };
            }

            if (!nearest) return;
            updateActivePanel(nearest.id);
            const targetLeft = centeredScrollLeft(container, nearest.element);
            if (Math.abs(container.scrollLeft - targetLeft) > 1) {
                snapTo(nearest.id);
            }
        }, 120);
    }, [snapTo, updateActivePanel]);

    const togglePanel = useCallback(
        () => snapTo(activePanelRef.current === "sidebar" ? "editor" : "sidebar"),
        [snapTo],
    );

    useEffect(
        () => () => {
            if (scrollTimer.current) clearTimeout(scrollTimer.current);
        },
        [],
    );

    const value = useMemo(
        () => ({ activePanel, containerRef, onScroll, snapTo, togglePanel }),
        [activePanel, onScroll, snapTo, togglePanel],
    );

    return <PanelSnapContext.Provider value={value}>{children}</PanelSnapContext.Provider>;
}

export function usePanelSnap() {
    const context = useContext(PanelSnapContext);
    if (!context) {
        throw new Error("usePanelSnap must be used within PanelSnapProvider");
    }
    return context;
}
