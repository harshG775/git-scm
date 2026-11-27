import { cn } from "cn";

/** A native <select> styled like <Input>: the platform picker is the best control on a phone. */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
    return (
        <select
            data-slot="native-select"
            className={cn(
                "h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:h-8 md:text-sm dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground",
                className,
            )}
            {...props}
        />
    );
}

export { NativeSelect };
