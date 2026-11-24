import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, File, Folder, FolderOpen, RefreshCw } from "lucide-react";
import { cn } from "cn";
import { type Entry } from "#/lib/api";
import { treeOptions, projectsOptions } from "#/lib/queries";
import { useFileNav } from "#/lib/use-file-nav";
import { useWorkspace } from "#/stores/workspace";
import { PanelHeader } from "./panels";

const row =
    "flex min-h-11 w-full items-center gap-1.5 pr-2 text-left text-sm hover:bg-muted md:min-h-7 [&_svg]:size-4 [&_svg]:shrink-0";

export function Explorer({ projectId }: { projectId: string }) {
    const queryClient = useQueryClient();
    const { data: projects } = useQuery(projectsOptions);
    const name = projects?.find((p) => p.id === projectId)?.name ?? "Explorer";

    return (
        <div className="flex h-full flex-col">
            <PanelHeader title={name}>
                <button
                    type="button"
                    aria-label="Refresh"
                    className="flex size-9 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground md:size-7"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["tree", projectId] })}
                >
                    <RefreshCw className="size-4" />
                </button>
            </PanelHeader>
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
                <Dir projectId={projectId} path="" depth={0} />
            </div>
        </div>
    );
}

function Dir({ projectId, path, depth }: { projectId: string; path: string; depth: number }) {
    const { data, isPending, error } = useQuery(treeOptions(projectId, path));
    const pad = { paddingLeft: 8 + depth * 14 };

    if (isPending)
        return (
            <p style={pad} className="py-1.5 text-xs text-muted-foreground">
                Loading…
            </p>
        );
    if (error)
        return (
            <p style={pad} className="py-1.5 text-xs text-destructive">
                {error.message}
            </p>
        );
    if (data.length === 0 && depth > 0)
        return (
            <p style={pad} className="py-1.5 text-xs text-muted-foreground">
                Empty
            </p>
        );

    return data.map((entry) => <Node key={entry.path} projectId={projectId} entry={entry} depth={depth} />);
}

function Node({ projectId, entry, depth }: { projectId: string; entry: Entry; depth: number }) {
    const active = useSearch({ from: "/p/$projectId", select: (s) => s.file ?? null });
    const expanded = useWorkspace((s) => s.expanded.includes(entry.path));
    const toggleDir = useWorkspace((s) => s.toggleDir);
    const nav = useFileNav(projectId, active);
    const style = { paddingLeft: 8 + depth * 14 };

    if (entry.type === "file") {
        return (
            <button
                type="button"
                style={style}
                className={cn(row, active === entry.path && "bg-muted font-medium")}
                onClick={() => nav.open(entry.path)}
            >
                <span className="size-4" />
                <File className="text-muted-foreground" />
                <span className="truncate">{entry.name}</span>
            </button>
        );
    }

    return (
        <>
            <button type="button" style={style} className={row} onClick={() => toggleDir(entry.path)}>
                {expanded ? <ChevronDown /> : <ChevronRight />}
                {expanded ? (
                    <FolderOpen className="text-muted-foreground" />
                ) : (
                    <Folder className="text-muted-foreground" />
                )}
                <span className="truncate">{entry.name}</span>
            </button>
            {expanded && <Dir projectId={projectId} path={entry.path} depth={depth + 1} />}
        </>
    );
}
