import { useEffect, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { api, type FileContent } from "#/lib/api";
import { fileKey } from "#/lib/queries";
import { useWorkspace } from "#/stores/workspace";

/** Identifies this page load to the server; the event stream and the watch list are matched by it. */
export const clientId =
    globalThis.crypto?.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

/**
 * Called when the server says an open file may have changed. Events also fire for our own saves,
 * so the file is re-read and compared with the ETag we already hold.
 *
 * A dirty tab is never touched: its cached ETag is what the next save is checked against, so
 * replacing it would let a save silently overwrite the outside edit. Instead the tab is flagged
 * and the user chooses (see FileView).
 */
export async function checkFile(queryClient: QueryClient, projectId: string, path: string): Promise<void> {
    const key = fileKey(projectId, path);
    const cached = queryClient.getQueryData<FileContent>(key);
    if (!cached) return; // never loaded in this session: it will be fetched fresh when opened

    const { markChanged, tabs } = useWorkspace.getState();
    const dirty = tabs.find((t) => t.kind === "file" && t.path === path)?.buffer !== undefined;

    let fresh: FileContent;
    try {
        fresh = await api.getFile(projectId, path);
    } catch {
        // Deleted, became binary, too large, ... Show the error for a clean tab; keep a dirty one editable.
        if (dirty) markChanged(path, true);
        else await queryClient.invalidateQueries({ queryKey: key });
        return;
    }

    if (fresh.etag === cached.etag) return; // our own save, or a touch with no content change
    if (dirty) markChanged(path, true);
    else queryClient.setQueryData(key, fresh);
}

/** After (re)connecting we may have missed events, so re-check everything that is on screen. */
export async function resync(queryClient: QueryClient, projectId: string): Promise<void> {
    const files = useWorkspace.getState().tabs.filter((t) => t.kind === "file");
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tree", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["git", projectId] }),
        ...files.map((t) => checkFile(queryClient, projectId, t.path)),
    ]);
}

/**
 * Keeps the UI in step with edits made outside the app. Opens one SSE stream per project, tells
 * the server which dirs/files are on screen, and turns events into query updates. The stream is
 * closed while the page is hidden so the server stops polling. Returns whether it is live.
 */
export function useLiveUpdates(projectId: string): boolean {
    const queryClient = useQueryClient();
    const dirs = useWorkspace(useShallow((s) => ["", ...s.expanded]));
    const files = useWorkspace(useShallow((s) => s.tabs.filter((t) => t.kind === "file").map((t) => t.path)));
    const [ready, setReady] = useState(false);
    const [visible, setVisible] = useState(() => !document.hidden);

    useEffect(() => {
        const onChange = () => setVisible(!document.hidden);
        document.addEventListener("visibilitychange", onChange);
        return () => document.removeEventListener("visibilitychange", onChange);
    }, []);

    useEffect(() => {
        if (!visible) return;
        const es = new EventSource(`/api/p/${encodeURIComponent(projectId)}/events?client=${clientId}`);
        const data = (e: Event) => JSON.parse((e as MessageEvent<string>).data) as { path: string };

        es.addEventListener("ready", () => {
            setReady(true);
            void resync(queryClient, projectId);
        });
        es.addEventListener("file", (e) => void checkFile(queryClient, projectId, data(e).path));
        es.addEventListener("dir", (e) => {
            void queryClient.invalidateQueries({ queryKey: ["tree", projectId, data(e).path] });
        });
        es.addEventListener("git", () => {
            void queryClient.invalidateQueries({ queryKey: ["git", projectId] });
        });
        // EventSource reconnects by itself; the server sends "ready" again when it does.
        es.onerror = () => setReady(false);

        return () => {
            es.close();
            setReady(false);
        };
    }, [projectId, visible, queryClient]);

    const watchKey = JSON.stringify([dirs, files]);
    useEffect(() => {
        if (!ready) return;
        const [d, f] = JSON.parse(watchKey) as [string[], string[]];
        // Debounced: expanding several folders quickly should be one request.
        const timer = setTimeout(() => void api.setWatch(projectId, clientId, d, f).catch(() => {}), 250);
        return () => clearTimeout(timer);
    }, [ready, watchKey, projectId]);

    return ready;
}
