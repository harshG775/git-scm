import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resync } from "#/lib/live";

export type Notice = { kind: "ok" | "error"; text: string };

/**
 * Runs one git action at a time. A job may return a message to show on success; on failure git's
 * own message is shown. Afterwards status, tree and open files are re-checked right away instead
 * of waiting for the next poll, since most actions change files on disk.
 */
export function useGitAction(projectId: string) {
    const queryClient = useQueryClient();
    const [notice, setNotice] = useState<Notice | null>(null);
    const mutation = useMutation({
        mutationFn: (job: () => Promise<string | void>) => job(),
        onSuccess: (text) => setNotice(text ? { kind: "ok", text } : null),
        onError: (e: Error) => setNotice({ kind: "error", text: e.message }),
        onSettled: () => resync(queryClient, projectId),
    });
    return { run: mutation.mutate, busy: mutation.isPending, notice, setNotice };
}

export type GitAction = ReturnType<typeof useGitAction>;
