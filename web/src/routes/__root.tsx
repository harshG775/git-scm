import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";

import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { PanelSnapProvider } from "#/contexts/PanelSnapContext";
import { TooltipProvider } from "#/components/ui/tooltip";

import "../styles.css";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: RootComponent,
});

function RootComponent() {
    return (
        <>
            <TooltipProvider>
                <PanelSnapProvider>
                    <Outlet />
                </PanelSnapProvider>
            </TooltipProvider>
            <TanStackDevtools
                config={{
                    position: "bottom-right",
                }}
                plugins={[
                    {
                        name: "TanStack Router",
                        render: <TanStackRouterDevtoolsPanel />,
                    },
                    {
                        name: "TanStack Query",
                        render: <ReactQueryDevtoolsPanel />,
                    },
                ]}
            />
        </>
    );
}
