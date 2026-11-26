import { ChevronDown, GitPullRequest } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import { TabHeader } from "./TabHeader";

const PULL_REQUESTS = [
    { title: "Add mobile sidebar navigation", status: "Review requested" },
    { title: "Improve editor tab handling", status: "Draft" },
    { title: "Update project documentation", status: "Checks passed" },
];

export function PullRequestsTab() {
    return (
        <>
            <TabHeader title="PRs" />
            <Collapsible defaultOpen className="border-b border-sidebar-border">
                <CollapsibleTrigger className="group flex min-h-10 w-full items-center gap-1 px-2 text-left text-sm font-medium">
                    <ChevronDown
                        className="size-4 shrink-0 -rotate-90 transition-transform group-aria-expanded:rotate-0"
                        aria-hidden="true"
                    />
                    <span>Pull requests</span>
                    <span className="ml-auto text-xs text-muted-foreground">{PULL_REQUESTS.length}</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 py-2">
                    {PULL_REQUESTS.map(({ title, status }) => (
                        <div key={title} className="flex items-start gap-2 border-b py-2 last:border-b-0">
                            <GitPullRequest className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                                <div className="text-sm">{title}</div>
                                <div className="text-xs text-muted-foreground">{status}</div>
                            </div>
                        </div>
                    ))}
                </CollapsibleContent>
            </Collapsible>
        </>
    );
}
