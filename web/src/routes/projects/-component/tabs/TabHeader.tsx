import type { ReactNode } from "react";
import { Ellipsis, type LucideIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";

export function TabHeader({
    title,
    action,
    leadingAction,
}: {
    title: string;
    action?: ReactNode;
    leadingAction?: ReactNode;
}) {
    return (
        <header className="flex min-h-12 items-center justify-between px-3 pr-2">
            <h2 className="text-base font-semibold">{title}</h2>
            <div className="flex items-center gap-1">
                {leadingAction}
                {action ?? <TooltipIconButton label={`More ${title} options`} icon={Ellipsis} />}
            </div>
        </header>
    );
}

export function TooltipIconButton({
    label,
    icon: Icon,
    onClick,
}: {
    label: string;
    icon: LucideIcon;
    onClick?: () => void;
}) {
    return (
        <Tooltip>
            <TooltipTrigger
                render={<Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick} />}
            >
                <Icon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}
