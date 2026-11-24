import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import type { FileContent } from "./api";
import { checkFile } from "./live";
import { fileKey } from "./queries";
import { useWorkspace } from "#/stores/workspace";

const P = "proj";
const path = "a.txt";
let qc: QueryClient;

/** Pretend the server currently has this file content (or a failure status). */
function serverHas(text: string, etag: string): void;
function serverHas(status: number): void;
function serverHas(a: string | number, etag?: string) {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
            typeof a === "number"
                ? new Response(JSON.stringify({ error: "nope" }), { status: a })
                : new Response(a, { headers: { ETag: etag! } }),
        ),
    );
}

const cache = () => qc.getQueryData<FileContent>(fileKey(P, path));
const tab = () => useWorkspace.getState().tabs.find((t) => t.path === path);

beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData<FileContent>(fileKey(P, path), { text: "v1", etag: '"e1"' });
    useWorkspace.setState({ tabs: [{ path }] });
});
afterEach(() => vi.unstubAllGlobals());

test("unchanged ETag (our own save) does nothing", async () => {
    serverHas("v1", '"e1"');
    await checkFile(qc, P, path);
    expect(cache()).toEqual({ text: "v1", etag: '"e1"' });
    expect(tab()?.changedOnDisk).toBeFalsy();
});

test("clean tab silently picks up an outside edit", async () => {
    serverHas("v2", '"e2"');
    await checkFile(qc, P, path);
    expect(cache()).toEqual({ text: "v2", etag: '"e2"' });
});

test("dirty tab is flagged and its cached ETag is NOT replaced", async () => {
    useWorkspace.getState().setBuffer(path, "my edits");
    serverHas("v2", '"e2"');
    await checkFile(qc, P, path);
    expect(tab()?.changedOnDisk).toBe(true);
    expect(tab()?.buffer).toBe("my edits");
    expect(cache()?.etag).toBe('"e1"'); // a save must still hit 412, not overwrite the outside edit
});

test("dirty tab whose file was deleted stays editable and is flagged", async () => {
    useWorkspace.getState().setBuffer(path, "my edits");
    serverHas(404);
    await checkFile(qc, P, path);
    expect(tab()?.changedOnDisk).toBe(true);
    expect(tab()?.buffer).toBe("my edits");
});

test("clean tab whose file was deleted is invalidated so the error shows", async () => {
    serverHas(404);
    await checkFile(qc, P, path);
    expect(qc.getQueryState(fileKey(P, path))?.isInvalidated).toBe(true);
});

test("a file that was never loaded is skipped without a request", async () => {
    qc.clear();
    serverHas("v2", '"e2"');
    await checkFile(qc, P, path);
    expect(fetch).not.toHaveBeenCalled();
});

test("cleaning a tab clears its changed-on-disk flag", () => {
    useWorkspace.getState().setBuffer(path, "x");
    useWorkspace.getState().markChanged(path, true);
    useWorkspace.getState().setBuffer(path, undefined);
    expect(tab()?.changedOnDisk).toBe(false);
});
