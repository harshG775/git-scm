// this is scratchpad for building and testing ui
// this mobile only ui
import { createFileRoute } from "@tanstack/react-router";
import {
    Archive,
    ChevronsUpDown,
    FileDiff,
    Folder,
    GitBranch,
    GitPullRequest,
    PanelLeft,
    PanelRight,
    RefreshCw,
    type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { GraphView } from "#/components/shell/GraphView";
import { usePanelSnap } from "#/contexts/PanelSnapContext";
import { cn } from "#/lib/utils";
import { BranchesTab } from "./-component/tabs/BranchesTab";
import { ChangesTab } from "./-component/tabs/ChangesTab";
import { FilesTab } from "./-component/tabs/FilesTab";
import { PullRequestsTab } from "./-component/tabs/PullRequestsTab";
import { StashTab } from "./-component/tabs/StashTab";
import { TabStrip, type EditorTab } from "./-component/TabStrip";

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

// mock file content: long lines scroll sideways, many lines scroll down
const SAMPLE_CODE = Array.from({ length: 60 }, (_, i) => {
    const n = String(i + 1).padStart(2, " ");
    return i % 5 === 0
        ? `${n}  const handler${i} = async (request: Request, context: { params: Record<string, string>; signal: AbortSignal }) => fetch(\`/api/items/\${context.params.id}?page=${i}\`, { signal: context.signal });`
        : `${n}  const value${i} = compute(${i}, "line ${i}");`;
}).join("\n");

// mock tabs, replace with real tab state
const MOCK_TABS: EditorTab[] = [
    { id: "package.json", name: "package.json", pinned: true },
    { id: "styles.css", name: "styles.css", git: "M" },
    { id: "route", name: "$project_id.tsx", git: "M", dirty: true },
    { id: "route:index", name: "$project_id.tsx", suffix: "(Index)", git: "M", readOnly: true },
    { id: "route:wt", name: "styles.css", suffix: "(Working Tree)", git: "M", readOnly: true },
    { id: "FilesTab.tsx", name: "FilesTab.tsx", git: "A" },
    { id: "notes.md", name: "notes.md", git: "U", dirty: true },
    { id: "old.ts", name: "old.ts", git: "D", readOnly: true },
    { id: "README.md", name: "README.md", preview: true },
    { id: "terminal", name: "terminal", kind: "terminal" },
];

// mock terminal session, replace with a real pty
const TERMINAL_SESSION: { cmd: string; out?: string }[] = [
    {
        cmd: "git status -sb",
        out: "## main...origin/main [ahead 1]\n M web/src/styles.css\n M web/src/routes/ui/p/$project_id.tsx\n?? notes.md",
    },
    { cmd: "git log --oneline -3", out: "1e2e533 /\ne585b98 //\n7a8347a pocket-git ui" },
    { cmd: "vp check", out: "checked 142 files in 1.2s\nno issues found" },
    { cmd: "vp test", out: "✓ src/lib/diff.test.ts (12)\n✓ src/lib/graph.test.ts (8)\n\nTest Files  2 passed (2)" },
];

function RouteComponent() {
    const { project_id } = Route.useParams();
    const { containerRef, onScroll, snapTo } = usePanelSnap();
    const [active, setActive] = useState<NavTab>("files");
    const [tabs, setTabs] = useState<EditorTab[]>(MOCK_TABS);
    const [activeId, setActiveId] = useState<string | null>("route");
    const activeTab = tabs.find((t) => t.id === activeId);
    const openGraph = () => {
        setTabs((current) =>
            current.some((tab) => tab.id === "git-graph")
                ? current
                : [...current, { id: "git-graph", name: "Git Graph", kind: "graph" }],
        );
        setActiveId("git-graph");
        snapTo("editor");
    };

    return (
        <div
            ref={containerRef}
            onScroll={onScroll}
            className="flex h-dvh overflow-x-auto overscroll-x-contain bg-background text-foreground scrollbar-none"
        >
            <div
                aria-label="Primary sidebar"
                data-snap-panel="sidebar"
                className="flex flex-col w-[100%] max-w-lg shrink-0 bg-sidebar text-sidebar-foreground"
            >
                <header className="flex h-10 items-center justify-between gap-2 border-b border-sidebar-border px-2 text-xs">
                    <div className="flex h-10 items-center justify-between gap-1 text-xs">
                        <button
                            type="button"
                            aria-label="Select repository"
                            className="flex shrink-0 items-center gap-1.5 font-mono font-semibold text-sidebar-foreground"
                        >
                            <ChevronsUpDown className="size-4 shrink-0" />
                            <span className="truncate">repository</span>
                        </button>
                        <span className="shrink-0 text-muted-foreground">/</span>
                        <span className="truncate font-mono">pocket-notes</span>
                        <span className="shrink-0 text-muted-foreground">/</span>
                        <button
                            type="button"
                            className="flex shrink-0 items-center gap-1.5 font-mono text-sidebar-foreground"
                        >
                            <GitBranch className="size-4 text-muted-foreground" />
                            main
                        </button>
                    </div>
                    <div className="ml-auto flex items-center">
                        <Button type="button" aria-label="Sync Changes" variant="ghost" size="icon">
                            <RefreshCw className="size-4" />
                        </Button>
                        <Button
                            type="button"
                            aria-label="Show editor"
                            variant="ghost"
                            size="icon"
                            onClick={() => snapTo("editor")}
                        >
                            <PanelRight className="size-4" />
                        </Button>
                    </div>
                </header>
                <section
                    aria-label={active}
                    data-project={project_id}
                    className="flex-1 min-h-0 overflow-y-auto flex flex-col"
                >
                    <div hidden={active !== "files"}>
                        <FilesTab />
                    </div>
                    <div hidden={active !== "changes"}>
                        <ChangesTab />
                    </div>
                    <div hidden={active !== "branches"}>
                        <BranchesTab onOpenGraph={openGraph} />
                    </div>
                    <div hidden={active !== "stash"}>
                        <StashTab />
                    </div>
                    <div hidden={active !== "prs"}>
                        <PullRequestsTab />
                    </div>
                </section>
                <nav className="sticky bottom-0 grid grid-cols-5 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)]">
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
                </nav>
            </div>
            <section aria-label="Editor" data-snap-panel="editor" className="flex min-h-0 w-full shrink-0 flex-col">
                <div className="flex items-center h-10 shrink-0 border-b border-border bg-sidebar font-mono text-xs">
                    <Button
                        type="button"
                        aria-label="Show sidebar"
                        variant="ghost"
                        size="icon"
                        onClick={() => snapTo("sidebar")}
                    >
                        <PanelLeft className="size-4" />
                    </Button>
                    <TabStrip tabs={tabs} setTabs={setTabs} activeId={activeId} setActiveId={setActiveId} />
                </div>
                <section className="min-h-0 flex-1 overflow-auto p-3 text-sm">
                    {activeTab?.kind === "graph" ? (
                        <GraphView projectId={project_id} />
                    ) : activeTab?.kind === "terminal" ? (
                        <div className="w-max min-w-full font-mono text-xs leading-5">
                            {TERMINAL_SESSION.map(({ cmd, out }) => (
                                <div key={cmd} className="mb-2">
                                    <div>
                                        <span className="text-sidebar-primary">~/pocket-notes $</span> {cmd}
                                    </div>
                                    {out && <pre className="text-muted-foreground">{out}</pre>}
                                </div>
                            ))}
                            <div>
                                <span className="text-sidebar-primary">~/pocket-notes $</span>{" "}
                                <span className="animate-pulse">▍</span>
                            </div>
                        </div>
                    ) : activeTab ? (
                        <pre className="w-max min-w-full font-mono text-xs leading-5">{SAMPLE_CODE}</pre>
                    ) : (
                        "No file open"
                    )}
                </section>
            </section>
        </div>
    );
}
