import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/dev-control/**/*.test.ts"],
  },
});
