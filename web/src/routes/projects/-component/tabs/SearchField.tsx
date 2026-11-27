import { Search, X } from "lucide-react";
import { Input } from "#/components/ui/input";

/** The search box every tab uses: icon on the left, a clear button once there is text, Escape clears. */
export function SearchField({
    id,
    label,
    value,
    onChange,
    placeholder,
}: {
    id: string;
    /** read by screen readers; the placeholder alone is not a label */
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
}) {
    return (
        <div className="relative min-w-0 flex-1">
            <label htmlFor={id} className="sr-only">
                {label}
            </label>
            <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
            />
            <Input
                id={id}
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => event.key === "Escape" && onChange("")}
                placeholder={placeholder}
                className="bg-card px-9"
            />
            {value && (
                <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => onChange("")}
                    className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
                >
                    <X aria-hidden="true" className="size-4" />
                </button>
            )}
        </div>
    );
}
