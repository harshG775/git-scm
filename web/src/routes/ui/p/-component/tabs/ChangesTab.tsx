import { useState } from "react";
import { Archive, Check, ChevronDown, Ellipsis, File, Folder, GitCommitVertical } from "lucide-react";
import { Button, buttonVariants } from "#/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { TabHeader } from "./TabHeader";

type ActionTab = "commit" | "stash";
type ChangesView = "list" | "tree";
type ChangeFile = { path: string; status: string };

const STAGED_FILES: ChangeFile[] = [
    { path: "src/main.tsx", status: "M" },
    { path: "README.md", status: "M" },
];
const CHANGED_FILES: ChangeFile[] = [
    { path: "src/styles.css", status: "M" },
    { path: "web/src/routes.tsx", status: "M" },
    { path: "notes.md", status: "U" },
];
const COMMIT_TYPES = ["feat", "fix", "docs", "refactor", "test", "chore"];
const SAMPLE_STASHES = ["WIP on main: update mobile navigation", "Save editor layout experiment"];

export function ChangesTab() {
    const [activeAction, setActiveAction] = useState<ActionTab>("commit");
    const [changesView, setChangesView] = useState<ChangesView>("list");
    const [commitMessage, setCommitMessage] = useState("");
    const [stashMessage, setStashMessage] = useState("");
    const [amendLastCommit, setAmendLastCommit] = useState(false);
    const [includeUntracked, setIncludeUntracked] = useState(true);
    const [showStashes, setShowStashes] = useState(false);
    const [notice, setNotice] = useState("");
    const stashFileCount = CHANGED_FILES.filter(({ status }) => status !== "U" || includeUntracked).length;

    const submitPreview = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setNotice(
            activeAction === "commit"
                ? "Commit is a UI preview. No changes were committed."
                : "Stash is a UI preview. No files were stashed.",
        );
    };

    const addCommitType = (type: string) => {
        const message = commitMessage.replace(/^(feat|fix|docs|refactor|test|chore):\s*/, "");
        setCommitMessage(`${type}: ${message}`);
    };

    const renderFiles = (files: ChangeFile[]) => {
        if (changesView === "list") {
            return files.map(({ path, status }) => (
                <div key={path} className="flex min-h-9 items-center justify-between gap-2 text-sm">
                    <span className="truncate">{path}</span>
                    <span className="text-xs font-medium text-amber-500">{status}</span>
                </div>
            ));
        }

        const byDirectory = new Map<string, { name: string; status: string }[]>();
        for (const { path, status } of files) {
            const separator = path.lastIndexOf("/");
            const directory = separator === -1 ? "" : path.slice(0, separator);
            const name = path.slice(separator + 1);
            const entries = byDirectory.get(directory) ?? [];
            entries.push({ name, status });
            byDirectory.set(directory, entries);
        }

        return [...byDirectory].map(([directory, entries]) => (
            <div key={directory}>
                {directory && (
                    <div className="flex min-h-9 items-center gap-2 text-sm">
                        <Folder className="size-4 text-muted-foreground" aria-hidden="true" />
                        <span>{directory}</span>
                    </div>
                )}
                {entries.map(({ name, status }) => (
                    <div
                        key={`${directory}/${name}`}
                        className={`flex min-h-9 items-center justify-between gap-2 text-sm ${directory ? "pl-5" : ""}`}
                    >
                        <span className="flex min-w-0 items-center gap-2 truncate">
                            <File className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="truncate">{name}</span>
                        </span>
                        <span className="text-xs font-medium text-amber-500">{status}</span>
                    </div>
                ))}
            </div>
        ));
    };

    return (
        <div>
            <TabHeader
                title="Changes"
                action={
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            className={buttonVariants({ variant: "ghost", size: "icon" })}
                            aria-label="Change view options"
                        >
                            <Ellipsis aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setChangesView("list")}>
                                View as List
                                {changesView === "list" && <Check className="ml-auto" aria-hidden="true" />}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setChangesView("tree")}>
                                View as Tree
                                {changesView === "tree" && <Check className="ml-auto" aria-hidden="true" />}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                }
            />
            <section className="mx-2 my-2 border border-sidebar-border p-3">
                <div role="group" aria-label="Change actions" className="mb-3 flex gap-2">
                    {(["commit", "stash"] as const).map((action) => (
                        <Button
                            key={action}
                            type="button"
                            aria-pressed={activeAction === action}
                            onClick={() => {
                                setActiveAction(action);
                                setNotice("");
                            }}
                            variant={activeAction === action ? "secondary" : "ghost"}
                        >
                            {action === "commit" ? (
                                <GitCommitVertical className="size-4" aria-hidden="true" />
                            ) : (
                                <Archive className="size-4" aria-hidden="true" />
                            )}
                            <span className="capitalize">{action}</span>
                        </Button>
                    ))}
                </div>

                {activeAction === "commit" ? (
                    <form onSubmit={submitPreview} className="space-y-3">
                        <div className="flex flex-wrap gap-1.5">
                            {COMMIT_TYPES.map((type) => (
                                <Button
                                    key={type}
                                    type="button"
                                    onClick={() => addCommitType(type)}
                                    variant="outline"
                                    size="sm"
                                >
                                    {type}
                                </Button>
                            ))}
                        </div>
                        <label className="sr-only" htmlFor="commit-message">
                            Commit message
                        </label>
                        <Textarea
                            id="commit-message"
                            value={commitMessage}
                            onChange={(event) => setCommitMessage(event.target.value)}
                            placeholder="Commit message"
                            rows={2}
                        />
                        <Button
                            type="submit"
                            disabled={!commitMessage.trim() || STAGED_FILES.length === 0}
                            className="w-full"
                        >
                            <GitCommitVertical className="size-4" aria-hidden="true" />
                            Commit {STAGED_FILES.length} {STAGED_FILES.length === 1 ? "file" : "files"}
                        </Button>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <label className="flex min-h-8 items-center gap-2 text-muted-foreground">
                                <input
                                    type="checkbox"
                                    checked={amendLastCommit}
                                    onChange={(event) => setAmendLastCommit(event.target.checked)}
                                    className="size-4 accent-sidebar-primary"
                                />
                                Amend last commit
                            </label>
                            <Button
                                type="button"
                                onClick={() => setNotice("Undo last commit is a UI preview. No changes were made.")}
                                variant="link"
                                className="text-destructive"
                            >
                                Undo last commit
                            </Button>
                        </div>
                    </form>
                ) : (
                    <form onSubmit={submitPreview} className="space-y-3">
                        <label className="sr-only" htmlFor="stash-message">
                            Stash message
                        </label>
                        <Input
                            id="stash-message"
                            value={stashMessage}
                            onChange={(event) => setStashMessage(event.target.value)}
                            placeholder="Stash message (optional)"
                        />
                        <Button type="submit" disabled={stashFileCount === 0} className="w-full">
                            <Archive className="size-4" aria-hidden="true" />
                            Stash {stashFileCount} {stashFileCount === 1 ? "file" : "files"}
                        </Button>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-muted-foreground">
                                {stashFileCount} {stashFileCount === 1 ? "file" : "files"} selected
                            </span>
                            <label className="flex min-h-8 items-center gap-2 text-muted-foreground">
                                <input
                                    type="checkbox"
                                    checked={includeUntracked}
                                    onChange={(event) => setIncludeUntracked(event.target.checked)}
                                    className="size-4 accent-sidebar-primary"
                                />
                                Include untracked
                            </label>
                        </div>
                        <Button
                            type="button"
                            onClick={() => setShowStashes((current) => !current)}
                            aria-expanded={showStashes}
                            variant="link"
                        >
                            {showStashes ? "Hide stashes" : "View stashes"}
                        </Button>
                        {showStashes && (
                            <ul className="space-y-1 border-t border-sidebar-border pt-2 text-xs text-muted-foreground">
                                {SAMPLE_STASHES.map((stash) => (
                                    <li key={stash}>{stash}</li>
                                ))}
                            </ul>
                        )}
                    </form>
                )}

                {notice && (
                    <p role="status" className="mt-3 text-xs text-muted-foreground">
                        {notice}
                    </p>
                )}
            </section>

            {[
                { title: "Staged Changes", files: STAGED_FILES },
                { title: "Changes", files: CHANGED_FILES },
            ].map(({ title, files }) => (
                <Collapsible key={title} defaultOpen>
                    <section className="border-b border-sidebar-border">
                        <CollapsibleTrigger className="group flex min-h-10 w-full items-center gap-1 px-2 text-left text-sm font-medium">
                            <ChevronDown
                                className="size-4 shrink-0 -rotate-90 transition-transform group-aria-expanded:rotate-0"
                                aria-hidden="true"
                            />
                            <span>{title}</span>
                            <span className="ml-auto text-xs text-muted-foreground">{files.length}</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-3 py-2">{renderFiles(files)}</CollapsibleContent>
                    </section>
                </Collapsible>
            ))}
        </div>
    );
}
