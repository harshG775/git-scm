import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Files } from "lucide-react";
import { cn } from "cn";
import { FileView } from "#/components/shell/FileView";
import { PanelButtons, SidebarContent } from "#/components/shell/panels";
import { TabStrip } from "#/components/shell/TabStrip";
import { useLiveUpdates } from "#/lib/live";
import { projectsOptions } from "#/lib/queries";
import { useWorkspace } from "#/stores/workspace";

export const Route = createFileRoute("/p/$projectId")({
    validateSearch: (search: Record<string, unknown>): { file?: string } => ({
        file: typeof search.file === "string" && search.file ? search.file : undefined,
    }),
    component: Shell,
});

// Bottom nav height; the phone drawer stops above it so panels can be switched while it is open.
const NAV = "h-[calc(3.5rem+env(safe-area-inset-bottom))]";

function Shell() {
    const { projectId } = Route.useParams();
    const { file } = Route.useSearch();
    const { data: projects, isSuccess } = useQuery(projectsOptions);
    const project = projects?.find((p) => p.id === projectId);

    const enterProject = useWorkspace((s) => s.enterProject);
    const openFile = useWorkspace((s) => s.openFile);
    const sidebarOpen = useWorkspace((s) => s.sidebarOpen);
    const drawerOpen = useWorkspace((s) => s.drawerOpen);
    const closeDrawer = useWorkspace((s) => s.closeDrawer);
    const selectPanel = useWorkspace((s) => s.selectPanel);
    const live = useLiveUpdates(projectId);

    useEffect(() => enterProject(projectId), [projectId, enterProject]);
    // A deep link or reload with ?file= should also have a tab.
    useEffect(() => {
        if (file) openFile(file);
    }, [file, openFile]);

    if (isSuccess && !project) return <Navigate to="/" />;

    return (
        <div className="flex h-dvh flex-col bg-background md:flex-row">
            {/* Desktop: activity rail + sidebar column */}
            <nav className="hidden w-12 shrink-0 flex-col items-center border-r bg-sidebar py-1 md:flex">
                <PanelButtons orientation="rail" />
                <LiveDot live={live} className="mt-auto mb-3" />
            </nav>
            {sidebarOpen && (
                <aside className="hidden w-64 shrink-0 border-r bg-sidebar md:block">
                    <SidebarContent projectId={projectId} />
                </aside>
            )}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {/* Phone header */}
                <header className="flex shrink-0 items-center border-b pt-[env(safe-area-inset-top)] md:hidden">
                    <Link to="/" aria-label="Projects" className="flex size-11 items-center justify-center">
                        <ArrowLeft className="size-5" />
                    </Link>
                    <button
                        type="button"
                        className="flex h-11 min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => selectPanel("explorer", false)}
                    >
                        <Files className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">{project?.name ?? "…"}</span>
                    </button>
                    <LiveDot live={live} className="mr-4" />
                </header>

                <TabStrip projectId={projectId} active={file ?? null} />

                <main className="min-h-0 flex-1">
                    {file ? (
                        <FileView projectId={projectId} path={file} />
                    ) : (
                        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                            Pick a file from the Explorer to start.
                        </div>
                    )}
                </main>

                {/* Phone bottom nav */}
                <nav
                    className={cn(
                        "relative z-50 flex shrink-0 border-t bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden",
                        NAV,
                    )}
                >
                    <PanelButtons orientation="bottom" />
                </nav>
            </div>

            {/* Phone drawer */}
            <div
                aria-hidden={!drawerOpen}
                data-open={drawerOpen}
                className="invisible fixed inset-x-0 top-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 transition-[visibility] duration-200 data-[open=true]:visible md:hidden"
            >
                <div
                    className="absolute inset-0 bg-black/50 opacity-0 transition-opacity duration-200 [[data-open=true]_&]:opacity-100"
                    onClick={closeDrawer}
                />
                <aside className="absolute inset-y-0 left-0 w-[85%] max-w-sm -translate-x-full border-r bg-sidebar pt-[env(safe-area-inset-top)] transition-transform duration-200 [[data-open=true]_&]:translate-x-0">
                    <SidebarContent projectId={projectId} />
                </aside>
            </div>
        </div>
    );
}

/** Green while the event stream is connected, i.e. outside edits show up on their own. */
function LiveDot({ live, className }: { live: boolean; className?: string }) {
    return (
        <span
            role="status"
            aria-label={live ? "Live updates on" : "Live updates off"}
            title={live ? "Live updates on" : "Reconnecting…"}
            className={cn("size-2 shrink-0 rounded-full", live ? "bg-green-500" : "bg-muted-foreground/50", className)}
        />
    );
}
