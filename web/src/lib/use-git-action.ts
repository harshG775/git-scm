import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyDone, notifyLoading, type NotifyOptions } from "#/lib/notify";
import { resync } from "#/lib/live";

/** First line becomes the toast's title, the rest (git's detail) its description. */
const toastFor = (type: "success" | "error", text: string, title?: string): NotifyOptions => {
    const [first = "", ...rest] = text.trim().split("\n");
    return {
        type,
        title: title ?? first,
        description: (title ? text : rest.join("\n")).trim() || undefined,
        // git's explanations take longer to read than "Committed"
        timeout: type === "error" ? 8000 : 4000,
    };
};

/**
 * Runs one git action at a time and reports the result as a toast: a job may return a message to
 * show on success; on failure git's own message is shown. Long jobs (a fetch over the network) can
 * start with a loading toast that turns into the result. Afterwards status, tree and open files are
 * re-checked right away instead of waiting for the next poll, since most actions change files on disk.
 */
export function useGitAction(projectId: string, { errorTitle = "Git couldn't do that" }: { errorTitle?: string } = {}) {
    const queryClient = useQueryClient();
    const loadingToast = useRef<string | null>(null);
    const mutation = useMutation({
        // a job may resolve to anything (the raw Response of a POST); only a string becomes a message
        mutationFn: async ({ job, loadingTitle }: { job: () => Promise<unknown>; loadingTitle?: string }) => {
            loadingToast.current = loadingTitle ? notifyLoading(loadingTitle) : null;
            return job();
        },
        onSuccess: (text) => {
            if (typeof text === "string" && text) {
                notifyDone(loadingToast.current, toastFor("success", text));
            } else if (loadingToast.current) {
                notifyDone(loadingToast.current, { type: "success", title: "Done" });
            }
            loadingToast.current = null;
        },
        onError: (e: Error) => {
            notifyDone(loadingToast.current, toastFor("error", e.message, errorTitle));
            loadingToast.current = null;
        },
        onSettled: () => resync(queryClient, projectId),
    });
    const run = (job: () => Promise<unknown>, options?: { loadingTitle?: string }) =>
        mutation.mutate({ job, loadingTitle: options?.loadingTitle });
    return { run, busy: mutation.isPending };
}

export type GitAction = ReturnType<typeof useGitAction>;
