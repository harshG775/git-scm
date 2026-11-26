import { ChevronDown, GitBranch } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import { TabHeader } from "./TabHeader";

const GROUPS = [
    { title: "Local", branches: ["main", "feature/mobile-sidebar", "fix/editor-tabs"] },
    { title: "Remotes", branches: ["origin/main", "origin/release"] },
];

export function BranchesTab() {
    return (
        <div>
            <TabHeader title="Branches" />
            {GROUPS.map(({ title, branches }) => (
                <Collapsible key={title} defaultOpen>
                    <section className="border-b border-sidebar-border">
                        <CollapsibleTrigger className="group flex min-h-10 w-full items-center gap-1 px-2 text-left text-sm font-medium">
                            <ChevronDown
                                className="size-4 shrink-0 -rotate-90 transition-transform group-aria-expanded:rotate-0"
                                aria-hidden="true"
                            />
                            <span>{title}</span>
                            <span className="ml-auto text-xs text-muted-foreground">{branches.length}</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-3 py-2">
                            {branches.map((branch) => (
                                <div key={branch} className="flex min-h-9 items-center gap-2 text-sm">
                                    <GitBranch className="size-4 text-muted-foreground" />
                                    <span>{branch}</span>
                                </div>
                            ))}
                        </CollapsibleContent>
                    </section>
                </Collapsible>
            ))}
        </div>
    );
}
