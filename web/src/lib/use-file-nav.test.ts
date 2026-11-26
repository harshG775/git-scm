import { expect, test } from "vite-plus/test";
import { activeIdOf } from "./use-file-nav";
import { GRAPH_ID, diffId } from "#/stores/workspace";

test("the URL's search params name the active tab", () => {
    expect(activeIdOf({ file: "src/a.ts" })).toBe("src/a.ts");
    expect(activeIdOf({ diff: "src/a.ts" })).toBe(diffId("src/a.ts", false));
    expect(activeIdOf({ diff: "src/a.ts", staged: true })).toBe(diffId("src/a.ts", true));
    expect(activeIdOf({ view: "graph" })).toBe(GRAPH_ID);
    expect(activeIdOf({})).toBeNull();
});
