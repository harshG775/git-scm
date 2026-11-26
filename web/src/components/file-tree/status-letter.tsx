import { cn } from "#/lib/utils";

const STYLE: Record<string, string> = {
    M: "text-amber-500 bg-amber-500/15",
    T: "text-amber-500 bg-amber-500/15",
    A: "text-emerald-500 bg-emerald-500/15",
    U: "text-emerald-500 bg-emerald-500/15",
    D: "text-red-500 bg-red-500/15",
    R: "text-sky-500 bg-sky-500/15",
    C: "text-sky-500 bg-sky-500/15",
    "!": "text-red-500 bg-red-500/15",
};

const TITLE: Record<string, string> = {
    M: "Modified",
    T: "Type changed",
    A: "Added",
    U: "Untracked",
    D: "Deleted",
    R: "Renamed",
    C: "Copied",
    "!": "Conflict",
};

/** git status letter. `pill` puts it on a tinted square, like a badge. */
export function StatusLetter({ status, pill, className }: { status: string; pill?: boolean; className?: string }) {
    const style = STYLE[status] ?? "text-muted-foreground bg-muted";
    return (
        <span
            title={TITLE[status]}
            aria-label={TITLE[status] ?? status}
            className={cn(
                "shrink-0 text-xs font-medium",
                style.split(" ")[0],
                pill && cn("flex size-5 items-center justify-center rounded", style.split(" ")[1]),
                className,
            )}
        >
            {status}
        </span>
    );
}
