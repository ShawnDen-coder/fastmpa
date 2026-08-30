import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: resolve(import.meta.dirname, "dist/preload"),
    emptyOutDir: true,
    target: "node22",
    lib: {
      entry: resolve(import.meta.dirname, "src/preload/preload.ts"),
      formats: ["cjs"],
      fileName: () => "preload.cjs",
    },
    rollupOptions: { external: ["electron"] },
  },
});
