import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/utils/configManager", () => ({
  createConfigManager: () => ({ load: mocks.load }),
}));
import {
  createDefaultWebDistilleryConfig,
  ensureDistilleryConfig,
  distilleryConfig,
} from "../config";

describe("distillery configuration lifecycle", () => {
  it("后台冷启动合并并发加载，UI 与服务共享配置及后续编辑", async () => {
    const saved = createDefaultWebDistilleryConfig();
    saved.jina.apiKey = "test-only-key";
    mocks.load.mockResolvedValue(saved);
    const [first, second] = await Promise.all([
      ensureDistilleryConfig(),
      ensureDistilleryConfig(),
    ]);
    expect(first.jina.apiKey).toBe("test-only-key");
    expect(first).toBe(second);
    expect(first).toBe(distilleryConfig);
    distilleryConfig.defaultCleanMode = true;
    expect((await ensureDistilleryConfig()).defaultCleanMode).toBe(true);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
});
