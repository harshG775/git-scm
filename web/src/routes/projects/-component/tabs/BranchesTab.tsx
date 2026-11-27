import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    ArrowDown,
    ArrowDownToLine,
    ArrowUp,
    ArrowUpFromLine,
    Check,
    Cloud,
    Copy,
    Ellipsis,
    GitBranch,
    GitBranchPlus,
    GitGraph,
    GitMerge,
    Pencil,
    Plus,
    RefreshCw,
    Tag,
    Trash2,
    type LucideIcon,
} from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty";
import { Input } from "#/components/ui/input";
import { ResponsiveDialog } from "#/components/ui/responsive-dialog";
import { Skeleton } from "#/components/ui/skeleton";
import { toast } from "#/components/ui/toast";
import { api } from "#/lib/api";
import { gitBranchesOptions, gitRemotesOptions, gitTagsOptions } from "#/lib/queries";
import { useGitAction } from "#/lib/use-git-action";
import { cn } from "#/lib/utils";
import { ListRow } from "./ListRow";
import { SearchField } from "./SearchField";
import { Section, SectionCard } from "./Section";
import { TabHeader, TooltipIconButton } from "./TabHeader";

type RefKind = "current" | "local" | "merged" | "remote" | "tag";
type Ref = {
    /** what git calls it: "feature/x", "origin/feature/x" or "v1.0" */
    name: string;
    kind: RefKind;
    /** last commit subject, or the tag message */
    subject: string;
    /** remote branch: a local branch of the same name exists, so checkout switches to it */
    local?: string;
    /** remote branch that no local branch tracks yet */
    remoteOnly?: boolean;
    /** commits ahead of upstream, waiting to be pushed */
    ahead?: number;
    /** commits behind upstream, waiting to be pulled */
    behind?: number;
    hash?: string;
};

// the icon says what kind of ref a row is; the checked-out branch gets a filled tile
const REF_ICONS: Record<RefKind, { icon: LucideIcon; tile?: string; className?: string }> = {
    current: { icon: GitBranch, tile: "bg-primary text-primary-foreground" },
    local: { icon: GitBranch },
    merged: { icon: GitMerge, className: "text-info" },
    remote: { icon: Cloud },
    tag: { icon: Tag, className: "text-warning" },
};

type ActionId = "checkout" | "merge" | "pull" | "push" | "push-tag" | "create" | "rename" | "copy" | "delete";
type RefAction = { id: ActionId; label: string; icon: LucideIcon; danger?: boolean };

// options in a row's bottom sheet; destructive ones sit below a divider
const checkout: RefAction = { id: "checkout", label: "Checkout", icon: Check };
const mergeInto: RefAction = { id: "merge", label: "Merge into current", icon: GitMerge };
const createFrom: RefAction = { id: "create", label: "Create branch from here", icon: GitBranchPlus };
const copyName: RefAction = { id: "copy", label: "Copy name", icon: Copy };
const rename: RefAction = { id: "rename", label: "Rename", icon: Pencil };
const remove = (label: string): RefAction => ({ id: "delete", label, icon: Trash2, danger: true });

const REF_ACTIONS: Record<RefKind, RefAction[]> = {
    current: [
        { id: "pull", label: "Pull", icon: ArrowDownToLine },
        { id: "push", label: "Push", icon: ArrowUpFromLine },
        createFrom,
        rename,
        copyName,
    ],
    local: [checkout, mergeInto, createFrom, rename, copyName, remove("Delete branch")],
    merged: [checkout, createFrom, rename, copyName, remove("Delete branch")],
    remote: [checkout, mergeInto, createFrom, copyName, remove("Delete remote branch")],
    // no checkout: that would detach HEAD; "create branch from here" is the way to work on a tag
    tag: [createFrom, { id: "push-tag", label: "Push tag", icon: ArrowUpFromLine }, copyName, remove("Delete tag")],
};

function RefRow({ item, onMenu }: { item: Ref; onMenu: (item: Ref) => void }) {
    const { name, kind, subject, remoteOnly, ahead, behind, hash } = item;
    const { icon, tile, className } = REF_ICONS[kind];
    return (
        <ListRow
            icon={icon}
            tileClassName={tile}
            iconClassName={className}
            title={name}
            mono
            emphasis={kind === "current"}
            subtitle={subject}
            meta={
                <>
                    {behind ? (
                        <span
                            className="flex items-center font-mono text-xs font-semibold text-warning"
                            title={`${behind} to pull`}
                        >
                            <ArrowDown className="size-3.5" aria-label="behind" />
                            {behind}
                        </span>
                    ) : null}
                    {ahead ? (
                        <span
                            className="flex items-center font-mono text-xs font-semibold text-success"
                            title={`${ahead} to push`}
                        >
                            <ArrowUp className="size-3.5" aria-label="ahead" />
                            {ahead}
                        </span>
                    ) : null}
                    {kind === "merged" && <Badge variant="secondary">merged</Badge>}
                    {kind === "remote" && (
                        <Badge variant={remoteOnly ? "secondary" : "info"}>
                            {remoteOnly ? "remote only" : "tracked"}
                        </Badge>
                    )}
                    {hash && <span className="font-mono text-xs text-muted-foreground">{hash}</span>}
                </>
            }
            actions={
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Options for ${name}`}
                    onClick={() => onMenu(item)}
                >
                    <Ellipsis aria-hidden="true" />
                </Button>
            }
        />
    );
}

// a row's options: a bottom sheet on the phone layout, a dialog on the desktop layout
function RefMenu({
    item,
    open,
    onOpenChange,
    onAction,
}: {
    item: Ref | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAction: (id: ActionId) => void;
}) {
    const actions = item ? REF_ACTIONS[item.kind] : [];
    const firstDanger = actions.findIndex((action) => action.danger);
    return (
        <ResponsiveDialog
            open={open}
            onOpenChange={onOpenChange}
            title={<span className="block truncate font-mono">{item?.name}</span>}
            description={<span className="block truncate">{item?.subject}</span>}
            closeLabel="Close options"
        >
            <div className="flex flex-col p-2">
                {actions.map((action, index) => (
                    <Fragment key={action.id}>
                        {index === firstDanger && <div role="separator" className="mx-2 my-1 border-t" />}
                        <Button
                            type="button"
                            variant="ghost"
                            className={cn(
                                "h-12 justify-start gap-3 px-3 text-base md:h-9 md:text-sm",
                                action.danger && "text-destructive hover:text-destructive",
                            )}
                            onClick={() => onAction(action.id)}
                        >
                            <action.icon className="size-5 md:size-4" aria-hidden="true" />
                            {action.label}
                        </Button>
                    </Fragment>
                ))}
            </div>
        </ResponsiveDialog>
    );
}

/** `item` is null for "new branch" from the header: it starts at HEAD. */
type RefDialogState = { id: "create" | "rename" | "delete"; item: Ref | null };

// for the actions that need input or a confirmation: a sheet on the phone layout, a dialog on the desktop layout
function RefDialog({
    state,
    onClose,
    onConfirm,
}: {
    state: RefDialogState | null;
    onClose: () => void;
    /** `value` is the typed name for create and rename */
    onConfirm: (state: RefDialogState, value: string) => void;
}) {
    const [value, setValue] = useState("");
    const [lastState, setLastState] = useState(state);
    // start each open with a fresh field: the current name for rename, empty for a new branch
    if (state !== lastState) {
        setLastState(state);
        if (state) setValue(state.id === "rename" ? (state.item?.name ?? "") : "");
    }
    const shown = state ?? lastState;
    const name = shown?.item?.name ?? "";
    const kind = shown?.item?.kind;
    const noun = kind === "tag" ? "tag" : kind === "remote" ? "remote branch" : "branch";
    const creating = shown?.id === "create";

    const title = creating ? "Create branch" : shown?.id === "rename" ? "Rename branch" : `Delete ${noun}?`;
    const deleteWarning =
        kind === "local"
            ? "It has commits that are not merged into the current branch. They will be lost."
            : kind === "merged"
              ? "It is fully merged, so no commits are lost."
              : kind === "remote"
                ? "It is removed from the remote. Others lose it on their next fetch."
                : "It is removed locally. Remote copies stay until you delete them there.";
    const description = creating
        ? name
            ? `Starts from ${name} and switches to it.`
            : "Starts from the current commit and switches to it."
        : shown?.id === "rename"
          ? `Choose a new name for ${name}.`
          : `${name} will be deleted. ${deleteWarning}`;

    return (
        <ResponsiveDialog
            open={state !== null}
            onOpenChange={(open) => !open && onClose()}
            title={title}
            description={description}
        >
            {shown?.id === "delete" ? (
                <div className="flex justify-end gap-2 px-5 py-4">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="button" variant="destructive" onClick={() => shown && onConfirm(shown, "")}>
                        Delete {noun}
                    </Button>
                </div>
            ) : (
                <form
                    className="space-y-4 px-5 py-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (shown && value.trim() && value.trim() !== name) onConfirm(shown, value.trim());
                    }}
                >
                    <label className="sr-only" htmlFor="ref-name">
                        Branch name
                    </label>
                    <Input
                        id="ref-name"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        placeholder="feature/my-change"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        className="font-mono"
                    />
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!value.trim() || (!creating && value.trim() === name)}>
                            {creating ? "Create branch" : "Rename"}
                        </Button>
                    </div>
                </form>
            )}
        </ResponsiveDialog>
    );
}

export function BranchesTab({ projectId, onOpenGraph }: { projectId: string; onOpenGraph: () => void }) {
    const branches = useQuery(gitBranchesOptions(projectId));
    const remotes = useQuery(gitRemotesOptions(projectId));
    const tags = useQuery(gitTagsOptions(projectId));
    const { run, busy } = useGitAction(projectId);

    const [query, setQuery] = useState("");
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Local: true, Remotes: true, Tags: false });
    // one sheet and one dialog for the whole tab; a row's ... button picks which ref they act on
    const [selected, setSelected] = useState<Ref | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [dialog, setDialog] = useState<RefDialogState | null>(null);

    const header = (
        <TabHeader
            title="Branches"
            leadingAction={
                <>
                    <TooltipIconButton label="Open Git Graph" icon={GitGraph} onClick={onOpenGraph} />
                    <TooltipIconButton
                        label="Fetch from remotes"
                        icon={RefreshCw}
                        onClick={() => run(() => api.gitFetch(projectId).then((r) => r.output || "Fetched."))}
                    />
                </>
            }
            action={
                <TooltipIconButton
                    label="New branch"
                    icon={Plus}
                    onClick={() => setDialog({ id: "create", item: null })}
                />
            }
        />
    );

    const failed = branches.error ?? remotes.error ?? tags.error;
    const branchData = branches.data;
    const remoteData = remotes.data;
    const tagData = tags.data;
    if (failed) {
        return (
            <>
                {header}
                <p role="alert" className="px-3 text-sm text-destructive">
                    {failed.message}{" "}
                    <button
                        type="button"
                        className="underline"
                        onClick={() => void Promise.all([branches.refetch(), remotes.refetch(), tags.refetch()])}
                    >
                        Retry
                    </button>
                </p>
            </>
        );
    }
    if (!branchData || !remoteData || !tagData) {
        return (
            <>
                {header}
                <div role="status" aria-label="Loading branches" className="space-y-3 px-3">
                    <Skeleton className="h-10 rounded-lg" />
                    <Skeleton className="h-40 rounded-xl" />
                </div>
            </>
        );
    }
    if (!branchData.isRepo) {
        return (
            <>
                {header}
                <div className="px-3">
                    <Empty>
                        <EmptyHeader>
                            <EmptyTitle>Not a Git repository</EmptyTitle>
                            <EmptyDescription>Run git init in this folder to start using branches.</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                </div>
            </>
        );
    }

    const groups: { title: string; empty: { title: string; description: string }; items: Ref[] }[] = [
        {
            title: "Local",
            empty: {
                title: "No local branches",
                description: "Commit something, or create a branch from the current commit.",
            },
            items: branchData.branches.map((b) => ({
                name: b.name,
                kind: b.current ? "current" : b.merged ? "merged" : "local",
                subject: b.subject,
                ahead: b.ahead,
                behind: b.behind,
            })),
        },
        {
            title: "Remotes",
            empty: remoteData.remotes.length
                ? { title: "No remote branches", description: "Fetch to see what's on the remote." }
                : { title: "No remotes configured", description: "Add a remote to push and pull." },
            items: remoteData.branches.map((b) => ({
                name: b.ref,
                kind: "remote",
                subject: b.subject,
                local: b.hasLocal ? b.name : undefined,
                remoteOnly: !b.hasLocal,
            })),
        },
        {
            title: "Tags",
            empty: { title: "No tags", description: "Tag a commit to mark a release." },
            items: tagData.tags.map((t) => ({ name: t.name, kind: "tag", subject: t.subject, hash: t.oid })),
        },
    ];

    const search = query.trim().toLocaleLowerCase();
    const filteredGroups = groups.map((group) => ({
        ...group,
        items: group.items.filter(({ name }) => name.toLocaleLowerCase().includes(search)),
    }));

    const openMenu = (item: Ref) => {
        setSelected(item);
        setSheetOpen(true);
    };
    const chooseAction = (id: ActionId) => {
        if (!selected) return;
        const item = selected;
        setSheetOpen(false);
        switch (id) {
            case "create":
            case "rename":
            case "delete":
                setDialog({ id, item });
                break;
            case "copy":
                navigator.clipboard?.writeText(item.name).then(
                    () => toast.add({ type: "success", title: `Copied "${item.name}"`, timeout: 2500 }),
                    () => toast.add({ type: "error", title: "Could not copy to the clipboard" }),
                );
                break;
            case "checkout":
                run(() =>
                    item.kind === "remote" && !item.local
                        ? api.gitCheckoutRemote(projectId, item.name)
                        : api.gitCheckout(projectId, item.local ?? item.name),
                );
                break;
            case "merge":
                run(() => api.gitMerge(projectId, item.name).then((r) => r.output || `Merged ${item.name}.`));
                break;
            case "pull":
                run(() => api.gitPull(projectId).then((r) => r.output || "Already up to date."));
                break;
            case "push":
                run(() => api.gitPush(projectId).then((r) => r.output || "Pushed."));
                break;
            case "push-tag":
                run(() => api.gitPushTag(projectId, item.name).then((r) => r.output || `Pushed ${item.name}.`));
                break;
        }
    };
    const confirmDialog = ({ id, item }: RefDialogState, value: string) => {
        setDialog(null);
        if (id === "create") run(() => api.gitCreateBranch(projectId, value, item?.name));
        else if (id === "rename" && item) run(() => api.gitRenameBranch(projectId, item.name, value));
        else if (id === "delete" && item) {
            run(() =>
                item.kind === "tag"
                    ? api.gitDeleteTag(projectId, item.name)
                    : item.kind === "remote"
                      ? api.gitDeleteRemoteBranch(projectId, item.name)
                      : // a branch that is not merged was confirmed in the dialog, so git may drop it
                        api.gitDeleteBranch(projectId, item.name, item.kind === "local"),
            );
        }
    };

    return (
        <>
            {header}
            <div className="flex px-3 pb-2">
                <SearchField
                    id="branch-search"
                    label="Search branches, remotes, and tags"
                    value={query}
                    onChange={setQuery}
                    placeholder="Search branches and tags"
                />
            </div>
            {filteredGroups.map(({ title, items, empty }) => (
                <Section
                    key={title}
                    title={title}
                    count={items.length}
                    open={search ? true : openGroups[title]}
                    onOpenChange={(open) => setOpenGroups((current) => ({ ...current, [title]: open }))}
                    disabled={Boolean(search)}
                >
                    {items.length === 0 ? (
                        <Empty>
                            <EmptyHeader>
                                <EmptyTitle>
                                    {search ? `No ${title.toLocaleLowerCase()} match “${query.trim()}”` : empty.title}
                                </EmptyTitle>
                                {!search && <EmptyDescription>{empty.description}</EmptyDescription>}
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <SectionCard>
                            {items.map((item) => (
                                <RefRow key={item.name} item={item} onMenu={openMenu} />
                            ))}
                        </SectionCard>
                    )}
                </Section>
            ))}
            <RefMenu item={selected} open={sheetOpen && !busy} onOpenChange={setSheetOpen} onAction={chooseAction} />
            <RefDialog state={dialog} onClose={() => setDialog(null)} onConfirm={confirmDialog} />
        </>
    );
}
