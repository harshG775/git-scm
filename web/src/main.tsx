import { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { getRouter } from "./router";
import { queryClient } from "./lib/query-client";
import { ErrorBoundary } from "./components/error-boundary";

const router = getRouter();

// index.html paints a skeleton so the page is never blank while this bundle loads; drop it once we render
function RemoveBootSplash() {
    useEffect(() => document.getElementById("boot")?.remove(), []);
    return null;
}

const rootElement = document.getElementById("app")!;

if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <>
            <ErrorBoundary>
                <QueryClientProvider client={queryClient}>
                    <RouterProvider router={router} />
                </QueryClientProvider>
            </ErrorBoundary>
            <RemoveBootSplash />
        </>,
    );
}
