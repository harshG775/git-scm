import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Button } from "#/components/ui/button";
import { ApiError, api, type FileContent } from "#/lib/api";
import { fileKey, fileOptions } from "#/lib/queries";
import { useWorkspace } from "#/stores/workspace";

export function FileView({ projectId, path }: { projectId: string; path: string }) {
    const queryClient = useQueryClient();
    const { data, error } = useQuery(fileOptions(projectId, path));
    const tab = useWorkspace((s) => s.tabs.find((t) => t.path === path));
    const setBuffer = useWorkspace((s) => s.setBuffer);
    const markChanged = useWorkspace((s) => s.markChanged);
    const buffer = tab?.buffer;
    const dirty = buffer !== undefined;

    const save = useMutation({
        mutationFn: ({ text, etag }: { text: string; etag: string }) => api.putFile(projectId, path, text, etag),
        onSuccess: (etag, { text }) => {
            queryClient.setQueryData<FileContent>(fileKey(projectId, path), { text, etag });
            setBuffer(path, undefined);
        },
        // 412: the file changed on disk since we loaded it. Same prompt as a live change event.
        onError: (err) => {
            if (err instanceof ApiError && err.status === 412) markChanged(path, true);
        },
    });

    if (!data) return <Message>{error ? describe(error) : "Loading…"}</Message>;
    // A clean tab shows the failure (e.g. deleted); a dirty one keeps the editor so nothing is lost.
    if (error && !dirty) return <Message>{describe(error)}</Message>;

    const text = buffer ?? data.text;
    const doSave = () => save.mutate({ text, etag: data.etag });

    const reload = async () => {
        setBuffer(path, undefined); // discards my edits and clears the flag
        await queryClient.invalidateQueries({ queryKey: fileKey(projectId, path) });
    };

    // Adopt the file's current ETag so the next save is checked against what is on disk now.
    const keepMine = async () => {
        try {
            queryClient.setQueryData(fileKey(projectId, path), await api.getFile(projectId, path));
        } catch {
            // Deleted: saving will recreate it, which is what "keep mine" means.
        }
        markChanged(path, false);
    };

    return (
        <div className="flex h-full flex-col">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3 md:h-9">
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{path}</span>
                {save.isError && !tab?.changedOnDisk && (
                    <span className="text-xs text-destructive">{save.error.message}</span>
                )}
                <Button size="sm" disabled={!dirty || save.isPending} onClick={doSave}>
                    <Save /> {save.isPending ? "Saving…" : "Save"}
                </Button>
            </div>

            {tab?.changedOnDisk && (
                <div
                    role="alert"
                    className="flex flex-wrap items-center gap-2 border-b bg-destructive/10 px-3 py-2 text-sm"
                >
                    <span className="flex-1">This file changed on disk while you were editing.</span>
                    <Button size="sm" variant="outline" onClick={reload}>
                        Reload (discard mine)
                    </Button>
                    <Button size="sm" variant="destructive" onClick={keepMine}>
                        Keep mine
                    </Button>
                </div>
            )}

            <textarea
                key={path}
                value={text}
                onChange={(e) => setBuffer(path, e.target.value === data.text ? undefined : e.target.value)}
                onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                        e.preventDefault();
                        if (dirty && !save.isPending) doSave();
                    }
                }}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                wrap="off"
                // 16px on phones stops iOS from zooming into the field on focus.
                className="min-h-0 flex-1 resize-none bg-background p-3 font-mono text-base leading-relaxed outline-none md:text-sm"
            />
        </div>
    );
}

function describe(error: Error) {
    if (error instanceof ApiError) {
        if (error.status === 415) return "Binary file: not shown.";
        if (error.status === 413) return "File is too large to open (over 5 MiB).";
        if (error.status === 404) return "This file no longer exists.";
    }
    return error.message;
}

function Message({ children }: { children: React.ReactNode }) {
    return <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">{children}</div>;
}
