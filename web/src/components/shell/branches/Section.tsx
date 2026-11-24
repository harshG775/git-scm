import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * A collapsible section, like the stacked headers in VS Code's sidebar. The header stays pinned
 * while its body scrolls, so a long list can always be collapsed again. `actions` sit at the right
 * of the header (outside the toggle button, so they are separate tap targets).
 */
export function Section({
    id,
    title,
    count,
    open,
    onToggle,
    actions,
    children,
}: {
    id: string;
    title: string;
    count?: number;
    open: boolean;
    onToggle: () => void;
    actions?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="border-b">
            <div className="sticky top-0 z-10 flex items-center bg-sidebar pr-1">
                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`section-${id}`}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-1 pl-1 text-left text-xs font-semibold tracking-wide uppercase md:min-h-8"
                    onClick={onToggle}
                >
                    {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                    <span className="truncate">{title}</span>
                    {!!count && <span className="rounded-full bg-muted px-1.5 text-[11px] font-normal">{count}</span>}
                </button>
                {actions}
            </div>
            {open && <div id={`section-${id}`}>{children}</div>}
        </section>
    );
}
