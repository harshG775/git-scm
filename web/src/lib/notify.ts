import { toast } from "#/components/ui/toast";
import { useNotifications, type NotificationType } from "#/stores/notifications";

export type NotifyOptions = {
    type: NotificationType;
    title: string;
    description?: string;
    timeout?: number;
    record?: boolean;
};

/**
 * Tell the user something happened: it is kept in the notification center and shown as a toast.
 * Do not disturb hides the toast, except for errors. Pass `record: false` for trivial confirmations
 * ("Copied") that are not worth keeping.
 */
export function notify({ type, title, description, timeout, record = true }: NotifyOptions) {
    const { add, doNotDisturb } = useNotifications.getState();
    if (record) add({ type, title, description });
    if (doNotDisturb && type !== "error") return;
    toast.add({ type, title, description, timeout });
}

/**
 * Show a toast that stays open until the work finishes. Pass the returned id to `notifyDone`
 * so it turns into the success or error toast in place, instead of stacking a second one.
 */
export function notifyLoading(title: string): string | null {
    const { doNotDisturb } = useNotifications.getState();
    if (doNotDisturb) return null;
    return toast.add({ type: "loading", title, timeout: 0 });
}

/** Ends a loading toast with the result; without an id it behaves like `notify`. */
export function notifyDone(id: string | null | undefined, options: NotifyOptions) {
    if (!id) {
        notify(options);
        return;
    }
    const { add, doNotDisturb } = useNotifications.getState();
    if (options.record !== false) add({ type: options.type, title: options.title, description: options.description });
    if (doNotDisturb && options.type !== "error") {
        toast.close(id);
        return;
    }
    toast.update(id, {
        type: options.type,
        title: options.title,
        description: options.description,
        timeout: options.timeout,
    });
}
