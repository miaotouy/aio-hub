// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";

const config = vi.hoisted(() => vi.fn());
vi.mock("@/utils/monaco", () => ({ localEngine: true }));
vi.mock("@guolao/vue-monaco-editor", () => ({ loader: { config } }));

// A failed configuration must be retryable, then shared by concurrent editor requests.
it("retries local engine setup and shares successful configuration", async () => {
  const { loadMonacoEditor } = await import("../loadMonacoEditor");
  config.mockImplementationOnce(() => {
    throw new Error("setup failed");
  });
  await expect(loadMonacoEditor()).rejects.toThrow("setup failed");
  const [first, second] = await Promise.all([
    loadMonacoEditor(),
    loadMonacoEditor(),
  ]);
  expect(first).toBe(second);
  expect(config).toHaveBeenCalledTimes(2);
  expect(config).toHaveBeenLastCalledWith({
    monaco: expect.objectContaining({ localEngine: true }),
  });
});
