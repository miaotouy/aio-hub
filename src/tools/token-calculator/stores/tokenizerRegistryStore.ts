/**
 * Tokenizer 注册表 Store（主线程权威态）
 *
 * - 内置 profile 不持久化，每次启动从 builtin-tokenizer-index 重建
 * - 用户安装的 profile 与匹配规则分别持久化到 AppData
 * - 任何注册表变化都会通过 calculatorProxy.restartWorker() 同步给 Worker
 *
 * 详见 docs/Plan/分词器资产注册表方案.md §5.1 / §16.3
 */

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  BUILTIN_TOKENIZERS,
  getSerializableBuiltinProfiles,
} from "../data/builtin-tokenizer-index";
import { calculatorProxy } from "../worker/calculator.proxy";
import { tokenCalculatorEngine } from "../core/tokenCalculatorEngine";
import { readProfileFiles } from "../services/tokenizerAssetService";
import type {
  TokenizerProfile,
  TokenizerRule,
  TokenizerCalibration,
  BuiltinProfileOverride,
} from "../types/tokenizer-profile";

const logger = createModuleLogger("token-calculator/registry");
const errorHandler = createModuleErrorHandler("token-calculator/registry");

// =================================================================
// 持久化结构
// =================================================================

interface UserProfilesStore {
  version: string;
  profiles: TokenizerProfile[];
  /**
   * 用户对内置 Profile 的覆盖（Phase 4.5 + Phase 6 引入）
   *
   * Key 为内置 profile ID（与 BUILTIN_TOKENIZERS 中的 id 一致）。
   * 启动时通过 applyBuiltinOverrides 应用到 builtinProfiles 上。
   * 升级 / 卸载内置 profile 时，残留的覆盖项是无害的。
   */
  builtinOverrides?: Record<string, BuiltinProfileOverride>;
}

interface UserRulesStore {
  version: string;
  rules: TokenizerRule[];
}

const profilesManager = createConfigManager<UserProfilesStore>({
  moduleName: "tokenizer-registry",
  fileName: "profiles.json",
  version: "1.0.0",
  createDefault: () => ({
    version: "1.0.0",
    profiles: [],
    builtinOverrides: {},
  }),
  mergeConfig: (def, loaded) => ({
    version: "1.0.0",
    profiles: Array.isArray(loaded.profiles) ? loaded.profiles : def.profiles,
    builtinOverrides:
      loaded.builtinOverrides && typeof loaded.builtinOverrides === "object"
        ? loaded.builtinOverrides
        : (def.builtinOverrides ?? {}),
  }),
});

const rulesManager = createConfigManager<UserRulesStore>({
  moduleName: "tokenizer-registry",
  fileName: "rules.json",
  version: "1.0.0",
  createDefault: () => ({ version: "1.0.0", rules: [] }),
  mergeConfig: (def, loaded) => ({
    version: "1.0.0",
    rules: Array.isArray(loaded.rules) ? loaded.rules : def.rules,
  }),
});

// =================================================================
// Pinia Store
// =================================================================

export const useTokenizerRegistryStore = defineStore(
  "tokenizerRegistry",
  () => {
    /**
     * 内置 profile 的代码默认值（每次启动从 BUILTIN_TOKENIZERS 重建）
     *
     * 这是不变量，所有运行期变化都通过 builtinOverrides 表达。
     */
    const builtinDefaults = getSerializableBuiltinProfiles();

    /**
     * 内置 profile 当前生效快照（默认值 + 用户覆盖）
     *
     * 这是 UI / engine / Worker 看到的内容，由 applyBuiltinOverrides 维护。
     */
    const builtinProfiles = ref<TokenizerProfile[]>(
      builtinDefaults.map((p) => ({ ...p }))
    );

    /** 用户对内置 profile 的覆盖（持久化） */
    const builtinOverrides = ref<Record<string, BuiltinProfileOverride>>({});

    /** 用户安装的 profile（本地导入 + 远端下载） */
    const userProfiles = ref<TokenizerProfile[]>([]);

    /** 用户自定义匹配规则 */
    const userRules = ref<TokenizerRule[]>([]);

    /** 是否已完成首次加载 */
    const isLoaded = ref(false);

    /** 主线程也维护一个 engine 实例，便于同步执行轻量逻辑（媒体 token 估算） */
    const engineReady = ref(false);

    // ============ 内部工具：应用覆盖 ============

    /**
     * 把 builtinOverrides 应用到 builtinProfiles
     *
     * 始终从 builtinDefaults 重建，避免历史状态残留。
     */
    function applyBuiltinOverrides() {
      builtinProfiles.value = builtinDefaults.map((p) => {
        const override = builtinOverrides.value[p.id];
        if (!override) return { ...p };
        const next: TokenizerProfile = { ...p };
        if (override.enabled !== undefined) {
          next.enabled = override.enabled;
        }
        // calibration 是完全覆盖（不是合并），因为代码层默认就没设 calibration
        if (override.calibration !== undefined) {
          next.calibration = { ...override.calibration };
        }
        return next;
      });
    }

    // ============ Computed ============

    /** 全部 profile（内置在前 + 用户在后），UI 用 */
    const allProfiles = computed<TokenizerProfile[]>(() => [
      ...builtinProfiles.value,
      ...userProfiles.value,
    ]);

    /** 全部规则 */
    const allRules = computed<TokenizerRule[]>(() => userRules.value);

    /** 通过 ID 查 profile */
    function getProfile(profileId: string): TokenizerProfile | undefined {
      return allProfiles.value.find((p) => p.id === profileId);
    }

    /** 构造可序列化的注册表快照（用于推 Worker / 推 engine） */
    function snapshot() {
      return {
        profiles: allProfiles.value.map((p) => ({ ...p })),
        rules: allRules.value.map((r) => ({ ...r })),
      };
    }

    // ============ 主线程引擎同步 ============

    /**
     * 把当前注册表同步到主线程的 engine 实例
     *
     * 主要用于 tokenCalculatorEngine.calculateImageTokens 等同步方法，
     * 这些方法不走 Worker，但需要 engine 知道注册表才能正常工作。
     *
     * 注意：主线程 engine 的 setLoader 也需要为内置 profile 注入 loader，
     * 否则 calculateMessageTokens 这类组合调用在主线程退化路径下会失败。
     */
    function syncEngineFromRegistry() {
      const snap = snapshot();
      tokenCalculatorEngine.setRegistry(snap);
      tokenCalculatorEngine.setProfileDataFetcher(async (profileId) => {
        const profile = getProfile(profileId);
        if (!profile) {
          throw new Error(`Tokenizer profile 不存在: ${profileId}`);
        }
        return readProfileFiles(profile);
      });
      for (const builtin of BUILTIN_TOKENIZERS) {
        if (builtin.loader) {
          tokenCalculatorEngine.setLoader(builtin.id, builtin.loader);
        }
      }
      engineReady.value = true;
    }

    function syncProxyReaders() {
      calculatorProxy.setSnapshotProvider(() => snapshot());
      calculatorProxy.setProfileDataReader(async (profileId) => {
        const profile = getProfile(profileId);
        if (!profile) {
          throw new Error(`Tokenizer profile 不存在: ${profileId}`);
        }
        return readProfileFiles(profile);
      });
    }

    // ============ 加载 ============

    /**
     * 从 AppData 加载用户 profile / 规则 / 内置覆盖，然后初始化 engine / proxy
     */
    async function load(): Promise<void> {
      try {
        const [profilesStore, rulesStore] = await Promise.all([
          profilesManager.load(),
          rulesManager.load(),
        ]);
        userProfiles.value = profilesStore.profiles ?? [];
        userRules.value = rulesStore.rules ?? [];
        builtinOverrides.value = { ...(profilesStore.builtinOverrides ?? {}) };
        applyBuiltinOverrides();
        isLoaded.value = true;

        // 同步到主线程 engine
        syncEngineFromRegistry();

        // 通过 proxy 把 snapshot / 按需资产读取器推给 Worker 通道
        syncProxyReaders();

        logger.info("Tokenizer 注册表加载完成", {
          builtin: builtinProfiles.value.length,
          user: userProfiles.value.length,
          rules: userRules.value.length,
          builtinOverrideCount: Object.keys(builtinOverrides.value).length,
        });
      } catch (error) {
        errorHandler.handle(error as Error, {
          userMessage: "加载 Tokenizer 注册表失败",
          showToUser: false,
        });
        isLoaded.value = true; // 即使失败也标记为已加载，使用内置 profile
        applyBuiltinOverrides();
        syncEngineFromRegistry();
        syncProxyReaders();
      }
    }

    // ============ 持久化 + Worker 重启 ============

    async function persistAndRestart(): Promise<void> {
      try {
        await Promise.all([
          profilesManager.save({
            version: "1.0.0",
            profiles: userProfiles.value,
            builtinOverrides: { ...builtinOverrides.value },
          }),
          rulesManager.save({
            version: "1.0.0",
            rules: userRules.value,
          }),
        ]);
      } catch (error) {
        errorHandler.handle(error as Error, {
          userMessage: "保存 Tokenizer 注册表失败",
        });
      }
      syncEngineFromRegistry();
      await calculatorProxy.restartWorker();
    }

    // ============ Profile 操作 ============

    function findUserProfileIndex(profileId: string): number {
      return userProfiles.value.findIndex((p) => p.id === profileId);
    }

    async function installProfile(profile: TokenizerProfile): Promise<void> {
      if (profile.source.type === "bundled") {
        throw new Error("内置 profile 不能通过 install 接口安装");
      }
      const idx = findUserProfileIndex(profile.id);
      const withInstalledAt: TokenizerProfile = {
        ...profile,
        installedAt: profile.installedAt || new Date().toISOString(),
      };
      if (idx >= 0) {
        userProfiles.value.splice(idx, 1, withInstalledAt);
      } else {
        userProfiles.value.push(withInstalledAt);
      }
      await persistAndRestart();
    }

    async function uninstallProfile(profileId: string): Promise<void> {
      const idx = findUserProfileIndex(profileId);
      if (idx < 0) return;
      userProfiles.value.splice(idx, 1);
      // 同时清理引用了该 profile 的规则
      userRules.value = userRules.value.filter(
        (r) => r.profileId !== profileId
      );
      await persistAndRestart();
    }

    /**
     * 判断是否为内置 profile（按 ID 与 BUILTIN_TOKENIZERS 对比）
     */
    function isBuiltinProfile(profileId: string): boolean {
      return builtinDefaults.some((p) => p.id === profileId);
    }

    /**
     * 写入/清除某个内置 profile 的覆盖
     *
     * 当覆盖项变成空对象时自动清理键，避免累积无用数据。
     * patch 中传 undefined 的字段表示"清除该字段的覆盖"。
     */
    function updateBuiltinOverride(
      profileId: string,
      patch: Partial<BuiltinProfileOverride>
    ): void {
      const existing = builtinOverrides.value[profileId] ?? {};
      const merged: BuiltinProfileOverride = { ...existing, ...patch };
      // 清理 undefined 字段
      if (merged.enabled === undefined) delete merged.enabled;
      if (merged.calibration === undefined) delete merged.calibration;

      if (Object.keys(merged).length === 0) {
        delete builtinOverrides.value[profileId];
      } else {
        builtinOverrides.value[profileId] = merged;
      }
      applyBuiltinOverrides();
    }

    /**
     * 设置 profile 启用/禁用（内置或用户均可）
     *
     * Phase 4.5 起：内置 profile 的启用状态也会持久化（通过 builtinOverrides）。
     * 当用户把内置 profile 设回默认值（enabled=true）时，自动清除该字段的覆盖。
     */
    async function setProfileEnabled(
      profileId: string,
      enabled: boolean
    ): Promise<void> {
      // 内置
      if (isBuiltinProfile(profileId)) {
        const isCodeDefault = enabled === true; // 代码默认就是 enabled=true
        updateBuiltinOverride(profileId, {
          enabled: isCodeDefault ? undefined : enabled,
        });
        await persistAndRestart();
        return;
      }
      // 用户
      const userIdx = findUserProfileIndex(profileId);
      if (userIdx >= 0) {
        const current = userProfiles.value[userIdx];
        if (current) {
          userProfiles.value.splice(userIdx, 1, { ...current, enabled });
        }
        await persistAndRestart();
      }
    }

    /**
     * 设置 profile 的 calibration（内置或用户均可）— Phase 6
     *
     * - 传 null：清除 calibration（内置回到代码默认值；用户则从 profile 对象上移除）
     * - 传对象：完整覆盖（不与现有 calibration 合并）
     */
    async function setProfileCalibration(
      profileId: string,
      calibration: TokenizerCalibration | null
    ): Promise<void> {
      if (isBuiltinProfile(profileId)) {
        updateBuiltinOverride(profileId, {
          calibration: calibration === null ? undefined : { ...calibration },
        });
        await persistAndRestart();
        return;
      }
      const userIdx = findUserProfileIndex(profileId);
      if (userIdx >= 0) {
        const current = userProfiles.value[userIdx];
        if (current) {
          const next: TokenizerProfile = { ...current };
          if (calibration === null) {
            delete next.calibration;
          } else {
            next.calibration = { ...calibration };
          }
          userProfiles.value.splice(userIdx, 1, next);
        }
        await persistAndRestart();
      }
    }

    /**
     * 重置某个内置 profile 的所有用户覆盖（enabled + calibration）
     *
     * 完全清空 builtinOverrides 中该 profile 的条目，恢复代码默认值。
     */
    async function resetBuiltinOverride(profileId: string): Promise<void> {
      if (!isBuiltinProfile(profileId)) return;
      if (!(profileId in builtinOverrides.value)) return;
      delete builtinOverrides.value[profileId];
      applyBuiltinOverrides();
      await persistAndRestart();
    }

    /**
     * 查询某个内置 profile 是否被用户覆盖过（任何字段）
     */
    function hasBuiltinOverride(profileId: string): boolean {
      return profileId in builtinOverrides.value;
    }

    // ============ Rule 操作 ============

    async function upsertRule(rule: TokenizerRule): Promise<void> {
      const idx = userRules.value.findIndex((r) => r.id === rule.id);
      if (idx >= 0) {
        userRules.value.splice(idx, 1, { ...rule });
      } else {
        userRules.value.push({ ...rule });
      }
      await persistAndRestart();
    }

    async function deleteRule(ruleId: string): Promise<void> {
      const idx = userRules.value.findIndex((r) => r.id === ruleId);
      if (idx < 0) return;
      userRules.value.splice(idx, 1);
      await persistAndRestart();
    }

    // ============ 工具 ============

    /**
     * 给定 modelId，预演命中哪个 profile
     * 用于规则测试 UI（Phase 4）
     */
    function previewResolve(modelId: string): {
      profile: TokenizerProfile | null;
      matchSource: "rule" | "metadata" | "pattern" | "fallback";
    } {
      const resolved = tokenCalculatorEngine.resolveProfile(modelId);
      return {
        profile: resolved?.profile ?? null,
        matchSource: resolved?.matchSource ?? "fallback",
      };
    }

    // ============ 自启动 ============
    //
    // 即使没有任何 UI 进入 token-calculator 工具页，只要有其他模块（如 LLM Chat）
    // 调用过 useTokenizerRegistryStore，本 store 也会立即触发一次 load，确保
    // Worker 的 init 握手能够完成、计算请求不会无限期挂在启动队列里。
    //
    // 使用 trigger flag 防止重复触发；load() 内部会自己处理异常并标记 isLoaded。
    let _loadTriggered = false;
    function ensureLoaded(): Promise<void> | void {
      if (_loadTriggered) return;
      _loadTriggered = true;
      // 不 await，避免阻塞调用方；store 的内部 watcher 会响应 isLoaded
      return load();
    }
    ensureLoaded();

    return {
      // state
      builtinProfiles,
      userProfiles,
      userRules,
      builtinOverrides,
      isLoaded,
      engineReady,
      // computed
      allProfiles,
      allRules,
      // getters
      getProfile,
      snapshot,
      previewResolve,
      isBuiltinProfile,
      hasBuiltinOverride,
      // actions
      load,
      installProfile,
      uninstallProfile,
      setProfileEnabled,
      setProfileCalibration,
      resetBuiltinOverride,
      upsertRule,
      deleteRule,
      syncEngineFromRegistry,
    };
  }
);
