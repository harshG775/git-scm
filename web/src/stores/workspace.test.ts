import { beforeEach, expect, test } from "vite-plus/test";
import { diffId, useWorkspace } from "./workspace";

const s = () => useWorkspace.getState();
const ids = () => s().tabs.map((t) => t.id);

beforeEach(() => {
    useWorkspace.setState({
        projectId: null,
        tabs: [],
        expanded: [],
        sidebarPanel: "explorer",
        sidebarOpen: true,
        drawerOpen: false,
        commitMessage: "",
    });
});

test("openFile does not duplicate tabs", () => {
    s().openFile("a.ts");
    s().openFile("a.ts");
    s().openFile("b.ts");
    expect(ids()).toEqual(["a.ts", "b.ts"]);
});

test("a file and its staged and unstaged diffs are three separate tabs", () => {
    s().openFile("a.ts");
    s().openDiff("a.ts", false);
    s().openDiff("a.ts", true);
    s().openDiff("a.ts", true);
    expect(ids()).toEqual(["a.ts", diffId("a.ts", false), diffId("a.ts", true)]);
    expect(s().tabs.map((t) => t.kind)).toEqual(["file", "diff", "diff"]);
});

test("closing the active tab activates its right neighbour, else the left one", () => {
    ["a", "b", "c"].forEach(s().openFile);
    expect(s().closeTab("b", "b")?.id).toBe("c");
    expect(s().closeTab("c", "c")?.id).toBe("a");
    expect(s().closeTab("a", "a")).toBeNull();
    expect(s().tabs).toEqual([]);
});

test("closing a background tab keeps the active tab", () => {
    ["a", "b"].forEach(s().openFile);
    expect(s().closeTab("a", "b")?.id).toBe("b");
});

test("closing works across file and diff tabs", () => {
    s().openFile("a");
    s().openDiff("a", false);
    expect(s().closeTab(diffId("a", false), diffId("a", false))?.id).toBe("a");
});

test("setBuffer touches only the file tab, never a diff tab for the same path", () => {
    s().openFile("a");
    s().openDiff("a", false);
    s().setBuffer("a", "edited");
    expect(s().tabs.find((t) => t.kind === "file")?.buffer).toBe("edited");
    expect(s().tabs.find((t) => t.kind === "diff")?.buffer).toBeUndefined();
    s().setBuffer("a", undefined);
    expect(s().tabs.find((t) => t.kind === "file")?.buffer).toBeUndefined();
});

test("cleaning a tab clears its changed-on-disk flag", () => {
    s().openFile("a");
    s().setBuffer("a", "x");
    s().markChanged("a", true);
    s().setBuffer("a", undefined);
    expect(s().tabs[0].changedOnDisk).toBe(false);
});

test("enterProject resets tabs and the commit draft only when the project changes", () => {
    s().enterProject("p1");
    s().openFile("a");
    s().toggleDir("src");
    s().setCommitMessage("wip");
    s().enterProject("p1");
    expect(s().tabs).toHaveLength(1);
    expect(s().commitMessage).toBe("wip");
    s().enterProject("p2");
    expect(s().tabs).toEqual([]);
    expect(s().expanded).toEqual([]);
    expect(s().commitMessage).toBe("");
});

test("selectPanel: same panel collapses, other panel switches and opens", () => {
    s().selectPanel("explorer", true);
    expect(s().sidebarOpen).toBe(false);
    s().selectPanel("git", true);
    expect(s().sidebarOpen).toBe(true);
    expect(s().sidebarPanel).toBe("git");
});

test("selectPanel on phone drives the drawer, not the desktop sidebar", () => {
    s().selectPanel("explorer", false);
    expect(s().drawerOpen).toBe(true);
    expect(s().sidebarOpen).toBe(true);
    s().selectPanel("explorer", false);
    expect(s().drawerOpen).toBe(false);
});

test("Branches sections: Local starts open, the others closed, and each toggles on its own", () => {
    useWorkspace.setState({ branchSections: { local: true, remote: false, stash: false } });
    s().toggleBranchSection("remote");
    expect(s().branchSections).toEqual({ local: true, remote: true, stash: false });
    s().toggleBranchSection("local");
    expect(s().branchSections).toEqual({ local: false, remote: true, stash: false });
    s().toggleBranchSection("remote");
    expect(s().branchSections.remote).toBe(false);
});

test("the graph is a single tab, however often it is opened", () => {
    s().openGraph();
    s().openGraph();
    s().openFile("a");
    expect(ids()).toEqual(["view:graph", "a"]);
    expect(s().tabs[0].kind).toBe("graph");
    expect(s().closeTab("view:graph", "view:graph")?.id).toBe("a");
});
