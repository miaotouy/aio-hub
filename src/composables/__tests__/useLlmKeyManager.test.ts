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
