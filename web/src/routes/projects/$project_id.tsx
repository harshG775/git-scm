// this is scratchpad for building and testing ui
// this mobile only ui
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
    Archive,
    ChevronsUpDown,
    FileDiff,
    Folder,
    GitBranch,
    GitPullRequest,
    PanelLeftOpen,
    PanelLeftClose,
    type LucideIcon,
} from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { GraphView } from "#/components/shell/GraphView";
import { PanelResizer } from "#/components/shell/PanelResizer";
import { usePanelSnap } from "#/contexts/PanelSnapContext";
import { useLiveUpdates } from "#/lib/live";
import { gitBranchesOptions, projectsOptions } from "#/lib/queries";
import { useWorkspace } from "#/stores/workspace";
import { cn } from "#/lib/utils";
import { BranchesTab } from "./-component/tabs/BranchesTab";
import { ChangesTab } from "./-component/tabs/ChangesTab";
import { FilesTab } from "./-component/tabs/FilesTab";
import { PullRequestsTab } from "./-component/tabs/PullRequestsTab";
import { StashTab } from "./-component/tabs/StashTab";
import { SyncButton, SyncError, useSync } from "./-component/sync";
import { TabStrip, type EditorTab } from "./-component/TabStrip";

export const Route = createFileRoute("/projects/$project_id")({
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

const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 320;
const SIDEBAR_KEY = "workspace.sidebarWidth";
const SIDEBAR_OPEN_KEY = "workspace.sidebarOpen";

function loadSidebarWidth() {
    try {
        const saved = Number(localStorage.getItem(SIDEBAR_KEY));
        if (saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX) return saved;
    } catch {
        // storage unavailable, use default
    }
    return SIDEBAR_DEFAULT;
}

function loadSidebarOpen() {
    try {
        return localStorage.getItem(SIDEBAR_OPEN_KEY) !== "0";
    } catch {
        return true;
    }
}

function saveSetting(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // storage unavailable, setting just won't persist
    }
}

/** project name / current branch, both from the API; git events keep the branch current */
function RepoCrumb({ projectId }: { projectId: string }) {
    const { data: projects } = useQuery(projectsOptions);
    const { data: branches } = useQuery(gitBranchesOptions(projectId));
    const name = projects?.find((project) => project.id === projectId)?.name;

    return (
        <div className="flex h-10 min-w-0 items-center gap-1 text-xs">
            <button
                type="button"
                aria-label="Switch project"
                className="flex min-w-0 items-center gap-1.5 font-mono font-semibold text-sidebar-foreground"
            >
                <ChevronsUpDown className="size-4 shrink-0" />
                <span className="truncate">{name ?? "Project"}</span>
            </button>
            {branches?.isRepo && (
                <>
                    <span className="shrink-0 text-muted-foreground">/</span>
                    <button
                        type="button"
                        aria-label={branches.detached ? "Detached HEAD" : "Switch branch"}
                        className="flex min-w-0 items-center gap-1.5 font-mono text-sidebar-foreground"
                    >
                        <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                        <span className={cn("truncate", branches.detached && "italic")}>{branches.head}</span>
                    </button>
                </>
            )}
        </div>
    );
}

/** Green while the server's event stream is connected, i.e. outside edits show up on their own. */
function LiveDot({ live }: { live: boolean }) {
    return (
        <span
            role="status"
            aria-label={live ? "Live updates on" : "Live updates off, reconnecting"}
            title={live ? "Live updates on" : "Reconnecting…"}
            className={cn(
                "mx-2 size-2 shrink-0 rounded-full transition-colors",
                live ? "bg-green-500" : "animate-pulse bg-muted-foreground/50",
            )}
        />
    );
}

function RouteComponent() {
    const { project_id } = Route.useParams();
    const { containerRef, onScroll, snapTo } = usePanelSnap();
    // expanded dirs belong to one project; switching resets them. Live updates refresh the tree on outside edits.
    const enterProject = useWorkspace((s) => s.enterProject);
    useEffect(() => enterProject(project_id), [enterProject, project_id]);
    const live = useLiveUpdates(project_id);
    const sync = useSync(project_id);
    const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
    const [sidebarOpen, setSidebarOpenState] = useState(loadSidebarOpen);
    const resizeSidebar = (width: number) => {
        setSidebarWidth(width);
        saveSetting(SIDEBAR_KEY, String(width));
    };
    const setSidebarOpen = (open: boolean) => {
        setSidebarOpenState(open);
        saveSetting(SIDEBAR_OPEN_KEY, open ? "1" : "0");
    };
    // Ctrl/Cmd+B toggles the sidebar on wide screens, like VS Code
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "b") return;
            if (!window.matchMedia("(min-width: 768px)").matches) return;
            e.preventDefault();
            setSidebarOpenState((open) => {
                saveSetting(SIDEBAR_OPEN_KEY, open ? "0" : "1");
                return !open;
            });
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
    const [active, setActive] = useState<NavTab>("files");
    const [tabs, setTabs] = useState<EditorTab[]>(MOCK_TABS);
    const [activeId, setActiveId] = useState<string | null>("route");
    const activeTab = tabs.find((t) => t.id === activeId);
    const openGraph = () => {
        // start the slide first, then mount the (heavy) graph in a transition so the
        // first render doesn't block the main thread and make the scroll jump
        snapTo("editor");
        requestAnimationFrame(() =>
            startTransition(() => {
                setTabs((current) =>
                    current.some((tab) => tab.id === "git-graph")
                        ? current
                        : [...current, { id: "git-graph", name: "Git Graph", kind: "graph" }],
                );
                setActiveId("git-graph");
            }),
        );
    };

    return (
        <div
            aria-label="Workspace"
            ref={containerRef}
            onScroll={onScroll}
            style={{ "--sidebar-w": `${sidebarWidth}px` } as React.CSSProperties}
            className="flex h-dvh overflow-x-auto overscroll-x-contain bg-background text-foreground scrollbar-none snap-x snap-mandatory md:snap-none md:overflow-x-hidden"
        >
            <div
                aria-label="Primary sidebar"
                data-snap-panel="sidebar"
                className={cn(
                    "flex flex-col w-full min-w-sm shrink-0 snap-center snap-always bg-sidebar text-sidebar-foreground md:w-(--sidebar-w) md:min-w-0",
                    !sidebarOpen && "md:hidden",
                )}
            >
                <header className="flex h-10 items-center justify-between gap-2 border-b border-sidebar-border px-2 text-xs">
                    <RepoCrumb projectId={project_id} />
                    <div className="ml-auto flex items-center">
                        <LiveDot live={live} />
                        <SyncButton sync={sync} />
                        <Button
                            type="button"
                            aria-label="Collapse sidebar"
                            title="Collapse sidebar (Ctrl+B)"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                // wide: hide the panel; phone: slide over to the editor
                                if (window.matchMedia("(min-width: 768px)").matches) setSidebarOpen(false);
                                else snapTo("editor");
                            }}
                        >
                            <PanelLeftClose className="size-4" />
                        </Button>
                    </div>
                </header>
                <SyncError sync={sync} />
                <section
                    aria-label={active}
                    data-project={project_id}
                    className="flex-1 min-h-0 overflow-y-auto flex flex-col"
                >
                    <div hidden={active !== "files"}>
                        <FilesTab projectId={project_id} />
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
            {sidebarOpen && (
                <PanelResizer
                    width={sidebarWidth}
                    min={SIDEBAR_MIN}
                    max={SIDEBAR_MAX}
                    onChange={resizeSidebar}
                    onReset={() => resizeSidebar(SIDEBAR_DEFAULT)}
                    onCollapse={() => setSidebarOpen(false)}
                />
            )}
            <section
                aria-label="Editor"
                data-snap-panel="editor"
                className="flex min-h-0 w-full shrink-0 snap-center snap-always flex-col md:w-auto md:min-w-0 md:flex-1 md:shrink"
            >
                <div className="flex items-center h-10 shrink-0 border-b border-border bg-sidebar font-mono text-xs">
                    <Button
                        type="button"
                        aria-label="Show sidebar"
                        title="Show sidebar (Ctrl+B)"
                        variant="ghost"
                        size="icon"
                        className={cn(sidebarOpen && "md:hidden")}
                        onClick={() => {
                            setSidebarOpen(true);
                            snapTo("sidebar");
                        }}
                    >
                        <PanelLeftOpen className="size-4" />
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
