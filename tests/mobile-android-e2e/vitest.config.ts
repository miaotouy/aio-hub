import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/mobile-android-e2e/**/*.test.ts"],
  },
});
