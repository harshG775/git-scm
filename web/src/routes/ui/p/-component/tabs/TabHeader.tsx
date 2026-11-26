import { Ellipsis } from "lucide-react";
import { Button } from "#/components/ui/button";

export function TabHeader({ title }: { title: string }) {
    return (
        <header className="flex items-center justify-between px-2 py-1.5">
            <h2 className="text-xs capitalize">{title}</h2>
            <Button type="button" variant="ghost" size="icon" aria-label={`More ${title} actions`}>
                <Ellipsis aria-hidden="true" />
            </Button>
        </header>
    );
}
