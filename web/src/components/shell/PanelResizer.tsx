import { useRef } from "react";

type PanelResizerProps = {
    width: number;
    min: number;
    max: number;
    onChange: (width: number) => void;
    onReset?: () => void;
    // dragging well past `min` collapses the panel, like VS Code
    onCollapse?: () => void;
};

const KEY_STEP = 16;
const COLLAPSE_BELOW = 80;

// vertical drag handle between sidebar and editor, shown at md+ only
export function PanelResizer({ width, min, max, onChange, onReset, onCollapse }: PanelResizerProps) {
    const drag = useRef<{ startX: number; startWidth: number } | null>(null);
    const clamp = (value: number) => Math.round(Math.max(min, Math.min(max, value)));

    return (
        <div
            role="separator"
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={width}
            tabIndex={0}
            onDoubleClick={onReset}
            onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { startX: e.clientX, startWidth: width };
            }}
            onPointerMove={(e) => {
                if (!drag.current) return;
                const raw = drag.current.startWidth + e.clientX - drag.current.startX;
                if (onCollapse && raw < min - COLLAPSE_BELOW) {
                    drag.current = null;
                    onCollapse();
                    return;
                }
                onChange(clamp(raw));
            }}
            onPointerUp={() => {
                drag.current = null;
            }}
            onPointerCancel={() => {
                drag.current = null;
            }}
            onKeyDown={(e) => {
                if (e.key === "ArrowLeft") onChange(clamp(width - KEY_STEP));
                else if (e.key === "ArrowRight") onChange(clamp(width + KEY_STEP));
                else if (e.key === "Home") onChange(min);
                else if (e.key === "End") onChange(max);
                else return;
                e.preventDefault();
            }}
            className="group relative hidden w-px shrink-0 cursor-col-resize touch-none bg-border outline-none md:block"
        >
            {/* wider hit area than the 1px line */}
            <span className="absolute inset-y-0 -left-1.5 w-3 transition-colors group-hover:bg-sidebar-primary/30 group-focus-visible:bg-sidebar-primary/40 group-active:bg-sidebar-primary/50" />
        </div>
    );
}
