import { useState } from "react";
import {
    Archive,
    ArchiveRestore,
    Check,
    Ellipsis,
    GitCommitVertical,
    Minus,
    Play,
    Plus,
    Trash2,
    Undo2,
} from "lucide-react";
import { Button, buttonVariants } from "#/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty";
import { Input } from "#/components/ui/input";
import { NativeDialog } from "#/components/ui/native-dialog";
import { FileTree, type TreeEntry, type TreeNode } from "#/components/file-tree/file-tree";
import { StatusLetter } from "#/components/file-tree/status-letter";
import { Textarea } from "#/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";
import { ListRow } from "./ListRow";
import { Section, SectionCard } from "./Section";
import { TabHeader } from "./TabHeader";

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
const STASHES = [
    { message: "WIP on main: update mobile navigation", branch: "main", age: "10 minutes ago" },
    { message: "Save editor layout experiment", branch: "feature/editor-layout", age: "Yesterday" },
];

// every file path at or below a tree row (a file row is just itself)
const nodePaths = (node: TreeNode<ChangeFile>): string[] =>
    node.kind === "file" ? (node.entry?.data ? [node.entry.data.path] : []) : node.children.flatMap(nodePaths);

export function ChangesTab() {
    const [changesView, setChangesView] = useState<ChangesView>("list");
    const [commitMessage, setCommitMessage] = useState("");
    const [stashMessage, setStashMessage] = useState("");
    const [amendLastCommit, setAmendLastCommit] = useState(false);
    const [includeUntracked, setIncludeUntracked] = useState(true);
    const [notice, setNotice] = useState("");
    const [staged, setStaged] = useState(STAGED_FILES);
    const [changed, setChanged] = useState(CHANGED_FILES);
    // paths waiting on the discard confirmation
    const [discarding, setDiscarding] = useState<string[] | null>(null);
    const stashFileCount = changed.filter(({ status }) => status !== "U" || includeUntracked).length;

    // preview only: moves rows between the two lists, nothing touches git
    const stage = (paths: string[]) => {
        const moving = changed.filter((file) => paths.includes(file.path));
        setChanged((current) => current.filter((file) => !paths.includes(file.path)));
        setStaged((current) => [...current, ...moving]);
    };
    const unstage = (paths: string[]) => {
        const moving = staged.filter((file) => paths.includes(file.path));
        setStaged((current) => current.filter((file) => !paths.includes(file.path)));
        setChanged((current) => [...current, ...moving]);
    };
    const confirmDiscard = () => {
        if (!discarding) return;
        setChanged((current) => current.filter((file) => !discarding.includes(file.path)));
        setDiscarding(null);
        setNotice("Discard is a UI preview. No files were changed on disk.");
    };
    const [stashes, setStashes] = useState(STASHES);
    const [droppingStash, setDroppingStash] = useState<string | null>(null);
    const [stashNotice, setStashNotice] = useState("");
    // preview only: apply keeps the stash, pop and drop remove it
    const applyStash = (message: string) => setStashNotice(`Applied "${message}". UI preview, no files were changed.`);
    const popStash = (message: string) => {
        setStashes((current) => current.filter((stash) => stash.message !== message));
        setStashNotice(`Popped "${message}". UI preview, no files were changed.`);
    };
    const confirmDrop = () => {
        const message = droppingStash;
        setDroppingStash(null);
        if (!message) return;
        setStashes((current) => current.filter((stash) => stash.message !== message));
        setStashNotice(`Dropped "${message}". UI preview, nothing was deleted.`);
    };
    const discardingUntracked = changed.some(({ path, status }) => discarding?.includes(path) && status === "U");

    const submitCommit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setNotice("Commit is a UI preview. No changes were committed.");
    };

    // preview only: the stashed files leave the Changes list and a stash row appears
    const submitStash = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const message = stashMessage.trim() || "WIP on main";
        setChanged((current) => current.filter(({ status }) => status === "U" && !includeUntracked));
        setStashes((current) => [{ message, branch: "main", age: "Just now" }, ...current]);
        setStashMessage("");
        setStashNotice(
            `Stashed ${stashFileCount} ${stashFileCount === 1 ? "file" : "files"}. UI preview, nothing was saved.`,
        );
    };

    const addCommitType = (type: string) => {
        const message = commitMessage.replace(/^(feat|fix|docs|refactor|test|chore):\s*/, "");
        setCommitMessage(`${type}: ${message}`);
    };

    const sections = [
        {
            title: "Staged Changes",
            files: staged,
            // per-row and per-section buttons
            rowActions: (paths: string[]) => <RowButton label="Unstage" icon={Minus} onClick={() => unstage(paths)} />,
            headerActions: (
                <RowButton bare label="Unstage all" icon={Minus} onClick={() => unstage(staged.map((f) => f.path))} />
            ),
        },
        {
            title: "Changes",
            files: changed,
            rowActions: (paths: string[]) => (
                <>
                    <RowButton label="Discard" icon={Undo2} danger onClick={() => setDiscarding(paths)} />
                    <RowButton label="Stage" icon={Plus} accent onClick={() => stage(paths)} />
                </>
            ),
            headerActions: (
                <>
                    <RowButton
                        bare
                        label="Discard all"
                        icon={Undo2}
                        danger
                        onClick={() => setDiscarding(changed.map((f) => f.path))}
                    />
                    <RowButton
                        bare
                        label="Stage all"
                        icon={Plus}
                        accent
                        onClick={() => stage(changed.map((f) => f.path))}
                    />
                </>
            ),
        },
    ];

    return (
        <>
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
            <section className="mx-3 mb-2 rounded-2xl border bg-card p-3">
                <form onSubmit={submitCommit} className="space-y-3">
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
                        size="lg"
                        disabled={!commitMessage.trim() || staged.length === 0}
                        className="w-full"
                    >
                        <GitCommitVertical className="size-4" aria-hidden="true" />
                        Commit {staged.length} {staged.length === 1 ? "file" : "files"}
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

                {notice && (
                    <p role="status" className="mt-3 text-xs text-muted-foreground">
                        {notice}
                    </p>
                )}
            </section>

            {sections.map(({ title, files, rowActions, headerActions }) => (
                <Section key={title} title={title} count={files.length} actions={files.length > 0 && headerActions}>
                    {files.length === 0 ? (
                        title === "Staged Changes" ? (
                            <Empty>
                                <EmptyHeader>
                                    <EmptyDescription>Nothing staged. Tap + on a change to stage it.</EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        ) : (
                            <Empty>
                                <EmptyHeader>
                                    <EmptyTitle>Working tree clean</EmptyTitle>
                                    <EmptyDescription>Last commit: feat(files): open files in tabs</EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        )
                    ) : (
                        <SectionCard>
                            <FileTree<ChangeFile>
                                label={title}
                                view={changesView}
                                entries={files.map((file): TreeEntry<ChangeFile> => ({ path: file.path, data: file }))}
                                defaultOpen
                                showFolderCount
                                strongNames
                                renderMeta={({ entry }) => entry?.data && <ChangeMeta file={entry.data} />}
                                renderActions={(node) => rowActions(nodePaths(node))}
                            />
                        </SectionCard>
                    )}
                </Section>
            ))}
            <Section title="Stashes" count={stashes.length} defaultOpen={false}>
                <div className="space-y-3">
                    <SectionCard className="p-3">
                        <form onSubmit={submitStash} className="space-y-3">
                            <label className="sr-only" htmlFor="stash-message">
                                Stash message
                            </label>
                            <Input
                                id="stash-message"
                                value={stashMessage}
                                onChange={(event) => setStashMessage(event.target.value)}
                                placeholder="Stash message (optional)"
                            />
                            <Button type="submit" size="lg" disabled={stashFileCount === 0} className="w-full">
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
                                        className="size-4 accent-primary"
                                    />
                                    Include untracked
                                </label>
                            </div>
                        </form>
                    </SectionCard>
                    {stashes.length === 0 ? (
                        <Empty>
                            <EmptyHeader>
                                <EmptyTitle>No stashes</EmptyTitle>
                                <EmptyDescription>Stash your changes to save them here.</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <SectionCard>
                            {stashes.map(({ message, branch, age }) => (
                                <ListRow key={message} icon={Archive} title={message} subtitle={`${branch} · ${age}`}>
                                    <div className="mt-2 flex gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => applyStash(message)}
                                        >
                                            <Play aria-hidden="true" />
                                            Apply
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => popStash(message)}
                                        >
                                            <ArchiveRestore aria-hidden="true" />
                                            Pop
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="text-destructive"
                                            onClick={() => setDroppingStash(message)}
                                        >
                                            <Trash2 aria-hidden="true" />
                                            Drop
                                        </Button>
                                    </div>
                                </ListRow>
                            ))}
                        </SectionCard>
                    )}
                    {stashNotice && (
                        <p role="status" className="text-xs text-muted-foreground">
                            {stashNotice}
                        </p>
                    )}
                </div>
            </Section>
            <NativeDialog
                open={discarding !== null}
                onOpenChange={(open) => !open && setDiscarding(null)}
                title="Discard changes?"
                description={
                    discardingUntracked
                        ? "Untracked files will be deleted. This cannot be undone."
                        : "Your edits will be lost. This cannot be undone."
                }
            >
                <div className="flex justify-end gap-2 px-5 py-4">
                    <Button type="button" variant="outline" onClick={() => setDiscarding(null)}>
                        Cancel
                    </Button>
                    <Button type="button" variant="destructive" onClick={confirmDiscard}>
                        Discard {discarding?.length} {discarding?.length === 1 ? "file" : "files"}
                    </Button>
                </div>
            </NativeDialog>
            <NativeDialog
                open={droppingStash !== null}
                onOpenChange={(open) => !open && setDroppingStash(null)}
                title="Drop stash?"
                description={`"${droppingStash ?? ""}" will be deleted. This cannot be undone.`}
            >
                <div className="flex justify-end gap-2 px-5 py-4">
                    <Button type="button" variant="outline" onClick={() => setDroppingStash(null)}>
                        Cancel
                    </Button>
                    <Button type="button" variant="destructive" onClick={confirmDrop}>
                        Drop stash
                    </Button>
                </div>
            </NativeDialog>
        </>
    );
}

function RowButton({
    label,
    icon: Icon,
    onClick,
    danger,
    accent,
    bare,
}: {
    label: string;
    icon: typeof Plus;
    onClick: () => void;
    danger?: boolean;
    accent?: boolean;
    /** no border, for buttons in a section header */
    bare?: boolean;
}) {
    return (
        <Button
            type="button"
            variant={bare ? "ghost" : "outline"}
            size="icon-sm"
            aria-label={label}
            title={label}
            onClick={onClick}
            className={cn(
                danger && "text-destructive",
                accent && (bare ? "text-primary" : "border-primary/40 bg-primary/15 text-primary"),
            )}
        >
            <Icon aria-hidden="true" />
        </Button>
    );
}

// right side of a change row: +added -removed and the status letter
function ChangeMeta({ file: { status, added, removed } }: { file: ChangeFile }) {
    return (
        <span className="flex shrink-0 items-center gap-2 text-xs font-medium">
            {(added !== undefined || removed !== undefined) && (
                <span className="flex flex-col items-end font-mono leading-tight">
                    <span className="text-success">+{added ?? 0}</span>
                    <span className="text-destructive">-{removed ?? 0}</span>
                </span>
            )}
            <StatusLetter status={status} />
        </span>
    );
}
