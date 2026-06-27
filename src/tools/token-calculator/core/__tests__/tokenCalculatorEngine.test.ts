import { describe, it, expect, vi } from "vitest";
import { TokenCalculatorEngine } from "../tokenCalculatorEngine";
import type { TokenizerProfile } from "../../types/tokenizer-profile";

function createProfile(overrides: Partial<TokenizerProfile> = {}): TokenizerProfile {
  return {
    id: "test-profile",
    name: "Test Profile",
    version: "1.0.0",
    description: "A test tokenizer",
    modelPatterns: ["^test-model$"],
    source: {
      type: "bundled",
      packageName: "@test/tokenizer",
    },
    confidence: "exact",
    ...overrides,
  };
}

describe("TokenCalculatorEngine", () => {
  it("空文本应返回 0 且不标记为估算", async () => {
    const engine = new TokenCalculatorEngine();

    const result = await engine.calculateTokens("", "test-model");

    expect(result).toEqual({
      count: 0,
      rawCount: 0,
      isEstimated: false,
      tokenizerName: "none",
    });
  });

  it("未命中 profile 时应使用字符级估算", async () => {
    const engine = new TokenCalculatorEngine();

    const result = await engine.calculateTokens("你好abc!", "unknown-model");

    expect(result.count).toBe(4);
    expect(result.rawCount).toBe(4);
    expect(result.isEstimated).toBe(true);
    expect(result.tokenizerName).toBe("estimator");
    expect(result.tokenizerConfidence).toBe("estimated");
  });

  it("应按用户规则优先解析 profile", () => {
    const engine = new TokenCalculatorEngine();
    const lowProfile = createProfile({
      id: "pattern-profile",
      modelPatterns: ["model"],
    });
    const highProfile = createProfile({
      id: "rule-profile",
      modelPatterns: [],
    });

    engine.setRegistry({
      profiles: [lowProfile, highProfile],
      rules: [
        {
          id: "override",
          pattern: "model",
          profileId: "rule-profile",
          priority: 100,
        },
      ],
    });

    expect(engine.resolveProfile("test-model")?.profile.id).toBe("rule-profile");
  });

  it("禁用的 profile 不应被自动匹配", async () => {
    const engine = new TokenCalculatorEngine();
    engine.setRegistry({
      profiles: [createProfile({ enabled: false })],
      rules: [],
    });

    const result = await engine.calculateTokens("hello world", "test-model");

    expect(result.isEstimated).toBe(true);
    expect(result.tokenizerName).toBe("estimator");
  });

  it("应使用 loader 实例化 tokenizer 并应用 calibration", async () => {
    const engine = new TokenCalculatorEngine();
    const profile = createProfile({
      calibration: {
        multiplier: 2,
        fixedOverhead: 1,
      },
    });
    const encode = vi.fn(() => [101, 102, 103, 104]);

    engine.setRegistry({
      profiles: [profile],
      rules: [],
    });
    engine.setLoader(profile.id, async () => ({
      fromPreTrained: () => ({ encode }),
    }));

    const result = await engine.calculateTokens("hello", "test-model");

    expect(encode).toHaveBeenCalledWith("hello", undefined, {
      add_special_tokens: true,
    });
    expect(result.count).toBe(9);
    expect(result.rawCount).toBe(4);
    expect(result.isEstimated).toBe(false);
    expect(result.tokenizerName).toBe(profile.id);
    expect(result.tokenizerProfileId).toBe(profile.id);
    expect(result.appliedCalibration).toEqual(profile.calibration);
  });

  it("应缓存同一个 profile 的 tokenizer 实例", async () => {
    const engine = new TokenCalculatorEngine();
    const profile = createProfile();
    const fromPreTrained = vi.fn(() => ({ encode: () => [1] }));

    engine.setRegistry({
      profiles: [profile],
      rules: [],
    });
    engine.setLoader(profile.id, async () => ({ fromPreTrained }));

    await engine.calculateTokens("first", "test-model");
    await engine.calculateTokens("second", "test-model");

    expect(fromPreTrained).toHaveBeenCalledTimes(1);
    expect(engine.getCacheSize()).toBe(1);
  });

  it("应计算多模态 token 成本", () => {
    const engine = new TokenCalculatorEngine();

    expect(
      engine.calculateImageTokens(1024, 1024, {
        calculationMethod: "openai_tile",
        parameters: { baseCost: 85, tileCost: 170, tileSize: 512 },
      })
    ).toBe(765);
    expect(engine.calculateVideoTokens(1.2)).toBe(526);
    expect(engine.calculateAudioTokens(2.1)).toBe(96);
  });
});
