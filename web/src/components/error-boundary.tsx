import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "#/components/ui/button";

export type FallbackProps = { error: Error; reset: () => void };

/** What the user sees instead of a blank page when something throws while rendering. */
export function ErrorFallback({ error, reset, title = "Something went wrong" }: FallbackProps & { title?: string }) {
    return (
        <div role="alert" className="flex min-h-40 flex-col items-center justify-center gap-3 p-6 text-center">
            <TriangleAlert aria-hidden="true" className="size-8 text-destructive" />
            <h2 className="text-sm font-medium">{title}</h2>
            <p className="max-w-full font-mono text-xs break-words whitespace-pre-wrap text-muted-foreground">
                {error.message || String(error)}
            </p>
            <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={reset}>
                    Try again
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => location.reload()}>
                    <RefreshCw aria-hidden="true" className="size-4" />
                    Reload page
                </Button>
            </div>
        </div>
    );
}

type Props = {
    children: ReactNode;
    /** replaces the default fallback */
    fallback?: (props: FallbackProps) => ReactNode;
    /** names the failed part in the default fallback, e.g. "Files failed to load" */
    title?: string;
    /** when any of these change (switching project or tab), a shown error clears itself */
    resetKeys?: readonly unknown[];
};

type State = { error: Error | null };

const changed = (a: readonly unknown[] = [], b: readonly unknown[] = []) =>
    a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));

/** Catches render errors below it so one broken panel doesn't blank the whole workspace. */
export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(error, info.componentStack);
    }

    componentDidUpdate(prev: Props) {
        if (this.state.error && changed(prev.resetKeys, this.props.resetKeys)) this.reset();
    }

    reset = () => this.setState({ error: null });

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        const props = { error, reset: this.reset };
        return this.props.fallback ? this.props.fallback(props) : <ErrorFallback {...props} title={this.props.title} />;
    }
}
