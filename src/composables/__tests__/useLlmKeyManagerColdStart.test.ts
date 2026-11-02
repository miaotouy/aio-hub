import { describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@utils/configManager", () => ({
  createConfigManager: () => ({
    load: mocks.load,
    save: vi.fn(),
    saveDebounced: vi.fn(),
  }),
}));
import { useLlmKeyManager } from "../useLlmKeyManager";
import { hashApiKey } from "@/utils/llm-secret/apiKeyHash";

describe("key manager cold-start contract", () => {
  it("并发等待状态加载后遵守用户禁用的 Key", async () => {
    let finish!: (data: unknown) => void;
    mocks.load.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const manager = useLlmKeyManager();
    const first = manager.ensureLoaded();
    const second = manager.ensureLoaded();
    const key = "test-only-disabled-key";
    const hash = hashApiKey(key);
    finish({
      states: {
        cold: {
          [hash]: {
            key: hash,
            isEnabled: false,
            isBroken: false,
            errorCount: 0,
          },
        },
      },
      lastUsedIndices: {},
      profileSettings: {},
    });
    await Promise.all([first, second]);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(() =>
      manager.pickKey({
        id: "cold",
        name: "Cold",
        apiKeys: [key],
      } as LlmProfile)
    ).toThrow(expect.objectContaining({ reason: "all-disabled" }));
  });
});
