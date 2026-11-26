import { useEffect, useRef } from "react";
import { GitCompare, GitGraph, X } from "lucide-react";
import { cn } from "cn";
import { useFileNav } from "#/lib/use-file-nav";
import { useWorkspace } from "#/stores/workspace";

/** Open files: a horizontally scrolling strip that snaps tab-by-tab. */
export function TabStrip({ projectId, active }: { projectId: string; active: string | null }) {
    // `active` is a tab id (see Tab.id).
    const tabs = useWorkspace((s) => s.tabs);
    const nav = useFileNav(projectId, active);
    const activeRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
    }, [active]);

    if (tabs.length === 0) return null;

    return (
        <div
            role="tablist"
            className="flex shrink-0 snap-x snap-mandatory overflow-x-auto border-b bg-muted/30 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
            {tabs.map((tab) => {
                const isActive = tab.id === active;
                const label = tab.kind === "graph" ? "Git Graph" : tab.path.split("/").pop();
                const dirty = tab.buffer !== undefined;
                return (
                    <div
                        key={tab.id}
                        ref={isActive ? activeRef : undefined}
                        className={cn(
                            "flex shrink-0 snap-start items-center border-r border-t-2 border-t-transparent",
                            isActive ? "border-t-primary bg-background" : "text-muted-foreground",
                        )}
                    >
                        <button
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            title={
                                tab.kind === "diff" ? `${tab.path} (${tab.staged ? "Staged" : "Changes"})` : tab.path
                            }
                            className="flex h-11 max-w-56 items-center gap-1.5 pr-1 pl-3 text-sm md:h-9"
                            onClick={() => nav.activate(tab)}
                        >
                            {tab.kind === "diff" && <GitCompare className="size-3.5 shrink-0" />}
                            {tab.kind === "graph" && <GitGraph className="size-3.5 shrink-0" />}
                            <span className="truncate">{label}</span>
                            {tab.kind === "diff" && (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                    {tab.staged ? "Staged" : "Changes"}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            aria-label={`Close ${label}`}
                            className="flex size-11 items-center justify-center hover:text-foreground md:size-9"
                            onClick={() => nav.close(tab.id)}
                        >
                            {dirty ? (
                                <span className="size-2.5 rounded-full bg-foreground" />
                            ) : (
                                <X className="size-4" />
                            )}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
