import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
    ChevronsUpDown,
    FileDiff,
    Folder,
    GitBranch,
    PanelLeftOpen,
    PanelLeftClose,
    type LucideIcon,
} from "lucide-react";
import { Activity, startTransition, useEffect, useState } from "react";
import { ErrorBoundary } from "#/components/error-boundary";
import { NotificationCenter } from "#/components/NotificationCenter";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { GraphView } from "#/components/shell/GraphView";
import { PanelResizer } from "#/components/shell/PanelResizer";
import { usePanelSnap } from "#/contexts/PanelSnapContext";
import { useLiveUpdates } from "#/lib/live";
import { gitBranchesOptions, gitStatusOptions, projectsOptions } from "#/lib/queries";
import { useWorkspace } from "#/stores/workspace";
import { cn } from "#/lib/utils";
import { BranchesTab } from "./-component/tabs/BranchesTab";
import { ChangesTab } from "./-component/tabs/ChangesTab";
import { FilesTab } from "./-component/tabs/FilesTab";
import { FileViewer } from "./-component/FileViewer";
import { RepoMenu } from "./-component/RepoMenu";
import { SyncButton, useSync } from "./-component/sync";
import { TabStrip, type EditorTab } from "./-component/TabStrip";

export const Route = createFileRoute("/projects/$project_id")({
    component: RouteComponent,
});

type NavTab = "files" | "changes" | "branches";

const NAV_ITEMS: { id: NavTab; label: string; icon: LucideIcon }[] = [
    { id: "files", label: "Files", icon: Folder },
    { id: "changes", label: "Changes", icon: FileDiff },
    { id: "branches", label: "Branches", icon: GitBranch },
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

/** project name / current branch, both from the API; tapping either opens the repository sheet */
function RepoCrumb({ projectId, onOpenBranches }: { projectId: string; onOpenBranches: () => void }) {
    const { data: projects } = useQuery(projectsOptions);
    const { data: branches } = useQuery(gitBranchesOptions(projectId));
    const [menuOpen, setMenuOpen] = useState(false);
    const project = projects?.find((item) => item.id === projectId);
    const name = project?.name;

    return (
        <div className="flex h-10 min-w-0 items-center gap-1 text-xs">
            <button
                type="button"
                aria-label="Repository menu"
                className="flex min-w-0 items-center gap-1.5 font-mono font-semibold text-sidebar-foreground"
                onClick={() => setMenuOpen(true)}
            >
                <ChevronsUpDown className="size-4 shrink-0" />
                {name ? <span className="truncate">{name}</span> : <Skeleton className="h-4 w-24" />}
            </button>
            {branches?.isRepo && (
                <>
                    <span className="shrink-0 text-muted-foreground">/</span>
                    <button
                        type="button"
                        aria-label={branches.detached ? "Detached HEAD" : "Switch branch"}
                        className="flex min-w-0 items-center gap-1.5 font-mono text-sidebar-foreground"
                        onClick={() => setMenuOpen(true)}
                    >
                        <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                        <span className={cn("truncate", branches.detached && "italic")}>{branches.head}</span>
                    </button>
                </>
            )}
            <RepoMenu
                projectId={projectId}
                projectName={project?.name}
                projectPath={project?.path}
                head={branches?.isRepo ? branches.head : undefined}
                detached={branches?.detached}
                isRepo={branches?.isRepo}
                open={menuOpen}
                onOpenChange={setMenuOpen}
                onSwitchBranch={onOpenBranches}
            />
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
                live ? "bg-success" : "animate-pulse bg-muted-foreground/50",
            )}
        />
    );
}

function RouteComponent() {
    const { project_id } = Route.useParams();
    // keyed: switching project remounts the workspace, so no tabs, searches or folders leak across
    return <Workspace key={project_id} project_id={project_id} />;
}

function Workspace({ project_id }: { project_id: string }) {
    const { containerRef, onScroll, snapTo } = usePanelSnap();
    // expanded dirs belong to one project; switching resets them. Live updates refresh the tree on outside edits.
    const enterProject = useWorkspace((s) => s.enterProject);
    useEffect(() => enterProject(project_id), [enterProject, project_id]);
    const live = useLiveUpdates(project_id);
    const sync = useSync(project_id);
    // files with changes, for the badge on the Changes tab; a file both staged and edited counts once
    const { data: gitStatus } = useQuery(gitStatusOptions(project_id));
    const changedFiles = new Set(
        [...(gitStatus?.staged ?? []), ...(gitStatus?.changes ?? []), ...(gitStatus?.conflicts ?? [])].map(
            (c) => c.path,
        ),
    ).size;
    const counts: Partial<Record<NavTab, number>> = { changes: changedFiles || undefined };
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
    // tabs stay mounted so their state survives switching; the inactive ones are hidden
    const mode = (tab: NavTab) => (tab === active ? "visible" : "hidden");
    const [tabs, setTabs] = useState<EditorTab[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const activeTab = tabs.find((t) => t.id === activeId);
    // open (or switch to) an editor tab. On a phone the editor is a separate panel, so slide to it first,
    // then mount the tab in a transition: a heavy first render (the graph, a big file) can't stall the slide.
    const openTab = (tab: EditorTab) => {
        snapTo("editor");
        requestAnimationFrame(() =>
            startTransition(() => {
                setTabs((current) => (current.some((t) => t.id === tab.id) ? current : [...current, tab]));
                setActiveId(tab.id);
            }),
        );
    };
    const openGraph = () => openTab({ id: "git-graph", name: "Git Graph", kind: "graph" });
    // VS Code preview tabs: a tap opens an italic preview that the next tap replaces; a double-tap
    // (or opening an already-open preview again with `pin`) keeps it.
    const openFile = (path: string, pin = false) => {
        const id = `file:${path}`;
        snapTo("editor");
        requestAnimationFrame(() =>
            startTransition(() => {
                setTabs((current) => {
                    const existing = current.find((t) => t.id === id);
                    if (existing) {
                        return pin && existing.preview
                            ? current.map((t) => (t.id === id ? { ...t, preview: false } : t))
                            : current;
                    }
                    const tab: EditorTab = {
                        id,
                        name: path.slice(path.lastIndexOf("/") + 1),
                        path,
                        readOnly: true,
                        preview: !pin,
                    };
                    const replace = pin ? -1 : current.findIndex((t) => t.preview && t.path);
                    return replace === -1 ? [...current, tab] : current.map((t, i) => (i === replace ? tab : t));
                });
                setActiveId(id);
            }),
        );
    };

    // tell the live-update stream which files are open, so outside edits refresh them
    useEffect(() => {
        useWorkspace.setState({
            tabs: tabs.flatMap((t) => (t.path ? [{ id: t.path, kind: "file" as const, path: t.path }] : [])),
        });
    }, [tabs]);

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
                    <RepoCrumb projectId={project_id} onOpenBranches={() => setActive("branches")} />
                    <div className="ml-auto flex items-center">
                        <LiveDot live={live} />
                        <SyncButton sync={sync} />
                        <NotificationCenter />
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
                {/* loading */}
                <section
                    aria-label={active}
                    data-project={project_id}
                    className="flex-1 min-h-0 overflow-y-auto flex flex-col"
                >
                    <ErrorBoundary resetKeys={[project_id]} title="The sidebar failed to load">
                        <Activity mode={mode("files")}>
                            <FilesTab projectId={project_id} activePath={activeTab?.path} onOpenFile={openFile} />
                        </Activity>
                        <Activity mode={mode("changes")}>
                            <ChangesTab projectId={project_id} activePath={activeTab?.path} onOpenFile={openFile} />
                        </Activity>
                        <Activity mode={mode("branches")}>
                            <BranchesTab projectId={project_id} onOpenGraph={openGraph} />
                        </Activity>
                    </ErrorBoundary>
                </section>
                <nav className="sticky bottom-0 grid grid-cols-3 border-t border-sidebar-border bg-card pb-[env(safe-area-inset-bottom)]">
                    {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
                        const count = counts[id];
                        const isActive = id === active;
                        return (
                            <button
                                key={id}
                                type="button"
                                aria-current={isActive ? "page" : undefined}
                                onClick={() => setActive(id)}
                                className={cn(
                                    "flex min-h-14 flex-col items-center justify-center gap-1 px-2 text-[11px] font-medium transition-colors",
                                    isActive ? "text-primary" : "text-muted-foreground",
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
                    <ErrorBoundary resetKeys={[project_id, activeId]} title="This tab failed to load">
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
                        ) : activeTab?.path ? (
                            <FileViewer projectId={project_id} path={activeTab.path} />
                        ) : (
                            "No file open"
                        )}
                    </ErrorBoundary>
                </section>
            </section>
        </div>
    );
}
