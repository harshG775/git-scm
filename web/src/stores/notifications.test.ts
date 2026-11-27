import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const add = vi.fn();
vi.mock("#/components/ui/toast", () => ({ toast: { add: (...args: unknown[]) => add(...args) } }));

import { notify } from "#/lib/notify";
import { MAX_NOTIFICATIONS, useNotifications } from "./notifications";

beforeEach(() => {
    add.mockClear();
    useNotifications.setState({ items: [], doNotDisturb: false });
});

describe("notifications", () => {
    it("keeps newest first and starts unread", () => {
        notify({ type: "success", title: "first" });
        notify({ type: "error", title: "second", description: "detail" });
        const { items } = useNotifications.getState();
        expect(items.map((i) => i.title)).toEqual(["second", "first"]);
        expect(items.every((i) => !i.read)).toBe(true);
        expect(items[0]?.description).toBe("detail");
    });

    it("shows a toast as well as recording", () => {
        notify({ type: "success", title: "Committed" });
        expect(add).toHaveBeenCalledOnce();
        expect(useNotifications.getState().items).toHaveLength(1);
    });

    it("does not record trivial confirmations when asked not to", () => {
        notify({ type: "success", title: "Copied", record: false });
        expect(useNotifications.getState().items).toHaveLength(0);
        expect(add).toHaveBeenCalledOnce();
    });

    it("do not disturb hides toasts but still records, and errors always show", () => {
        useNotifications.getState().toggleDoNotDisturb();
        notify({ type: "success", title: "quiet" });
        expect(add).not.toHaveBeenCalled();
        expect(useNotifications.getState().items).toHaveLength(1);
        notify({ type: "error", title: "loud" });
        expect(add).toHaveBeenCalledOnce();
    });

    it("marks everything read, removes one and clears all", () => {
        notify({ type: "info", title: "a" });
        notify({ type: "info", title: "b" });
        useNotifications.getState().markAllRead();
        expect(useNotifications.getState().items.every((i) => i.read)).toBe(true);
        const [first] = useNotifications.getState().items;
        useNotifications.getState().remove(first!.id);
        expect(useNotifications.getState().items).toHaveLength(1);
        useNotifications.getState().clear();
        expect(useNotifications.getState().items).toHaveLength(0);
    });

    it("drops the oldest entries past the cap", () => {
        for (let i = 0; i < MAX_NOTIFICATIONS + 5; i++) notify({ type: "info", title: `n${i}` });
        const { items } = useNotifications.getState();
        expect(items).toHaveLength(MAX_NOTIFICATIONS);
        expect(items[0]?.title).toBe(`n${MAX_NOTIFICATIONS + 4}`);
    });
});
