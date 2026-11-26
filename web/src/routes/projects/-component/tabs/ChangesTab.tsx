import { useState } from "react";
import { Archive, Check, ChevronDown, Ellipsis, GitCommitVertical } from "lucide-react";
import { Button, buttonVariants } from "#/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { FileTree, type TreeEntry } from "#/components/file-tree/file-tree";
import { StatusLetter } from "#/components/file-tree/status-letter";
import { Textarea } from "#/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { TabHeader } from "./TabHeader";

type ActionTab = "commit" | "stash";
type ChangesView = "list" | "tree";
type ChangeFile = { path: string; status: string; added?: number; removed?: number };

const STAGED_FILES: ChangeFile[] = [
    { path: "src/main.tsx", status: "M", added: 4, removed: 2 },
    { path: "README.md", status: "M", added: 1, removed: 1 },
];
const CHANGED_FILES: ChangeFile[] = [
    { path: "src/styles.css", status: "M", added: 2, removed: 1 },
    { path: "web/src/routes.tsx", status: "M", added: 6, removed: 3 },
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

    const renderFiles = (title: string, files: ChangeFile[]) => (
        <FileTree<ChangeFile>
            label={title}
            view={changesView}
            entries={files.map((file): TreeEntry<ChangeFile> => ({ path: file.path, data: file }))}
            defaultOpen
            showFolderCount
            renderMeta={({ entry }) => entry?.data && <ChangeMeta file={entry.data} />}
        />
    );

    return (
        <div>
            <TabHeader
                title="Changes"
                action={
                    <DropdownMenu>
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <DropdownMenuTrigger
                                        className={buttonVariants({ variant: "ghost", size: "icon" })}
                                        aria-label="Change view options"
                                    />
                                }
                            >
                                <Ellipsis aria-hidden="true" />
                            </TooltipTrigger>
                            <TooltipContent>Change view options</TooltipContent>
                        </Tooltip>
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
                        <CollapsibleContent>{renderFiles(title, files)}</CollapsibleContent>
                    </section>
                </Collapsible>
            ))}
        </div>
    );
}

// right side of a change row: +added -removed and the status letter
function ChangeMeta({ file: { status, added, removed } }: { file: ChangeFile }) {
    return (
        <span className="flex shrink-0 items-center gap-2 text-xs font-medium">
            {(added !== undefined || removed !== undefined) && (
                <span className="flex flex-col items-end font-mono leading-tight">
                    <span className="text-emerald-500">+{added ?? 0}</span>
                    <span className="text-red-500">-{removed ?? 0}</span>
                </span>
            )}
            <StatusLetter status={status} />
        </span>
    );
}
