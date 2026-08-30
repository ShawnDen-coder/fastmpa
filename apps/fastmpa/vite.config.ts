import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  esbuild: {
    target: "node22",
  },
  build: {
    target: "node22",
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
    formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: [
        /^node:/,
        /^@shawnden-coder\//,
        /^workspace(?:\/.*)?$/,
        "commander",
        "ink",
        "react",
        "react/jsx-runtime",
        "better-sqlite3",
        "drizzle-orm",
        "pino",
        "pino-pretty",
      ],
      output: {
        banner: "#!/usr/bin/env node",
      },
    },
  },
});
