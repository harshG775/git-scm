import { useNavigate } from "@tanstack/react-router";
import { GRAPH_ID, diffId, useWorkspace, type Tab } from "#/stores/workspace";

/** The route's search params. `file`, `diff` and `view` are mutually exclusive. */
export interface TabSearch {
    file?: string;
    diff?: string;
    staged?: boolean;
    /** A tab that is not a file: the commit graph. */
    view?: "graph";
}

/** Id of the tab the URL points at, matching `Tab.id`. */
export const activeIdOf = (s: TabSearch): string | null =>
    s.file ?? (s.diff ? diffId(s.diff, s.staged === true) : s.view === "graph" ? GRAPH_ID : null);

const searchFor = (tab: Pick<Tab, "kind" | "path" | "staged">): TabSearch =>
    tab.kind === "file"
        ? { file: tab.path }
        : tab.kind === "graph"
          ? { view: "graph" }
          : { diff: tab.path, staged: tab.staged || undefined };

/** Opens, activates and closes tabs; the active tab is encoded in the URL search params. */
export function useFileNav(projectId: string, activeId: string | null) {
    const navigate = useNavigate();

    const go = (tab: Pick<Tab, "kind" | "path" | "staged"> | null) =>
        navigate({ to: "/p/$projectId", params: { projectId }, search: tab ? searchFor(tab) : {} });

    const show = (tab: Pick<Tab, "kind" | "path" | "staged">) => {
        useWorkspace.getState().closeDrawer();
        return go(tab);
    };

    return {
        open: (path: string) => {
            useWorkspace.getState().openFile(path);
            return show({ kind: "file", path });
        },
        openDiff: (path: string, staged: boolean) => {
            useWorkspace.getState().openDiff(path, staged);
            return show({ kind: "diff", path, staged });
        },
        openGraph: () => {
            useWorkspace.getState().openGraph();
            return show({ kind: "graph", path: "graph" });
        },
        activate: (tab: Tab) => go(tab),
        close: (id: string) => {
            const { tabs, closeTab } = useWorkspace.getState();
            const tab = tabs.find((t) => t.id === id);
            if (tab?.buffer !== undefined && !window.confirm(`Discard unsaved changes to ${tab.path}?`)) return;
            const next = closeTab(id, activeId);
            if ((next?.id ?? null) !== activeId) return go(next);
        },
    };
}
