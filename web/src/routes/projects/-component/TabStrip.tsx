import { Ellipsis, FileCode, FileText, GitGraph, Lock, Pin, SquareTerminal, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "#/lib/utils";
import { buttonVariants } from "#/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
export type GitLetter = "M" | "A" | "U" | "D";

export interface EditorTab {
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
    /** Project-relative path of a real file; tabs without one are mock content. */
    path?: string;
    /** Defaults to a file. A terminal tab has no git status and shows a shell instead of code. */
    kind?: "file" | "terminal" | "graph";
}

const GIT_COLOR: Record<GitLetter, string> = {
    M: "text-sidebar-primary",
    A: "text-sidebar-primary",
    U: "text-sidebar-primary",
    D: "text-destructive",
};

const tabIcon = (tab: EditorTab) =>
    tab.kind === "graph"
        ? GitGraph
        : tab.kind === "terminal"
          ? SquareTerminal
          : /\.(tsx?|jsx?|css|json|go)$/.test(tab.name)
            ? FileCode
            : FileText;

export function TabStrip({
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

    // Keep the active tab visible when it changes or the list grows. Only the strip is scrolled:
    // scrollIntoView also scrolls every ancestor, and on a phone that includes the panel slider,
    // which then fights the slide to the editor and stops half-way between the two panels.
    useEffect(() => {
        const bar = strip.current;
        const tab = bar?.querySelector('[aria-selected="true"]');
        if (!bar || !tab) return;
        const barBox = bar.getBoundingClientRect();
        const tabBox = tab.getBoundingClientRect();
        if (tabBox.left < barBox.left) bar.scrollLeft += tabBox.left - barBox.left;
        else if (tabBox.right > barBox.right) bar.scrollLeft += tabBox.right - barBox.right;
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
        <>
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

            <DropdownMenu>
                <DropdownMenuTrigger
                    type="button"
                    aria-label="Tab actions"
                    className={cn(
                        buttonVariants({ variant: "ghost", size: "icon" }),
                        "h-full w-10 shrink-0 rounded-none border-l border-border text-muted-foreground data-popup-open:bg-sidebar-accent",
                    )}
                >
                    <Ellipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-56">
                    <DropdownMenuItem disabled={!active} onClick={() => active && close([active.id], true)}>
                        Close
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={!active}
                        onClick={() => active && close(tabs.filter((t) => t.id !== active.id).map((t) => t.id))}
                    >
                        Close Others
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={idx < 0 || idx === tabs.length - 1}
                        onClick={() => close(tabs.slice(idx + 1).map((t) => t.id))}
                    >
                        Close to the Right
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={tabs.length === 0}
                        onClick={() => close(tabs.filter((t) => !t.dirty).map((t) => t.id))}
                    >
                        Close Saved
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={tabs.length === 0} onClick={() => close(tabs.map((t) => t.id))}>
                        Close All
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={!active} onClick={() => active && togglePin(active.id)}>
                        {active?.pinned ? "Unpin Tab" : "Pin Tab"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={!active}
                        onClick={() => active && navigator.clipboard?.writeText(active.name)}
                    >
                        Copy Name
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
}
