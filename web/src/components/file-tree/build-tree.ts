// Pure tree logic for <FileTree>: no React, no DOM.

export type TreeEntry<T = unknown> = {
    /** slash-separated, relative to the tree root: "src/styles/theme.css" */
    path: string;
    /** defaults to "file". Use "folder" for empty or not-yet-loaded folders. */
    kind?: "file" | "folder";
    /** caller payload, handed back through the render props and onSelect */
    data?: T;
};

export type TreeNode<T = unknown> = {
    /** display name; "a/b" for a compacted chain of folders */
    name: string;
    /** full path; for a compacted chain, the path of the deepest folder */
    path: string;
    kind: "file" | "folder";
    entry?: TreeEntry<T>;
    children: TreeNode<T>[];
    /** files below this folder (0 for a file) */
    fileCount: number;
};

export type TreeRow<T = unknown> = {
    node: TreeNode<T>;
    depth: number;
    /** list view only: directory of the file, "" at the root */
    dir?: string;
};

const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

// folders first, then files, each A-Z (VS Code order)
const sortNodes = <N extends { name: string; kind: string }>(nodes: N[]) =>
    nodes.sort((a, b) => (a.kind === b.kind ? byName(a, b) : a.kind === "folder" ? -1 : 1));

export function buildTree<T>(entries: TreeEntry<T>[], { compact = false } = {}): TreeNode<T>[] {
    const roots: TreeNode<T>[] = [];
    const folders = new Map<string, TreeNode<T>>();

    const folder = (path: string, name: string, parent: TreeNode<T>[]) => {
        let node = folders.get(path);
        if (!node) {
            node = { name, path, kind: "folder", children: [], fileCount: 0 };
            folders.set(path, node);
            parent.push(node);
        }
        return node;
    };

    for (const entry of entries) {
        const parts = entry.path.split("/").filter(Boolean);
        const leaf = parts.pop();
        if (!leaf) continue;

        let siblings = roots;
        let prefix = "";
        for (const part of parts) {
            prefix = prefix ? `${prefix}/${part}` : part;
            siblings = folder(prefix, part, siblings).children;
        }

        const path = prefix ? `${prefix}/${leaf}` : leaf;
        if (entry.kind === "folder") {
            folder(path, leaf, siblings).entry = entry;
        } else {
            siblings.push({ name: leaf, path, kind: "file", entry, children: [], fileCount: 0 });
        }
    }

    const finish = (nodes: TreeNode<T>[]): TreeNode<T>[] => {
        for (const node of nodes) {
            if (node.kind === "file") {
                node.fileCount = 1;
                continue;
            }
            node.children = finish(node.children);
            node.fileCount = node.children.reduce((sum, child) => sum + child.fileCount, 0);

            // a/b/c with nothing else inside collapses into one row
            while (compact && node.children.length === 1 && node.children[0]?.kind === "folder" && !node.entry) {
                const [only] = node.children;
                if (!only) break;
                node.name = `${node.name}/${only.name}`;
                node.path = only.path;
                node.entry = only.entry;
                node.children = only.children;
            }
        }
        return sortNodes(nodes);
    };

    return finish(roots);
}

/** Visible rows of the tree, depth-first, skipping the children of closed folders. */
export function flattenTree<T>(nodes: TreeNode<T>[], isOpen: (path: string) => boolean, depth = 0): TreeRow<T>[] {
    const rows: TreeRow<T>[] = [];
    for (const node of nodes) {
        rows.push({ node, depth });
        if (node.kind === "folder" && isOpen(node.path)) rows.push(...flattenTree(node.children, isOpen, depth + 1));
    }
    return rows;
}

/** Flat A-Z list of files, each with its directory (the "list" view of the changes panel). */
export function listRows<T>(entries: TreeEntry<T>[]): TreeRow<T>[] {
    const rows: TreeRow<T>[] = [];
    for (const entry of entries) {
        const path = entry.path.split("/").filter(Boolean).join("/");
        if (entry.kind === "folder" || !path) continue;
        const slash = path.lastIndexOf("/");
        rows.push({
            node: { name: path.slice(slash + 1), path, kind: "file", entry, children: [], fileCount: 1 },
            depth: 0,
            dir: slash === -1 ? "" : path.slice(0, slash),
        });
    }
    return rows.sort((a, b) => byName(a.node, b.node));
}

/** Files whose path contains every whitespace-separated term of `query` (case-insensitive). */
export function filterFiles<T>(entries: TreeEntry<T>[], query: string): TreeEntry<T>[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return entries.filter((entry) => {
        if (entry.kind === "folder") return false;
        const path = entry.path.toLowerCase();
        return terms.every((term) => path.includes(term));
    });
}
