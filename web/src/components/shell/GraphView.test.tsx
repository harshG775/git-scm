import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vite-plus/test";
import type { GitCommit, GitLog, GitStash } from "#/lib/api";
import type { UncommittedCounts } from "#/lib/graph-items";
import { Graph, ROW_H } from "./GraphView";

const commit = (oid: string, subject: string, parents: string[], refs: GitCommit["refs"] = []): GitCommit => ({
    oid: oid.padEnd(40, "0"),
    parents: parents.map((p) => p.padEnd(40, "0")),
    author: "Ada",
    email: "ada@x.io",
    time: 1_795_000_000,
    subject,
    body: "",
    refs,
});
const stash = (index: number, base: string): GitStash => ({
    index,
    oid: `s${index}`.padEnd(40, "0"),
    branch: "main",
    title: "wip",
    auto: true,
    time: 1_795_000_000,
    base: base.padEnd(40, "0"),
});
const baseLog: GitLog = {
    isRepo: true,
    head: "c3".padEnd(40, "0"),
    headBranch: "main",
    detached: false,
    uncommitted: 0,
    hasMore: false,
    stashes: [],
    commits: [
        commit(
            "c3",
            "third",
            ["c2"],
            [
                { name: "main", kind: "branch", current: true },
                { name: "origin/main", kind: "remote" },
            ],
        ),
        commit("c2", "second", ["c1"], [{ name: "v1", kind: "tag" }]),
        commit("c1", "first", []),
    ],
};
const render = (log: GitLog, selected: string | null = null, uncommittedCounts?: UncommittedCounts) =>
    renderToStaticMarkup(
        <Graph
            log={log}
            desktop
            selected={selected}
            uncommittedCounts={uncommittedCounts}
            onSelect={() => {}}
            onMore={() => {}}
            loadingMore={false}
        />,
    );

test("renders every commit with its refs, and the desktop column headers", () => {
    const html = render(baseLog);
    for (const text of [
        "third",
        "second",
        "first",
        "main",
        "origin/main",
        "v1",
        "Ada",
        "Description",
        "Author",
        "Commit",
    ]) {
        expect(html, text).toContain(text);
    }
});

test("HEAD is a ring, other commits are filled dots", () => {
    const html = render(baseLog);
    expect(html.match(/<circle[^>]*r="5"/g)).toHaveLength(1); // HEAD only
    expect(html.match(/<circle[^>]*r="4"/g)).toHaveLength(2);
});

test("uncommitted changes and a stash get their own rows, and the stash joins the main line", () => {
    const html = render({ ...baseLog, uncommitted: 29, stashes: [stash(0, "c2")] });
    expect(html).toContain("Uncommitted Changes (29)");
    expect(html).toContain("stash@{0}");
    expect(html).toContain("WIP on main: wip");
    expect(html).toContain('stroke-dasharray="3 3"'); // the dashed line from the uncommitted node
    expect(html).toContain("#d946ef"); // stash colour
    expect(html).toMatch(new RegExp(`<path[^>]*d="M[\\d.]+ ${ROW_H / 2}C`)); // curve from the stash into main line
});

test("shows staged and unstaged counts under the uncommitted row", () => {
    const html = render({ ...baseLog, uncommitted: 6 }, null, { staged: 2, unstaged: 4 });
    expect(html).toContain("Uncommitted Changes (6)");
    expect(html).toContain("2 staged · 4 unstaged");
});

test("a merge draws curves between lanes", () => {
    const merge: GitLog = {
        ...baseLog,
        head: "m".padEnd(40, "0"),
        commits: [
            commit("m", "merge", ["a", "f"], [{ name: "main", kind: "branch", current: true }]),
            commit("a", "main work", ["base"]),
            commit("f", "feature work", ["base"], [{ name: "feature", kind: "branch" }]),
            commit("base", "base", []),
        ],
    };
    const html = render(merge);
    expect(html.match(/d="[^"]*C/g) ?? []).toHaveLength(2); // out to the second parent, and back in at the branch point
});

test("shows an empty message when there is nothing to draw", () => {
    expect(render({ ...baseLog, commits: [], head: "" })).toContain("No commits yet.");
});

test("selecting a commit shows its details, with the full hash", () => {
    const log = {
        ...baseLog,
        commits: [{ ...baseLog.commits[0], body: "longer description" }, ...baseLog.commits.slice(1)],
    };
    const html = render(log, baseLog.commits[0].oid);
    expect(html).toContain("longer description");
    expect(html).toContain("ada@x.io");
    expect(html).toContain(baseLog.commits[0].oid);
});

test("hundreds of lanes are squeezed to fit instead of overflowing", () => {
    const many: GitLog = {
        ...baseLog,
        head: "t0".padEnd(40, "0"),
        commits: [
            ...Array.from({ length: 60 }, (_, i) => commit(`t${i}`, `tip ${i}`, ["root"])),
            commit("root", "root", []),
        ],
    };
    const html = render(many);
    const widths = [...html.matchAll(/<svg width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(Math.max(...widths)).toBeLessThanOrEqual(300);
});

test("a one-lane history still leaves room for the Graph column header", () => {
    const widths = [...render(baseLog).matchAll(/<svg width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(56);
    expect(new Set(widths).size).toBe(1); // every row's graph cell is the same width, so columns line up
});
