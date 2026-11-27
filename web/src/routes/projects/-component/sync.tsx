import { useQuery } from "@tanstack/react-query";
import { CloudUpload, RefreshCw, X } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { api } from "#/lib/api";
import { gitStatusOptions } from "#/lib/queries";
import { useGitAction } from "#/lib/use-git-action";
import { cn } from "#/lib/utils";

/** Sync like VS Code: pull (fast-forward only), then push. A branch with no upstream is published instead. */
export function useSync(projectId: string) {
    const { data: status } = useQuery(gitStatusOptions(projectId));
    const { run, busy, notice, setNotice } = useGitAction(projectId);

    const published = !!status?.upstream;
    const ahead = status?.ahead ?? 0;
    const behind = status?.behind ?? 0;

    const sync = () =>
        run(async () => {
            // a failed pull (diverged, conflicts) throws, so we never push on top of it
            if (published) await api.gitPull(projectId);
            if (!published || ahead > 0) await api.gitPush(projectId);
        });

    return {
        available: !!status?.isRepo && !status.detached,
        published,
        ahead,
        behind,
        upstream: status?.upstream ?? "",
        busy,
        error: notice?.kind === "error" ? notice.text : null,
        dismissError: () => setNotice(null),
        sync,
    };
}

export type Sync = ReturnType<typeof useSync>;

export function SyncButton({ sync }: { sync: Sync }) {
    if (!sync.available) return null;

    const label = sync.published
        ? `Sync changes: pull ${sync.behind}, push ${sync.ahead} (${sync.upstream})`
        : "Publish branch";
    const Icon = sync.published ? RefreshCw : CloudUpload;

    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        aria-label={label}
                        disabled={sync.busy}
                        onClick={sync.sync}
                        className="h-10 w-auto gap-1 px-2 font-mono text-xs md:h-8"
                    />
                }
            >
                <Icon aria-hidden="true" className={cn("size-4", sync.busy && "animate-spin")} />
                {sync.published && (sync.behind > 0 || sync.ahead > 0) && (
                    <span className="flex gap-1">
                        {sync.behind > 0 && <span>↓{sync.behind}</span>}
                        {sync.ahead > 0 && <span>↑{sync.ahead}</span>}
                    </span>
                )}
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

/** git's own message when a pull or push is refused */
export function SyncError({ sync }: { sync: Sync }) {
    if (!sync.error) return null;
    return (
        <p
            role="alert"
            className="flex items-start gap-2 border-b border-sidebar-border bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
            <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">{sync.error}</span>
            <button type="button" aria-label="Dismiss" onClick={sync.dismissError} className="shrink-0">
                <X aria-hidden="true" className="size-4" />
            </button>
        </p>
    );
}
