import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { gitStatusOptions } from "#/lib/queries";

/** Header status only; pull/fetch actions live in the Changes tab. */
export function useSyncStatus(projectId: string) {
    const { data: status } = useQuery(gitStatusOptions(projectId));
    return {
        available: !!status?.isRepo,
        upstream: status?.upstream ?? "",
        ahead: status?.ahead ?? 0,
        behind: status?.behind ?? 0,
    };
}

export type SyncStatus = ReturnType<typeof useSyncStatus>;

export function SyncStatusButton({ status, onClick }: { status: SyncStatus; onClick: () => void }) {
    if (!status.available) return null;

    const label = status.upstream
        ? `Changes: ${status.behind} behind, ${status.ahead} ahead (${status.upstream})`
        : "Changes: no upstream configured";

    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        aria-label={label}
                        onClick={onClick}
                        className="h-10 w-auto gap-1 px-2 font-mono text-xs md:h-8"
                    />
                }
            >
                <GitBranch aria-hidden="true" className="size-4" />
                {status.upstream ? (
                    <span className="flex gap-1">
                        <span>↓{status.behind}</span>
                        <span>↑{status.ahead}</span>
                    </span>
                ) : (
                    <span className="font-sans">No upstream</span>
                )}
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}
