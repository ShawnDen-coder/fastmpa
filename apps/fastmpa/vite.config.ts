import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
    formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: [
        "commander",
        "@shawnden-coder/agent-runtime",
        "agent-scheduler",
        "workspace",
        "integrations",
        "tool-pipeline",
        "better-sqlite3",
        "drizzle-orm",
        "node:fs/promises",
        "node:path",
        "node:url",
        "node:crypto",
      ],
      output: {
        banner: "#!/usr/bin/env node",
      },
    },
  },
});
