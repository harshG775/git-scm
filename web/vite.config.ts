import { defineConfig, lazyPlugins } from "vite-plus";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackRouter } from "@tanstack/router-plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

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
        // Forward API calls to the Go server during `vp dev`.
        proxy: { "/api": "http://127.0.0.1:8080" },
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
                theme_color: "#262626",
                background_color: "#262626",
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
