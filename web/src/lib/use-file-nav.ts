import { useNavigate } from "@tanstack/react-router";
import { useWorkspace } from "#/stores/workspace";

/** Opens, activates and closes files; the active file is the `?file=` search param. */
export function useFileNav(projectId: string, active: string | null) {
    const navigate = useNavigate();

    const go = (file: string | null) =>
        navigate({ to: "/p/$projectId", params: { projectId }, search: { file: file ?? undefined } });

    return {
        open: (path: string) => {
            const { openFile, closeDrawer } = useWorkspace.getState();
            openFile(path);
            closeDrawer();
            return go(path);
        },
        close: (path: string) => {
            const tab = useWorkspace.getState().tabs.find((t) => t.path === path);
            if (tab?.buffer !== undefined && !window.confirm(`Discard unsaved changes to ${path}?`)) return;
            const next = useWorkspace.getState().closeFile(path, active);
            if (next !== active) return go(next);
        },
    };
}
