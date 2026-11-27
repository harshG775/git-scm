import { defineConfig, lazyPlugins } from "vite-plus";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackRouter } from "@tanstack/router-plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const API = process.env.GIT_CSM_API ?? "http://127.0.0.1:8080";
const apiOrigin = new URL(API).origin;

const config = defineConfig({
    fmt: {
        useTabs: false,
        tabWidth: 4,
        printWidth: 120,
        ignorePatterns: ["**/routeTree.gen.ts"],
    },
    lint: {
        jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
        rules: { "vite-plus/prefer-vite-plus-imports": "error" },
        options: { typeAware: true, typeCheck: true },
    },
    resolve: { tsconfigPaths: true },
    server: {
        // Forward API calls to the Go server during `vp dev`. GIT_CSM_API overrides the target.
        proxy: {
            "/api": {
                target: API,
                changeOrigin: true,
                // The Go server refuses any request whose Origin is not itself (it has no login, so
                // this is what keeps other websites out). The proxy rewrites Host to the API but
                // forwards the browser's Origin, which would always mismatch. So: accept only
                // requests that really came from this dev server's own page, present the API's origin
                // for them, and refuse the rest here, so the proxy cannot launder cross-site requests.
                bypass(req, res) {
                    const origin = req.headers.origin;
                    if (!origin) return; // GET navigations, curl: nothing to check
                    let sameOrigin = false;
                    try {
                        sameOrigin = new URL(origin).host === req.headers.host;
                    } catch {
                        // malformed Origin: treated as cross-site
                    }
                    if (!sameOrigin) {
                        if (!res) return false; // WebSocket upgrade: Vite answers 404
                        res.statusCode = 403;
                        res.end("cross-origin request blocked");
                        return req.url; // response already sent, so Vite stops here
                    }
                    req.headers.origin = apiOrigin;
                },
            },
        },
    },
    plugins: lazyPlugins(() => [
        devtools(),
        tailwindcss(),
        tanstackRouter({ target: "react", autoCodeSplitting: true }),
        viteReact(),
        VitePWA({
            registerType: "autoUpdate",
            manifest: {
                name: "git csm",
                short_name: "git csm",
                description: "Source control and code browsing, built for your phone.",
                // A manifest has one color for both themes; the splash screen uses the dark background.
                theme_color: "#0d1113",
                background_color: "#0d1113",
                display: "standalone",
                start_url: "/",
                scope: "/",
                icons: [
                    { src: "icon-192.png", sizes: "192x192", type: "image/png" },
                    { src: "icon-512.png", sizes: "512x512", type: "image/png" },
                    { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
                ],
            },
            workbox: {
                // App shell only. The API and the /events stream must never be served from cache.
                navigateFallback: "/index.html",
                navigateFallbackDenylist: [/^\/api\//],
                globPatterns: ["**/*.{js,css,html,png,webmanifest}", "**/inter-latin*.woff2"],
            },
        }),
    ]),
});

export default config;
