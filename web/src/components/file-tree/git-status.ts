// Pure helpers for showing git status and sizes in a tree. No React.
import type { GitStatus } from "#/lib/api";

/** path -> status letter. A conflict wins over a working-tree change, which wins over a staged one. */
export function statusByPath({ staged, changes, conflicts }: Pick<GitStatus, "staged" | "changes" | "conflicts">) {
    const map = new Map<string, string>();
    for (const { path, status } of staged) map.set(path, status);
    for (const { path, status } of changes) map.set(path, status);
    for (const { path } of conflicts) map.set(path, "!");
    return map;
}

/** folder path -> number of changed files anywhere below it ("src" counts "src/a/b.ts"). */
export function changedCountByDir(paths: Iterable<string>) {
    const counts = new Map<string, number>();
    for (const path of paths) {
        const parts = path.split("/").filter(Boolean);
        parts.pop();
        let dir = "";
        for (const part of parts) {
            dir = dir ? `${dir}/${part}` : part;
            counts.set(dir, (counts.get(dir) ?? 0) + 1);
        }
    }
    return counts;
}

export function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value < 10 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value)} ${units[unit]}`;
}
