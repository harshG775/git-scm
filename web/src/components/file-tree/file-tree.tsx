import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "#/lib/utils";
import { buildTree, flattenTree, listRows, type TreeEntry, type TreeNode } from "./build-tree";
import { FileIcon, FolderIcon } from "./file-icon";

export type { TreeEntry, TreeNode } from "./build-tree";

export type FileTreeProps<T = unknown> = {
    entries: TreeEntry<T>[];
    /** accessible name for the tree */
    label: string;
    /** "tree": nested folders. "list": flat files, directory shown under the name. */
    view?: "tree" | "list";
    /** merge single-child folder chains into one row (a/b/c), like VS Code */
    compactFolders?: boolean;
    /** whether folders start open; the user's toggles are kept on top of this */
    defaultOpen?: boolean;
    /** controlled mode: exactly these folder paths are open. Pair it with `onToggleFolder`. */
    expanded?: readonly string[];
    /** show how many files are below each folder */
    showFolderCount?: boolean;
    selectedPath?: string;
    /** a file row was activated with a single click or Space */
    onSelect?: (entry: TreeEntry<T>, node: TreeNode<T>) => void;
    /** a file row was opened for keeps: double-click or Enter. Without it these fall back to `onSelect`. */
    onOpen?: (entry: TreeEntry<T>, node: TreeNode<T>) => void;
    /** a folder was opened or closed; use it to lazy-load children */
    onToggleFolder?: (node: TreeNode<T>, open: boolean) => void;
    /** right-aligned, non-interactive: status letters, +/- counts */
    renderMeta?: (node: TreeNode<T>) => ReactNode;
    /** right-aligned buttons; clicks and keys here never select or toggle the row */
    renderActions?: (node: TreeNode<T>) => ReactNode;
    className?: string;
};

const INDENT = 12;
const BASE_PAD = 8;

export function FileTree<T = unknown>({
    entries,
    label,
    view = "tree",
    compactFolders = false,
    defaultOpen = false,
    expanded,
    showFolderCount = false,
    selectedPath,
    onSelect,
    onOpen,
    onToggleFolder,
    renderMeta,
    renderActions,
    className,
}: FileTreeProps<T>) {
    // folders the user flipped away from `defaultOpen`; survives `entries` changing
    const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
    const [activePath, setActivePath] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const isOpen = (path: string) => (expanded ? expanded.includes(path) : defaultOpen !== flipped.has(path));
    const rows =
        view === "list" ? listRows(entries) : flattenTree(buildTree(entries, { compact: compactFolders }), isOpen);

    // roving tabindex: one tab stop for the whole tree
    const tabStop = rows.some((row) => row.node.path === activePath) ? activePath : rows[0]?.node.path;

    const toggle = (node: TreeNode<T>) => {
        const open = isOpen(node.path);
        setFlipped((current) => {
            const next = new Set(current);
            if (next.has(node.path)) next.delete(node.path);
            else next.add(node.path);
            return next;
        });
        onToggleFolder?.(node, !open);
    };

    const activate = (node: TreeNode<T>, keep = false) => {
        if (node.kind === "folder") toggle(node);
        else if (node.entry) (keep ? (onOpen ?? onSelect) : onSelect)?.(node.entry, node);
    };

    const focusRow = (index: number) =>
        listRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]')[index]?.focus();

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
        if (event.target !== event.currentTarget) return; // a key inside an action button
        const row = rows[index];
        if (!row) return;
        const { node, depth } = row;
        const open = node.kind === "folder" && isOpen(node.path);

        switch (event.key) {
            case "ArrowDown":
                focusRow(index + 1);
                break;
            case "ArrowUp":
                focusRow(index - 1);
                break;
            case "Home":
                focusRow(0);
                break;
            case "End":
                focusRow(rows.length - 1);
                break;
            case "ArrowRight":
                if (node.kind !== "folder") break;
                if (open) focusRow(index + 1);
                else toggle(node);
                break;
            case "ArrowLeft":
                if (open) {
                    toggle(node);
                    break;
                }
                for (let i = index - 1; i >= 0; i--) {
                    if ((rows[i]?.depth ?? 0) < depth) {
                        focusRow(i);
                        break;
                    }
                }
                break;
            case "Enter":
                activate(node, true);
                break;
            case " ":
                activate(node);
                break;
            default:
                return;
        }
        event.preventDefault();
    };

    return (
        <div ref={listRef} role="tree" aria-label={label} className={className}>
            {rows.map(({ node, depth, dir }, index) => {
                const isFolder = node.kind === "folder";
                const open = isFolder && isOpen(node.path);
                const selected = node.path === selectedPath;
                const actions = renderActions?.(node);
                return (
                    <div
                        key={node.path}
                        role="treeitem"
                        aria-level={depth + 1}
                        aria-selected={selected}
                        aria-expanded={isFolder ? open : undefined}
                        tabIndex={node.path === tabStop ? 0 : -1}
                        onClick={() => activate(node)}
                        onDoubleClick={() => node.kind === "file" && activate(node, true)}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        onFocus={() => setActivePath(node.path)}
                        style={{ paddingLeft: BASE_PAD + depth * INDENT }}
                        className={cn(
                            "flex min-h-9 cursor-pointer items-center gap-1.5 pr-2 text-sm outline-none select-none",
                            "hover:bg-sidebar-accent/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
                            selected && "bg-sidebar-accent text-sidebar-accent-foreground",
                        )}
                    >
                        {view === "tree" &&
                            (isFolder ? (
                                <ChevronRight
                                    aria-hidden="true"
                                    className={cn(
                                        "size-4 shrink-0 text-muted-foreground transition-transform",
                                        open && "rotate-90",
                                    )}
                                />
                            ) : (
                                <span className="size-4 shrink-0" />
                            ))}
                        {isFolder ? <FolderIcon open={open} /> : <FileIcon name={node.name} />}
                        <span className="min-w-0 flex-1">
                            <span className={cn("block truncate", view === "list" && "font-medium")}>{node.name}</span>
                            {dir !== undefined && (
                                <span className="block truncate font-mono text-xs text-muted-foreground">
                                    {dir || "/"}
                                </span>
                            )}
                        </span>
                        {isFolder && showFolderCount && node.fileCount > 0 && (
                            <span className="shrink-0 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                                {node.fileCount}
                            </span>
                        )}
                        {renderMeta?.(node)}
                        {actions && (
                            <span
                                className="flex shrink-0 items-center gap-1"
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                            >
                                {actions}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
