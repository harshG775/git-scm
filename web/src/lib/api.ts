// Typed client for the Go server. Shapes mirror the API table in ../PLAN.md.

export interface Project {
    id: string;
    name: string;
    path: string;
    lastOpened: string;
}

export interface Entry {
    name: string;
    /** Slash-separated, relative to the project root. */
    path: string;
    type: "dir" | "file";
    size: number;
}

export interface FileContent {
    text: string;
    etag: string;
}

export interface GitChange {
    path: string;
    /** Renames and copies: the path it came from. */
    origPath?: string;
    /** M modified, A added, D deleted, R renamed, C copied, T type change, U untracked, ! conflict */
    status: string;
}

export interface GitStatus {
    isRepo: boolean;
    branch: string;
    detached: boolean;
    oid: string;
    upstream: string;
    ahead: number;
    behind: number;
    conflicts: GitChange[];
    staged: GitChange[];
    changes: GitChange[];
}

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        /** Current ETag, sent by the server with a 412 (file changed on disk). */
        public etag?: string,
    ) {
        super(message);
    }
}

async function request(url: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(url, init);
    if (!res.ok) {
        let message = res.statusText;
        try {
            message = (await res.json()).error ?? message;
        } catch {
            // not JSON; keep statusText
        }
        throw new ApiError(res.status, message, res.headers.get("ETag") ?? undefined);
    }
    return res;
}

const project = (id: string) => `/api/p/${encodeURIComponent(id)}`;
const q = (path: string) => `?path=${encodeURIComponent(path)}`;

const gitPost = (id: string, action: string, body?: unknown) =>
    request(`${project(id)}/git/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

export const api = {
    listProjects: async (): Promise<Project[]> => (await request("/api/projects")).json(),

    openProject: async (path: string): Promise<Project> =>
        (
            await request("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path }),
            })
        ).json(),

    removeProject: async (id: string): Promise<void> => {
        await request(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
    },

    getTree: async (id: string, path: string): Promise<Entry[]> =>
        (await (await request(`${project(id)}/tree${q(path)}`)).json()).entries,

    getFile: async (id: string, path: string): Promise<FileContent> => {
        const res = await request(`${project(id)}/file${q(path)}`);
        return { text: await res.text(), etag: res.headers.get("ETag") ?? "" };
    },

    gitStatus: async (id: string): Promise<GitStatus> => (await request(`${project(id)}/git/status`)).json(),

    gitDiff: async (id: string, path: string, staged: boolean): Promise<string> =>
        (await request(`${project(id)}/git/diff${q(path)}${staged ? "&staged=1" : ""}`)).text(),

    gitStage: (id: string, paths: string[]) => gitPost(id, "stage", { paths }),
    gitUnstage: (id: string, paths: string[]) => gitPost(id, "unstage", { paths }),
    gitDiscard: (id: string, paths: string[]) => gitPost(id, "discard", { paths }),
    gitCommit: async (id: string, message: string): Promise<{ oid: string }> =>
        (await gitPost(id, "commit", { message })).json(),
    gitPull: async (id: string): Promise<{ output: string }> => (await gitPost(id, "pull")).json(),
    gitPush: async (id: string): Promise<{ output: string }> => (await gitPost(id, "push")).json(),

    /** Tells the server which dirs and files this client's event stream should report on. */
    setWatch: async (id: string, client: string, dirs: string[], files: string[]): Promise<void> => {
        await request(`${project(id)}/watch?client=${encodeURIComponent(client)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dirs, files }),
        });
    },

    /** Returns the new ETag. Throws ApiError(412) if the file changed since `etag`. */
    putFile: async (id: string, path: string, text: string, etag: string): Promise<string> => {
        const res = await request(`${project(id)}/file${q(path)}`, {
            method: "PUT",
            headers: { "If-Match": etag },
            body: text,
        });
        return res.headers.get("ETag") ?? "";
    },
};
