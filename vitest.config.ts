import { defineConfig } from "vitest/config";

// Single root vitest config; auto-discovers *.test.ts across all workspace packages.
// Workspace package imports (@festival-bot/core, @festival/ps26) resolve via the
// node_modules symlinks npm creates, whose "exports" point at TypeScript source.
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "festivals/**/*.test.ts"],
    environment: "node",
  },
});
