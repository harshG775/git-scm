import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronsDownUp } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty";
import { Skeleton } from "#/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { filterFiles } from "#/components/file-tree/build-tree";
import { FileTree, type TreeEntry, type TreeNode } from "#/components/file-tree/file-tree";
import { changedCountByDir, formatSize, statusByPath } from "#/components/file-tree/git-status";
import { StatusLetter } from "#/components/file-tree/status-letter";
import type { Entry } from "#/lib/api";
import { gitStatusOptions, treeOptions } from "#/lib/queries";
import { useWorkspace } from "#/stores/workspace";
import { SearchField } from "./SearchField";
import { Section, SectionCard } from "./Section";
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

export function FilesTab({
    projectId,
    activePath,
    onOpenFile,
}: {
    projectId: string;
    /** path of the file shown in the editor, highlighted in the tree */
    activePath?: string;
    /** a single tap previews the file (replaced by the next one); `pin` keeps it, like a double-click */
    onOpenFile: (path: string, pin?: boolean) => void;
}) {
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
                <span className="shrink-0 rounded-full bg-warning/15 px-1.5 text-xs font-medium text-warning">
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
            <div className="flex items-center gap-2 px-3 pb-2">
                <SearchField
                    id="file-search"
                    label="Find a file"
                    value={query}
                    onChange={setQuery}
                    placeholder="Find a file"
                />
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
            <Section title="Project files">
                {root?.isPending ? (
                    <SectionCard>
                        <FilesSkeleton />
                    </SectionCard>
                ) : root?.error ? (
                    <p role="alert" className="text-xs text-destructive">
                        {root.error.message}{" "}
                        <button type="button" className="underline" onClick={() => root.refetch()}>
                            Retry
                        </button>
                    </p>
                ) : searching ? (
                    matches.length === 0 ? (
                        <Empty>
                            <EmptyHeader>
                                <EmptyTitle>No matching files</EmptyTitle>
                                <EmptyDescription>
                                    Nothing matches “{query.trim()}” in the folders opened so far.
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <>
                            <SectionCard>
                                <FileTree<Entry>
                                    label="Search results"
                                    view="list"
                                    entries={matches.slice(0, MAX_RESULTS)}
                                    renderMeta={renderMeta}
                                    selectedPath={activePath}
                                    onSelect={(entry) => onOpenFile(entry.path)}
                                    onOpen={(entry) => onOpenFile(entry.path, true)}
                                />
                            </SectionCard>
                            <p role="status" className="pt-2 text-xs text-muted-foreground">
                                {matches.length > MAX_RESULTS ? `Showing ${MAX_RESULTS} of ${matches.length}. ` : ""}
                                Searches the folders opened so far.
                            </p>
                        </>
                    )
                ) : entries.length === 0 ? (
                    <Empty>
                        <EmptyHeader>
                            <EmptyTitle>This folder is empty</EmptyTitle>
                            <EmptyDescription>Files you add will show up here.</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    <SectionCard>
                        <FileTree<Entry>
                            label="Project files"
                            entries={entries}
                            expanded={expanded}
                            renderMeta={renderMeta}
                            onToggleFolder={(node) => toggleDir(node.path)}
                            selectedPath={activePath}
                            onSelect={(entry) => onOpenFile(entry.path)}
                            onOpen={(entry) => onOpenFile(entry.path, true)}
                        />
                    </SectionCard>
                )}
            </Section>
        </>
    );
}
