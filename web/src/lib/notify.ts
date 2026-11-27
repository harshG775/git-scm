import { toast } from "#/components/ui/toast";
import { useNotifications, type NotificationType } from "#/stores/notifications";

/**
 * Tell the user something happened: it is kept in the notification center and shown as a toast.
 * Do not disturb hides the toast, except for errors. Pass `record: false` for trivial confirmations
 * ("Copied") that are not worth keeping.
 */
export function notify({
    type,
    title,
    description,
    timeout,
    record = true,
}: {
    type: NotificationType;
    title: string;
    description?: string;
    timeout?: number;
    record?: boolean;
}) {
    const { add, doNotDisturb } = useNotifications.getState();
    if (record) add({ type, title, description });
    if (doNotDisturb && type !== "error") return;
    toast.add({ type, title, description, timeout });
}
