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
import type {
  TokenizerProfile,
  TokenizerRule,
} from "../types/tokenizer-profile";

const logger = createModuleLogger("token-calculator/registry");
const errorHandler = createModuleErrorHandler("token-calculator/registry");

// =================================================================
// 持久化结构
// =================================================================

interface UserProfilesStore {
  version: string;
  profiles: TokenizerProfile[];
}

interface UserRulesStore {
  version: string;
  rules: TokenizerRule[];
}

const profilesManager = createConfigManager<UserProfilesStore>({
  moduleName: "tokenizer-registry",
  fileName: "profiles.json",
  version: "1.0.0",
  createDefault: () => ({ version: "1.0.0", profiles: [] }),
  mergeConfig: (def, loaded) => ({
    version: "1.0.0",
    profiles: Array.isArray(loaded.profiles) ? loaded.profiles : def.profiles,
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
    /** 内置 profile（构造时填入，运行期不变） */
    const builtinProfiles = ref<TokenizerProfile[]>(
      getSerializableBuiltinProfiles()
    );

    /** 用户安装的 profile（本地导入 + 远端下载） */
    const userProfiles = ref<TokenizerProfile[]>([]);

    /** 用户自定义匹配规则 */
    const userRules = ref<TokenizerRule[]>([]);

    /** 是否已完成首次加载 */
    const isLoaded = ref(false);

    /** 主线程也维护一个 engine 实例，便于同步执行轻量逻辑（媒体 token 估算） */
    const engineReady = ref(false);

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
      for (const builtin of BUILTIN_TOKENIZERS) {
        if (builtin.loader) {
          tokenCalculatorEngine.setLoader(builtin.id, builtin.loader);
        }
      }
      engineReady.value = true;
    }

    // ============ 加载 ============

    /**
     * 从 AppData 加载用户 profile 与规则，然后初始化 engine / proxy
     */
    async function load(): Promise<void> {
      try {
        const [profilesStore, rulesStore] = await Promise.all([
          profilesManager.load(),
          rulesManager.load(),
        ]);
        userProfiles.value = profilesStore.profiles ?? [];
        userRules.value = rulesStore.rules ?? [];
        isLoaded.value = true;

        // 同步到主线程 engine
        syncEngineFromRegistry();

        // 通过 proxy 把 snapshot 推给 Worker
        calculatorProxy.setSnapshotProvider(() => snapshot());

        logger.info("Tokenizer 注册表加载完成", {
          builtin: builtinProfiles.value.length,
          user: userProfiles.value.length,
          rules: userRules.value.length,
        });
      } catch (error) {
        errorHandler.handle(error as Error, {
          userMessage: "加载 Tokenizer 注册表失败",
          showToUser: false,
        });
        isLoaded.value = true; // 即使失败也标记为已加载，使用内置 profile
        syncEngineFromRegistry();
        calculatorProxy.setSnapshotProvider(() => snapshot());
      }
    }

    // ============ 持久化 + Worker 重启 ============

    async function persistAndRestart(): Promise<void> {
      try {
        await Promise.all([
          profilesManager.save({
            version: "1.0.0",
            profiles: userProfiles.value,
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
     * 设置 profile 启用/禁用（内置或用户均可）
     *
     * 内置 profile 不写到磁盘，只是在运行期通过 enabled 字段控制；
     * 但下次启动会重置为 BUILTIN_TOKENIZERS 中的默认值。
     * （TODO Phase 4 之后再考虑是否把内置启用状态也持久化）
     */
    async function setProfileEnabled(
      profileId: string,
      enabled: boolean
    ): Promise<void> {
      // 内置
      const builtinIdx = builtinProfiles.value.findIndex(
        (p) => p.id === profileId
      );
      if (builtinIdx >= 0) {
        const current = builtinProfiles.value[builtinIdx];
        if (current) {
          builtinProfiles.value.splice(builtinIdx, 1, {
            ...current,
            enabled,
          });
        }
        syncEngineFromRegistry();
        await calculatorProxy.restartWorker();
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
      isLoaded,
      engineReady,
      // computed
      allProfiles,
      allRules,
      // getters
      getProfile,
      snapshot,
      previewResolve,
      // actions
      load,
      installProfile,
      uninstallProfile,
      setProfileEnabled,
      upsertRule,
      deleteRule,
      syncEngineFromRegistry,
    };
  }
);
