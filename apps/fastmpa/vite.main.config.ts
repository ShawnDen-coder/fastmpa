import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: resolve(import.meta.dirname, "dist/main"),
    emptyOutDir: true,
    target: "node22",
    lib: {
      entry: resolve(import.meta.dirname, "src/main/main.ts"),
      formats: ["es"],
      fileName: () => "main.mjs",
    },
    rollupOptions: { external: [/^node:/, "electron", /^@shawnden-coder\//, /^workspace(?:\/.*)?$/, "better-sqlite3", "drizzle-orm", "pino", "pino-pretty"] },
  },
});
