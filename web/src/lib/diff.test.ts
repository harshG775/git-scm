import { expect, test } from "vite-plus/test";
import { parseDiff } from "./diff";

const kinds = (d: string) => parseDiff(d).map((l) => l.kind);

test("classifies a typical diff", () => {
    const d = [
        "diff --git a/x.ts b/x.ts",
        "index 1..2 100644",
        "--- a/x.ts",
        "+++ b/x.ts",
        "@@ -1,2 +1,2 @@ fn()",
        " keep",
        "-old",
        "+new",
    ].join("\n");
    expect(kinds(d)).toEqual(["meta", "meta", "meta", "meta", "hunk", "context", "del", "add"]);
});

test("--- and +++ inside a hunk are content, not headers", () => {
    const d = [
        "diff --git a/x b/x",
        "@@ -1 +1 @@",
        "--- removed line starting with --",
        "+++ added line starting with ++",
    ].join("\n");
    expect(kinds(d)).toEqual(["meta", "hunk", "del", "add"]);
});

test("a second file's headers are meta again", () => {
    const d = [
        "diff --git a/a b/a",
        "@@ -1 +1 @@",
        "-x",
        "diff --git a/b b/b",
        "--- a/b",
        "+++ b/b",
        "@@ -1 +1 @@",
        "+y",
    ].join("\n");
    expect(kinds(d)).toEqual(["meta", "hunk", "del", "meta", "meta", "meta", "hunk", "add"]);
});

test("the trailing newline does not add a blank line, and the no-newline marker is context", () => {
    const d = "diff --git a/a b/a\n@@ -1 +1 @@\n-x\n+y\n\\ No newline at end of file\n";
    expect(parseDiff(d)).toHaveLength(5);
    expect(kinds(d).at(-1)).toBe("context");
});

test("empty input has no lines", () => {
    expect(parseDiff("")).toEqual([]);
});
