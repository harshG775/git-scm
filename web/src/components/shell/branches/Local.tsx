import { useState } from "react";
import { GitBranch, Plus } from "lucide-react";
import { cn } from "cn";
import { Button } from "#/components/ui/button";
import { api, type GitBranches } from "#/lib/api";
import type { GitAction } from "#/lib/use-git-action";
import { Empty } from "./Notice";

export function Local({ projectId, data, action }: { projectId: string; data: GitBranches; action: GitAction }) {
    const [name, setName] = useState("");
    const { run, busy } = action;

    const create = () =>
        run(async () => {
            await api.gitCreateBranch(projectId, name.trim());
            setName(""); // only cleared on success, so a rejected name can be corrected
        });

    return (
        <>
            <form
                className="border-b p-3"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (name.trim() && !busy) create();
                }}
            >
                <label htmlFor="new-branch" className="text-sm font-medium">
                    Create a branch
                </label>
                <p className="mb-2 text-xs text-muted-foreground">
                    Starts from {data.head ? <b>{data.head}</b> : "the current commit"} and switches to it.
                </p>
                <input
                    id="new-branch"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="feature/my-change"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="h-11 w-full rounded-lg border bg-background px-3 font-mono text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:h-8 md:text-sm"
                />
                <Button type="submit" className="mt-2 h-11 w-full md:h-8" disabled={!name.trim() || busy}>
                    <Plus /> Create branch
                </Button>
            </form>

            <section>
                {data.detached && (
                    <Empty>HEAD is detached: you are not on any branch. Checking out a branch goes back to it.</Empty>
                )}
                {data.branches.length === 0 && (
                    <Empty>
                        {data.head
                            ? `No commits on ${data.head} yet. It will be listed after the first commit.`
                            : "No branches."}
                    </Empty>
                )}
                {data.branches.map((b) => (
                    <div key={b.name} className="flex items-center gap-2 px-3 hover:bg-muted">
                        <GitBranch
                            className={cn("size-4 shrink-0", b.current ? "text-foreground" : "text-muted-foreground")}
                        />
                        <div className="min-w-0 flex-1 py-2">
                            <div className={cn("truncate text-sm", b.current && "font-semibold")} title={b.name}>
                                {b.name}
                            </div>
                            <div className="truncate text-xs text-muted-foreground" title={b.subject}>
                                {b.oid} · {b.subject || "(no message)"}
                                {b.upstream && ` · ${b.upstream}`}
                            </div>
                        </div>
                        {b.current ? (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                Current
                            </span>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-9 shrink-0 md:h-7"
                                disabled={busy}
                                onClick={() => run(() => api.gitCheckout(projectId, b.name).then(() => {}))}
                            >
                                Checkout
                            </Button>
                        )}
                    </div>
                ))}
            </section>
        </>
    );
}
