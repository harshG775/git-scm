import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { ApiError, api } from "./api";

export const projectsOptions = queryOptions({
    queryKey: ["projects"],
    queryFn: api.listProjects,
});

export const gitGlobalConfigOptions = queryOptions({
    queryKey: ["git-config", "global"],
    queryFn: api.gitGlobalConfig,
});

export const gitRepoConfigOptions = (projectId: string) =>
    queryOptions({
        queryKey: ["git", projectId, "config"],
        queryFn: () => api.gitRepoConfig(projectId),
    });

export const treeOptions = (projectId: string, path: string) =>
    queryOptions({
        queryKey: ["tree", projectId, path],
        queryFn: () => api.getTree(projectId, path),
    });

// Everything git-related lives under ["git", projectId, ...], so one invalidation (done on every
// "git" event from the server) refreshes status and all open diffs.
export const gitStatusOptions = (projectId: string) =>
    queryOptions({
        queryKey: ["git", projectId, "status"],
        queryFn: () => api.gitStatus(projectId),
    });

export const gitNumstatOptions = (projectId: string) =>
    queryOptions({
        queryKey: ["git", projectId, "numstat"],
        queryFn: () => api.gitNumstat(projectId),
    });

export const gitBranchesOptions = (projectId: string) =>
    queryOptions({
        queryKey: ["git", projectId, "branches"],
        queryFn: () => api.gitBranches(projectId),
    });

export const gitRemotesOptions = (projectId: string) =>
    queryOptions({
        queryKey: ["git", projectId, "remotes"],
        queryFn: () => api.gitRemotes(projectId),
    });

export const gitTagsOptions = (projectId: string) =>
    queryOptions({
        queryKey: ["git", projectId, "tags"],
        queryFn: () => api.gitTags(projectId),
    });

export const gitStashesOptions = (projectId: string) =>
    queryOptions({
        queryKey: ["git", projectId, "stashes"],
        queryFn: () => api.gitStashes(projectId),
    });

export const gitLogOptions = (projectId: string, scope: "current" | "local" | "all", limit: number) =>
    queryOptions({
        queryKey: ["git", projectId, "log", scope, limit],
        queryFn: () => api.gitLog(projectId, scope, limit),
        // "Load more" and the scope toggle keep showing the old graph until the new one arrives.
        placeholderData: keepPreviousData,
    });

export const gitDiffOptions = (projectId: string, path: string, staged: boolean) =>
    queryOptions({
        queryKey: ["git", projectId, "diff", path, staged],
        queryFn: () => api.gitDiff(projectId, path, staged),
        retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 1,
    });

export const fileKey = (projectId: string, path: string) => ["file", projectId, path] as const;

export const fileOptions = (projectId: string, path: string) =>
    queryOptions({
        queryKey: fileKey(projectId, path),
        queryFn: () => api.getFile(projectId, path),
        // Never refetch behind the user's back: the ETag here is what a save is checked against.
        // Live updates (M2) will invalidate explicitly.
        staleTime: Infinity,
        // 4xx (binary, too large, missing) won't fix themselves.
        retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 1,
    });
