import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notify } from "#/lib/notify";
import { resync } from "#/lib/live";

/** First line becomes the toast's title, the rest (git's detail) its description. */
const showToast = (type: "success" | "error", text: string, title?: string) => {
    const [first = "", ...rest] = text.trim().split("\n");
    notify({
        type,
        title: title ?? first,
        description: (title ? text : rest.join("\n")).trim() || undefined,
        // git's explanations take longer to read than "Committed"
        timeout: type === "error" ? 8000 : 4000,
    });
};

/**
 * Runs one git action at a time and reports the result as a toast: a job may return a message to
 * show on success; on failure git's own message is shown. Afterwards status, tree and open files
 * are re-checked right away instead of waiting for the next poll, since most actions change files
 * on disk.
 */
export function useGitAction(projectId: string, { errorTitle = "Git couldn't do that" } = {}) {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        // a job may resolve to anything (the raw Response of a POST); only a string becomes a message
        mutationFn: (job: () => Promise<unknown>) => job(),
        onSuccess: (text) => {
            if (typeof text === "string" && text) showToast("success", text);
        },
        onError: (e: Error) => showToast("error", e.message, errorTitle),
        onSettled: () => resync(queryClient, projectId),
    });
    return { run: mutation.mutate, busy: mutation.isPending };
}

export type GitAction = ReturnType<typeof useGitAction>;
