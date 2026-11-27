import { beforeEach, expect, test } from "vite-plus/test";
import { useSettings } from "./settings";

beforeEach(() => {
    useSettings.setState({ theme: "auto", pullModeByProject: {} });
});

test("keeps the pull/fetch selection independent for each project", () => {
    useSettings.getState().setPullMode("project-a", "pull-rebase");
    useSettings.getState().setPullMode("project-b", "fetch-all");

    expect(useSettings.getState().pullModeByProject).toEqual({
        "project-a": "pull-rebase",
        "project-b": "fetch-all",
    });
});
