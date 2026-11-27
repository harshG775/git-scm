import { Fragment, useState } from "react";
import {
    ArrowDown,
    ArrowDownToLine,
    ArrowUp,
    ArrowUpFromLine,
    Check,
    ChevronDown,
    Cloud,
    Copy,
    Ellipsis,
    GitBranch,
    GitBranchPlus,
    GitGraph,
    GitMerge,
    Pencil,
    Search,
    Tag,
    Trash2,
    type LucideIcon,
} from "lucide-react";
import { Button } from "#/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty";
import { Input } from "#/components/ui/input";
import { ResponsiveDialog } from "#/components/ui/responsive-dialog";
import { cn } from "#/lib/utils";
import { TabHeader, TooltipIconButton } from "./TabHeader";

type RefKind = "current" | "local" | "merged" | "remote" | "tag";
type RefStatus = "merged" | "tracked" | "remote only";
type Ref = {
    name: string;
    kind: RefKind;
    /** last commit subject, or the tag message */
    subject: string;
    status?: RefStatus;
    /** commits ahead of upstream, waiting to be pushed */
    ahead?: number;
    /** commits behind upstream, waiting to be pulled */
    behind?: number;
    hash?: string;
};

// the icon says what kind of ref a row is; the checked-out branch is highlighted
const REF_ICONS: Record<RefKind, { icon: LucideIcon; className: string }> = {
    current: { icon: GitBranch, className: "text-sidebar-primary" },
    local: { icon: GitBranch, className: "text-muted-foreground" },
    merged: { icon: GitMerge, className: "text-info" },
    remote: { icon: Cloud, className: "text-muted-foreground" },
    tag: { icon: Tag, className: "text-warning" },
};

const STATUS_STYLES: Record<RefStatus, string> = {
    merged: "bg-muted text-muted-foreground",
    tracked: "bg-info/15 text-info",
    "remote only": "bg-muted text-muted-foreground",
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
    tag: [
        checkout,
        createFrom,
        { id: "push-tag", label: "Push tag", icon: ArrowUpFromLine },
        copyName,
        remove("Delete tag"),
    ],
};

const GROUPS: { title: string; empty: { title: string; description: string }; items: Ref[] }[] = [
    {
        title: "Local",
        empty: { title: "No local branches", description: "Create a branch from the current commit." },
        items: [
            { name: "main", kind: "current", subject: "feat(files): open files in tabs · 2h", ahead: 1, behind: 2 },
            {
                name: "feature/mobile-sidebar",
                kind: "local",
                subject: "feat(nav): bottom tab bar · 1d",
                status: "tracked",
            },
            { name: "fix/editor-tabs", kind: "merged", subject: "fix(nav): clamp tab labels · 3d", status: "merged" },
        ],
    },
    {
        title: "Remotes",
        empty: { title: "No remotes configured", description: "Add a remote to push and pull." },
        items: [
            { name: "origin/main", kind: "remote", subject: "Merge pull request #41 · 3h", status: "tracked" },
            { name: "origin/release", kind: "remote", subject: "chore(release): 1.2.0 · 4d", status: "remote only" },
        ],
    },
    {
        title: "Tags",
        empty: { title: "No tags", description: "Tag a commit to mark a release." },
        items: [
            { name: "v1.1.0", kind: "tag", subject: "Release 1.1.0", hash: "c4e8a15" },
            { name: "v1.0.0", kind: "tag", subject: "Release 1.0.0", hash: "31fa6c4" },
        ],
    },
];

function RefRow({ item, onMenu }: { item: Ref; onMenu: (item: Ref) => void }) {
    const { name, kind, subject, status, ahead, behind, hash } = item;
    const { icon: Icon, className } = REF_ICONS[kind];
    return (
        <div className="flex min-h-12 items-center gap-2 border-b py-1.5 text-sm last:border-b-0">
            <Icon className={cn("size-4 shrink-0", className)} aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <div className={cn("truncate font-mono", kind === "current" && "font-semibold")} title={name}>
                    {name}
                </div>
                <div className="truncate text-xs text-muted-foreground" title={subject}>
                    {subject}
                </div>
            </div>
            {behind ? (
                <span
                    className="flex shrink-0 items-center font-mono text-xs font-semibold text-warning"
                    title={`${behind} to pull`}
                >
                    <ArrowDown className="size-3.5" aria-label="behind" />
                    {behind}
                </span>
            ) : null}
            {ahead ? (
                <span
                    className="flex shrink-0 items-center font-mono text-xs font-semibold text-success"
                    title={`${ahead} to push`}
                >
                    <ArrowUp className="size-3.5" aria-label="ahead" />
                    {ahead}
                </span>
            ) : null}
            {status && (
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLES[status])}>
                    {status}
                </span>
            )}
            {hash && <span className="shrink-0 font-mono text-xs text-muted-foreground">{hash}</span>}
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Options for ${name}`}
                onClick={() => onMenu(item)}
            >
                <Ellipsis aria-hidden="true" />
            </Button>
        </div>
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

type RefDialogState = { id: "create" | "rename" | "delete"; item: Ref };

// for the actions that need input or a confirmation: a sheet on the phone layout, a dialog on the desktop layout
function RefDialog({
    state,
    onClose,
    onDone,
}: {
    state: RefDialogState | null;
    onClose: () => void;
    onDone: (message: string) => void;
}) {
    const [value, setValue] = useState("");
    const [lastState, setLastState] = useState(state);
    // start each open with a fresh field: the current name for rename, empty for a new branch
    if (state !== lastState) {
        setLastState(state);
        if (state) setValue(state.id === "rename" ? state.item.name : "");
    }
    const shown = state ?? lastState;
    const name = shown?.item.name ?? "";
    const isTag = shown?.item.kind === "tag";
    const isRemote = shown?.item.kind === "remote";
    const noun = isTag ? "tag" : isRemote ? "remote branch" : "branch";

    const title =
        shown?.id === "create" ? "Create branch" : shown?.id === "rename" ? "Rename branch" : `Delete ${noun}?`;
    const description =
        shown?.id === "create"
            ? `Starts from ${name} and switches to it.`
            : shown?.id === "rename"
              ? `Choose a new name for ${name}.`
              : `${name} will be deleted. This cannot be undone.`;
    const preview = (verb: string) =>
        onDone(`${verb} "${shown?.id === "create" ? value.trim() : name}" is a UI preview.`);

    const creating = shown?.id === "create";

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
                    <Button type="button" variant="destructive" onClick={() => preview("Delete")}>
                        Delete {noun}
                    </Button>
                </div>
            ) : (
                <form
                    className="space-y-4 px-5 py-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        preview(creating ? "Create" : "Rename");
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
                        <Button type="submit" disabled={!value.trim() || value.trim() === name}>
                            {creating ? "Create branch" : "Rename"}
                        </Button>
                    </div>
                </form>
            )}
        </ResponsiveDialog>
    );
}

export function BranchesTab({ onOpenGraph }: { onOpenGraph: () => void }) {
    const [query, setQuery] = useState("");
    const [notice, setNotice] = useState("");
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
        Local: true,
        Remotes: true,
        Tags: false,
    });
    const search = query.trim().toLocaleLowerCase();
    const filteredGroups = GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(({ name }) => name.toLocaleLowerCase().includes(search)),
    }));
    // one sheet and one dialog for the whole tab; a row's ... button picks which ref they act on
    const [selected, setSelected] = useState<Ref | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [dialog, setDialog] = useState<RefDialogState | null>(null);
    const openMenu = (item: Ref) => {
        setSelected(item);
        setSheetOpen(true);
    };
    const chooseAction = (id: ActionId) => {
        if (!selected) return;
        setSheetOpen(false);
        if (id === "create" || id === "rename" || id === "delete") {
            setDialog({ id, item: selected });
            return;
        }
        if (id === "copy") {
            navigator.clipboard?.writeText(selected.name).catch(() => {});
            setNotice(`Copied "${selected.name}".`);
            return;
        }
        const label = REF_ACTIONS[selected.kind].find((action) => action.id === id)?.label;
        setNotice(`${label} "${selected.name}" is a UI preview. Nothing was changed.`);
    };

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
            {notice && (
                <p role="status" className="px-3 pb-2 text-xs text-muted-foreground">
                    {notice}
                </p>
            )}
            {filteredGroups.map(({ title, items, empty }) => (
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
                        {items.length === 0 && (
                            <Empty>
                                <EmptyHeader>
                                    <EmptyTitle>
                                        {search
                                            ? `No ${title.toLocaleLowerCase()} match “${query.trim()}”`
                                            : empty.title}
                                    </EmptyTitle>
                                    {!search && <EmptyDescription>{empty.description}</EmptyDescription>}
                                </EmptyHeader>
                            </Empty>
                        )}
                        {items.map((item) => (
                            <RefRow key={item.name} item={item} onMenu={openMenu} />
                        ))}
                    </CollapsibleContent>
                </Collapsible>
            ))}
            <RefMenu item={selected} open={sheetOpen} onOpenChange={setSheetOpen} onAction={chooseAction} />
            <RefDialog
                state={dialog}
                onClose={() => setDialog(null)}
                onDone={(message) => {
                    setDialog(null);
                    setNotice(`${message} Nothing was changed.`);
                }}
            />
        </>
    );
}
