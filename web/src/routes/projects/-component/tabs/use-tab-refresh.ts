import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resync } from "#/lib/live";
import { notifyDone, notifyLoading } from "#/lib/notify";

/**
 * Re-checks the tree, git state and open files with VS Code-style feedback: the tab header's
 * progress line runs, a loading toast turns into a short success toast, and failures keep git's
 * message in an error toast.
 */
export function useTabRefresh(projectId: string, loadingTitle = "Refreshing…") {
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);

    const refresh = () => {
        if (refreshing) return;
        setRefreshing(true);
        const toastId = notifyLoading(loadingTitle);
        void resync(queryClient, projectId)
            .then(() =>
                notifyDone(toastId, {
                    type: "success",
                    title: "Up to date",
                    timeout: 2000,
                    record: false,
                }),
            )
            .catch((error: unknown) =>
                notifyDone(toastId, {
                    type: "error",
                    title: "Refresh failed",
                    description: error instanceof Error ? error.message : String(error),
                    timeout: 8000,
                    record: false,
                }),
            )
            .finally(() => setRefreshing(false));
    };

    return { refresh, refreshing };
}
