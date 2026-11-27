import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Archive,
    ArchiveRestore,
    GitCommitVertical,
    List,
    ListTree,
    Minus,
    Play,
    Plus,
    Trash2,
    Undo2,
} from "lucide-react";
import { Button } from "#/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty";
import { Input } from "#/components/ui/input";
import { NativeDialog } from "#/components/ui/native-dialog";
import { Skeleton } from "#/components/ui/skeleton";
import { FileTree, type TreeEntry, type TreeNode } from "#/components/file-tree/file-tree";
import { StatusLetter } from "#/components/file-tree/status-letter";
import { Textarea } from "#/components/ui/textarea";
import { api, type GitChange, type GitLines, type GitStash } from "#/lib/api";
import { resync } from "#/lib/live";
import { gitBranchesOptions, gitNumstatOptions, gitStashesOptions, gitStatusOptions } from "#/lib/queries";
import { timeAgo } from "#/lib/time";
import { useGitAction } from "#/lib/use-git-action";
import { cn } from "#/lib/utils";
import { ListRow } from "./ListRow";
import { Section, SectionCard } from "./Section";
import { TabHeader, TooltipIconButton } from "./TabHeader";

type ChangesView = "list" | "tree";
type ChangeFile = { path: string; status: string; added?: number; removed?: number };

const COMMIT_TYPES = ["feat", "fix", "docs", "refactor", "test", "chore"];
const TYPE_PREFIX = /^(feat|fix|docs|refactor|test|chore)(\([^)]*\))?:\s*/;

const toFiles = (changes: GitChange[], counts?: Record<string, GitLines>): ChangeFile[] =>
    changes.map(({ path, status }) => ({
        path,
        status,
        added: counts?.[path]?.added,
        removed: counts?.[path]?.removed,
    }));

// every file path at or below a tree row (a file row is just itself)
const nodePaths = (node: TreeNode<ChangeFile>): string[] =>
    node.kind === "file" ? (node.entry?.data ? [node.entry.data.path] : []) : node.children.flatMap(nodePaths);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function ChangesTab({
    projectId,
    activePath,
    onOpenFile,
}: {
    projectId: string;
    /** path of the file shown in the editor, highlighted in the lists */
    activePath?: string;
    onOpenFile: (path: string, pin?: boolean) => void;
}) {
    const status = useQuery(gitStatusOptions(projectId));
    const { data: numstat } = useQuery(gitNumstatOptions(projectId));
    const { data: branches } = useQuery(gitBranchesOptions(projectId));
    const { data: stashList } = useQuery(gitStashesOptions(projectId));
    const { run, busy } = useGitAction(projectId);
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);

    // refetch git state and the files the editor has open
    const refresh = () => {
        if (refreshing) return;
        setRefreshing(true);
        void resync(queryClient, projectId).finally(() => setRefreshing(false));
    };

    const [changesView, setChangesView] = useState<ChangesView>("list");
    const [commitMessage, setCommitMessage] = useState("");
    const [amend, setAmend] = useState(false);
    const [stashMessage, setStashMessage] = useState("");
    const [includeUntracked, setIncludeUntracked] = useState(true);
    // what a confirm dialog is asking about
    const [discarding, setDiscarding] = useState<string[] | null>(null);
    const [droppingStash, setDroppingStash] = useState<GitStash | null>(null);
    const [undoing, setUndoing] = useState(false);

    const header = (
        <TabHeader
            title="Changes"
            refresh={{ onClick: refresh, refreshing }}
            action={
                <TooltipIconButton
                    label={changesView === "tree" ? "View as list" : "View as tree"}
                    icon={changesView === "tree" ? List : ListTree}
                    onClick={() => setChangesView(changesView === "tree" ? "list" : "tree")}
                />
            }
        />
    );

    if (status.isPending) {
        return (
            <>
                {header}
                <div role="status" aria-label="Loading changes" className="space-y-3 px-3">
                    <Skeleton className="h-40 rounded-2xl" />
                    <Skeleton className="h-24 rounded-xl" />
                </div>
            </>
        );
    }
    if (status.error) {
        return (
            <>
                {header}
                <p role="alert" className="px-3 text-sm text-destructive">
                    {status.error.message}{" "}
                    <button type="button" className="underline" onClick={() => status.refetch()}>
                        Retry
                    </button>
                </p>
            </>
        );
    }
    if (!status.data.isRepo) {
        return (
            <>
                {header}
                <div className="px-3">
                    <Empty>
                        <EmptyHeader>
                            <EmptyTitle>Not a Git repository</EmptyTitle>
                            <EmptyDescription>Run git init in this folder to start tracking changes.</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                </div>
            </>
        );
    }

    const staged = toFiles(status.data.staged, numstat?.staged);
    // conflicts are listed with the changes; staging one marks it resolved
    const changed = toFiles([...status.data.conflicts, ...status.data.changes], numstat?.changes);
    const stashes = stashList?.stashes ?? [];
    const lastCommit = branches?.branches.find((b) => b.current)?.subject;

    const stage = (paths: string[]) => run(() => api.gitStage(projectId, paths));
    const unstage = (paths: string[]) => run(() => api.gitUnstage(projectId, paths));
    const confirmDiscard = () => {
        const paths = discarding;
        setDiscarding(null);
        if (paths) run(() => api.gitDiscard(projectId, paths));
    };

    const canCommit = !busy && (amend || (staged.length > 0 && commitMessage.trim() !== ""));
    // say why the button is disabled instead of leaving it dead
    const commitHint = amend
        ? "Folds the staged changes into the last commit"
        : staged.length === 0
          ? "Stage at least one change to commit"
          : commitMessage.trim() === ""
            ? "Write a commit message"
            : "";
    const submitCommit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canCommit) return;
        run(async () => {
            const { oid } = await api.gitCommit(projectId, commitMessage, amend);
            setCommitMessage("");
            setAmend(false);
            return `${amend ? "Amended" : "Committed"} ${oid}`;
        });
    };
    const confirmUndo = () => {
        setUndoing(false);
        run(async () => {
            const { message } = await api.gitUndoCommit(projectId);
            setCommitMessage(message.trim());
            return "Commit undone. Its changes are staged again.";
        });
    };
    const addCommitType = (type: string) => setCommitMessage(`${type}: ${commitMessage.replace(TYPE_PREFIX, "")}`);

    // git stashes tracked changes (staged and unstaged); untracked files only when asked
    const stashCount = new Set([
        ...staged.map((f) => f.path),
        ...changed.filter((f) => f.status !== "U" || includeUntracked).map((f) => f.path),
    ]).size;
    const submitStash = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy || stashCount === 0) return;
        run(async () => {
            await api.gitStash(projectId, stashMessage.trim(), includeUntracked);
            setStashMessage("");
            return `Stashed ${plural(stashCount, "file")}.`;
        });
    };
    const confirmDrop = () => {
        const stash = droppingStash;
        setDroppingStash(null);
        if (stash) run(() => api.gitStashDrop(projectId, stash.index, stash.oid).then(() => "Stash dropped."));
    };

    const sections = [
        {
            title: "Staged Changes",
            files: staged,
            rowActions: (paths: string[]) => (
                <RowButton label="Unstage" icon={Minus} disabled={busy} onClick={() => unstage(paths)} />
            ),
            headerActions: (
                <RowButton
                    bare
                    label="Unstage all"
                    icon={Minus}
                    disabled={busy}
                    onClick={() => unstage(staged.map((f) => f.path))}
                />
            ),
        },
        {
            title: "Changes",
            files: changed,
            rowActions: (paths: string[]) => (
                <>
                    <RowButton
                        label="Discard"
                        icon={Undo2}
                        danger
                        disabled={busy}
                        onClick={() => setDiscarding(paths)}
                    />
                    <RowButton label="Stage" icon={Plus} accent disabled={busy} onClick={() => stage(paths)} />
                </>
            ),
            headerActions: (
                <>
                    <RowButton
                        bare
                        label="Discard all"
                        icon={Undo2}
                        danger
                        disabled={busy}
                        onClick={() => setDiscarding(changed.map((f) => f.path))}
                    />
                    <RowButton
                        bare
                        label="Stage all"
                        icon={Plus}
                        accent
                        disabled={busy}
                        onClick={() => stage(changed.map((f) => f.path))}
                    />
                </>
            ),
        },
    ];

    const discardingUntracked = changed.some(({ path, status }) => discarding?.includes(path) && status === "U");

    return (
        <>
            {header}
            <section className="mx-3 mb-2 rounded-2xl border bg-card p-3">
                <form onSubmit={submitCommit} className="space-y-3">
                    <div className="scrollbar-none -mx-3 flex gap-1.5 overflow-x-auto px-3">
                        {COMMIT_TYPES.map((type) => (
                            <Button
                                key={type}
                                type="button"
                                onClick={() => addCommitType(type)}
                                variant="outline"
                                size="sm"
                                className="shrink-0 rounded-full font-mono text-xs"
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
                        placeholder={amend ? "New message (empty keeps the last one)" : "Commit message"}
                        rows={1}
                        className="max-h-24 min-h-10 md:min-h-8"
                    />
                    <Button type="submit" size="lg" disabled={!canCommit} className="w-full">
                        <GitCommitVertical className="size-4" aria-hidden="true" />
                        {amend
                            ? "Amend Last Commit"
                            : staged.length
                              ? `Commit Changes to ${plural(staged.length, "File")}`
                              : "Commit Changes"}
                    </Button>
                    {commitHint && <p className="-mt-1 text-xs text-muted-foreground">{commitHint}</p>}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <label className="flex min-h-8 items-center gap-2 text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={amend}
                                onChange={(event) => setAmend(event.target.checked)}
                                className="size-4 accent-primary"
                            />
                            Amend last commit
                        </label>
                        <Button
                            type="button"
                            disabled={busy || !lastCommit}
                            onClick={() => setUndoing(true)}
                            variant="link"
                            className="text-destructive"
                        >
                            Undo last commit
                        </Button>
                    </div>
                </form>
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
                                    <EmptyTitle>
                                        {staged.length ? "Everything is staged" : "Working tree clean"}
                                    </EmptyTitle>
                                    <EmptyDescription>
                                        {staged.length
                                            ? "Write a message and commit."
                                            : lastCommit
                                              ? `Last commit: ${lastCommit}`
                                              : "No commits yet."}
                                    </EmptyDescription>
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
                                selectedPath={activePath}
                                // a deleted file has nothing to open
                                onSelect={(entry) => entry.data?.status !== "D" && onOpenFile(entry.path)}
                                onOpen={(entry) => entry.data?.status !== "D" && onOpenFile(entry.path, true)}
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
                            <Button type="submit" size="lg" disabled={busy || stashCount === 0} className="w-full">
                                <Archive className="size-4" aria-hidden="true" />
                                Stash {plural(stashCount, "file")}
                            </Button>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="text-muted-foreground">{plural(stashCount, "file")} selected</span>
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
                            {stashes.map((stash) => (
                                <ListRow
                                    key={stash.oid}
                                    icon={Archive}
                                    title={stash.title}
                                    subtitle={`${stash.branch} · ${timeAgo(stash.time)}`}
                                >
                                    <div className="mt-2 flex gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() =>
                                                run(() =>
                                                    api
                                                        .gitStashApply(projectId, stash.index, stash.oid)
                                                        .then(() => "Stash applied. It is kept in the list."),
                                                )
                                            }
                                        >
                                            <Play aria-hidden="true" />
                                            Apply
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() =>
                                                run(() =>
                                                    api
                                                        .gitStashPop(projectId, stash.index, stash.oid)
                                                        .then(() => "Stash popped. Its changes are back in your tree."),
                                                )
                                            }
                                        >
                                            <ArchiveRestore aria-hidden="true" />
                                            Pop
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={busy}
                                            className="text-destructive"
                                            onClick={() => setDroppingStash(stash)}
                                        >
                                            <Trash2 aria-hidden="true" />
                                            Drop
                                        </Button>
                                    </div>
                                </ListRow>
                            ))}
                        </SectionCard>
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
                        Discard {plural(discarding?.length ?? 0, "file")}
                    </Button>
                </div>
            </NativeDialog>
            <NativeDialog
                open={droppingStash !== null}
                onOpenChange={(open) => !open && setDroppingStash(null)}
                title="Drop stash?"
                description={`"${droppingStash?.title ?? ""}" will be deleted. This cannot be undone.`}
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
            <NativeDialog
                open={undoing}
                onOpenChange={setUndoing}
                title="Undo last commit?"
                description={`"${lastCommit ?? ""}" is removed. Its changes come back as staged files and the message returns to the box.`}
            >
                <div className="flex justify-end gap-2 px-5 py-4">
                    <Button type="button" variant="outline" onClick={() => setUndoing(false)}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={confirmUndo}>
                        Undo commit
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
    disabled,
}: {
    label: string;
    icon: typeof Plus;
    onClick: () => void;
    danger?: boolean;
    accent?: boolean;
    /** no border, for buttons in a section header */
    bare?: boolean;
    disabled?: boolean;
}) {
    return (
        <Button
            type="button"
            variant={bare ? "ghost" : "outline"}
            size="icon"
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                !bare && "size-9",
                danger && "text-destructive",
                accent &&
                    (bare
                        ? "text-primary"
                        : "border-primary/40 bg-primary/15 text-primary dark:border-primary/40 dark:bg-primary/15"),
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
