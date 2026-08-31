import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: resolve(import.meta.dirname, "src/renderer"),
  build: {
    outDir: resolve(import.meta.dirname, "dist/renderer"),
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: { input: resolve(import.meta.dirname, "src/renderer/index.html") },
  },
});
