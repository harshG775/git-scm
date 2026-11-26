import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronRight,
    GitBranch,
    Minus,
    Plus,
    RefreshCw,
    Undo2,
    X,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "#/components/ui/button";
import { api, type GitChange, type GitStatus } from "#/lib/api";
import { resync } from "#/lib/live";
import { gitStatusOptions } from "#/lib/queries";
import { activeIdOf, useFileNav } from "#/lib/use-file-nav";
import { useWorkspace } from "#/stores/workspace";
import { OpenGraphButton } from "./OpenGraphButton";
import { PanelHeader } from "./panels";

type Notice = { kind: "ok" | "error"; text: string };

const STATUS_COLOR: Record<string, string> = {
    M: "text-amber-500",
    A: "text-green-500",
    U: "text-green-500",
    D: "text-red-500",
    R: "text-sky-500",
    C: "text-sky-500",
    T: "text-amber-500",
    "!": "text-red-500",
};

const iconBtn =
    "flex size-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40 md:size-7";

export function SourceControl({ projectId }: { projectId: string }) {
    const queryClient = useQueryClient();
    const { data: status, error, isPending } = useQuery(gitStatusOptions(projectId));
    const active = useSearch({ from: "/p/$projectId", select: activeIdOf });
    const nav = useFileNav(projectId, active);
    const message = useWorkspace((s) => s.commitMessage);
    const setMessage = useWorkspace((s) => s.setCommitMessage);
    const [notice, setNotice] = useState<Notice | null>(null);

    // Every action goes through here: one in flight at a time, git's message shown on failure,
    // and status, tree and open files re-checked afterwards instead of waiting for the next poll.
    const act = useMutation({
        mutationFn: (job: () => Promise<string | void>) => job(),
        onSuccess: (text) => setNotice(text ? { kind: "ok", text } : null),
        onError: (e: Error) => setNotice({ kind: "error", text: e.message }),
        onSettled: () => resync(queryClient, projectId),
    });
    const busy = act.isPending;

    const refresh = () => resync(queryClient, projectId);

    if (isPending)
        return (
            <Shell projectId={projectId} onRefresh={refresh}>
                Loading…
            </Shell>
        );
    if (error)
        return (
            <Shell projectId={projectId} onRefresh={refresh}>
                {error.message}
            </Shell>
        );
    if (!status.isRepo) {
        return (
            <Shell projectId={projectId} onRefresh={refresh}>
                Not a git repository. Run `git init` in this folder from Termux.
            </Shell>
        );
    }

    const paths = (cs: GitChange[]) => cs.flatMap((c) => (c.origPath ? [c.path, c.origPath] : [c.path]));
    const stage = (cs: GitChange[]) => act.mutate(() => api.gitStage(projectId, paths(cs)).then(() => {}));
    const unstage = (cs: GitChange[]) => act.mutate(() => api.gitUnstage(projectId, paths(cs)).then(() => {}));
    const discard = (cs: GitChange[]) => {
        const what =
            cs.length === 1
                ? cs[0].status === "U"
                    ? `Delete untracked file ${cs[0].path}?`
                    : `Discard changes to ${cs[0].path}?`
                : `Discard changes to ${cs.length} files? Untracked files will be deleted.`;
        if (window.confirm(`${what}\n\nThis cannot be undone.`)) {
            act.mutate(() => api.gitDiscard(projectId, paths(cs)).then(() => {}));
        }
    };
    const commit = () =>
        act.mutate(async () => {
            const { oid } = await api.gitCommit(projectId, message);
            setMessage("");
            return `Committed ${oid}`;
        });
    const canCommit = status.staged.length > 0 && message.trim() !== "" && !busy;

    return (
        <Shell
            projectId={projectId}
            onRefresh={refresh}
            header={<BranchBar status={status} busy={busy} act={act} projectId={projectId} />}
        >
            <div className="border-b p-3">
                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canCommit) commit();
                    }}
                    placeholder="Message (Ctrl+Enter to commit)"
                    rows={3}
                    className="w-full resize-none rounded-lg border bg-background p-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:text-sm"
                />
                <Button
                    className="mt-2 h-11 w-full md:h-8"
                    disabled={!canCommit}
                    title={status.staged.length === 0 ? "Stage changes first" : undefined}
                    onClick={commit}
                >
                    Commit{status.staged.length > 0 && ` (${status.staged.length})`}
                </Button>
            </div>

            {notice && (
                <div
                    role={notice.kind === "error" ? "alert" : "status"}
                    className={cn(
                        "flex items-start gap-2 border-b px-3 py-2 text-xs",
                        notice.kind === "error" ? "bg-destructive/10 text-destructive" : "bg-muted",
                    )}
                >
                    <p className="max-h-32 min-w-0 flex-1 overflow-auto break-words whitespace-pre-wrap">
                        {notice.text}
                    </p>
                    <button type="button" aria-label="Dismiss" className="shrink-0" onClick={() => setNotice(null)}>
                        <X className="size-4" />
                    </button>
                </div>
            )}

            <Group
                title="Merge Changes"
                items={status.conflicts}
                actions={(cs) => <IconButton label="Stage all" disabled={busy} onClick={() => stage(cs)} icon={Plus} />}
                row={(c) => (
                    <Row
                        key={c.path}
                        change={c}
                        onOpen={() => nav.open(c.path)}
                        actions={
                            <IconButton label="Mark resolved" disabled={busy} onClick={() => stage([c])} icon={Plus} />
                        }
                    />
                )}
            />
            <Group
                title="Staged Changes"
                items={status.staged}
                actions={(cs) => (
                    <IconButton label="Unstage all" disabled={busy} onClick={() => unstage(cs)} icon={Minus} />
                )}
                row={(c) => (
                    <Row
                        key={c.path}
                        change={c}
                        onOpen={() => nav.openDiff(c.path, true)}
                        actions={
                            <IconButton label="Unstage" disabled={busy} onClick={() => unstage([c])} icon={Minus} />
                        }
                    />
                )}
            />
            <Group
                title="Changes"
                items={status.changes}
                actions={(cs) => (
                    <>
                        <IconButton label="Discard all" disabled={busy} onClick={() => discard(cs)} icon={Undo2} />
                        <IconButton label="Stage all" disabled={busy} onClick={() => stage(cs)} icon={Plus} />
                    </>
                )}
                row={(c) => (
                    <Row
                        key={c.path}
                        change={c}
                        onOpen={() => nav.openDiff(c.path, false)}
                        actions={
                            <>
                                <IconButton label="Discard" disabled={busy} onClick={() => discard([c])} icon={Undo2} />
                                <IconButton label="Stage" disabled={busy} onClick={() => stage([c])} icon={Plus} />
                            </>
                        }
                    />
                )}
            />
            {status.conflicts.length + status.staged.length + status.changes.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No changes. The working tree is clean.</p>
            )}
        </Shell>
    );
}

function Shell({
    projectId,
    children,
    header,
    onRefresh,
}: {
    projectId: string;
    children: React.ReactNode;
    header?: React.ReactNode;
    onRefresh: () => void;
}) {
    return (
        <div className="flex h-full flex-col">
            <PanelHeader title="Source Control">
                <span className="flex">
                    <OpenGraphButton projectId={projectId} />
                    <button type="button" aria-label="Refresh" className={iconBtn} onClick={onRefresh}>
                        <RefreshCw className="size-4" />
                    </button>
                </span>
            </PanelHeader>
            {header}
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
                {typeof children === "string" ? (
                    <p className="p-4 text-sm text-muted-foreground">{children}</p>
                ) : (
                    children
                )}
            </div>
        </div>
    );
}

function BranchBar({
    status,
    busy,
    act,
    projectId,
}: {
    status: GitStatus;
    busy: boolean;
    act: { mutate: (job: () => Promise<string | void>) => void };
    projectId: string;
}) {
    const name = status.detached ? `detached at ${status.oid.slice(0, 7)}` : status.branch;
    const published = status.upstream !== "";
    return (
        <div className="flex items-center gap-1 border-y px-3 text-sm">
            <GitBranch className="size-4 shrink-0 text-muted-foreground" />
            <span
                className="min-w-0 flex-1 truncate font-medium"
                title={status.upstream ? `tracking ${status.upstream}` : undefined}
            >
                {name}
                {status.oid === "(initial)" && <span className="text-muted-foreground"> (no commits yet)</span>}
            </span>
            <button
                type="button"
                aria-label="Pull"
                title={published ? "Pull (fast-forward only)" : "No upstream branch"}
                disabled={busy || !published}
                className={cn(iconBtn, "w-auto gap-0.5 px-2 text-xs")}
                onClick={() => act.mutate(async () => (await api.gitPull(projectId)).output || "Already up to date.")}
            >
                <ArrowDown className="size-4" />
                {status.behind > 0 && status.behind}
            </button>
            <button
                type="button"
                aria-label={published ? "Push" : "Publish branch"}
                title={published ? "Push" : "Publish branch to origin"}
                disabled={busy || status.detached || (published && status.ahead === 0)}
                className={cn(iconBtn, "w-auto gap-0.5 px-2 text-xs")}
                onClick={() => act.mutate(async () => (await api.gitPush(projectId)).output || "Pushed.")}
            >
                <ArrowUp className="size-4" />
                {status.ahead > 0 ? status.ahead : !published && "Publish"}
            </button>
        </div>
    );
}

function Group({
    title,
    items,
    actions,
    row,
}: {
    title: string;
    items: GitChange[];
    actions: (items: GitChange[]) => React.ReactNode;
    row: (change: GitChange) => React.ReactNode;
}) {
    const [open, setOpen] = useState(true);
    if (items.length === 0) return null;
    return (
        <section>
            <div className="flex items-center pr-1 pl-1">
                <button
                    type="button"
                    aria-expanded={open}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-1 text-left text-xs font-semibold tracking-wide uppercase md:min-h-7"
                    onClick={() => setOpen(!open)}
                >
                    {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    <span className="truncate">{title}</span>
                    <span className="rounded-full bg-muted px-1.5 text-[11px] font-normal">{items.length}</span>
                </button>
                {actions(items)}
            </div>
            {open && items.map(row)}
        </section>
    );
}

function Row({ change, onOpen, actions }: { change: GitChange; onOpen: () => void; actions: React.ReactNode }) {
    const slash = change.path.lastIndexOf("/");
    const name = change.path.slice(slash + 1);
    const dir = change.origPath ? `← ${change.origPath}` : slash > 0 ? change.path.slice(0, slash) : "";
    return (
        <div className="flex items-center pl-2 hover:bg-muted">
            <button
                type="button"
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left md:min-h-7"
                onClick={onOpen}
            >
                <span className="min-w-0 flex-1 truncate text-sm" title={change.path}>
                    {name} <span className="text-xs text-muted-foreground">{dir}</span>
                </span>
                <span className={cn("w-4 shrink-0 text-center text-xs font-semibold", STATUS_COLOR[change.status])}>
                    {change.status}
                </span>
            </button>
            {actions}
        </div>
    );
}

function IconButton({
    label,
    icon: Icon,
    onClick,
    disabled,
}: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            className={iconBtn}
            onClick={onClick}
        >
            <Icon className="size-4" />
        </button>
    );
}
