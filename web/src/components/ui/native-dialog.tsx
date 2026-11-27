import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "#/components/ui/button";
import { cn } from "cn";

export interface NativeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: React.ReactNode;
    description?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    closeLabel?: string;
}

function NativeDialog({
    open,
    onOpenChange,
    title,
    description,
    children,
    className,
    closeLabel = "Close dialog",
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
            data-slot="dialog"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            onCancel={() => onOpenChange(false)}
            onClose={() => onOpenChange(false)}
            onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                if (
                    event.clientX < bounds.left ||
                    event.clientX > bounds.right ||
                    event.clientY < bounds.top ||
                    event.clientY > bounds.bottom
                ) {
                    onOpenChange(false);
                }
            }}
            className={cn(
                "fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/50",
                className,
            )}
        >
            <div data-slot="dialog-header" className="flex items-start justify-between gap-4 border-b px-5 py-4">
                <div className="min-w-0">
                    <h2 id={titleId} data-slot="dialog-title" className="font-semibold">
                        {title}
                    </h2>
                    {description && (
                        <p
                            id={descriptionId}
                            data-slot="dialog-description"
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
            <div data-slot="dialog-content">{children}</div>
        </dialog>
    );
}

export { NativeDialog };
