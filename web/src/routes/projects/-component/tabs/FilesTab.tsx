import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronsDownUp, Search, X } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { filterFiles } from "#/components/file-tree/build-tree";
import { FileTree, type TreeEntry, type TreeNode } from "#/components/file-tree/file-tree";
import { changedCountByDir, formatSize, statusByPath } from "#/components/file-tree/git-status";
import { StatusLetter } from "#/components/file-tree/status-letter";
import type { Entry } from "#/lib/api";
import { gitStatusOptions, treeOptions } from "#/lib/queries";
import { useWorkspace } from "#/stores/workspace";
import { TabHeader } from "./TabHeader";

const MAX_RESULTS = 100;
const SKELETON_WIDTHS = ["w-24", "w-16", "w-28", "w-20", "w-32", "w-24", "w-20"];

function FilesSkeleton() {
    return (
        <div role="status" aria-label="Loading files" className="py-1">
            {SKELETON_WIDTHS.map((width, i) => (
                <div key={i} className="flex min-h-9 items-center gap-2 px-3">
                    <Skeleton className="size-4 shrink-0" />
                    <Skeleton className={`h-3.5 ${width}`} />
                </div>
            ))}
        </div>
    );
}

const toTreeEntry = (entry: Entry): TreeEntry<Entry> => ({
    path: entry.path,
    kind: entry.type === "dir" ? "folder" : "file",
    data: entry,
});

export function FilesTab({ projectId }: { projectId: string }) {
    const [selected, setSelected] = useState<string>();
    // expanded dirs live in the workspace store: they are also what the live-update stream watches
    const expanded = useWorkspace((s) => s.expanded);
    const toggleDir = useWorkspace((s) => s.toggleDir);
    const collapseAll = useWorkspace((s) => s.collapseAll);
    const [query, setQuery] = useState("");

    // one directory level per query: the root, plus every folder the user has opened
    const levels = useQueries({ queries: ["", ...expanded].map((path) => treeOptions(projectId, path)) });
    const root = levels[0];
    const entries = levels.flatMap((level) => level.data?.map(toTreeEntry) ?? []);

    // the tree API lists one folder at a time, so search covers the folders loaded so far
    const searching = query.trim() !== "";
    const matches = searching ? filterFiles(entries, query) : [];

    // git status as letters on files and a changed-file count on folders; refreshed by git events
    const { data: git } = useQuery(gitStatusOptions(projectId));
    const statuses = useMemo(() => (git ? statusByPath(git) : new Map<string, string>()), [git]);
    const changedInDir = useMemo(() => changedCountByDir(statuses.keys()), [statuses]);

    const renderMeta = (node: TreeNode<Entry>) => {
        if (node.kind === "folder") {
            const changed = changedInDir.get(node.path);
            return changed ? (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 text-xs font-medium text-amber-500">
                    {changed}
                </span>
            ) : null;
        }
        const status = statuses.get(node.path);
        return (
            <>
                {node.entry?.data && (
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {formatSize(node.entry.data.size)}
                    </span>
                )}
                {status && <StatusLetter status={status} pill />}
            </>
        );
    };

    return (
        <>
            <TabHeader title="Files" />
            <div className="flex items-center gap-2 px-2 py-2">
                <div className="relative min-w-0 flex-1">
                    <label htmlFor="file-search" className="sr-only">
                        Find a file
                    </label>
                    <Search
                        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <Input
                        id="file-search"
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => event.key === "Escape" && setQuery("")}
                        placeholder="Find a file"
                        className="px-9"
                    />
                    {query && (
                        <button
                            type="button"
                            aria-label="Clear search"
                            onClick={() => setQuery("")}
                            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                            <X aria-hidden="true" className="size-4" />
                        </button>
                    )}
                </div>
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label="Collapse all folders"
                                disabled={expanded.length === 0 || searching}
                                onClick={collapseAll}
                            />
                        }
                    >
                        <ChevronsDownUp aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent>Collapse all folders</TooltipContent>
                </Tooltip>
            </div>
            <Collapsible defaultOpen className="border-b border-sidebar-border">
                <CollapsibleTrigger className=" group flex min-h-10 w-full items-center gap-1 px-2 text-left text-sm font-medium">
                    <ChevronDown
                        className="size-4 shrink-0 -rotate-90 transition-transform group-aria-expanded:rotate-0"
                        aria-hidden="true"
                    />
                    <span>Project files</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    {root?.isPending ? (
                        <FilesSkeleton />
                    ) : root?.error ? (
                        <p role="alert" className="px-3 py-2 text-xs text-destructive">
                            {root.error.message}{" "}
                            <button type="button" className="underline" onClick={() => root.refetch()}>
                                Retry
                            </button>
                        </p>
                    ) : searching ? (
                        matches.length === 0 ? (
                            <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
                                No files match “{query.trim()}” in the folders opened so far.
                            </p>
                        ) : (
                            <>
                                <FileTree<Entry>
                                    label="Search results"
                                    view="list"
                                    entries={matches.slice(0, MAX_RESULTS)}
                                    renderMeta={renderMeta}
                                    selectedPath={selected}
                                    onSelect={(entry) => setSelected(entry.path)}
                                />
                                <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
                                    {matches.length > MAX_RESULTS
                                        ? `Showing ${MAX_RESULTS} of ${matches.length}. `
                                        : ""}
                                    Searches the folders opened so far.
                                </p>
                            </>
                        )
                    ) : entries.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">This folder is empty</p>
                    ) : (
                        <FileTree<Entry>
                            label="Project files"
                            entries={entries}
                            expanded={expanded}
                            renderMeta={renderMeta}
                            onToggleFolder={(node) => toggleDir(node.path)}
                            selectedPath={selected}
                            onSelect={(entry) => setSelected(entry.path)}
                        />
                    )}
                </CollapsibleContent>
            </Collapsible>
        </>
    );
}
