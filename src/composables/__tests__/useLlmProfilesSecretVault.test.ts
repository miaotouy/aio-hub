// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";

const PROFILE_ID = "llm-profile-legacy";
const LEGACY_SECRET = "sk-legacy-plaintext-secret";

function legacyProfile(): LlmProfile {
  return {
    id: PROFILE_ID,
    name: "Legacy Channel",
    type: "openai",
    baseUrl: "https://api.openai.com",
    apiKeys: [LEGACY_SECRET],
    enabled: true,
    models: [],
  };
}

/**
 * 每个用例都重置模块注册表，确保 useLlmProfiles 的模块级单例（configManager
 * 内存存储、secretVault、isLoaded）回到干净的初始状态。
 */
async function bootstrapWithLegacyProfiles(profiles: LlmProfile[]) {
  vi.resetModules();

  // useLlmProfiles 依赖 useModelMetadata 的 Pinia Store
  const { createPinia, setActivePinia } = await import("pinia");
  setActivePinia(createPinia());

  // resetModules 会重建 logger 单例，需重新关闭文件落盘，避免 mock 环境噪音
  const { logger } = await import("@utils/logger");
  logger.setLogToFile(false);
  logger.setLogToConsole(false);

  const { createConfigManager } = await import("@utils/configManager");
  const profilesManager = createConfigManager<{
    profiles: LlmProfile[];
    secretRevision?: string;
  }>({
    moduleName: "llm-service",
    fileName: "profiles.json",
    version: "1.0.0",
    createDefault: () => ({ profiles: [] }),
  });
  await profilesManager.save({ profiles });

  const { useLlmProfiles } = await import("@/composables/useLlmProfiles");
  const store = useLlmProfiles();
  await store.loadProfiles();

  const { createLlmSecretVault } = await import("@/utils/llm-secret");
  const vault = createLlmSecretVault({
    resolveDir: async () => "",
    fileName: "secrets.dat",
  });

  return { profilesManager, vault, store };
}

// 首次动态 import 需要编译 useLlmProfiles 的整条依赖链，放宽单测超时
vi.setConfig({ testTimeout: 20000 });

describe("useLlmProfiles secret vault bridging", () => {
  it("migrates legacy inline keys, strips profiles.json and hydrates memory", async () => {
    const { profilesManager, vault, store } = await bootstrapWithLegacyProfiles(
      [legacyProfile()]
    );

    expect(store.profiles.value[0].apiKeys).toEqual([LEGACY_SECRET]);

    const persisted = await profilesManager.load();
    expect(persisted.profiles[0].apiKeys).toEqual([]);
    expect(persisted.profiles[0].customHeaders).toEqual({});
    expect(JSON.stringify(persisted)).not.toContain(LEGACY_SECRET);
    expect(persisted.secretRevision).toBeTruthy();

    const loaded = await vault.load(persisted.secretRevision ?? null);
    expect(loaded.needsRewrite).toBe(false);
    expect(loaded.secrets).toEqual({
      [PROFILE_ID]: { apiKeys: [LEGACY_SECRET], customHeaders: {} },
    });
  });

  it("strips newly saved keys while keeping them available in memory", async () => {
    const { profilesManager, vault, store } = await bootstrapWithLegacyProfiles(
      []
    );

    const fresh: LlmProfile = {
      ...legacyProfile(),
      id: "llm-profile-fresh",
      apiKeys: ["sk-fresh-secret"],
      customHeaders: { Authorization: "Bearer sk-header-secret" },
    };
    await store.saveProfile(fresh);

    expect(store.profiles.value[0].apiKeys).toEqual(["sk-fresh-secret"]);
    expect(store.profiles.value[0].customHeaders).toEqual({
      Authorization: "Bearer sk-header-secret",
    });

    const persisted = await profilesManager.load();
    expect(persisted.profiles[0].apiKeys).toEqual([]);
    expect(persisted.profiles[0].customHeaders).toEqual({});
    expect(JSON.stringify(persisted)).not.toContain("sk-fresh-secret");
    expect(JSON.stringify(persisted)).not.toContain("sk-header-secret");

    const loaded = await vault.load(persisted.secretRevision ?? null);
    expect(loaded.secrets).toEqual({
      "llm-profile-fresh": {
        apiKeys: ["sk-fresh-secret"],
        customHeaders: { Authorization: "Bearer sk-header-secret" },
      },
    });
  });

  it("removes vault entries together with deleted profiles", async () => {
    const { profilesManager, vault, store } = await bootstrapWithLegacyProfiles(
      [legacyProfile()]
    );

    await store.deleteProfile(PROFILE_ID);

    const persisted = await profilesManager.load();
    const loaded = await vault.load(persisted.secretRevision ?? null);
    expect(loaded.secrets).toEqual({});
  });

  it("keeps stored secrets when a partial update omits them", async () => {
    const { profilesManager, vault, store } = await bootstrapWithLegacyProfiles(
      [legacyProfile()]
    );

    const partial = { ...legacyProfile(), name: "Renamed Channel" };
    delete (partial as Partial<LlmProfile>).apiKeys;
    delete (partial as Partial<LlmProfile>).customHeaders;
    await store.saveProfile(partial as LlmProfile);

    expect(store.profiles.value[0].name).toBe("Renamed Channel");
    expect(store.profiles.value[0].apiKeys).toEqual([LEGACY_SECRET]);

    const persisted = await profilesManager.load();
    const loaded = await vault.load(persisted.secretRevision ?? null);
    expect(loaded.secrets).toEqual({
      [PROFILE_ID]: { apiKeys: [LEGACY_SECRET], customHeaders: {} },
    });
  });
});
