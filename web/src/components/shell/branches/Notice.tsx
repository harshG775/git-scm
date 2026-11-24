import { X } from "lucide-react";
import { cn } from "cn";
import type { Notice as NoticeData } from "#/lib/use-git-action";

/** Result of the last git action: git's own message on failure, a short confirmation on success. */
export function Notice({ notice, onDismiss }: { notice: NoticeData | null; onDismiss: () => void }) {
    if (!notice) return null;
    return (
        <div
            role={notice.kind === "error" ? "alert" : "status"}
            className={cn(
                "flex items-start gap-2 border-b px-3 py-2 text-xs",
                notice.kind === "error" ? "bg-destructive/10 text-destructive" : "bg-muted",
            )}
        >
            <p className="max-h-32 min-w-0 flex-1 overflow-auto break-words whitespace-pre-wrap">{notice.text}</p>
            <button type="button" aria-label="Dismiss" className="shrink-0" onClick={onDismiss}>
                <X className="size-4" />
            </button>
        </div>
    );
}

export function Empty({ children }: { children: React.ReactNode }) {
    return <p className="px-3 py-3 text-sm text-muted-foreground">{children}</p>;
}

export function Heading({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {children}
        </h3>
    );
}
