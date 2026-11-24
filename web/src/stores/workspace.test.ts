import { beforeEach, expect, test } from "vite-plus/test";
import { useWorkspace } from "./workspace";

const s = () => useWorkspace.getState();

beforeEach(() => {
    useWorkspace.setState({
        projectId: null,
        tabs: [],
        expanded: [],
        sidebarPanel: "explorer",
        sidebarOpen: true,
        drawerOpen: false,
    });
});

test("openFile does not duplicate tabs", () => {
    s().openFile("a.ts");
    s().openFile("a.ts");
    s().openFile("b.ts");
    expect(s().tabs.map((t) => t.path)).toEqual(["a.ts", "b.ts"]);
});

test("closing the active tab activates its right neighbour, else the left one", () => {
    ["a", "b", "c"].forEach(s().openFile);
    expect(s().closeFile("b", "b")).toBe("c");
    expect(s().closeFile("c", "c")).toBe("a");
    expect(s().closeFile("a", "a")).toBeNull();
    expect(s().tabs).toEqual([]);
});

test("closing a background tab keeps the active file", () => {
    ["a", "b"].forEach(s().openFile);
    expect(s().closeFile("a", "b")).toBe("b");
});

test("setBuffer marks one tab dirty and undefined cleans it", () => {
    ["a", "b"].forEach(s().openFile);
    s().setBuffer("a", "edited");
    expect(s().tabs.find((t) => t.path === "a")?.buffer).toBe("edited");
    expect(s().tabs.find((t) => t.path === "b")?.buffer).toBeUndefined();
    s().setBuffer("a", undefined);
    expect(s().tabs.find((t) => t.path === "a")?.buffer).toBeUndefined();
});

test("enterProject resets tabs only when the project changes", () => {
    s().enterProject("p1");
    s().openFile("a");
    s().toggleDir("src");
    s().enterProject("p1");
    expect(s().tabs).toHaveLength(1);
    s().enterProject("p2");
    expect(s().tabs).toEqual([]);
    expect(s().expanded).toEqual([]);
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
