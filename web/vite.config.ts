import { defineConfig, lazyPlugins } from "vite-plus";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackRouter } from "@tanstack/router-plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

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
    ]),
});

export default config;
