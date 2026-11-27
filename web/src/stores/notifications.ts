import { create } from "zustand";
import { persist } from "zustand/middleware";
import { migrateStorageKey } from "./storage-migration";

export type NotificationType = "success" | "error" | "info";

export interface AppNotification {
    id: string;
    type: NotificationType;
    title: string;
    description?: string;
    /** Epoch milliseconds. */
    time: number;
    read: boolean;
}

/** Old entries fall off the end, so the saved list cannot grow without bound. */
export const MAX_NOTIFICATIONS = 100;

interface NotificationState {
    /** Newest first. */
    items: AppNotification[];
    /** Hides the pop-up toasts (errors still show); everything is still recorded here. */
    doNotDisturb: boolean;
    add: (n: Pick<AppNotification, "type" | "title" | "description">) => void;
    markAllRead: () => void;
    remove: (id: string) => void;
    clear: () => void;
    toggleDoNotDisturb: () => void;
}

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Kept in localStorage like the other per-device UI state: it is a log of what happened on this
// device, so it should survive a reload but does not need to follow the user to another one.
migrateStorageKey("git-scm.notifications", "git-csm.notifications");
export const useNotifications = create<NotificationState>()(
    persist(
        (set) => ({
            items: [],
            doNotDisturb: false,
            add: (n) =>
                set((s) => ({
                    items: [{ ...n, id: newId(), time: Date.now(), read: false }, ...s.items].slice(
                        0,
                        MAX_NOTIFICATIONS,
                    ),
                })),
            markAllRead: () =>
                set((s) => (s.items.some((i) => !i.read) ? { items: s.items.map((i) => ({ ...i, read: true })) } : s)),
            remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
            clear: () => set({ items: [] }),
            toggleDoNotDisturb: () => set((s) => ({ doNotDisturb: !s.doNotDisturb })),
        }),
        {
            name: "git-scm.notifications",
            version: 1,
            partialize: ({ items, doNotDisturb }) => ({ items, doNotDisturb }),
        },
    ),
);
