import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const manifest = JSON.parse(
  readFileSync(new URL("../custom_components/atrium/manifest.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig(({ mode }) => ({
  define: {
    __ATRIUM_VERSION__: JSON.stringify(manifest.version),
  },
  build: {
    lib: {
      entry: "src/main.ts",
      formats: ["es"],
      fileName: () => "atrium.js",
    },
    outDir: "../custom_components/atrium/frontend",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: mode === "development",
    minify: mode !== "development",
  },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
  },
}));
