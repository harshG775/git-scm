// this is scratchpad for building and testing ui
// this mobile only ui
import { Menu } from "@base-ui/react/menu";
import { createFileRoute } from "@tanstack/react-router";
import {
    Archive,
    ChevronDown,
    Ellipsis,
    FileCode,
    FileDiff,
    FileText,
    Folder,
    GitBranch,
    GitPullRequest,
    Lock,
    Pin,
    RefreshCw,
    SquareTerminal,
    X,
    type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

// mock file content: long lines scroll sideways, many lines scroll down
const SAMPLE_CODE = Array.from({ length: 60 }, (_, i) => {
    const n = String(i + 1).padStart(2, " ");
    return i % 5 === 0
        ? `${n}  export const handler${i} = async (request: Request, context: { params: Record<string, string>; signal: AbortSignal }) => fetch(\`/api/items/\${context.params.id}?page=${i}\`, { signal: context.signal });`
        : `${n}  const value${i} = compute(${i}, "line ${i}");`;
}).join("\n");

// ---- editor tabs (VS Code style) -------------------------------------------------------------

type GitLetter = "M" | "A" | "U" | "D";

interface EditorTab {
    id: string;
    name: string;
    /** Shown after the name, e.g. "(Index)" for a staged diff. */
    suffix?: string;
    git?: GitLetter;
    /** Unsaved edits: the close button becomes a dot. */
    dirty?: boolean;
    /** Opened by a single tap: italic, replaced by the next preview, pinned by a double tap. */
    preview?: boolean;
    /** Pinned tabs sit first, can't be closed by accident and survive "Close All". */
    pinned?: boolean;
    readOnly?: boolean;
    /** Defaults to a file. A terminal tab has no git status and shows a shell instead of code. */
    kind?: "file" | "terminal";
}

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

const GIT_COLOR: Record<GitLetter, string> = {
    M: "text-sidebar-primary",
    A: "text-sidebar-primary",
    U: "text-sidebar-primary",
    D: "text-destructive",
};

const tabIcon = (tab: EditorTab) =>
    tab.kind === "terminal" ? SquareTerminal : /\.(tsx?|jsx?|css|json|go)$/.test(tab.name) ? FileCode : FileText;

const menuItem =
    "flex min-h-11 cursor-default items-center rounded-md px-3 outline-none data-disabled:opacity-40 data-highlighted:bg-accent data-highlighted:text-accent-foreground";

function TabStrip({
    tabs,
    setTabs,
    activeId,
    setActiveId,
}: {
    tabs: EditorTab[];
    setTabs: (tabs: EditorTab[]) => void;
    activeId: string | null;
    setActiveId: (id: string | null) => void;
}) {
    const strip = useRef<HTMLDivElement>(null);
    const active = tabs.find((t) => t.id === activeId);

    // Keep the active tab visible when it changes or the list grows.
    useEffect(() => {
        strip.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: "nearest", block: "nearest" });
    }, [activeId, tabs.length]);

    /** Closes `ids`; pinned tabs are skipped unless `force`. The active tab falls to its neighbour. */
    const close = (ids: string[], force = false) => {
        const gone = new Set(tabs.filter((t) => ids.includes(t.id) && (force || !t.pinned)).map((t) => t.id));
        const next = tabs.filter((t) => !gone.has(t.id));
        if (activeId && gone.has(activeId)) {
            const at = tabs.findIndex((t) => t.id === activeId);
            setActiveId(next.length === 0 ? null : next[Math.min(at, next.length - 1)].id);
        }
        setTabs(next);
    };

    const update = (id: string, patch: Partial<EditorTab>) =>
        setTabs(tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)));

    const togglePin = (id: string) => {
        const tab = tabs.find((t) => t.id === id);
        if (!tab) return;
        const next = tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned, preview: false } : t));
        // Pinned tabs first, keeping the relative order inside each group.
        setTabs([...next.filter((t) => t.pinned), ...next.filter((t) => !t.pinned)]);
    };

    const idx = active ? tabs.indexOf(active) : -1;

    return (
        <div className="flex h-10 shrink-0 border-b border-border bg-sidebar font-mono text-xs">
            <div ref={strip} role="tablist" className="flex min-w-0 flex-1 overflow-x-auto scrollbar-none">
                {tabs.map((tab) => {
                    const isActive = tab.id === activeId;
                    const Icon = tabIcon(tab);
                    return (
                        <div
                            key={tab.id}
                            role="tab"
                            aria-selected={isActive}
                            onAuxClick={(e) => e.button === 1 && close([tab.id])}
                            className={cn(
                                "flex h-full shrink-0 items-center gap-1.5 border-b-2 border-r border-r-border pl-3",
                                isActive
                                    ? "border-b-sidebar-primary bg-background text-foreground"
                                    : "border-b-transparent text-muted-foreground",
                            )}
                        >
                            <button
                                type="button"
                                className={cn("flex h-full items-center gap-1.5", tab.preview && "italic")}
                                onClick={() => setActiveId(tab.id)}
                                onDoubleClick={() => update(tab.id, { preview: false })}
                            >
                                <Icon className="size-3.5 shrink-0" />
                                <span className={cn(tab.git === "D" && "line-through")}>{tab.name}</span>
                                {tab.suffix && <span className="text-muted-foreground">{tab.suffix}</span>}
                                {tab.git && <span className={cn("font-semibold", GIT_COLOR[tab.git])}>{tab.git}</span>}
                                {tab.readOnly && <Lock aria-label="Read-only" className="size-3 shrink-0" />}
                            </button>
                            {tab.pinned ? (
                                <button
                                    type="button"
                                    aria-label={`Unpin ${tab.name}`}
                                    onClick={() => togglePin(tab.id)}
                                    className="flex size-8 items-center justify-center rounded-md active:bg-sidebar-accent [&_svg]:size-3.5"
                                >
                                    <Pin className="fill-current" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    aria-label={`Close ${tab.name}`}
                                    onClick={() => close([tab.id])}
                                    className="flex size-8 items-center justify-center rounded-md active:bg-sidebar-accent [&_svg]:size-3.5"
                                >
                                    {tab.dirty ? <span className="size-2 rounded-full bg-current" /> : <X />}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            <Menu.Root>
                <Menu.Trigger
                    aria-label="Tab actions"
                    className="flex w-10 shrink-0 items-center justify-center border-l border-border text-muted-foreground active:bg-sidebar-accent data-popup-open:bg-sidebar-accent [&_svg]:size-4"
                >
                    <Ellipsis />
                </Menu.Trigger>
                <Menu.Portal>
                    <Menu.Positioner align="end" sideOffset={4} className="z-50">
                        <Menu.Popup className="min-w-56 rounded-lg border border-sidebar-border bg-popover p-1 text-sm text-popover-foreground shadow-md outline-none">
                            <Menu.Item className={menuItem} disabled={!active} onClick={() => active && close([active.id], true)}>
                                Close
                            </Menu.Item>
                            <Menu.Item
                                className={menuItem}
                                disabled={!active}
                                onClick={() => active && close(tabs.filter((t) => t.id !== active.id).map((t) => t.id))}
                            >
                                Close Others
                            </Menu.Item>
                            <Menu.Item
                                className={menuItem}
                                disabled={idx < 0 || idx === tabs.length - 1}
                                onClick={() => close(tabs.slice(idx + 1).map((t) => t.id))}
                            >
                                Close to the Right
                            </Menu.Item>
                            <Menu.Item
                                className={menuItem}
                                disabled={tabs.length === 0}
                                onClick={() => close(tabs.filter((t) => !t.dirty).map((t) => t.id))}
                            >
                                Close Saved
                            </Menu.Item>
                            <Menu.Item
                                className={menuItem}
                                disabled={tabs.length === 0}
                                onClick={() => close(tabs.map((t) => t.id))}
                            >
                                Close All
                            </Menu.Item>
                            <Menu.Separator className="my-1 h-px bg-border" />
                            <Menu.Item className={menuItem} disabled={!active} onClick={() => active && togglePin(active.id)}>
                                {active?.pinned ? "Unpin Tab" : "Pin Tab"}
                            </Menu.Item>
                            <Menu.Item
                                className={menuItem}
                                disabled={!active}
                                onClick={() => active && navigator.clipboard?.writeText(active.name)}
                            >
                                Copy Name
                            </Menu.Item>
                        </Menu.Popup>
                    </Menu.Positioner>
                </Menu.Portal>
            </Menu.Root>
        </div>
    );
}

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
    const [active, setActive] = useState<NavTab>("files");
    const [tabs, setTabs] = useState<EditorTab[]>(MOCK_TABS);
    const [activeId, setActiveId] = useState<string | null>("route");
    const activeTab = tabs.find((t) => t.id === activeId);

    return (
        <div className="flex h-dvh snap-x snap-mandatory overflow-x-auto overscroll-x-contain bg-background text-foreground scrollbar-none">
            <nav aria-label="Primary sidebar" className="flex w-[90%] max-w-lg  shrink-0 snap-center flex-col bg-sidebar text-sidebar-foreground">
                <div
                    key={active}
                    aria-label={active}
                    data-project={project_id}
                    className="flex-1 min-h-0 overflow-y-auto"
                >
                    <header className="flex h-10 items-center justify-between gap-2 border-b border-sidebar-border px-2 text-xs">
                        <div className="flex h-10 items-center justify-between gap-1 text-xs">
                            <button
                                type="button"
                                aria-label="Select repository"
                                className="flex shrink-0 items-center gap-1.5 font-mono font-semibold text-sidebar-foreground"
                            >
                                <ChevronDown className="size-4 shrink-0" />
                                <span className="truncate">repository</span>
                            </button>
                            <span className="shrink-0 text-muted-foreground">/</span>
                            <span className="truncate font-mono">pocket-notes</span>
                            <span className="shrink-0 text-muted-foreground">/</span>
                            <button type="button" className="flex shrink-0 items-center gap-1.5 font-mono text-sidebar-foreground">
                                <GitBranch className="size-4 text-muted-foreground" />
                                main
                            </button>
                        </div>
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
            <section aria-label="Editor" className="flex min-h-0 w-full shrink-0 snap-center flex-col">
                <TabStrip tabs={tabs} setTabs={setTabs} activeId={activeId} setActiveId={setActiveId} />
                <section className="min-h-0 flex-1 overflow-auto p-3 text-sm">
                    {activeTab?.kind === "terminal" ? (
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
