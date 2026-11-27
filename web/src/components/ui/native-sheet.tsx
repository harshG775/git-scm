import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "#/components/ui/button";
import type { NativeDialogProps } from "#/components/ui/native-dialog";
import { cn } from "cn";

/**
 * A bottom sheet on the native <dialog> element, with the same props as NativeDialog.
 * The browser gives it the top layer, focus trapping, Escape to close and an inert page behind it.
 */
function NativeSheet({
    open,
    onOpenChange,
    title,
    description,
    children,
    className,
    closeLabel = "Close sheet",
}: NativeDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const id = useId();
    const titleId = `${id}-title`;
    const descriptionId = `${id}-description`;

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (open && !dialog.open) dialog.showModal();
        else if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog
            ref={dialogRef}
            data-slot="sheet"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            onCancel={() => onOpenChange(false)}
            onClose={() => onOpenChange(false)}
            onClick={(event) => {
                // a click on the backdrop lands on the <dialog> itself, outside its box
                if (event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                if (event.clientY < bounds.top) onOpenChange(false);
            }}
            className={cn(
                // pinned to the bottom edge, full width; slides up on open and down on close
                "fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl rounded-b-none border-x-0 border-t border-b-0 bg-background p-0 pb-[env(safe-area-inset-bottom)] text-foreground shadow-lg backdrop:bg-black/50",
                "translate-y-0 transition-[translate,display,overlay] duration-200 ease-out transition-discrete starting:translate-y-full [&:not([open])]:translate-y-full",
                className,
            )}
        >
            <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 rounded-full bg-muted-foreground/30" />
            <div data-slot="sheet-header" className="flex items-start justify-between gap-4 px-4 pt-2 pb-3">
                <div className="min-w-0">
                    <h2 id={titleId} data-slot="sheet-title" className="font-semibold">
                        {title}
                    </h2>
                    {description && (
                        <p
                            id={descriptionId}
                            data-slot="sheet-description"
                            className="mt-1 text-sm text-muted-foreground"
                        >
                            {description}
                        </p>
                    )}
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={closeLabel}
                    onClick={() => onOpenChange(false)}
                >
                    <X />
                </Button>
            </div>
            <div data-slot="sheet-content" className="border-t">
                {children}
            </div>
        </dialog>
    );
}

export { NativeSheet };
