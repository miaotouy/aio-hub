import { describe, it, expect } from "vitest";
import { filterParametersForModel, buildEffectiveParameters } from "../parameter-config";
import type { LlmParameters } from "../../types";
import type { LlmParameterSupport, ModelCapabilities } from "@/types/llm-profiles";

describe("parameter-config", () => {
  describe("filterParametersForModel", () => {
    const mockParameters: LlmParameters = {
      temperature: 1,
      maxTokens: 2000,
      topP: 0.9,
      thinkingEnabled: true,
      thinkingBudget: 4000,
      reasoningEffort: "medium",
      includeThoughts: true,
      custom: { enabled: true, params: { key: "value" } },
      contextManagement: {
        enabled: true,
        maxContextTokens: 4096,
        retainedCharacters: 100,
      },
      enabledParameters: [
        "temperature",
        "maxTokens",
        "thinkingEnabled",
        "thinkingBudget",
        "reasoningEffort",
      ],
    };

    it("should filter basic parameters based on provider support", () => {
      const supported: LlmParameterSupport = {
        temperature: true,
        maxTokens: true,
        topP: false, // 不支持 topP
      };

      const result = filterParametersForModel(mockParameters, supported);

      expect(result.temperature).toBe(0.7);
      expect(result.maxTokens).toBe(2000);
      expect(result.topP).toBeUndefined();
      expect(result.enabledParameters).toContain("temperature");
      expect(result.enabledParameters).not.toContain("topP");
    });

    it("should handle thinking budget mode correctly", () => {
      const supported: LlmParameterSupport = {
        temperature: true,
        maxTokens: true,
      };
      const capabilities: ModelCapabilities = {
        thinkingConfigType: "budget",
      };

      const result = filterParametersForModel(mockParameters, supported, capabilities);

      expect(result.thinkingEnabled).toBe(true);
      expect(result.thinkingBudget).toBe(4000);
      expect(result.reasoningEffort).toBeUndefined();
      expect(result.enabledParameters).toContain("thinkingEnabled");
      expect(result.enabledParameters).toContain("thinkingBudget");
      expect(result.enabledParameters).not.toContain("reasoningEffort");
    });

    it("should handle thinking effort mode correctly", () => {
      const supported: LlmParameterSupport = {
        temperature: true,
        maxTokens: true,
      };
      const capabilities: ModelCapabilities = {
        thinkingConfigType: "effort",
      };

      const result = filterParametersForModel(mockParameters, supported, capabilities);

      expect(result.thinkingEnabled).toBeUndefined();
      expect(result.thinkingBudget).toBeUndefined();
      expect(result.reasoningEffort).toBe("medium");
      expect(result.enabledParameters).not.toContain("thinkingEnabled");
      expect(result.enabledParameters).not.toContain("thinkingBudget");
      expect(result.enabledParameters).toContain("reasoningEffort");
    });

    it("should remove all thinking parameters when not supported", () => {
      const supported: LlmParameterSupport = {
        temperature: true,
        maxTokens: true,
      };
      const capabilities: ModelCapabilities = {
        thinkingConfigType: "none",
      };

      const result = filterParametersForModel(mockParameters, supported, capabilities);

      expect(result.thinkingEnabled).toBeUndefined();
      expect(result.thinkingBudget).toBeUndefined();
      expect(result.reasoningEffort).toBeUndefined();
      expect(result.enabledParameters).not.toContain("thinkingEnabled");
      expect(result.enabledParameters).not.toContain("thinkingBudget");
      expect(result.enabledParameters).not.toContain("reasoningEffort");
    });

    it("should always preserve special management fields", () => {
      const supported: LlmParameterSupport = {};
      const result = filterParametersForModel(mockParameters, supported);

      expect(result.custom).toEqual({ enabled: true, params: { key: "value" } });
      expect(result.contextManagement).toEqual({
        enabled: true,
        maxContextTokens: 4096,
        retainedCharacters: 100,
      });
    });

    it("should handle Gemini specific includeThoughts correctly", () => {
      const supportedWithThinkingConfig: LlmParameterSupport = {
        thinkingConfig: true,
      };
      const resultWith = filterParametersForModel(mockParameters, supportedWithThinkingConfig);
      expect(resultWith.includeThoughts).toBe(true);

      const supportedWithoutThinkingConfig: LlmParameterSupport = {
        thinkingConfig: false,
      };
      const resultWithout = filterParametersForModel(mockParameters, supportedWithoutThinkingConfig);
      expect(resultWithout.includeThoughts).toBeUndefined();
    });
  });

  describe("buildEffectiveParameters", () => {
    it("should filter parameters not in enabledParameters list", () => {
      const params: LlmParameters = {
        temperature: 0.8,
        maxTokens: 1000,
        topP: 0.5,
        enabledParameters: ["temperature", "maxTokens"],
      } as any;

      const result = buildEffectiveParameters(params);

      expect(result.temperature).toBe(0.8);
      expect(result.maxTokens).toBe(1000);
      expect(result.topP).toBeUndefined();
    });

    it("should include all standard parameters if enabledParameters is not provided", () => {
      const params: LlmParameters = {
        temperature: 0.8,
        maxTokens: 1000,
      } as any;

      const result = buildEffectiveParameters(params);

      expect(result.temperature).toBe(0.8);
      expect(result.maxTokens).toBe(1000);
    });

    it("should merge custom parameters and override standard ones if necessary", () => {
      const params: LlmParameters = {
        temperature: 0.8,
        enabledParameters: ["temperature"],
        custom: {
          temperature: 0.5, // Override
          extra_param: "value",
        },
      } as any;

      const result = buildEffectiveParameters(params);

      expect(result.temperature).toBe(0.5); // Merged custom takes precedence
      expect(result.extra_param).toBe("value");
    });

    it("should skip undefined values", () => {
      const params: LlmParameters = {
        temperature: undefined,
        maxTokens: 1000,
      } as any;

      const result = buildEffectiveParameters(params);

      expect(result).not.toHaveProperty("temperature");
      expect(result.maxTokens).toBe(1000);
    });
  });
});