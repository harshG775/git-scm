import type { LucideIcon } from "lucide-react";
import { cn } from "#/lib/utils";

/**
 * One row in a section card: an icon tile, a title with a quieter line under it, a meta slot
 * (badges, counts) and action buttons. Branches and stashes share it so rows line up everywhere.
 */
export function ListRow({
    icon: Icon,
    tileClassName,
    iconClassName,
    title,
    mono,
    emphasis,
    subtitle,
    meta,
    actions,
    children,
}: {
    icon?: LucideIcon;
    /** background of the icon tile; the default is a quiet fill */
    tileClassName?: string;
    iconClassName?: string;
    title: string;
    /** set the title in the code font, for branch and tag names */
    mono?: boolean;
    emphasis?: boolean;
    subtitle?: string;
    meta?: React.ReactNode;
    actions?: React.ReactNode;
    /** extra content under the text, e.g. a row of buttons */
    children?: React.ReactNode;
}) {
    return (
        <div className={cn("flex gap-3 px-3 py-2.5", children ? "items-start" : "items-center")}>
            {Icon && (
                <span
                    className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground",
                        tileClassName,
                    )}
                >
                    <Icon className={cn("size-4", iconClassName)} aria-hidden="true" />
                </span>
            )}
            <div className="min-w-0 flex-1">
                <div
                    className={cn("truncate text-sm font-medium", mono && "font-mono", emphasis && "font-semibold")}
                    title={title}
                >
                    {title}
                </div>
                {subtitle && (
                    <div className="truncate text-xs text-muted-foreground" title={subtitle}>
                        {subtitle}
                    </div>
                )}
                {children}
            </div>
            {meta && <div className="flex shrink-0 items-center gap-2">{meta}</div>}
            {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
    );
}
