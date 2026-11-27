import { X } from "lucide-react";
import type { Notice } from "#/lib/use-git-action";
import { cn } from "#/lib/utils";

/** The result of the last git action: git's own message on failure, a short confirmation on success. */
export function NoticeBar({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
    if (!notice) return null;
    return (
        <div
            role={notice.kind === "error" ? "alert" : "status"}
            className={cn(
                "mx-3 mb-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs",
                notice.kind === "error"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "bg-card text-muted-foreground",
            )}
        >
            <p className="min-w-0 flex-1 break-words whitespace-pre-wrap">{notice.text}</p>
            <button
                type="button"
                aria-label="Dismiss"
                onClick={onDismiss}
                className="shrink-0 rounded p-0.5 hover:text-foreground"
            >
                <X className="size-3.5" aria-hidden="true" />
            </button>
        </div>
    );
}
