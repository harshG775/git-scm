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

export interface GitBranch {
    name: string;
    current: boolean;
    upstream: string;
    /** Short commit id the branch points at. */
    oid: string;
    /** First line of that commit's message. */
    subject: string;
}

export interface GitBranches {
    isRepo: boolean;
    /** Checked-out branch; "" when HEAD is detached. */
    head: string;
    detached: boolean;
    /** Current branch first, then most recently committed. Empty before the first commit. */
    branches: GitBranch[];
}

export interface GitRemoteBranch {
    /** "origin/feature/x" */
    ref: string;
    remote: string;
    /** "feature/x" */
    name: string;
    oid: string;
    subject: string;
    /** A local branch with this name exists, so checking out just switches to it. */
    hasLocal: boolean;
}

export interface GitRemotes {
    isRepo: boolean;
    remotes: string[];
    /** As of the last fetch, most recently committed first. */
    branches: GitRemoteBranch[];
}

export interface GitStash {
    /** Position in the stash list; it shifts as stashes come and go, so actions also send `oid`. */
    index: number;
    oid: string;
    branch: string;
    title: string;
    /** No message was given; `title` is then the summary of the commit it was made on. */
    auto: boolean;
    /** Unix seconds. */
    time: number;
}

export interface GitStashes {
    isRepo: boolean;
    stashes: GitStash[];
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

    gitBranches: async (id: string): Promise<GitBranches> => (await request(`${project(id)}/git/branches`)).json(),
    /** Creates the branch at HEAD and switches to it. */
    gitCreateBranch: (id: string, name: string) => gitPost(id, "branches", { name }),
    gitCheckout: (id: string, name: string) => gitPost(id, "checkout", { name }),

    gitRemotes: async (id: string): Promise<GitRemotes> => (await request(`${project(id)}/git/remotes`)).json(),
    gitFetch: async (id: string): Promise<{ output: string }> => (await gitPost(id, "fetch")).json(),
    /** Creates a local branch tracking `ref` ("origin/feature") and switches to it. */
    gitCheckoutRemote: (id: string, ref: string) => gitPost(id, "checkout-remote", { name: ref }),

    gitStashes: async (id: string): Promise<GitStashes> => (await request(`${project(id)}/git/stashes`)).json(),
    gitStash: (id: string, message: string, includeUntracked: boolean) =>
        gitPost(id, "stash", { message, includeUntracked }),
    gitStashApply: (id: string, index: number, oid: string) => gitPost(id, "stash/apply", { index, oid }),
    gitStashPop: (id: string, index: number, oid: string) => gitPost(id, "stash/pop", { index, oid }),
    gitStashDrop: (id: string, index: number, oid: string) => gitPost(id, "stash/drop", { index, oid }),

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
