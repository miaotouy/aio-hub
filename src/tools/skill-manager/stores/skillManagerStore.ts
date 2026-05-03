/**
 * skillManagerStore — 技能管理 Store
 *
 * 管理 Skill 的配置和运行时状态。
 * 配置通过 ConfigManager 持久化。
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { createConfigManager, type ConfigManager } from "@/utils/configManager";
import type { SkillManifest, ExternalScanPath } from "../types";

export interface SkillManagerConfig {
  /** 总开关 */
  enabled: boolean;
  /** 禁用的 Skill ID 列表（skillName） */
  disabledSkillIds: string[];
  /** 是否自动激活匹配的 Skill */
  autoActivate: boolean;
  /** 外部扫描总开关 */
  externalScanEnabled: boolean;
  /** 外部扫描路径列表（每个带 id/path/enabled） */
  externalScanPaths: ExternalScanPath[];
}

const defaultConfig: SkillManagerConfig = {
  enabled: true,
  disabledSkillIds: [],
  autoActivate: false,
  externalScanEnabled: false,
  externalScanPaths: [],
};

const configManager: ConfigManager<SkillManagerConfig> = createConfigManager({
  moduleName: "skill-manager",
  fileName: "config.json",
  fileType: "json",
  createDefault: () => ({ ...defaultConfig }),
});

export const useSkillManagerStore = defineStore("skill-manager", () => {
  const config = ref<SkillManagerConfig>({ ...defaultConfig });
  const manifests = ref<SkillManifest[]>([]);
  const scanStatus = ref<"idle" | "scanning" | "ready" | "error">("idle");
  const activeSkillNames = ref<Set<string>>(new Set());

  /** 已启用的 Skill 清单（过滤掉禁用的） */
  const enabledManifests = computed(() => {
    return manifests.value.filter((m) => !config.value.disabledSkillIds.includes(m.name));
  });

  /** 已安装的 Skill 名称列表 */
  const installedSkillNames = computed(() => manifests.value.map((m) => m.name));

  /** 加载配置 */
  async function loadConfig() {
    config.value = await configManager.load();
  }

  /** 保存配置 */
  async function saveConfig() {
    await configManager.save(config.value);
  }

  /** 更新配置并持久化 */
  async function updateConfig(updates: Partial<SkillManagerConfig>) {
    Object.assign(config.value, updates);
    await saveConfig();
  }

  /** 设置已扫描的清单 */
  function setManifests(list: SkillManifest[]) {
    manifests.value = list;
  }

  /** 设置扫描状态 */
  function setScanStatus(status: "idle" | "scanning" | "ready" | "error") {
    scanStatus.value = status;
  }

  /** 设置技能激活状态 */
  function setSkillActive(name: string, active: boolean) {
    const newSet = new Set(activeSkillNames.value);
    if (active) {
      newSet.add(name);
    } else {
      newSet.delete(name);
    }
    activeSkillNames.value = newSet;
  }

  /** 切换技能启用/禁用 */
  function toggleSkill(name: string) {
    const idx = config.value.disabledSkillIds.indexOf(name);
    if (idx >= 0) {
      config.value.disabledSkillIds.splice(idx, 1);
    } else {
      config.value.disabledSkillIds.push(name);
    }
    saveConfig();
  }

  /** 移除一个技能（卸载后清理） */
  function removeSkill(name: string) {
    const idx = config.value.disabledSkillIds.indexOf(name);
    if (idx >= 0) {
      config.value.disabledSkillIds.splice(idx, 1);
    }
    activeSkillNames.value.delete(name);
    manifests.value = manifests.value.filter((m) => m.name !== name);
    saveConfig();
  }

  /** 判断技能是否启用 */
  function isSkillEnabled(name: string): boolean {
    return !config.value.disabledSkillIds.includes(name);
  }

  /** 判断技能是否已激活 */
  function isSkillActive(name: string): boolean {
    return activeSkillNames.value.has(name);
  }

  /** 重置激活状态（对话轮次结束） */
  function resetActivation() {
    activeSkillNames.value = new Set();
  }

  return {
    config,
    manifests,
    scanStatus,
    activeSkillNames,
    enabledManifests,
    installedSkillNames,
    loadConfig,
    saveConfig,
    updateConfig,
    setManifests,
    setScanStatus,
    setSkillActive,
    toggleSkill,
    removeSkill,
    isSkillEnabled,
    isSkillActive,
    resetActivation,
  };
});
