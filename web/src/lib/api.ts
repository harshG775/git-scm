// Typed client for the Go server. Shapes mirror the API table in ../PLAN.md.

export interface Project {
    id: string;
    name: string;
    path: string;
    lastOpened: string;
}

export interface DirectoryChoice {
    name: string;
    path: string;
}

export interface DirectoryListing {
    path: string;
    parent?: string;
    directories: DirectoryChoice[];
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

export interface GitLines {
    added: number;
    removed: number;
}

/** Changed-line counts per path for the staged and unstaged halves of the status. Untracked and binary files have none. */
export interface GitNumstat {
    staged: Record<string, GitLines>;
    changes: Record<string, GitLines>;
}

/** The keys of git config the app can read and write. Keys that are not set are absent. */
export type GitConfigKey =
    | "user.name"
    | "user.email"
    | "init.defaultBranch"
    | "pull.rebase"
    | "push.autoSetupRemote"
    | "core.autocrlf";

export interface GitConfig {
    /** The file global changes are written to, e.g. /home/me/.gitconfig. */
    path: string;
    values: Partial<Record<GitConfigKey, string>>;
}

export interface GitBranch {
    name: string;
    current: boolean;
    upstream: string;
    /** Short commit id the branch points at. */
    oid: string;
    /** First line of that commit's message. */
    subject: string;
    /** Commits ahead of / behind the upstream (0 without one). */
    ahead: number;
    behind: number;
    /** Already part of the checked-out branch, so deleting it loses nothing. */
    merged: boolean;
}

export interface GitTag {
    name: string;
    /** Short id of the tagged commit. */
    oid: string;
    /** Unix seconds. */
    time: number;
    subject: string;
}

export interface GitTags {
    isRepo: boolean;
    /** Newest first. */
    tags: GitTag[];
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
    /** The commit the stash was made on. */
    base: string;
}

export interface GitStashes {
    isRepo: boolean;
    stashes: GitStash[];
}

export interface GitRef {
    name: string;
    kind: "branch" | "remote" | "tag";
    current?: boolean;
}

export interface GitCommit {
    oid: string;
    /** Parent ids, first parent first (for a merge, the branch that was merged into). */
    parents: string[];
    author: string;
    email: string;
    /** Unix seconds. */
    time: number;
    subject: string;
    body: string;
    refs: GitRef[];
}

export interface GitLog {
    isRepo: boolean;
    /** The commit HEAD points at; "" before the first commit. */
    head: string;
    headBranch: string;
    detached: boolean;
    /** Files with uncommitted changes. */
    uncommitted: number;
    /** Newest first, and every commit comes before its parents. */
    commits: GitCommit[];
    hasMore: boolean;
    /** Each stash carries the commit it was made on (`base`). */
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

    listDirectories: async (path = ""): Promise<DirectoryListing> =>
        (await request(`/api/directories${path ? `?path=${encodeURIComponent(path)}` : ""}`)).json(),

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

    gitGlobalConfig: async (): Promise<GitConfig> => (await request("/api/git/config")).json(),
    /** An empty value removes the key. Only an allowlist of keys is accepted; others are refused with a 422. */
    setGitGlobalConfig: async (key: GitConfigKey, value: string): Promise<void> => {
        await request("/api/git/config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, value }),
        });
    },

    /** The allowed keys set in this repository's config, i.e. its overrides of the global values. */
    gitRepoConfig: async (id: string): Promise<GitConfig> => (await request(`${project(id)}/git/config`)).json(),
    /** An empty value removes the local key, so the global value applies again. */
    setGitRepoConfig: async (id: string, key: GitConfigKey, value: string): Promise<void> => {
        await request(`${project(id)}/git/config`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, value }),
        });
    },

    gitStatus: async (id: string): Promise<GitStatus> => (await request(`${project(id)}/git/status`)).json(),

    gitDiff: async (id: string, path: string, staged: boolean): Promise<string> =>
        (await request(`${project(id)}/git/diff${q(path)}${staged ? "&staged=1" : ""}`)).text(),

    gitBranches: async (id: string): Promise<GitBranches> => (await request(`${project(id)}/git/branches`)).json(),
    /** Creates the branch and switches to it. It starts at `from` (a branch, "origin/x", a tag or a commit), or at HEAD. */
    gitCreateBranch: (id: string, name: string, from?: string) => gitPost(id, "branches", { name, from }),
    gitRenameBranch: (id: string, name: string, to: string) => gitPost(id, "branches/rename", { name, to }),
    /** Without `force` git refuses a branch that is not merged. */
    gitDeleteBranch: (id: string, name: string, force = false) => gitPost(id, "branches/delete", { name, force }),
    /** Merges into the checked-out branch. A merge that conflicts is undone and reported as an error. */
    gitMerge: async (id: string, name: string): Promise<{ output: string }> =>
        (await gitPost(id, "merge", { name })).json(),

    gitTags: async (id: string): Promise<GitTags> => (await request(`${project(id)}/git/tags`)).json(),
    gitDeleteTag: (id: string, name: string) => gitPost(id, "tags/delete", { name }),
    gitPushTag: async (id: string, name: string): Promise<{ output: string }> =>
        (await gitPost(id, "tags/push", { name })).json(),
    gitCheckout: (id: string, name: string) => gitPost(id, "checkout", { name }),

    gitRemotes: async (id: string): Promise<GitRemotes> => (await request(`${project(id)}/git/remotes`)).json(),
    gitFetch: async (id: string): Promise<{ output: string }> => (await gitPost(id, "fetch")).json(),
    /** "origin/feature" deletes `feature` on origin. */
    gitDeleteRemoteBranch: async (id: string, ref: string): Promise<{ output: string }> =>
        (await gitPost(id, "remote-branches/delete", { name: ref })).json(),
    /** Creates a local branch tracking `ref` ("origin/feature") and switches to it. */
    gitCheckoutRemote: (id: string, ref: string) => gitPost(id, "checkout-remote", { name: ref }),

    gitLog: async (id: string, scope: "local" | "all", limit: number): Promise<GitLog> =>
        (await request(`${project(id)}/git/log?scope=${scope}&limit=${limit}`)).json(),

    gitStashes: async (id: string): Promise<GitStashes> => (await request(`${project(id)}/git/stashes`)).json(),
    gitStash: (id: string, message: string, includeUntracked: boolean) =>
        gitPost(id, "stash", { message, includeUntracked }),
    gitStashApply: (id: string, index: number, oid: string) => gitPost(id, "stash/apply", { index, oid }),
    gitStashPop: (id: string, index: number, oid: string) => gitPost(id, "stash/pop", { index, oid }),
    gitStashDrop: (id: string, index: number, oid: string) => gitPost(id, "stash/drop", { index, oid }),

    gitStage: (id: string, paths: string[]) => gitPost(id, "stage", { paths }),
    gitUnstage: (id: string, paths: string[]) => gitPost(id, "unstage", { paths }),
    gitDiscard: (id: string, paths: string[]) => gitPost(id, "discard", { paths }),
    gitNumstat: async (id: string): Promise<GitNumstat> => (await request(`${project(id)}/git/numstat`)).json(),
    /** With `amend`, rewrites the last commit; an empty message then keeps the old one. */
    gitCommit: async (id: string, message: string, amend = false): Promise<{ oid: string }> =>
        (await gitPost(id, "commit", { message, amend })).json(),
    /** Moves the branch back one commit, keeping its changes staged. Returns the old message. */
    gitUndoCommit: async (id: string): Promise<{ message: string }> => (await gitPost(id, "undo-commit")).json(),
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
