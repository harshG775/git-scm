import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FolderGit2, FolderOpen, X } from "lucide-react";
import { Button } from "#/components/ui/button";
import { api } from "#/lib/api";
import { projectsOptions } from "#/lib/queries";

export const Route = createFileRoute("/")({ component: Welcome });

function Welcome() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data: projects } = useQuery(projectsOptions);
    const [path, setPath] = useState("");

    const open = useMutation({
        mutationFn: api.openProject,
        onSuccess: (p) => {
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            return navigate({ to: "/p/$projectId", params: { projectId: p.id } });
        },
    });
    const remove = useMutation({
        mutationFn: api.removeProject,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
    });

    return (
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-8 px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
            <header>
                <h1 className="text-2xl font-semibold">git csm</h1>
                <p className="text-sm text-muted-foreground">Source control and code browsing, built for your phone.</p>
            </header>

            <section>
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Open project
                </h2>
                <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (path.trim()) open.mutate(path.trim());
                    }}
                >
                    <input
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        placeholder="~/projects/my-app"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 font-mono text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                    <Button type="submit" className="h-11 px-4" disabled={open.isPending}>
                        <FolderOpen /> Open
                    </Button>
                </form>
                {open.isError && <p className="mt-2 text-sm text-destructive">{open.error.message}</p>}
            </section>

            <section>
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recent</h2>
                {projects?.length === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}
                <ul className="flex flex-col gap-1">
                    {projects?.map((p) => (
                        <li key={p.id} className="flex items-center rounded-lg hover:bg-muted">
                            <button
                                type="button"
                                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-3 text-left"
                                onClick={() => navigate({ to: "/p/$projectId", params: { projectId: p.id } })}
                            >
                                <FolderGit2 className="size-5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">{p.name}</span>
                                    <span className="block truncate text-xs text-muted-foreground">{p.path}</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                aria-label={`Remove ${p.name} from recent`}
                                className="flex size-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                                onClick={() => remove.mutate(p.id)}
                            >
                                <X className="size-4" />
                            </button>
                        </li>
                    ))}
                </ul>
            </section>
        </main>
    );
}
