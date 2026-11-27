import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, FolderGit2, FolderOpen, GitBranch, Settings } from "lucide-react";
import { Button } from "#/components/ui/button";
import { ResponsiveDialog } from "#/components/ui/responsive-dialog";
import { projectsOptions } from "#/lib/queries";

/**
 * The repository sheet: which repository is open and switching to another recent one. A sheet on
 * the phone layout, a dialog on desktop.
 */
export function RepoMenu({
    projectId,
    projectName,
    projectPath,
    head,
    detached,
    isRepo,
    open,
    onOpenChange,
    onSwitchBranch,
}: {
    projectId: string;
    projectName?: string;
    projectPath?: string;
    head?: string;
    detached?: boolean;
    isRepo?: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSwitchBranch: () => void;
}) {
    const { data: projects } = useQuery(projectsOptions);
    const navigate = useNavigate();
    const others = projects?.filter((project) => project.id !== projectId) ?? [];

    const go = (id: string) => {
        onOpenChange(false);
        if (id !== projectId) void navigate({ to: "/projects/$project_id", params: { project_id: id } });
    };
    const switchBranch = () => {
        onOpenChange(false);
        onSwitchBranch();
    };
    const openSettings = () => {
        onOpenChange(false);
        void navigate({ to: "/projects/$project_id/settings", params: { project_id: projectId } });
    };

    return (
        <ResponsiveDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Repository"
            description={projectPath && <span className="block truncate font-mono">{projectPath}</span>}
            closeLabel="Close repository menu"
        >
            <div className="flex flex-col p-2">
                <div className="rounded-xl border bg-card p-3">
                    <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                            <FolderGit2 className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{projectName ?? "Repository"}</div>
                            {projectPath && (
                                <div className="truncate font-mono text-xs text-muted-foreground">{projectPath}</div>
                            )}
                        </div>
                        <Check className="size-4 shrink-0 text-primary" aria-label="Current repository" />
                    </div>
                    {head !== undefined && (
                        <div className="mt-3 flex min-w-0 items-center gap-1.5 border-t pt-2 text-xs">
                            <GitBranch className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className={detached ? "truncate italic" : "truncate"}>
                                {head || "No commits yet"}
                            </span>
                        </div>
                    )}
                </div>

                {isRepo && (
                    <Button
                        type="button"
                        variant="ghost"
                        className="mt-2 h-12 justify-start gap-3 px-3 text-base md:h-9 md:text-sm"
                        onClick={switchBranch}
                    >
                        <GitBranch className="size-5 md:size-4" aria-hidden="true" />
                        Switch branch
                    </Button>
                )}

                <p className="px-3 pt-4 pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Change repository
                </p>
                <div className="flex flex-col">
                    {others.map((project) => (
                        <button
                            key={project.id}
                            type="button"
                            className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors hover:bg-muted"
                            onClick={() => go(project.id)}
                        >
                            <FolderGit2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">{project.name}</span>
                                <span className="block truncate font-mono text-xs text-muted-foreground">
                                    {project.path}
                                </span>
                            </span>
                        </button>
                    ))}
                    <button
                        type="button"
                        className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors hover:bg-muted"
                        onClick={() => {
                            onOpenChange(false);
                            void navigate({ to: "/" });
                        }}
                    >
                        <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="text-sm font-medium">Open another folder…</span>
                    </button>
                </div>

                {isRepo && (
                    <>
                        <div role="separator" className="mx-2 my-1 border-t" />
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-12 justify-start gap-3 px-3 text-base md:h-9 md:text-sm"
                            onClick={openSettings}
                        >
                            <Settings className="size-5 md:size-4" aria-hidden="true" />
                            Repository settings
                        </Button>
                    </>
                )}
            </div>
        </ResponsiveDialog>
    );
}
