import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "cn";
import { useFileNav } from "#/lib/use-file-nav";
import { useWorkspace } from "#/stores/workspace";

/** Open files: a horizontally scrolling strip that snaps tab-by-tab. */
export function TabStrip({ projectId, active }: { projectId: string; active: string | null }) {
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
                const isActive = tab.path === active;
                const dirty = tab.buffer !== undefined;
                return (
                    <div
                        key={tab.path}
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
                            title={tab.path}
                            className="h-11 max-w-48 truncate pr-1 pl-3 text-sm md:h-9"
                            onClick={() => nav.open(tab.path)}
                        >
                            {tab.path.split("/").pop()}
                        </button>
                        <button
                            type="button"
                            aria-label={`Close ${tab.path}`}
                            className="flex size-11 items-center justify-center hover:text-foreground md:size-9"
                            onClick={() => nav.close(tab.path)}
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
