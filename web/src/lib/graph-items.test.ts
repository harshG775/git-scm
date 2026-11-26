import { expect, test } from "vite-plus/test";
import type { GitCommit, GitLog, GitStash } from "./api";
import { buildItems } from "./graph-items";

const commit = (oid: string, ...parents: string[]): GitCommit => ({
    oid,
    parents,
    author: "a",
    email: "a@x",
    time: 0,
    subject: oid,
    body: "",
    refs: [],
});
const stash = (index: number, base: string): GitStash => ({
    index,
    oid: `s${index}`,
    branch: "main",
    title: "t",
    auto: true,
    time: 0,
    base,
});
const log = (over: Partial<GitLog>): GitLog => ({
    isRepo: true,
    head: "c3",
    headBranch: "main",
    detached: false,
    uncommitted: 0,
    commits: [commit("c3", "c2"), commit("c2", "c1"), commit("c1")],
    hasMore: false,
    stashes: [],
    ...over,
});
const ids = (l: GitLog) => buildItems(l).map((i) => i.id);

test("plain history is just the commits", () => {
    expect(ids(log({}))).toEqual(["c3", "c2", "c1"]);
});

test("uncommitted changes come first and hang off HEAD", () => {
    const items = buildItems(log({ uncommitted: 29 }));
    expect(items[0]).toMatchObject({ kind: "uncommitted", parents: ["c3"], count: 29 });
    expect(buildItems(log({ uncommitted: 0 })).some((i) => i.kind === "uncommitted")).toBe(false);
});

test("uncommitted changes before the first commit have no parent", () => {
    const items = buildItems(log({ uncommitted: 2, head: "", commits: [] }));
    expect(items).toEqual([{ kind: "uncommitted", id: "uncommitted", parents: [], count: 2 }]);
});

test("a stash sits directly above the commit it was made on", () => {
    expect(ids(log({ stashes: [stash(0, "c2")] }))).toEqual(["c3", "stash:s0", "c2", "c1"]);
});

test("several stashes on one commit keep their order (stash@{0} first)", () => {
    expect(ids(log({ stashes: [stash(1, "c2"), stash(0, "c2")] }))).toEqual(["c3", "stash:s0", "stash:s1", "c2", "c1"]);
});

test("a stash whose base commit is not loaded is left out", () => {
    expect(ids(log({ stashes: [stash(0, "older-than-the-page")] }))).toEqual(["c3", "c2", "c1"]);
});

test("a stash points at its base so it joins that commit's line", () => {
    const item = buildItems(log({ stashes: [stash(0, "c2")] })).find((i) => i.kind === "stash");
    expect(item?.parents).toEqual(["c2"]);
});
