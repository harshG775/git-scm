import { Archive, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import { TabHeader } from "./TabHeader";

const STASHES = [
    { message: "WIP on main: update mobile navigation", branch: "main", age: "10 minutes ago" },
    { message: "Save editor layout experiment", branch: "feature/editor-layout", age: "Yesterday" },
];

export function StashTab() {
    return (
        <>
            <TabHeader title="Stash" />
            <Collapsible defaultOpen>
                <section className="border-b border-sidebar-border">
                    <CollapsibleTrigger className="group flex min-h-10 w-full items-center gap-1 px-2 text-left text-sm font-medium">
                        <ChevronDown
                            className="size-4 shrink-0 -rotate-90 transition-transform group-aria-expanded:rotate-0"
                            aria-hidden="true"
                        />
                        <span>Saved changes</span>
                        <span className="ml-auto text-xs text-muted-foreground">{STASHES.length}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-3 py-2">
                        {STASHES.map(({ message, branch, age }) => (
                            <div key={message} className="flex items-start gap-2 border-b py-2 last:border-b-0">
                                <Archive className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0">
                                    <div className="text-sm">{message}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {branch} · {age}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </CollapsibleContent>
                </section>
            </Collapsible>
        </>
    );
}
