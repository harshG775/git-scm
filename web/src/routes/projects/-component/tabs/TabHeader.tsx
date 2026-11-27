import type { ReactNode } from "react";
import { Ellipsis, RefreshCw, type LucideIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";
import { TabProgressBar } from "./TabProgressBar";

export function TabHeader({
    title,
    action,
    leadingAction,
    refresh,
}: {
    title: string;
    action?: ReactNode;
    leadingAction?: ReactNode;
    /** A refresh button, plus a thin progress line under the header while it runs. */
    refresh?: { onClick: () => void; refreshing: boolean; label?: string; icon?: LucideIcon };
}) {
    return (
        <header className="relative flex min-h-12 items-center justify-between px-3 pr-2">
            <h2 className="text-base font-semibold">{title}</h2>
            <div className="flex items-center gap-1">
                {leadingAction}
                {refresh && (
                    <TooltipIconButton
                        label={refresh.label ?? "Refresh"}
                        icon={refresh.icon ?? RefreshCw}
                        onClick={refresh.onClick}
                        spinning={refresh.refreshing}
                        disabled={refresh.refreshing}
                    />
                )}
                {action ?? (refresh ? null : <TooltipIconButton label={`More ${title} options`} icon={Ellipsis} />)}
            </div>
            {refresh && <TabProgressBar active={refresh.refreshing} />}
        </header>
    );
}

export function TooltipIconButton({
    label,
    icon: Icon,
    onClick,
    spinning,
    disabled,
}: {
    label: string;
    icon: LucideIcon;
    onClick?: () => void;
    /** Rotate the icon, e.g. while a refresh is running. */
    spinning?: boolean;
    disabled?: boolean;
}) {
    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={label}
                        onClick={onClick}
                        disabled={disabled}
                    />
                }
            >
                <Icon aria-hidden="true" className={cn(spinning && "animate-spin")} />
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}
