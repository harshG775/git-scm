import { Progress } from "@base-ui/react/progress";
import { useEffect, useRef, useState } from "react";

/**
 * A thin progress line under a tab header, with the same easing as the route progress bar.
 * It starts when `active` turns on and completes when the refresh finishes.
 */
export function TabProgressBar({ active }: { active: boolean }) {
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(false);
    const wasActive = useRef(false);

    const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        clearInterval(intervalRef.current);
        clearTimeout(hideTimeoutRef.current);
        clearTimeout(resetTimeoutRef.current);

        if (active) {
            wasActive.current = true;
            setVisible(true);
            setProgress(15);

            intervalRef.current = setInterval(() => {
                setProgress((prev) => {
                    if (prev >= 90) {
                        clearInterval(intervalRef.current);
                        return prev;
                    }
                    const step = Math.max(1, (90 - prev) / 10);
                    return Math.min(prev + step, 90);
                });
            }, 150);
        } else if (wasActive.current) {
            wasActive.current = false;
            setProgress(100);

            hideTimeoutRef.current = setTimeout(() => {
                setVisible(false);
                resetTimeoutRef.current = setTimeout(() => setProgress(0), 200);
            }, 250);
        }

        return () => {
            clearInterval(intervalRef.current);
            clearTimeout(hideTimeoutRef.current);
            clearTimeout(resetTimeoutRef.current);
        };
    }, [active]);

    if (!visible && progress === 0) return null;

    return (
        <Progress.Root
            value={progress}
            aria-label="Refreshing"
            data-slot="tab-progress"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 w-full"
        >
            <Progress.Track className="relative flex h-0.5 w-full items-center overflow-x-hidden rounded-none bg-transparent">
                <Progress.Indicator className="h-full bg-primary transition-[width] duration-200 ease-out" />
            </Progress.Track>
        </Progress.Root>
    );
}
