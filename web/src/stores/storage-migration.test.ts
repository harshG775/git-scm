import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import { migrateStorageKey } from "./storage-migration";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const values = new Map<string, string>();

beforeEach(() => {
    values.clear();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, String(value)),
            removeItem: (key: string) => values.delete(key),
        },
    });
});

afterEach(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

test("migrates a legacy key when the new key is absent", () => {
    values.set("git-csm.settings", '{"state":{"theme":"dark"}}');

    migrateStorageKey("git-scm.settings", "git-csm.settings");

    expect(values.get("git-scm.settings")).toBe('{"state":{"theme":"dark"}}');
    expect(values.has("git-csm.settings")).toBe(false);
});

test("keeps the new key when both keys exist", () => {
    values.set("git-scm.settings", '{"state":{"theme":"light"}}');
    values.set("git-csm.settings", '{"state":{"theme":"dark"}}');

    migrateStorageKey("git-scm.settings", "git-csm.settings");

    expect(values.get("git-scm.settings")).toBe('{"state":{"theme":"light"}}');
    expect(values.has("git-csm.settings")).toBe(false);
});
