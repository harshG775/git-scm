import { ChevronDown } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import { cn } from "#/lib/utils";

/**
 * Every sidebar tab is a stack of these: an uppercase title with a count and optional action buttons,
 * and a body that folds away. Keeping them in one place keeps the three tabs looking the same.
 */
export function Section({
    title,
    count,
    actions,
    defaultOpen = true,
    open,
    onOpenChange,
    disabled,
    children,
}: {
    title: string;
    count?: number;
    /** icon buttons at the right edge of the header */
    actions?: React.ReactNode;
    defaultOpen?: boolean;
    /** controlled mode; pair it with `onOpenChange` */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** keeps the section open, e.g. while a search is filtering it */
    disabled?: boolean;
    children: React.ReactNode;
}) {
    return (
        <Collapsible defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange}>
            <div className="flex items-center gap-1 pr-2">
                <CollapsibleTrigger
                    disabled={disabled}
                    className="group flex min-h-11 min-w-0 flex-1 items-center gap-1 px-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase md:min-h-10"
                >
                    <ChevronDown
                        className="size-4 shrink-0 -rotate-90 transition-transform group-aria-expanded:rotate-0"
                        aria-hidden="true"
                    />
                    <span className="truncate">{title}</span>
                    {count !== undefined && (
                        <Badge variant="count" className="ml-1">
                            {count}
                        </Badge>
                    )}
                </CollapsibleTrigger>
                {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
            </div>
            <CollapsibleContent className="px-3 pb-3">{children}</CollapsibleContent>
        </Collapsible>
    );
}

/** The rounded, bordered panel that holds a section's rows; rows are divided by hairlines. */
export function SectionCard({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            className={cn(
                "overflow-hidden rounded-xl border bg-card [&>*+*]:border-t [&>[role=tree]>*+*]:border-t",
                className,
            )}
            {...props}
        />
    );
}
