// this is scratchpad for building and testing ui
// this mobile only ui
import { createFileRoute } from "@tanstack/react-router";
import {
    Archive,
    ChevronDown,
    FileDiff,
    Folder,
    GitBranch,
    GitPullRequest,
    RefreshCw,
    X,
    type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/ui/p/$project_id")({
    component: RouteComponent,
});

type NavTab = "files" | "changes" | "branches" | "stash" | "prs";

// mock counts, replace with real data
const NAV_ITEMS: { id: NavTab; label: string; icon: LucideIcon; count?: number }[] = [
    { id: "files", label: "Files", icon: Folder },
    { id: "changes", label: "Changes", icon: FileDiff, count: 6 },
    { id: "branches", label: "Branches", icon: GitBranch },
    { id: "stash", label: "Stash", icon: Archive, count: 2 },
    { id: "prs", label: "PRs", icon: GitPullRequest, count: 3 },
];

function RouteComponent() {
    const { project_id } = Route.useParams();
    const [active, setActive] = useState<NavTab>("files");
    // mock open files, replace with real tab state
    const [openFiles, setOpenFiles] = useState(["styles.css", "index.tsx"]);
    const [activeFile, setActiveFile] = useState<string | null>("index.tsx");

    const closeFile = (file: string) => {
        const next = openFiles.filter((f) => f !== file);
        setOpenFiles(next);
        if (file === activeFile) setActiveFile(next.at(-1) ?? null);
    };

    return (
        <div className="flex h-dvh bg-background text-foreground">
            <nav aria-label="Primary sidebar" className="flex flex-col bg-sidebar text-sidebar-foreground">
                <div
                    key={active}
                    aria-label={active}
                    data-project={project_id}
                    className="flex-1 min-h-0 overflow-y-auto"
                >
                    <header className="flex h-10 items-center justify-between gap-2 border-b border-sidebar-border px-2 text-xs">
                        <button
                            type="button"
                            aria-label="Select repository"
                            className="flex shrink-0 items-center gap-1.5 font-mono font-semibold text-sidebar-foreground"
                        >
                            <ChevronDown className="size-4 shrink-0" />
                            <span className="truncate">repository</span>
                        </button>
                        <span className="shrink-0 text-sidebar-border">/</span>
                        <span className="truncate font-mono">pocket-notes</span>
                        <span className="shrink-0 text-sidebar-border">/</span>
                        <button type="button" className="flex shrink-0 items-center gap-1.5 font-mono text-sidebar-foreground">
                            <GitBranch className="size-4 text-muted-foreground" />
                            main
                        </button>
                        <button
                            type="button"
                            aria-label="Sync Changes"
                            className="ml-auto flex h-10 min-w-0 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground active:bg-sidebar-accent"
                        >
                            <RefreshCw className="size-4 shrink-0" />
                        </button>
                    </header>
                    <section className="px-3 py-2 text-sm capitalize">{active}</section>
                    <div>{/* active content */}</div>
                </div>
                <div className="sticky bottom-0 grid grid-cols-5 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)]">
                    {NAV_ITEMS.map(({ id, label, icon: Icon, count }) => {
                        const isActive = id === active;
                        return (
                            <button
                                key={id}
                                type="button"
                                aria-current={isActive ? "page" : undefined}
                                onClick={() => setActive(id)}
                                className={cn(
                                    "flex flex-col items-center gap-1 px-2 pt-3 pb-2 text-xs font-medium transition-colors",
                                    isActive ? "text-sidebar-primary" : "text-muted-foreground",
                                )}
                            >
                                <span className="relative">
                                    <Icon className="size-6" strokeWidth={1.75} />
                                    {count !== undefined && (
                                        <span
                                            className={cn(
                                                "absolute -top-2 -right-3 flex min-w-4.5 items-center justify-center rounded-full bg-sidebar-primary px-1 text-[10px] leading-4.5 font-semibold text-sidebar-primary-foreground",
                                                !isActive && "opacity-80",
                                            )}
                                        >
                                            {count}
                                        </span>
                                    )}
                                </span>
                                {label}
                            </button>
                        );
                    })}
                </div>
            </nav>
            <section aria-label="Editor" className="flex min-h-0 flex-1 flex-col">
                <div role="tablist" className="flex h-10 shrink-0 overflow-x-auto border-b border-border bg-sidebar font-mono text-xs">
                    {openFiles.map((file) => {
                        const isActive = file === activeFile;
                        return (
                            <div
                                key={file}
                                role="tab"
                                aria-selected={isActive}
                                className={cn(
                                    "flex h-full shrink-0 items-center gap-1 border-b-2 border-r border-r-border pl-3",
                                    isActive
                                        ? "border-b-sidebar-primary bg-background text-foreground"
                                        : "border-b-transparent text-muted-foreground",
                                )}
                            >
                                <button type="button" className="h-full" onClick={() => setActiveFile(file)}>
                                    {file}
                                </button>
                                <button
                                    type="button"
                                    aria-label={`Close ${file}`}
                                    onClick={() => closeFile(file)}
                                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground active:bg-sidebar-accent [&_svg]:size-3.5"
                                >
                                    <X />
                                </button>
                            </div>
                        );
                    })}
                </div>
                <section className="min-h-0 flex-1 overflow-auto p-3 text-sm">
                    {activeFile ? `${activeFile} content` : "No file open"}
                </section>
            </section>
        </div>
    );
}
