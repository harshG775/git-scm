import { expect, test } from "vite-plus/test";
import { changedCountByDir, formatSize, statusByPath } from "./git-status";

test("a conflict beats a working-tree change, which beats a staged one", () => {
    const map = statusByPath({
        staged: [
            { path: "a.ts", status: "A" },
            { path: "b.ts", status: "M" },
            { path: "c.ts", status: "M" },
        ],
        changes: [
            { path: "b.ts", status: "D" },
            { path: "c.ts", status: "M" },
        ],
        conflicts: [{ path: "c.ts", status: "U" }],
    });
    expect([...map]).toEqual([
        ["a.ts", "A"],
        ["b.ts", "D"],
        ["c.ts", "!"],
    ]);
});

test("every ancestor folder counts a changed file once", () => {
    const counts = changedCountByDir(["src/a/x.ts", "src/y.ts", "top.md"]);
    expect(counts.get("src")).toBe(2);
    expect(counts.get("src/a")).toBe(1);
    expect(counts.has("top.md")).toBe(false);
    expect(counts.size).toBe(2);
});

test("sizes", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(1023)).toBe("1023 B");
    expect(formatSize(1024)).toBe("1 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(12 * 1024)).toBe("12 KB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5 MB");
});
