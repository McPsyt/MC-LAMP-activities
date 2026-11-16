import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { viteSingleFile } from "vite-plugin-singlefile"
import { fileURLToPath } from "node:url"
import { readFileSync } from "node:fs"

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))

// Modes:
//   (dev server)        `vite`                     -> builder.html, index.html, dev/host.html all served
//   activity            `vite build --mode activity` -> build/index.html   (single file, consumed by ../build.sh)
//   builder             `vite build --mode builder`  -> build-builder/builder.html (single file, finalized to release/)
export default defineConfig(({ mode, command }) => {
  const isBuilder = mode === "builder"
  const singleFile = command === "build"
  return {
    base: "./",
    plugins: [react(), tailwindcss(), ...(singleFile ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    define: {
      __BUILD_INFO__: JSON.stringify({ version: pkg.version, date: new Date().toISOString().slice(0, 10) }),
    },
    server: { port: 5173 },
    // Pre-bundle everything the three pages use so the dev server never reloads mid-test.
    optimizeDeps: { entries: ["index.html", "builder.html", "dev/host.html"] },
    build: {
      outDir: isBuilder ? "build-builder" : "build",
      emptyOutDir: true,
      assetsInlineLimit: 100_000_000,
      cssCodeSplit: false,
      chunkSizeWarningLimit: 5000,
      rolldownOptions: {
        input: fileURLToPath(new URL(isBuilder ? "./builder.html" : "./index.html", import.meta.url)),
        // The dashboard decodes activities with atob() (Latin-1), so the bundle must be pure ASCII.
        output: { charset: "ascii" },
      },
    },
  }
})
