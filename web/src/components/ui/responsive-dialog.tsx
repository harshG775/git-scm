import { NativeDialog, type NativeDialogProps } from "#/components/ui/native-dialog";
import { NativeSheet } from "#/components/ui/native-sheet";
import { useIsDesktop } from "#/lib/use-media-query";

/** A dialog on the desktop layout, a bottom sheet on the phone layout; both are native <dialog>s. */
function ResponsiveDialog(props: NativeDialogProps) {
    const Component = useIsDesktop() ? NativeDialog : NativeSheet;
    return <Component {...props} />;
}

export { ResponsiveDialog };
