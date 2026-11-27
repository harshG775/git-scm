import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { buttonVariants } from "#/components/ui/button";
import { projectsOptions } from "#/lib/queries";
import { GitConfigForm } from "../-settings/GitConfigForm";

export const Route = createFileRoute("/projects/$project_id_/settings")({ component: ProjectSettingsPage });

function ProjectSettingsPage() {
    const { project_id } = Route.useParams();
    const { data: projects } = useQuery(projectsOptions);
    const projectName = projects?.find((project) => project.id === project_id)?.name;

    return (
        <div className="min-h-dvh">
            <header className="sticky top-0 z-20 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
                <div className="mx-auto flex h-14 max-w-xl items-center gap-1 px-2">
                    <Link
                        to="/projects/$project_id"
                        params={{ project_id }}
                        aria-label="Back to repository"
                        className={buttonVariants({ variant: "ghost", size: "icon" })}
                    >
                        <ChevronLeft aria-hidden="true" />
                    </Link>
                    <h1 className="min-w-0 truncate text-base font-semibold">
                        {projectName ? `${projectName} settings` : "Repository settings"}
                    </h1>
                </div>
            </header>
            <main className="mx-auto max-w-xl space-y-4 px-4 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
                <section aria-labelledby="repo-git-heading" className="space-y-4">
                    <div>
                        <h2 id="repo-git-heading" className="text-lg font-semibold">
                            Git
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Overrides for this repository. Empty values fall back to the global git config.
                        </p>
                    </div>
                    <GitConfigForm scope="local" projectId={project_id} />
                </section>
            </main>
        </div>
    );
}
