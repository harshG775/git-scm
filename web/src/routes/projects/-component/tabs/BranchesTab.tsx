import { useState } from "react";
import { ChevronDown, GitBranch, Search, Tag, GitGraph } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import { Input } from "#/components/ui/input";
import { TabHeader, TooltipIconButton } from "./TabHeader";

const GROUPS = [
    { title: "Local", items: ["main", "feature/mobile-sidebar", "fix/editor-tabs"], icon: GitBranch },
    { title: "Remotes", items: ["origin/main", "origin/release"], icon: GitBranch },
    { title: "Tags", items: ["v1.1.0", "v1.0.0"], icon: Tag },
];

export function BranchesTab({ onOpenGraph }: { onOpenGraph: () => void }) {
    const [query, setQuery] = useState("");
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
        Local: true,
        Remotes: true,
        Tags: false,
    });
    const search = query.trim().toLocaleLowerCase();
    const filteredGroups = GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => item.toLocaleLowerCase().includes(search)),
    })).filter(({ items }) => !search || items.length > 0);

    return (
        <>
            <TabHeader
                title="Branches"
                leadingAction={<TooltipIconButton label="Open Git Graph" icon={GitGraph} onClick={onOpenGraph} />}
            />
            <div className="relative px-2 py-2">
                <label htmlFor="branch-search" className="sr-only">
                    Search branches, remotes, and tags
                </label>
                <Search
                    className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                />
                <Input
                    id="branch-search"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search branches and tags"
                    className="pl-9"
                />
            </div>
            {filteredGroups.map(({ title, items, icon: Icon }) => (
                <Collapsible
                    key={title}
                    open={search ? true : openGroups[title]}
                    onOpenChange={(open) => setOpenGroups((current) => ({ ...current, [title]: open }))}
                    className="border-b border-sidebar-border"
                >
                    <CollapsibleTrigger
                        disabled={Boolean(search)}
                        className="group flex min-h-10 w-full items-center gap-1 px-2 text-left text-sm font-medium"
                    >
                        <ChevronDown
                            className="size-4 shrink-0 -rotate-90 transition-transform group-aria-expanded:rotate-0"
                            aria-hidden="true"
                        />
                        <span>{title}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-3 py-2">
                        {items.map((item) => (
                            <div key={item} className="flex min-h-9 items-center gap-2 text-sm">
                                <Icon className="size-4 text-muted-foreground" />
                                <span>{item}</span>
                            </div>
                        ))}
                    </CollapsibleContent>
                </Collapsible>
            ))}
            {search && filteredGroups.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">No matching branches, remotes, or tags.</p>
            )}
        </>
    );
}
