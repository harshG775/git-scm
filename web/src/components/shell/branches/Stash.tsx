import { useState } from "react";
import { Archive } from "lucide-react";
import { Button } from "#/components/ui/button";
import { api, type GitStash, type GitStashes } from "#/lib/api";
import { timeAgo } from "#/lib/time";
import type { GitAction } from "#/lib/use-git-action";
import { Empty } from "./Notice";

const label = (s: GitStash) => (s.auto ? `WIP on ${s.branch}: ${s.title}` : s.title || "(no message)");

export function Stash({ projectId, data, action }: { projectId: string; data: GitStashes; action: GitAction }) {
    const [message, setMessage] = useState("");
    const [untracked, setUntracked] = useState(false);
    const { run, busy } = action;

    const stash = () =>
        run(async () => {
            await api.gitStash(projectId, message.trim(), untracked);
            setMessage("");
            return "Stashed. The working tree is clean again.";
        });

    const apply = (s: GitStash) =>
        run(async () => {
            await api.gitStashApply(projectId, s.index, s.oid);
            return `Applied "${label(s)}". It is still in the list.`;
        });
    const pop = (s: GitStash) =>
        run(async () => {
            await api.gitStashPop(projectId, s.index, s.oid);
            return `Applied and removed "${label(s)}".`;
        });
    const drop = (s: GitStash) => {
        if (!window.confirm(`Drop "${label(s)}"?\n\nThe saved changes are deleted and cannot be restored here.`))
            return;
        run(async () => {
            await api.gitStashDrop(projectId, s.index, s.oid);
            return `Dropped "${label(s)}".`;
        });
    };

    return (
        <>
            <form
                className="border-b p-3"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!busy) stash();
                }}
            >
                <label htmlFor="stash-message" className="text-sm font-medium">
                    Stash changes
                </label>
                <p className="mb-2 text-xs text-muted-foreground">
                    Saves your uncommitted changes and gives you a clean tree, for example before switching branches.
                </p>
                <input
                    id="stash-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Message (optional)"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="h-11 w-full rounded-lg border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:h-8 md:text-sm"
                />
                <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2 text-sm md:min-h-8">
                    <input
                        type="checkbox"
                        checked={untracked}
                        onChange={(e) => setUntracked(e.target.checked)}
                        className="size-4 accent-sky-600"
                    />
                    Include untracked files
                </label>
                <Button type="submit" className="h-11 w-full md:h-8" disabled={busy}>
                    <Archive /> Stash changes
                </Button>
            </form>

            <section>
                {data.stashes.length === 0 && <Empty>No stashes.</Empty>}
                {data.stashes.map((s) => (
                    <div key={s.oid} className="border-b px-3 py-2 last:border-b-0">
                        <div className="text-sm break-words">{label(s)}</div>
                        <div className="text-xs text-muted-foreground">
                            stash@{`{${s.index}}`}
                            {!s.auto && ` · on ${s.branch}`} · {timeAgo(s.time)}
                        </div>
                        <div className="mt-2 flex gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-9 md:h-7"
                                disabled={busy}
                                onClick={() => apply(s)}
                            >
                                Apply
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-9 md:h-7"
                                disabled={busy}
                                onClick={() => pop(s)}
                            >
                                Pop
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                className="h-9 md:h-7"
                                disabled={busy}
                                onClick={() => drop(s)}
                            >
                                Drop
                            </Button>
                        </div>
                    </div>
                ))}
            </section>
        </>
    );
}
