import { GitBranch } from "lucide-react";
import { Button } from "#/components/ui/button";
import { api, type GitRemoteBranch, type GitRemotes } from "#/lib/api";
import type { GitAction } from "#/lib/use-git-action";
import { Empty, Heading } from "./Notice";

export function Remote({ projectId, data, action }: { projectId: string; data: GitRemotes; action: GitAction }) {
    const { run, busy } = action;

    const checkout = (b: GitRemoteBranch) =>
        run(() =>
            // Already have a local branch of that name: just switch to it. Otherwise create one tracking the remote.
            (b.hasLocal ? api.gitCheckout(projectId, b.name) : api.gitCheckoutRemote(projectId, b.ref)).then(() => {}),
        );

    if (data.remotes.length === 0) {
        return (
            <Empty>
                No remotes are configured. In Termux, add one with <code>git remote add origin &lt;url&gt;</code>, then
                come back here to fetch.
            </Empty>
        );
    }

    return (
        <>
            <p className="px-3 pt-1 text-xs text-muted-foreground">
                Remotes: <b className="text-foreground">{data.remotes.join(", ")}</b>
            </p>

            {data.branches.length === 0 && (
                <Empty>
                    No remote branches yet. Use the fetch button above to download the list from{" "}
                    {data.remotes.join(", ")}.
                </Empty>
            )}
            {data.remotes.map((remote) => {
                const branches = data.branches.filter((b) => b.remote === remote);
                if (branches.length === 0) return null;
                return (
                    <section key={remote}>
                        <Heading>{remote}</Heading>
                        {branches.map((b) => (
                            <div key={b.ref} className="flex items-center gap-2 px-3 hover:bg-muted">
                                <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0 flex-1 py-2">
                                    <div className="truncate text-sm" title={b.ref}>
                                        {b.name}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground" title={b.subject}>
                                        {b.oid} · {b.subject || "(no message)"}
                                        {!b.hasLocal && " · creates a local branch"}
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-9 shrink-0 md:h-7"
                                    disabled={busy}
                                    onClick={() => checkout(b)}
                                >
                                    Checkout
                                </Button>
                            </div>
                        ))}
                    </section>
                );
            })}
        </>
    );
}
