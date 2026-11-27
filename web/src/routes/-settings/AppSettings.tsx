import { cn } from "#/lib/utils";
import { useSettings, type Theme } from "#/stores/settings";

const THEMES: [Theme, string][] = [
    ["auto", "Auto"],
    ["light", "Light"],
    ["dark", "Dark"],
];

/** Preferences that belong to the app, not to git. They are saved in this browser. */
export function AppSettings() {
    const theme = useSettings((s) => s.theme);
    const setTheme = useSettings((s) => s.setTheme);
    return (
        <fieldset>
            <legend className="mb-2 px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Appearance
            </legend>
            <div className="space-y-2 rounded-xl border bg-card p-4">
                <div role="group" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-xl border p-1">
                    {THEMES.map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            aria-pressed={theme === id}
                            onClick={() => setTheme(id)}
                            className={cn(
                                "h-10 rounded-lg text-sm font-medium text-muted-foreground transition-colors",
                                theme === id && "bg-foreground text-background",
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">Auto follows your device. Saved in this browser only.</p>
            </div>
        </fieldset>
    );
}
