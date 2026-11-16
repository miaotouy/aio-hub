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

import { beforeAll, describe, expect, it, vi } from "vitest";
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
async function bootstrapWithLegacyProfiles(
  profiles: LlmProfile[],
  failInitialLoad = false
) {
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
  const { ConfigManager } = await import("@/utils/configManager");
  const originalLoad = ConfigManager.prototype.load;
  let failNextRead = failInitialLoad;
  const load = failInitialLoad
    ? vi.spyOn(ConfigManager.prototype, "load").mockImplementation(function (
        this: any
      ) {
        if (this.moduleName === "llm-service" && failNextRead) {
          failNextRead = false;
          return Promise.reject(new Error("initial load unavailable"));
        }
        return originalLoad.call(this);
      })
    : null;
  const store = useLlmProfiles();
  try {
    await store.loadProfiles();
  } finally {
    load?.mockRestore();
  }

  const { createLlmSecretVault } = await import("@/utils/llm-secret");
  const vault = createLlmSecretVault({
    resolveDir: async () => "",
    fileName: "secrets.dat",
  });

  return { profilesManager, vault, store };
}

// 将首次依赖编译放入套件准备阶段，避免并行转换耗尽业务断言的超时。
beforeAll(async () => {
  await import("@/composables/useLlmProfiles");
}, 60000);
vi.setConfig({ testTimeout: 20000 });

describe("useLlmProfiles secret vault bridging", () => {
  it("persists stable DeepSeek URLs and a default-on Beta preference through migration and save", async () => {
    const { profilesManager, store } = await bootstrapWithLegacyProfiles([
      {
        ...legacyProfile(),
        type: "deepseek",
        baseUrl: "https://api.deepseek.com/beta",
      },
    ]);
    expect(store.profiles.value[0]).toMatchObject({
      baseUrl: "https://api.deepseek.com",
      options: { deepseekBeta: true },
    });
    expect((await profilesManager.load()).profiles[0]).toMatchObject({
      baseUrl: "https://api.deepseek.com",
      options: { deepseekBeta: true },
    });
    await store.saveProfile({
      ...store.profiles.value[0],
      baseUrl: "https://api.deepseek.com/beta/v1",
      options: { deepseekBeta: false },
    });
    expect((await profilesManager.load()).profiles[0]).toMatchObject({
      baseUrl: "https://api.deepseek.com",
      options: { deepseekBeta: false },
    });
    const { options: _options, ...partial } = store.profiles.value[0];
    await store.saveProfile(partial);
    expect(store.profiles.value[0].options?.deepseekBeta).toBe(false);
    expect(store.profiles.value[0].apiKeys).toEqual([LEGACY_SECRET]);
  });
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

describe("useLlmProfiles provider selection", () => {
  it("自动选择按列表顺序匹配已启用的提供商渠道，并响应渠道变更", async () => {
    const { store } = await bootstrapWithLegacyProfiles([]);
    const first: LlmProfile = {
      ...legacyProfile(),
      id: "deepseek-first",
      type: "deepseek",
    };
    const second = { ...first, id: "deepseek-second" };
    const disabled = { ...first, id: "deepseek-disabled", enabled: false };
    store.profiles.value = [legacyProfile(), disabled, first, second];

    expect(store.getEnabledProfileByType("deepseek")?.id).toBe(first.id);
    store.profiles.value = [legacyProfile(), disabled, second, first];
    expect(store.getEnabledProfileByType("deepseek", "")?.id).toBe(second.id);
    store.profiles.value[2].enabled = false;
    expect(store.getEnabledProfileByType("deepseek")?.id).toBe(first.id);
    store.profiles.value = [legacyProfile(), disabled];
    expect(store.getEnabledProfileByType("deepseek")).toBeUndefined();
  });

  it("显式绑定优先于列表顺序，绑定缺失、停用或提供商不匹配时返回待修复状态", async () => {
    const { store } = await bootstrapWithLegacyProfiles([]);
    const first: LlmProfile = {
      ...legacyProfile(),
      id: "deepseek-first",
      type: "deepseek",
    };
    const selected = { ...first, id: "deepseek-selected" };
    store.profiles.value = [legacyProfile(), first, selected];

    expect(store.getEnabledProfileByType("deepseek", selected.id)?.id).toBe(
      selected.id
    );
    store.profiles.value[2].enabled = false;
    expect(
      store.getEnabledProfileByType("deepseek", selected.id)
    ).toBeUndefined();
    expect(
      store.getEnabledProfileByType("deepseek", "deleted")
    ).toBeUndefined();
    expect(
      store.getEnabledProfileByType("deepseek", PROFILE_ID)
    ).toBeUndefined();
  });
});

describe("confirmed configuration writes", () => {
  it("keeps failed edits private and retries against the same confirmed revision", async () => {
    const { store } = await bootstrapWithLegacyProfiles([legacyProfile()]);
    const { ConfigManager } = await import("@/utils/configManager");
    const revision = store.revision.value;
    const draft = { ...store.profiles.value[0], name: "Retried draft" };
    const save = vi
      .spyOn(ConfigManager.prototype, "save")
      .mockRejectedValueOnce(new Error("disk full"));
    try {
      await expect(
        store.saveProfile(draft, { expectedRevision: revision })
      ).rejects.toThrow("disk full");
      expect(store.profiles.value[0].name).toBe("Legacy Channel");
      expect(store.revision.value).toBe(revision);
      expect(draft.name).toBe("Retried draft");
      await store.saveProfile(draft, { expectedRevision: revision });
      expect(store.profiles.value[0].name).toBe("Retried draft");
      expect(store.revision.value).not.toBe(revision);
    } finally {
      save.mockRestore();
    }
  });
  it("serializes independent creations without dropping either channel", async () => {
    const { store } = await bootstrapWithLegacyProfiles([]);
    const a = { ...legacyProfile(), id: "queued-a" };
    const b = { ...legacyProfile(), id: "queued-b" };
    const first = store.saveProfile(a);
    const second = store.saveProfile(b);
    a.name = "later mutation";
    await Promise.all([first, second]);
    expect(store.profiles.value.map((item) => item.id)).toEqual([
      "queued-a",
      "queued-b",
    ]);
    expect(store.profiles.value[0].name).toBe("Legacy Channel");
  });
  it("merges local model updates and refuses an older full draft", async () => {
    const profile = {
      ...legacyProfile(),
      models: [{ id: "model", name: "Model", capabilities: { vision: true } }],
    };
    const { store } = await bootstrapWithLegacyProfiles([profile]);
    const staleRevision = store.revision.value;
    const oldDraft = JSON.parse(JSON.stringify(store.profiles.value[0]));
    await store.patchProfileModel(PROFILE_ID, "model", {
      capabilities: { iterativeRefinement: true },
    });
    expect(store.profiles.value[0].models[0].capabilities).toMatchObject({
      vision: true,
      iterativeRefinement: true,
    });
    await expect(
      store.saveProfile(oldDraft, { expectedRevision: staleRevision })
    ).rejects.toMatchObject({ code: "LLM_CONFIG_CONFLICT" });
    expect(
      store.profiles.value[0].models[0].capabilities?.iterativeRefinement
    ).toBe(true);
  });
  it("recovers an initial storage load failure before creating a channel and retains saved channels", async () => {
    const { store } = await bootstrapWithLegacyProfiles(
      [legacyProfile()],
      true
    );
    expect(store.isLoaded.value).toBe(false);
    await store.saveProfile(
      { ...legacyProfile(), id: "recovered-new" },
      { expectedRevision: null }
    );
    expect(store.isLoaded.value).toBe(true);
    expect(store.profiles.value.map((item) => item.id)).toEqual([
      PROFILE_ID,
      "recovered-new",
    ]);
    expect(store.profiles.value[0].apiKeys).toEqual([LEGACY_SECRET]);
  });
});
