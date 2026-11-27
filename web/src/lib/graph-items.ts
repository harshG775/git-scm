import type { GitCommit, GitLog, GitStash } from "./api";
import type { GraphInput } from "./graph";

export type UncommittedCounts = { staged: number; unstaged: number };

export type GraphItem =
    | {
          kind: "uncommitted";
          id: string;
          parents: string[];
          count: number;
          staged?: number;
          unstaged?: number;
      }
    | { kind: "stash"; id: string; parents: string[]; stash: GitStash }
    | { kind: "commit"; id: string; parents: string[]; commit: GitCommit };

export const UNCOMMITTED_ID = "uncommitted";

/**
 * The rows of the graph: uncommitted changes on top (hanging off HEAD), then the commits, with each
 * stash placed just above the commit it was made on, like the pink branch in Git Graph. A stash
 * whose base commit is not in the loaded page is left out; it appears once that page is loaded.
 */
export function buildItems(log: GitLog, counts?: UncommittedCounts): GraphItem[] {
    const items: GraphItem[] = [];
    const uncommittedCount = log.uncommitted || (counts ? counts.staged + counts.unstaged : 0);
    if (uncommittedCount > 0) {
        items.push({
            kind: "uncommitted",
            id: UNCOMMITTED_ID,
            parents: log.head ? [log.head] : [],
            count: uncommittedCount,
            staged: counts?.staged,
            unstaged: counts?.unstaged,
        });
    }

    const stashesByBase = new Map<string, GitStash[]>();
    for (const s of [...log.stashes].sort((a, b) => a.index - b.index)) {
        stashesByBase.set(s.base, [...(stashesByBase.get(s.base) ?? []), s]);
    }
    for (const commit of log.commits) {
        for (const stash of stashesByBase.get(commit.oid) ?? []) {
            items.push({ kind: "stash", id: `stash:${stash.oid}`, parents: [commit.oid], stash });
        }
        items.push({ kind: "commit", id: commit.oid, parents: commit.parents, commit });
    }
    return items;
}

export const toInputs = (items: GraphItem[]): GraphInput[] => items.map(({ id, parents }) => ({ id, parents }));
