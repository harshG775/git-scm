import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { buttonVariants } from "#/components/ui/button";
import { AppSettings } from "./-settings/AppSettings";
import { GlobalGitSettings } from "./-settings/GlobalGitSettings";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
    return (
        <div className="min-h-dvh">
            <header className="sticky top-0 z-20 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
                <div className="mx-auto flex h-14 max-w-xl items-center gap-1 px-2">
                    <Link to="/" aria-label="Back" className={buttonVariants({ variant: "ghost", size: "icon" })}>
                        <ChevronLeft aria-hidden="true" />
                    </Link>
                    <h1 className="text-base font-semibold">Settings</h1>
                </div>
            </header>
            <main className="mx-auto max-w-xl space-y-10 px-4 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
                <section aria-labelledby="git-heading" className="space-y-4">
                    <div>
                        <h2 id="git-heading" className="text-lg font-semibold">
                            Git
                        </h2>
                        <p className="text-sm text-muted-foreground">Applies to every repository on this device.</p>
                    </div>
                    <GlobalGitSettings />
                </section>
                <section aria-labelledby="app-heading" className="space-y-4">
                    <div>
                        <h2 id="app-heading" className="text-lg font-semibold">
                            App
                        </h2>
                        <p className="text-sm text-muted-foreground">How git csm looks and behaves.</p>
                    </div>
                    <AppSettings />
                </section>
            </main>
        </div>
    );
}
