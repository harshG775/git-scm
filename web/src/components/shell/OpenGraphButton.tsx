import { useSearch } from "@tanstack/react-router";
import { GitGraph } from "lucide-react";
import { activeIdOf, useFileNav } from "#/lib/use-file-nav";

/** Panel-header button that opens the commit graph as a tab. */
export function OpenGraphButton({ projectId }: { projectId: string }) {
    const active = useSearch({ from: "/p/$projectId", select: activeIdOf });
    const nav = useFileNav(projectId, active);
    return (
        <button
            type="button"
            aria-label="Open Git Graph"
            title="Open Git Graph"
            className="flex size-11 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground md:size-7"
            onClick={() => void nav.openGraph()}
        >
            <GitGraph className="size-4" />
        </button>
    );
}
