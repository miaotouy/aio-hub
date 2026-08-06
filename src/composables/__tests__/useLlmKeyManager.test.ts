import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";
import legacyKeyStates from "./fixtures/key-states-v1.0.0.json";

const mocks = vi.hoisted(() => ({
  saveDebounced: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@utils/configManager", () => ({
  createConfigManager: (options: { createDefault: () => unknown }) => ({
    load: vi.fn(async () => options.createDefault()),
    saveDebounced: mocks.saveDebounced,
  }),
}));

vi.mock("@utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: mocks.warn,
    error: vi.fn(),
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));

import {
  normalizeKeyStatesStorage,
  useLlmKeyManager,
} from "../useLlmKeyManager";

const profile = {
  id: "profile-1",
  apiKeys: ["secret-key"],
} as LlmProfile;

describe("useLlmKeyManager", () => {
  beforeEach(() => vi.clearAllMocks());

  it("drops ambiguous global breaker settings from v1.0 storage", () => {
    const normalized = normalizeKeyStatesStorage(legacyKeyStates);

    expect(normalized.states).toEqual(legacyKeyStates.states);
    expect(normalized.lastUsedIndices).toEqual(legacyKeyStates.lastUsedIndices);
    expect(normalized.profileSettings).toEqual({});
    expect(normalized).not.toHaveProperty("enableAutoDisable");
    expect(normalized).not.toHaveProperty("autoRecoveryTime");
  });

  it("requires both opt-in and another available key before breaking", () => {
    const manager = useLlmKeyManager();
    manager.syncKeyStates(profile);

    expect(manager.getEnableAutoDisable("profile-1")).toBe(false);

    manager.reportFailure("profile-1", "secret-key", new Error("invalid key"), {
      forceBroken: true,
    });
    expect(manager.getKeyStatuses("profile-1")["secret-key"].isBroken).toBe(
      false
    );

    manager.setEnableAutoDisable("profile-1", true);
    manager.reportFailure("profile-1", "secret-key", new Error("invalid key"), {
      forceBroken: true,
    });
    expect(manager.getKeyStatuses("profile-1")["secret-key"].isBroken).toBe(
      false
    );

    manager.syncKeyStates({
      ...profile,
      apiKeys: ["secret-key", "backup-key"],
    });
    manager.reportFailure("profile-1", "secret-key", new Error("invalid key"), {
      forceBroken: true,
    });

    expect(manager.getKeyStatuses("profile-1")["secret-key"].isBroken).toBe(
      true
    );
    expect(mocks.warn).toHaveBeenCalledWith(
      "API Key 凭据认证失败",
      expect.objectContaining({ profileId: "profile-1", key: "secret-k..." })
    );
  });

  it("keeps circuit-breaker settings isolated by profile", () => {
    const manager = useLlmKeyManager();

    manager.setEnableAutoDisable("profile-1", true);
    manager.setAutoRecoveryTime("profile-1", 30000);

    expect(manager.getEnableAutoDisable("profile-1")).toBe(true);
    expect(manager.getAutoRecoveryTime("profile-1")).toBe(30000);
    expect(manager.getEnableAutoDisable("profile-2")).toBe(false);
    expect(manager.getAutoRecoveryTime("profile-2")).toBe(60000);
  });
});

// KI-005 回归：不可用 Key 不能静默回退。
describe("pickKey availability boundaries", () => {
  it("全部被用户禁用时抛出配置错误", () => {
    const manager = useLlmKeyManager();
    const disabledProfile = {
      id: "profile-all-disabled",
      name: "全部禁用渠道",
      apiKeys: ["disabled-a", "disabled-b"],
    } as LlmProfile;
    manager.syncKeyStates(disabledProfile);
    manager.batchSetEnabled(disabledProfile.id, false);

    expect(() => manager.pickKey(disabledProfile)).toThrowError(
      expect.objectContaining({ reason: "all-disabled" })
    );
  });

  it("全部已启用 Key 熔断时返回最近恢复时间而不回退", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T00:00:00.000Z"));
    try {
      const manager = useLlmKeyManager();
      const brokenProfile = {
        id: "profile-all-broken",
        name: "全部熔断渠道",
        apiKeys: ["broken-a", "broken-b"],
      } as LlmProfile;
      manager.syncKeyStates(brokenProfile);
      manager.setAutoRecoveryTime(brokenProfile.id, 60_000);
      manager.updateKeyStatus(brokenProfile.id, "broken-a", {
        isBroken: true,
        disabledTime: Date.now() - 10_000,
      });
      manager.updateKeyStatus(brokenProfile.id, "broken-b", {
        isBroken: true,
        disabledTime: Date.now() - 20_000,
      });

      try {
        manager.pickKey(brokenProfile);
        throw new Error("expected pickKey to throw");
      } catch (error) {
        expect(error).toMatchObject({
          reason: "all-enabled-circuit-broken",
          retryAt: Date.now() + 40_000,
        });
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("熔断时间到期后自动恢复", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T00:02:00.000Z"));
    try {
      const manager = useLlmKeyManager();
      const recoveryProfile = {
        id: "profile-auto-recovery",
        apiKeys: ["recover-key"],
      } as LlmProfile;
      manager.syncKeyStates(recoveryProfile);
      manager.setAutoRecoveryTime(recoveryProfile.id, 60_000);
      manager.updateKeyStatus(recoveryProfile.id, "recover-key", {
        isBroken: true,
        disabledTime: Date.now() - 61_000,
      });

      expect(manager.pickKey(recoveryProfile)).toBe("recover-key");
      expect(
        manager.getKeyStatuses(recoveryProfile.id)["recover-key"].isBroken
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("只选择最后一个仍可用的 Key", () => {
    const manager = useLlmKeyManager();
    const partialProfile = {
      id: "profile-last-available",
      apiKeys: ["bad-key", "good-key"],
    } as LlmProfile;
    manager.syncKeyStates(partialProfile);
    manager.updateKeyStatus(partialProfile.id, "bad-key", { isBroken: true });

    expect(manager.pickKey(partialProfile)).toBe("good-key");
  });
});
