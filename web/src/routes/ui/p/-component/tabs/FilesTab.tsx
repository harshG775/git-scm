import { ChevronDown, File, Folder } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import { TabHeader } from "./TabHeader";

const FILES = [
    { name: "src", type: "folder" },
    { name: "main.tsx", type: "file" },
    { name: "styles.css", type: "file" },
    { name: "package.json", type: "file" },
    { name: "README.md", type: "file" },
] as const;

export function FilesTab() {
    return (
        <>
            <TabHeader title="Files" />
            <Collapsible defaultOpen>
                <section className="border-b border-sidebar-border">
                    <CollapsibleTrigger className="group flex min-h-10 w-full items-center gap-1 px-2 text-left text-sm font-medium">
                        <ChevronDown
                            className="size-4 shrink-0 -rotate-90 transition-transform group-aria-expanded:rotate-0"
                            aria-hidden="true"
                        />
                        <span>Project files</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-3 py-2">
                        {FILES.map(({ name, type }) => (
                            <div key={name} className="flex min-h-9 items-center gap-2 text-sm">
                                {type === "folder" ? (
                                    <Folder className="size-4 text-muted-foreground" />
                                ) : (
                                    <File className="size-4 text-muted-foreground" />
                                )}
                                <span>{name}</span>
                            </div>
                        ))}
                    </CollapsibleContent>
                </section>
            </Collapsible>
        </>
    );
}
