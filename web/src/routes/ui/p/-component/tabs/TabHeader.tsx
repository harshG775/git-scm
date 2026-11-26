import type { ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { Button } from "#/components/ui/button";

export function TabHeader({ title, action }: { title: string; action?: ReactNode }) {
    return (
        <header className="flex items-center justify-between px-2 py-1.5">
            <h2 className="text-xs capitalize">{title}</h2>
            {action ?? (
                <Button type="button" variant="ghost" size="icon" aria-label={`More ${title} actions`}>
                    <Ellipsis aria-hidden="true" />
                </Button>
            )}
        </header>
    );
}
