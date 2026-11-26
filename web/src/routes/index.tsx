import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Folder, FolderGit2, FolderOpen, GitBranch, X } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { api } from "#/lib/api";
import { projectsOptions } from "#/lib/queries";

export const Route = createFileRoute("/")({ component: Welcome });

function Welcome() {
    const [activeDialog, setActiveDialog] = useState<"open" | "clone" | null>(null);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data: projects } = useQuery(projectsOptions);
    const [path, setPath] = useState("");
    const [repositoryUrl, setRepositoryUrl] = useState("");
    const [browsePath, setBrowsePath] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const directoryListing = useQuery({
        queryKey: ["directory-picker", browsePath],
        queryFn: () => api.listDirectories(browsePath ?? ""),
        enabled: activeDialog === "open" && browsePath !== null,
    });

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (activeDialog && !dialog.open) dialog.showModal();
        else if (!activeDialog && dialog.open) dialog.close();
    }, [activeDialog]);

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
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Repository</h2>
                <div className="flex flex-col gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        className="h-11 justify-start px-3"
                        onClick={() => {
                            setBrowsePath(null);
                            setActiveDialog("open");
                        }}
                    >
                        <FolderOpen /> Open Folder...
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        className="h-11 justify-start px-3"
                        onClick={() => setActiveDialog("clone")}
                    >
                        <GitBranch /> Clone Git Repository...
                    </Button>
                </div>
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

            <dialog
                ref={dialogRef}
                aria-labelledby="repository-dialog-title"
                onCancel={() => setActiveDialog(null)}
                onClose={() => setActiveDialog(null)}
                className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg rounded-xl border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/50"
            >
                <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
                    <div>
                        <h2 id="repository-dialog-title" className="font-semibold">
                            {activeDialog === "clone"
                                ? "Clone Git Repository"
                                : browsePath !== null
                                  ? "Select Folder"
                                  : "Open Folder"}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {activeDialog === "clone"
                                ? "Enter the URL of the repository you want to clone."
                                : browsePath !== null
                                  ? "Browse folders available to the server."
                                  : "Enter the path to a local repository."}
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Close dialog"
                        onClick={() => setActiveDialog(null)}
                    >
                        <X />
                    </Button>
                </div>

                {activeDialog === "clone" ? (
                    <form
                        className="flex flex-col gap-4 p-5"
                        onSubmit={(e) => {
                            e.preventDefault();
                        }}
                    >
                        <label htmlFor="repository-url" className="text-sm font-medium">
                            Repository URL
                        </label>
                        <Input
                            id="repository-url"
                            type="url"
                            value={repositoryUrl}
                            onChange={(e) => setRepositoryUrl(e.target.value)}
                            placeholder="https://github.com/owner/repository.git"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                        />
                        <p className="text-sm text-muted-foreground">
                            Cloning isn't available yet. This dialog is ready for the clone flow.
                        </p>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled>
                                Clone
                            </Button>
                        </div>
                    </form>
                ) : browsePath !== null ? (
                    <div className="flex flex-col gap-3 p-5">
                        <div className="min-w-0">
                            <p className="text-sm font-medium">
                                {directoryListing.data?.path ? "Current folder" : "Choose a location"}
                            </p>
                            {directoryListing.data?.path && (
                                <p className="truncate font-mono text-xs text-muted-foreground">
                                    {directoryListing.data.path}
                                </p>
                            )}
                        </div>
                        {directoryListing.data?.parent && (
                            <Button
                                type="button"
                                variant="ghost"
                                className="justify-start"
                                onClick={() => setBrowsePath(directoryListing.data.parent ?? "")}
                            >
                                <ChevronLeft /> Up one level
                            </Button>
                        )}
                        <div className="max-h-64 min-h-20 overflow-y-auto rounded-lg border">
                            {directoryListing.isPending && (
                                <p className="p-3 text-sm text-muted-foreground">Loading folders...</p>
                            )}
                            {directoryListing.isError && (
                                <p className="p-3 text-sm text-destructive">{directoryListing.error.message}</p>
                            )}
                            {directoryListing.data?.directories.map((directory) => (
                                <button
                                    key={directory.path}
                                    type="button"
                                    className="flex min-h-11 w-full items-center gap-3 px-3 text-left hover:bg-muted"
                                    onClick={() => setBrowsePath(directory.path)}
                                >
                                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                                    <span className="truncate text-sm">{directory.name}</span>
                                </button>
                            ))}
                            {directoryListing.data?.directories.length === 0 && (
                                <p className="p-3 text-sm text-muted-foreground">No folders here.</p>
                            )}
                        </div>
                        <div className="flex flex-wrap justify-between gap-2">
                            <Button type="button" variant="outline" onClick={() => setBrowsePath(null)}>
                                Enter path manually
                            </Button>
                            <Button
                                type="button"
                                disabled={!directoryListing.data?.path}
                                onClick={() => {
                                    if (!directoryListing.data?.path) return;
                                    setPath(directoryListing.data.path);
                                    setBrowsePath(null);
                                }}
                            >
                                <FolderOpen /> Select Folder
                            </Button>
                        </div>
                    </div>
                ) : (
                    <form
                        className="flex flex-col gap-4 p-5"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (path.trim()) open.mutate(path.trim());
                        }}
                    >
                        <label htmlFor="project-path" className="text-sm font-medium">
                            Folder path
                        </label>
                        <div className="flex gap-2">
                            <Input
                                id="project-path"
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                                placeholder="~/projects/my-app"
                                autoCapitalize="off"
                                autoCorrect="off"
                                spellCheck={false}
                                className="h-11 font-mono"
                            />
                            <Button type="button" variant="outline" className="h-11" onClick={() => setBrowsePath("")}>
                                <Folder /> Browse
                            </Button>
                        </div>
                        {open.isError && <p className="text-sm text-destructive">{open.error.message}</p>}
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={!path.trim() || open.isPending}>
                                <FolderOpen /> Open
                            </Button>
                        </div>
                    </form>
                )}
            </dialog>
        </main>
    );
}
