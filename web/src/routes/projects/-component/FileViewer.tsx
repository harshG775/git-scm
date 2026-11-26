import { useQuery } from "@tanstack/react-query";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { fileOptions } from "#/lib/queries";

const SKELETON_WIDTHS = ["w-2/3", "w-1/2", "w-3/4", "w-1/3", "w-3/5", "w-2/3", "w-1/2", "w-1/4"];

/** Read-only view of one project file, with line numbers. Live updates keep the cached text current. */
export function FileViewer({ projectId, path }: { projectId: string; path: string }) {
    const { data, error, isPending, refetch } = useQuery(fileOptions(projectId, path));

    if (isPending) {
        return (
            <div role="status" aria-label={`Loading ${path}`} className="space-y-2.5 py-1">
                {SKELETON_WIDTHS.map((width, i) => (
                    <Skeleton key={i} className={`h-3.5 ${width}`} />
                ))}
            </div>
        );
    }

    if (error) {
        // binary, too large, deleted... git's and the server's own message
        return (
            <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
                <p className="max-w-full text-sm break-words text-muted-foreground">{error.message}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                    Retry
                </Button>
            </div>
        );
    }

    if (data.text === "") return <p className="py-10 text-center text-sm text-muted-foreground">Empty file</p>;

    const lineCount = data.text.split("\n").length - (data.text.endsWith("\n") ? 1 : 0);
    const gutter = Array.from({ length: lineCount }, (_, i) => i + 1).join("\n");

    return (
        <div className="flex w-max min-w-full font-mono text-xs leading-5 [tab-size:4]">
            <pre
                aria-hidden="true"
                className="sticky left-0 shrink-0 bg-background pr-4 text-right text-muted-foreground select-none"
            >
                {gutter}
            </pre>
            <pre className="flex-1">{data.text}</pre>
        </div>
    );
}
