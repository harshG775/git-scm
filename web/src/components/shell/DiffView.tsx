import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { cn } from "cn";
import { Button } from "#/components/ui/button";
import { parseDiff, type DiffLineKind } from "#/lib/diff";
import { gitDiffOptions } from "#/lib/queries";
import { useFileNav } from "#/lib/use-file-nav";
import { diffId } from "#/stores/workspace";

const MAX_LINES = 5000;

const LINE: Record<DiffLineKind, string> = {
    meta: "text-muted-foreground",
    hunk: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    add: "bg-green-500/15 text-green-800 dark:text-green-300",
    del: "bg-red-500/15 text-red-800 dark:text-red-300",
    context: "",
};

export function DiffView({ projectId, path, staged }: { projectId: string; path: string; staged: boolean }) {
    const { data, error, isPending } = useQuery(gitDiffOptions(projectId, path, staged));
    const nav = useFileNav(projectId, diffId(path, staged));

    const lines = data ? parseDiff(data) : [];
    const shown = lines.slice(0, MAX_LINES);

    return (
        <div className="flex h-full flex-col">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3 md:h-9">
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {path} <span className="text-foreground">({staged ? "Staged" : "Working tree"})</span>
                </span>
                <Button size="sm" variant="outline" onClick={() => nav.open(path)}>
                    <FileText /> Open file
                </Button>
            </div>

            {isPending ? (
                <Message>Loading…</Message>
            ) : error ? (
                <Message>{error.message}</Message>
            ) : lines.length === 0 ? (
                <Message>No changes.</Message>
            ) : (
                <div className="min-h-0 flex-1 overflow-auto font-mono text-xs leading-relaxed">
                    <div className="w-max min-w-full">
                        {shown.map((line, i) => (
                            <div key={i} className={cn("px-3 whitespace-pre", LINE[line.kind])}>
                                {line.text || " "}
                            </div>
                        ))}
                        {lines.length > shown.length && (
                            <div className="px-3 py-2 text-muted-foreground">
                                … {lines.length - shown.length} more lines not shown
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function Message({ children }: { children: React.ReactNode }) {
    return <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">{children}</div>;
}
