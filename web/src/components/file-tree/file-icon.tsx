import { File, FileCode, FileImage, FileJson, FileText, Folder, FolderOpen, type LucideIcon } from "lucide-react";
import { cn } from "#/lib/utils";

const CODE = FileCode;
const BY_EXTENSION: Record<string, [LucideIcon, string]> = {
    ts: [CODE, "text-blue-400"],
    tsx: [CODE, "text-sky-400"],
    js: [CODE, "text-yellow-300"],
    jsx: [CODE, "text-yellow-300"],
    go: [CODE, "text-cyan-400"],
    css: [CODE, "text-pink-400"],
    html: [CODE, "text-orange-300"],
    json: [FileJson, "text-yellow-400"],
    md: [FileText, "text-muted-foreground"],
    txt: [FileText, "text-muted-foreground"],
    png: [FileImage, "text-emerald-400"],
    jpg: [FileImage, "text-emerald-400"],
    svg: [FileImage, "text-emerald-400"],
};

export function FileIcon({ name, className }: { name: string; className?: string }) {
    const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
    const [Icon, color] = BY_EXTENSION[extension] ?? [File, "text-muted-foreground"];
    return <Icon aria-hidden="true" className={cn("size-4 shrink-0", color, className)} />;
}

export function FolderIcon({ open, className }: { open?: boolean; className?: string }) {
    const Icon = open ? FolderOpen : Folder;
    return <Icon aria-hidden="true" className={cn("size-4 shrink-0 text-orange-400", className)} />;
}
