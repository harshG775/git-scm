import { useEffect, useState } from "react";
import { Bell, BellOff, CircleCheck, Info, OctagonX, Trash2, X, type LucideIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty";
import { ResponsiveDialog } from "#/components/ui/responsive-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { timeAgo } from "#/lib/time";
import { cn } from "#/lib/utils";
import { useNotifications, type NotificationType } from "#/stores/notifications";

const ICONS: Record<NotificationType, { icon: LucideIcon; className: string }> = {
    success: { icon: CircleCheck, className: "text-success" },
    error: { icon: OctagonX, className: "text-destructive" },
    info: { icon: Info, className: "text-info" },
};

/**
 * The bell and the list behind it, like VS Code's: everything the app told you stays here after
 * its toast is gone, survives a reload, and can be cleared one by one or all at once.
 */
export function NotificationCenter() {
    const items = useNotifications((s) => s.items);
    const doNotDisturb = useNotifications((s) => s.doNotDisturb);
    const { markAllRead, remove, clear, toggleDoNotDisturb } = useNotifications.getState();
    const [open, setOpen] = useState(false);
    const unread = items.filter((i) => !i.read).length;

    // whatever arrives while the list is open is being read
    useEffect(() => {
        if (open && unread > 0) markAllRead();
    }, [open, unread, markAllRead]);

    const label = unread > 0 ? `Notifications, ${unread} new` : "Notifications";
    const BellIcon = doNotDisturb ? BellOff : Bell;

    return (
        <>
            <Tooltip>
                <TooltipTrigger
                    render={
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={label}
                            onClick={() => setOpen(true)}
                            className="relative"
                        />
                    }
                >
                    <BellIcon aria-hidden="true" className="size-4" />
                    {unread > 0 && (
                        <span className="absolute top-1 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground md:top-0.5 md:right-0">
                            {unread > 9 ? "9+" : unread}
                        </span>
                    )}
                </TooltipTrigger>
                <TooltipContent>{doNotDisturb ? `${label} (do not disturb)` : label}</TooltipContent>
            </Tooltip>

            <ResponsiveDialog open={open} onOpenChange={setOpen} title="Notifications" closeLabel="Close notifications">
                <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-pressed={doNotDisturb}
                        onClick={toggleDoNotDisturb}
                    >
                        <BellOff aria-hidden="true" />
                        Do not disturb{doNotDisturb ? ": on" : ""}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={items.length === 0} onClick={clear}>
                        <Trash2 aria-hidden="true" />
                        Clear all
                    </Button>
                </div>
                {items.length === 0 ? (
                    <div className="p-4">
                        <Empty>
                            <EmptyHeader>
                                <EmptyTitle>No new notifications</EmptyTitle>
                                <EmptyDescription>What git actions report will be kept here.</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    </div>
                ) : (
                    <ul className="max-h-[60dvh] divide-y overflow-y-auto">
                        {items.map(({ id, type, title, description, time }) => {
                            const { icon: Icon, className } = ICONS[type];
                            return (
                                <li key={id} className="flex items-start gap-3 px-4 py-3">
                                    <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", className)} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium break-words">{title}</p>
                                        {description && (
                                            <p className="mt-0.5 text-xs break-words whitespace-pre-wrap text-muted-foreground">
                                                {description}
                                            </p>
                                        )}
                                        <p className="mt-1 text-xs text-muted-foreground">{timeAgo(time / 1000)}</p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Dismiss notification"
                                        onClick={() => remove(id)}
                                        className="-my-1 -mr-2 shrink-0"
                                    >
                                        <X aria-hidden="true" className="size-4" />
                                    </Button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </ResponsiveDialog>
        </>
    );
}
