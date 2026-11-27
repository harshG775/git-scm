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
import { buttonVariants } from "#/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
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
    merged: { icon: GitMerge, className: "text-violet-400" },
    remote: { icon: Cloud, className: "text-muted-foreground" },
    tag: { icon: Tag, className: "text-amber-400" },
};

const STATUS_STYLES: Record<RefStatus, string> = {
    merged: "bg-muted text-muted-foreground",
    tracked: "bg-blue-500/15 text-blue-400",
    "remote only": "bg-muted text-muted-foreground",
};

type RefAction = { label: string; icon: LucideIcon; danger?: boolean };

// options in each row's ... menu; destructive ones sit below a separator
const checkout: RefAction = { label: "Checkout", icon: Check };
const mergeInto: RefAction = { label: "Merge into current", icon: GitMerge };
const createFrom: RefAction = { label: "Create branch from here", icon: GitBranchPlus };
const copyName: RefAction = { label: "Copy name", icon: Copy };
const rename: RefAction = { label: "Rename", icon: Pencil };
const remove = (label: string): RefAction => ({ label, icon: Trash2, danger: true });

const REF_ACTIONS: Record<RefKind, RefAction[]> = {
    current: [
        { label: "Pull", icon: ArrowDownToLine },
        { label: "Push", icon: ArrowUpFromLine },
        createFrom,
        rename,
        copyName,
    ],
    local: [checkout, mergeInto, createFrom, rename, copyName, remove("Delete branch")],
    merged: [checkout, createFrom, rename, copyName, remove("Delete branch")],
    remote: [checkout, mergeInto, createFrom, copyName, remove("Delete remote branch")],
    tag: [checkout, createFrom, { label: "Push tag", icon: ArrowUpFromLine }, copyName, remove("Delete tag")],
};

const GROUPS: { title: string; items: Ref[] }[] = [
    {
        title: "Local",
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
        items: [
            { name: "origin/main", kind: "remote", subject: "Merge pull request #41 · 3h", status: "tracked" },
            { name: "origin/release", kind: "remote", subject: "chore(release): 1.2.0 · 4d", status: "remote only" },
        ],
    },
    {
        title: "Tags",
        items: [
            { name: "v1.1.0", kind: "tag", subject: "Release 1.1.0", hash: "c4e8a15" },
            { name: "v1.0.0", kind: "tag", subject: "Release 1.0.0", hash: "31fa6c4" },
        ],
    },
];

function RefRow({ item, onAction }: { item: Ref; onAction: (action: RefAction, name: string) => void }) {
    const { name, kind, subject, status, ahead, behind, hash } = item;
    const { icon: Icon, className } = REF_ICONS[kind];
    const actions = REF_ACTIONS[kind];
    const firstDanger = actions.findIndex((action) => action.danger);
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
                    className="flex shrink-0 items-center font-mono text-xs font-semibold text-amber-500"
                    title={`${behind} to pull`}
                >
                    <ArrowDown className="size-3.5" aria-label="behind" />
                    {behind}
                </span>
            ) : null}
            {ahead ? (
                <span
                    className="flex shrink-0 items-center font-mono text-xs font-semibold text-emerald-500"
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
            <DropdownMenu>
                <DropdownMenuTrigger
                    className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                    aria-label={`Options for ${name}`}
                >
                    <Ellipsis aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto min-w-48">
                    {actions.map((action, index) => (
                        <Fragment key={action.label}>
                            {index === firstDanger && <DropdownMenuSeparator />}
                            <DropdownMenuItem
                                variant={action.danger ? "destructive" : "default"}
                                onClick={() => onAction(action, name)}
                            >
                                <action.icon aria-hidden="true" />
                                {action.label}
                            </DropdownMenuItem>
                        </Fragment>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
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
    })).filter(({ items }) => !search || items.length > 0);
    const runAction = ({ label }: RefAction, name: string) =>
        setNotice(`${label} "${name}" is a UI preview. Nothing was changed.`);

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
            {filteredGroups.map(({ title, items }) => (
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
                            <RefRow key={item.name} item={item} onAction={runAction} />
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
