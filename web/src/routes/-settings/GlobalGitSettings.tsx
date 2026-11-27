import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { NativeSelect } from "#/components/ui/native-select";
import { Skeleton } from "#/components/ui/skeleton";
import { api, type GitConfigKey } from "#/lib/api";
import { notify } from "#/lib/notify";
import { gitGlobalConfigOptions } from "#/lib/queries";

type Field =
    | { key: GitConfigKey; label: string; hint?: string; kind: "text"; placeholder: string; type?: string }
    | { key: GitConfigKey; label: string; hint?: string; kind: "select"; options: [value: string, label: string][] }
    | { key: GitConfigKey; label: string; hint?: string; kind: "switch" };

const FIELD_GROUPS: { title: string; fields: Field[] }[] = [
    {
        title: "Identity",
        fields: [
            {
                key: "user.name",
                label: "Name",
                kind: "text",
                placeholder: "Your name",
                hint: "Shown on every commit you make.",
            },
            { key: "user.email", label: "Email", kind: "text", type: "email", placeholder: "you@example.com" },
        ],
    },
    {
        title: "Defaults",
        fields: [
            {
                key: "init.defaultBranch",
                label: "Default branch name",
                kind: "text",
                placeholder: "main",
                hint: "For repositories you create with git init.",
            },
            {
                key: "pull.rebase",
                label: "When pulling",
                kind: "select",
                options: [
                    ["", "Let git ask"],
                    ["false", "Merge"],
                    ["true", "Rebase"],
                ],
            },
            {
                key: "push.autoSetupRemote",
                label: "Set upstream on first push",
                kind: "switch",
                hint: "Pushing a new branch creates it on the remote.",
            },
            {
                key: "core.autocrlf",
                label: "Line endings",
                kind: "select",
                options: [
                    ["", "Git default"],
                    ["input", "Convert to LF on commit (Mac, Linux)"],
                    ["true", "CRLF in files (Windows)"],
                    ["false", "Do not convert"],
                ],
            },
        ],
    },
];

/**
 * Global git config: the same fields git itself reads from ~/.gitconfig. Only what you change is
 * written, and a bar with Save and Revert appears once something is different from what is saved.
 */
export function GlobalGitSettings() {
    const queryClient = useQueryClient();
    const { data, error, isPending, refetch } = useQuery(gitGlobalConfigOptions);
    // only what the user has touched; everything else shows what is saved
    const [draft, setDraft] = useState<Partial<Record<GitConfigKey, string>>>({});

    const saved = (key: GitConfigKey) => data?.values[key] ?? "";
    const value = (key: GitConfigKey) => draft[key] ?? saved(key);
    const dirtyKeys = (Object.keys(draft) as GitConfigKey[]).filter((key) => draft[key] !== saved(key));

    const save = useMutation({
        mutationFn: async () => {
            // one key at a time: git locks the file while it writes
            for (const key of dirtyKeys) await api.setGitGlobalConfig(key, draft[key] ?? "");
        },
        onSuccess: () => {
            setDraft({});
            notify({ type: "success", title: "Git settings saved", description: data?.path });
        },
        onError: (e: Error) => notify({ type: "error", title: "Could not save git settings", description: e.message }),
        onSettled: () => queryClient.invalidateQueries({ queryKey: gitGlobalConfigOptions.queryKey }),
    });

    if (isPending) {
        return (
            <div role="status" aria-label="Loading git settings" className="space-y-4">
                <Skeleton className="h-40 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
            </div>
        );
    }
    if (error) {
        return (
            <p role="alert" className="text-sm text-destructive">
                {error.message}{" "}
                <button type="button" className="underline" onClick={() => refetch()}>
                    Retry
                </button>
            </p>
        );
    }

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                if (dirtyKeys.length > 0) save.mutate();
            }}
        >
            <div className="space-y-6">
                {FIELD_GROUPS.map(({ title, fields }) => (
                    <fieldset key={title}>
                        <legend className="mb-2 px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                            {title}
                        </legend>
                        <div className="space-y-4 rounded-xl border bg-card p-4">
                            {fields.map((field) => {
                                const id = `git-${field.key}`;
                                const hint = field.hint && (
                                    <p className="text-xs text-muted-foreground">{field.hint}</p>
                                );
                                const set = (next: string) =>
                                    setDraft((current) => ({ ...current, [field.key]: next }));
                                if (field.kind === "switch") {
                                    return (
                                        <div key={field.key} className="space-y-1">
                                            <label
                                                htmlFor={id}
                                                className="flex min-h-10 items-center justify-between gap-3 text-sm font-medium"
                                            >
                                                {field.label}
                                                <input
                                                    id={id}
                                                    type="checkbox"
                                                    checked={value(field.key) === "true"}
                                                    onChange={(event) => set(event.target.checked ? "true" : "")}
                                                    className="size-5 accent-primary"
                                                />
                                            </label>
                                            {hint}
                                        </div>
                                    );
                                }
                                return (
                                    <div key={field.key} className="space-y-1.5">
                                        <label htmlFor={id} className="text-sm font-medium">
                                            {field.label}
                                        </label>
                                        {field.kind === "select" ? (
                                            <NativeSelect
                                                id={id}
                                                value={value(field.key)}
                                                onChange={(event) => set(event.target.value)}
                                            >
                                                {field.options.map(([optionValue, optionLabel]) => (
                                                    <option key={optionValue} value={optionValue}>
                                                        {optionLabel}
                                                    </option>
                                                ))}
                                            </NativeSelect>
                                        ) : (
                                            <Input
                                                id={id}
                                                type={field.type ?? "text"}
                                                value={value(field.key)}
                                                onChange={(event) => set(event.target.value)}
                                                placeholder={field.placeholder}
                                                autoCapitalize="off"
                                                autoCorrect="off"
                                                spellCheck={false}
                                            />
                                        )}
                                        {hint}
                                    </div>
                                );
                            })}
                        </div>
                    </fieldset>
                ))}
                <p className="px-1 text-xs break-all text-muted-foreground">
                    Saved in <span className="font-mono">{data.path}</span>. A repository can override these in its own
                    settings.
                </p>
            </div>
            {dirtyKeys.length > 0 && (
                <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex gap-2 border-t bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
                    <Button type="submit" size="lg" className="flex-1" disabled={save.isPending}>
                        Save {dirtyKeys.length === 1 ? "change" : `${dirtyKeys.length} changes`}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        disabled={save.isPending}
                        onClick={() => setDraft({})}
                    >
                        Revert
                    </Button>
                </div>
            )}
        </form>
    );
}
