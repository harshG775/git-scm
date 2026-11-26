import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { CloudDownload, RefreshCw } from "lucide-react";
import { api } from "#/lib/api";
import { resync } from "#/lib/live";
import { gitBranchesOptions, gitRemotesOptions, gitStashesOptions } from "#/lib/queries";
import { useGitAction } from "#/lib/use-git-action";
import { useWorkspace } from "#/stores/workspace";
import { OpenGraphButton } from "../OpenGraphButton";
import { PanelHeader } from "../panels";
import { Local } from "./Local";
import { Empty, Notice } from "./Notice";
import { Remote } from "./Remote";
import { Section } from "./Section";
import { Stash } from "./Stash";

/** Loading and error states for one section's data, so each section can fail on its own. */
function Body<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => React.ReactNode }) {
    if (query.isPending) return <Empty>Loading…</Empty>;
    if (query.error) return <Empty>{query.error.message}</Empty>;
    return <>{children(query.data)}</>;
}

export function Branches({ projectId }: { projectId: string }) {
    const queryClient = useQueryClient();
    const action = useGitAction(projectId);
    const sections = useWorkspace((s) => s.branchSections);
    const toggle = useWorkspace((s) => s.toggleBranchSection);

    const local = useQuery(gitBranchesOptions(projectId));
    const remote = useQuery(gitRemotesOptions(projectId));
    const stash = useQuery(gitStashesOptions(projectId));

    const fetchAll = () =>
        action.run(async () => {
            const { output } = await api.gitFetch(projectId);
            return output || "Fetched. Everything is up to date.";
        });

    return (
        <div className="flex h-full flex-col">
            <PanelHeader title="Branches">
                <span className="flex">
                    <OpenGraphButton projectId={projectId} />
                    <button
                        type="button"
                        aria-label="Refresh"
                        className="flex size-11 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground md:size-7"
                        onClick={() => resync(queryClient, projectId)}
                    >
                        <RefreshCw className="size-4" />
                    </button>
                </span>
            </PanelHeader>

            <Notice notice={action.notice} onDismiss={() => action.setNotice(null)} />

            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
                {local.data && !local.data.isRepo ? (
                    <Empty>Not a git repository. Run `git init` in this folder from Termux.</Empty>
                ) : (
                    <>
                        <Section
                            id="local"
                            title="Local"
                            count={local.data?.branches.length}
                            open={sections.local}
                            onToggle={() => toggle("local")}
                        >
                            <Body query={local}>{(d) => <Local projectId={projectId} data={d} action={action} />}</Body>
                        </Section>

                        <Section
                            id="remote"
                            title="Remote"
                            count={remote.data?.branches.length}
                            open={sections.remote}
                            onToggle={() => toggle("remote")}
                            actions={
                                !!remote.data?.remotes.length && (
                                    <button
                                        type="button"
                                        aria-label="Fetch from all remotes"
                                        title="Fetch from all remotes"
                                        disabled={action.busy}
                                        className="flex size-11 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40 md:size-7"
                                        onClick={fetchAll}
                                    >
                                        <CloudDownload className="size-4" />
                                    </button>
                                )
                            }
                        >
                            <Body query={remote}>
                                {(d) => <Remote projectId={projectId} data={d} action={action} />}
                            </Body>
                        </Section>

                        <Section
                            id="stash"
                            title="Stash"
                            count={stash.data?.stashes.length}
                            open={sections.stash}
                            onToggle={() => toggle("stash")}
                        >
                            <Body query={stash}>{(d) => <Stash projectId={projectId} data={d} action={action} />}</Body>
                        </Section>
                    </>
                )}
            </div>
        </div>
    );
}
