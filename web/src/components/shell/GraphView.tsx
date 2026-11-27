import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Cloud, GitBranch, GitGraph, RefreshCw, Tag } from "lucide-react";
import { cn } from "cn";
import { Button } from "#/components/ui/button";
import type { GitCommit, GitLog, GitRef } from "#/lib/api";
import { COLORS, layoutGraph, type GraphRow } from "#/lib/graph";
import { buildItems, toInputs, type GraphItem } from "#/lib/graph-items";
import { resync } from "#/lib/live";
import { gitLogOptions } from "#/lib/queries";
import { timeAgo } from "#/lib/time";
import { useIsDesktop } from "#/lib/use-media-query";
import { useWorkspace } from "#/stores/workspace";

export const ROW_H = 40;
const PAD = 10;
const PAGE = 100;
const MIN_GRAPH = 56;
// Line colours for branches; stash and uncommitted changes have their own, as in Git Graph.
const LINE = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6", "#eab308", "#06b6d4"].slice(0, COLORS);
const STASH = "#d946ef";
const UNCOMMITTED = "#9ca3af";

const COLUMNS = "grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)_9rem_7rem_4.5rem]";
const fullDate = (t: number) =>
    new Date(t * 1000).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

export function GraphView({ projectId }: { projectId: string }) {
    const queryClient = useQueryClient();
    const desktop = useIsDesktop();
    const [scope, setScope] = useState<"current" | "local" | "all">("current");
    const [limit, setLimit] = useState(PAGE);
    const [selected, setSelected] = useState<string | null>(null);
    const { data: log, error, isPending, isPlaceholderData } = useQuery(gitLogOptions(projectId, scope, limit));

    return (
        <div className="flex h-full flex-col">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3 md:h-9">
                <GitGraph className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium">Git Graph</span>
                <div
                    role="group"
                    aria-label="Branches shown"
                    className="ml-2 flex overflow-hidden rounded-md border text-xs"
                >
                    {(["current", "local", "all"] as const).map((s) => (
                        <button
                            key={s}
                            type="button"
                            aria-pressed={scope === s}
                            title={
                                s === "current"
                                    ? "Current branch history"
                                    : s === "local"
                                      ? "Local branches and HEAD"
                                      : "Everything: remote branches and tags too"
                            }
                            className={cn(
                                "h-8 px-3 md:h-6",
                                scope === s ? "bg-muted font-medium" : "text-muted-foreground",
                            )}
                            onClick={() => {
                                setScope(s);
                                setLimit(PAGE);
                            }}
                        >
                            {s === "current" ? "Current" : s === "local" ? "Local" : "All"}
                        </button>
                    ))}
                </div>
                <span className="min-w-0 flex-1" />
                {isPlaceholderData && <span className="text-xs text-muted-foreground">Loading…</span>}
                <button
                    type="button"
                    aria-label="Refresh"
                    className="flex size-9 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground md:size-7"
                    onClick={() => resync(queryClient, projectId)}
                >
                    <RefreshCw className="size-4" />
                </button>
            </div>

            {isPending ? (
                <Message>Loading…</Message>
            ) : error ? (
                <Message>{error.message}</Message>
            ) : !log.isRepo ? (
                <Message>Not a git repository. Run `git init` in this folder from Termux.</Message>
            ) : (
                <Graph
                    log={log}
                    desktop={desktop}
                    selected={selected}
                    onSelect={(id) => setSelected((cur) => (cur === id ? null : id))}
                    onMore={() => setLimit((l) => l + PAGE)}
                    loadingMore={isPlaceholderData}
                />
            )}
        </div>
    );
}

export function Graph({
    log,
    desktop,
    selected,
    onSelect,
    onMore,
    loadingMore,
}: {
    log: GitLog;
    desktop: boolean;
    selected: string | null;
    onSelect: (id: string) => void;
    onMore: () => void;
    loadingMore: boolean;
}) {
    const items = buildItems(log);
    if (items.length === 0) return <Message>No commits yet.</Message>;

    const rows = layoutGraph(toInputs(items));
    const maxLanes = Math.max(1, ...rows.map((r) => r.lanes));
    // Many branches mean many columns: squeeze them to fit instead of pushing the text off screen.
    const maxWidth = desktop ? 300 : 120;
    const laneW = Math.max(5, Math.min(14, (maxWidth - 2 * PAD) / Math.max(1, maxLanes - 1)));
    // At least wide enough for the "Graph" column header, so a one-lane history does not squash it.
    const width = Math.max(MIN_GRAPH, PAD * 2 + (maxLanes - 1) * laneW);
    const picked = items.find((i) => i.id === selected);

    return (
        <>
            <div className="min-h-0 flex-1 overflow-auto">
                <div className="min-w-0 md:min-w-[40rem]">
                    <div
                        className={cn(
                            "sticky top-0 z-10 hidden h-8 items-center border-b bg-background px-0 text-xs font-medium text-muted-foreground md:grid",
                            COLUMNS,
                        )}
                    >
                        <span style={{ width }} className="pl-2">
                            Graph
                        </span>
                        <span>Description</span>
                        <span>Date</span>
                        <span>Author</span>
                        <span>Commit</span>
                    </div>
                    {items.map((item, i) => (
                        <Row
                            key={item.id}
                            item={item}
                            row={rows[i]}
                            width={width}
                            laneW={laneW}
                            isHead={item.kind === "commit" && item.id === log.head}
                            selected={item.id === selected}
                            onSelect={() => onSelect(item.id)}
                        />
                    ))}
                    {log.hasMore && (
                        <div className="p-3 text-center">
                            <Button variant="outline" size="sm" disabled={loadingMore} onClick={onMore}>
                                {loadingMore ? "Loading…" : "Load more commits"}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
            {picked && <Details item={picked} log={log} />}
        </>
    );
}

function Row({
    item,
    row,
    width,
    laneW,
    isHead,
    selected,
    onSelect,
}: {
    item: GraphItem;
    row: GraphRow;
    width: number;
    laneW: number;
    isHead: boolean;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            style={{ height: ROW_H }}
            className={cn("grid w-full items-center text-left hover:bg-muted/60", COLUMNS, selected && "bg-muted")}
            onClick={onSelect}
        >
            <Lines item={item} row={row} width={width} laneW={laneW} isHead={isHead} />
            <Description item={item} />
            <span className="hidden truncate pr-2 text-xs text-muted-foreground md:block">{meta(item).date}</span>
            <span className="hidden truncate pr-2 text-xs text-muted-foreground md:block">{meta(item).author}</span>
            <span className="hidden font-mono text-xs text-muted-foreground md:block">{meta(item).hash}</span>
        </button>
    );
}

function meta(item: GraphItem) {
    switch (item.kind) {
        case "uncommitted":
            return { date: "*", author: "*", hash: "*" };
        case "stash":
            return { date: fullDate(item.stash.time), author: "", hash: item.stash.oid.slice(0, 7) };
        case "commit":
            return { date: fullDate(item.commit.time), author: item.commit.author, hash: item.id.slice(0, 7) };
    }
}

function Description({ item }: { item: GraphItem }) {
    if (item.kind === "uncommitted") {
        return <span className="truncate text-sm font-semibold">Uncommitted Changes ({item.count})</span>;
    }
    if (item.kind === "stash") {
        return (
            <span className="flex min-w-0 items-center gap-1.5">
                <Badge color={STASH} icon={Archive} solid>{`stash@{${item.stash.index}}`}</Badge>
                <span className="truncate text-sm">
                    {item.stash.auto ? `WIP on ${item.stash.branch}: ${item.stash.title}` : item.stash.title}
                </span>
            </span>
        );
    }
    const c = item.commit;
    return (
        <span className="flex min-w-0 flex-col justify-center">
            <span className="flex min-w-0 items-center gap-1.5">
                {c.refs.map((r) => (
                    <RefBadge key={`${r.kind}:${r.name}`} r={r} />
                ))}
                <span className="truncate text-sm">{c.subject || "(no message)"}</span>
            </span>
            {/* Phones have no columns: the details go on a second line. */}
            <span className="truncate text-[11px] text-muted-foreground md:hidden">
                {c.author} · {timeAgo(c.time)} · {c.oid.slice(0, 7)}
            </span>
        </span>
    );
}

function RefBadge({ r }: { r: GitRef }) {
    if (r.kind === "tag")
        return (
            <Badge color="#f59e0b" icon={Tag}>
                {r.name}
            </Badge>
        );
    if (r.kind === "remote")
        return (
            <Badge color="#94a3b8" icon={Cloud}>
                {r.name}
            </Badge>
        );
    return (
        <Badge color="#3b82f6" icon={GitBranch} solid={r.current}>
            {r.name}
        </Badge>
    );
}

function Badge({
    color,
    icon: Icon,
    solid,
    children,
}: {
    color: string;
    icon: React.ComponentType<{ className?: string }>;
    solid?: boolean;
    children: React.ReactNode;
}) {
    return (
        <span
            style={solid ? { backgroundColor: color, borderColor: color } : { borderColor: color, color }}
            className={cn(
                "inline-flex max-w-40 shrink-0 items-center gap-1 rounded border px-1.5 text-[11px] leading-5",
                solid && "text-white",
            )}
        >
            <Icon className="size-3 shrink-0" />
            <span className="truncate">{children}</span>
        </span>
    );
}

/** One row's slice of the graph: the lines through, into and out of the node, and the node. */
export function Lines({
    item,
    row,
    width,
    laneW,
    isHead,
}: {
    item: GraphItem;
    row: GraphRow;
    width: number;
    laneW: number;
    isHead: boolean;
}) {
    const x = (lane: number) => PAD + lane * laneW;
    const mid = ROW_H / 2;
    const own = item.kind === "stash" ? STASH : item.kind === "uncommitted" ? UNCOMMITTED : LINE[row.color];
    const colorOf = (i: number) => LINE[i % LINE.length];
    const nx = x(row.lane);

    return (
        <svg width={width} height={ROW_H} className="shrink-0 overflow-visible" aria-hidden="true">
            <g fill="none" strokeWidth={2} strokeLinecap="round">
                {row.pass.map((p) => (
                    <line
                        key={`p${p.lane}`}
                        x1={x(p.lane)}
                        x2={x(p.lane)}
                        y1={0}
                        y2={ROW_H}
                        stroke={colorOf(p.color)}
                    />
                ))}
                {row.incoming.map((e) => (
                    <path
                        key={`i${e.from}`}
                        stroke={colorOf(e.color)}
                        d={
                            e.from === row.lane
                                ? `M${nx} 0V${mid}`
                                : `M${x(e.from)} 0C${x(e.from)} ${mid} ${nx} 0 ${nx} ${mid}`
                        }
                    />
                ))}
                {row.outgoing.map((o, k) => (
                    <path
                        key={`o${k}`}
                        stroke={item.kind === "commit" ? colorOf(o.color) : own}
                        strokeDasharray={item.kind === "uncommitted" ? "3 3" : undefined}
                        d={
                            o.to === row.lane
                                ? `M${nx} ${mid}V${ROW_H}`
                                : `M${nx} ${mid}C${nx} ${ROW_H} ${x(o.to)} ${mid} ${x(o.to)} ${ROW_H}`
                        }
                    />
                ))}
            </g>
            {item.kind === "stash" ? (
                <rect
                    x={nx - 4}
                    y={mid - 4}
                    width={8}
                    height={8}
                    rx={1.5}
                    fill={STASH}
                    transform={`rotate(45 ${nx} ${mid})`}
                />
            ) : item.kind === "uncommitted" ? (
                <circle cx={nx} cy={mid} r={4.5} fill="var(--background)" stroke={UNCOMMITTED} strokeWidth={2} />
            ) : isHead ? (
                <circle cx={nx} cy={mid} r={5} fill="var(--background)" stroke={own} strokeWidth={2.5} />
            ) : (
                <circle cx={nx} cy={mid} r={4} fill={own} />
            )}
        </svg>
    );
}

function Details({ item, log }: { item: GraphItem; log: GitLog }) {
    const selectPanel = useWorkspace((s) => s.selectPanel);
    const desktop = useIsDesktop();

    return (
        <div className="max-h-[45%] shrink-0 overflow-auto border-t bg-sidebar p-3 text-sm">
            {item.kind === "uncommitted" && (
                <>
                    <p className="font-medium">
                        Uncommitted changes in {item.count} file{item.count === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        On {log.detached ? "a detached HEAD" : log.headBranch}.
                    </p>
                    <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 h-9 md:h-7"
                        onClick={() => selectPanel("git", desktop)}
                    >
                        Open Source Control
                    </Button>
                </>
            )}
            {item.kind === "stash" && (
                <>
                    <p className="font-medium">stash@{`{${item.stash.index}}`}</p>
                    <p className="mt-1 break-words">
                        {item.stash.auto ? `WIP on ${item.stash.branch}: ${item.stash.title}` : item.stash.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {fullDate(item.stash.time)} · made on {item.stash.base.slice(0, 7)}. Apply, pop or drop it from
                        Branches › Stash.
                    </p>
                </>
            )}
            {item.kind === "commit" && <CommitDetails c={item.commit} />}
        </div>
    );
}

function CommitDetails({ c }: { c: GitCommit }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        void navigator.clipboard?.writeText(c.oid).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };
    return (
        <>
            <p className="font-medium break-words">{c.subject || "(no message)"}</p>
            {c.body && <p className="mt-2 text-xs break-words whitespace-pre-wrap text-muted-foreground">{c.body}</p>}
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Author</dt>
                <dd className="break-words">
                    {c.author} &lt;{c.email}&gt;
                </dd>
                <dt className="text-muted-foreground">Date</dt>
                <dd>{fullDate(c.time)}</dd>
                <dt className="text-muted-foreground">Commit</dt>
                <dd className="flex items-center gap-2">
                    <code className="font-mono break-all">{c.oid}</code>
                    <button type="button" className="shrink-0 rounded border px-1.5 hover:bg-muted" onClick={copy}>
                        {copied ? "Copied" : "Copy"}
                    </button>
                </dd>
                {c.parents.length > 0 && (
                    <>
                        <dt className="text-muted-foreground">{c.parents.length > 1 ? "Parents" : "Parent"}</dt>
                        <dd className="font-mono">{c.parents.map((p) => p.slice(0, 7)).join(" ")}</dd>
                    </>
                )}
            </dl>
        </>
    );
}

function Message({ children }: { children: React.ReactNode }) {
    return <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">{children}</div>;
}
