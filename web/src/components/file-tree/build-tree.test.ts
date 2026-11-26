import { expect, test } from "vite-plus/test";
import { buildTree, filterFiles, flattenTree, listRows, type TreeEntry } from "./build-tree";

const files = (...paths: string[]): TreeEntry[] => paths.map((path) => ({ path }));
const shape = (rows: { node: { path: string }; depth: number }[]) => rows.map((r) => `${r.depth}:${r.node.path}`);

test("groups by folder, folders before files, each sorted", () => {
    const tree = buildTree(files("b.ts", "src/z.ts", "a.ts", "src/a.ts", "lib/x.ts"));
    expect(tree.map((n) => n.path)).toEqual(["lib", "src", "a.ts", "b.ts"]);
    expect(tree[1]?.children.map((n) => n.name)).toEqual(["a.ts", "z.ts"]);
});

test("sorts numbers naturally", () => {
    const tree = buildTree(files("f10.ts", "f2.ts"));
    expect(tree.map((n) => n.name)).toEqual(["f2.ts", "f10.ts"]);
});

test("fileCount counts files below a folder, not folders", () => {
    const tree = buildTree(files("src/a.ts", "src/deep/b.ts", "src/deep/c.ts"));
    expect(tree[0]?.fileCount).toBe(3);
    expect(tree[0]?.children[0]?.fileCount).toBe(2);
});

test("explicit folder entries keep empty folders and carry their payload", () => {
    const tree = buildTree<string>([{ path: "empty", kind: "folder", data: "d" }]);
    expect(tree[0]).toMatchObject({ name: "empty", kind: "folder", fileCount: 0 });
    expect(tree[0]?.entry?.data).toBe("d");
});

test("a folder entry and a file inside it share one node", () => {
    const tree = buildTree([{ path: "src", kind: "folder" as const }, { path: "src/a.ts" }]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children.map((n) => n.name)).toEqual(["a.ts"]);
});

test("ignores leading, trailing and doubled slashes", () => {
    const tree = buildTree(files("/src//a.ts"));
    expect(tree[0]?.path).toBe("src");
    expect(tree[0]?.children[0]?.path).toBe("src/a.ts");
});

test("compact merges single-child folder chains", () => {
    const tree = buildTree(files("a/b/c/x.ts"), { compact: true });
    expect(tree[0]).toMatchObject({ name: "a/b/c", path: "a/b/c" });
    expect(tree[0]?.children[0]?.path).toBe("a/b/c/x.ts");
});

test("compact stops where a folder has more than one child", () => {
    const tree = buildTree(files("a/b/x.ts", "a/y.ts"), { compact: true });
    expect(tree[0]?.name).toBe("a");
    expect(tree[0]?.children.map((n) => n.name)).toEqual(["b", "y.ts"]);
});

test("flatten skips the children of closed folders", () => {
    const tree = buildTree(files("src/a.ts", "src/deep/b.ts", "z.ts"));
    expect(shape(flattenTree(tree, () => false))).toEqual(["0:src", "0:z.ts"]);
    expect(shape(flattenTree(tree, (p) => p === "src"))).toEqual(["0:src", "1:src/deep", "1:src/a.ts", "0:z.ts"]);
    expect(shape(flattenTree(tree, () => true))).toEqual([
        "0:src",
        "1:src/deep",
        "2:src/deep/b.ts",
        "1:src/a.ts",
        "0:z.ts",
    ]);
});

test("listRows is flat, sorted by name, with the directory split off", () => {
    const rows = listRows(files("src/sync/queue.ts", "package.json", "src/styles/theme.css"));
    expect(rows.map((r) => [r.node.name, r.dir])).toEqual([
        ["package.json", ""],
        ["queue.ts", "src/sync"],
        ["theme.css", "src/styles"],
    ]);
});

test("filterFiles needs every term, ignores case, skips folders and empty queries", () => {
    const entries: TreeEntry[] = [
        ...files("src/Header.tsx", "src/utils/rate-limit.ts", "README.md"),
        { path: "src/header-assets", kind: "folder" },
    ];
    expect(filterFiles(entries, "header").map((e) => e.path)).toEqual(["src/Header.tsx"]);
    expect(filterFiles(entries, "src limit").map((e) => e.path)).toEqual(["src/utils/rate-limit.ts"]);
    expect(filterFiles(entries, "  ")).toEqual([]);
    expect(filterFiles(entries, "nope")).toEqual([]);
});
