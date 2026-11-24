import { Files, GitBranch, Search, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { useIsDesktop } from "#/lib/use-media-query";
import { useWorkspace, type SidebarPanel } from "#/stores/workspace";
import { Explorer } from "./Explorer";
import { SourceControl } from "./SourceControl";

export const PANELS: { id: SidebarPanel; label: string; icon: LucideIcon }[] = [
    { id: "explorer", label: "Explorer", icon: Files },
    { id: "search", label: "Search", icon: Search },
    { id: "git", label: "Source Control", icon: GitBranch },
];

/** Panel switcher: a vertical rail on desktop, a bottom nav on phones. */
export function PanelButtons({
    orientation,
    badges = {},
}: {
    orientation: "rail" | "bottom";
    /** Counts shown on a panel's icon, e.g. the number of changed files. */
    badges?: Partial<Record<SidebarPanel, number>>;
}) {
    const desktop = useIsDesktop();
    const panel = useWorkspace((s) => s.sidebarPanel);
    const open = useWorkspace((s) => (desktop ? s.sidebarOpen : s.drawerOpen));
    const selectPanel = useWorkspace((s) => s.selectPanel);

    return (
        <>
            {PANELS.map(({ id, label, icon: Icon }) => {
                const active = open && panel === id;
                return (
                    <button
                        key={id}
                        type="button"
                        aria-label={label}
                        aria-pressed={active}
                        onClick={() => selectPanel(id, desktop)}
                        className={cn(
                            "flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
                            orientation === "rail"
                                ? "size-11 border-l-2 border-transparent"
                                : "h-full flex-1 flex-col gap-0.5 border-t-2 border-transparent text-[11px]",
                            active && "border-primary text-foreground",
                        )}
                    >
                        <span className="relative">
                            <Icon className="size-5" />
                            {!!badges[id] && (
                                <span className="absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-primary-foreground">
                                    {badges[id]! > 99 ? "99+" : badges[id]}
                                </span>
                            )}
                        </span>
                        {orientation === "bottom" && label}
                    </button>
                );
            })}
        </>
    );
}

export function SidebarContent({ projectId }: { projectId: string }) {
    const panel = useWorkspace((s) => s.sidebarPanel);
    switch (panel) {
        case "explorer":
            return <Explorer projectId={projectId} />;
        case "search":
            return <Placeholder title="Search" note="Search across files is planned for M4." />;
        case "git":
            return <SourceControl projectId={projectId} />;
    }
}

function Placeholder({ title, note }: { title: string; note: string }) {
    return (
        <div className="flex h-full flex-col">
            <PanelHeader title={title} />
            <p className="p-4 text-sm text-muted-foreground">{note}</p>
        </div>
    );
}

export function PanelHeader({ title, children }: { title: string; children?: React.ReactNode }) {
    return (
        <div className="flex h-11 shrink-0 items-center justify-between px-3 md:h-9">
            <h2 className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
            {children}
        </div>
    );
}
