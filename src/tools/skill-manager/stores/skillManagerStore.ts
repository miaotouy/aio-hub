/**
 * skillManagerStore — 技能管理 Store
 *
 * 管理 Skill 的配置和运行时状态。
 * 配置通过 ConfigManager 持久化。
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { createConfigManager, type ConfigManager } from "@/utils/configManager";
import type {
  SkillManifest,
  ExternalScanPath,
  RuntimeSettings,
  TerminalPreferences,
  BuiltinInstallInfo,
  SkillSource,
} from "../types";

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
  /** 运行环境配置 */
  runtimeSettings: RuntimeSettings;
  /** 终端/Shell 偏好 */
  terminalPreferences: TerminalPreferences;
  /** Per-skill 环境变量配置 (skillName -> { key: value }) */
  skillEnvVars: Record<string, Record<string, string>>;
  /** 已配置的 Skill 源列表 */
  sources: SkillSource[];
  /** 内置 skill 安装记录 */
  builtinInstallRecords: Record<string, BuiltinInstallInfo>;
}

const defaultRuntimeSettings: RuntimeSettings = {
  javascript: { command: "" }, // 空 = 自动检测：bun > node
  python: { command: "" }, // 空 = 自动检测：python
  shell: { command: "" }, // 空 = 自动检测：bash/sh
  powershell: { command: "" }, // 空 = 自动检测：powershell
};

const defaultTerminalPreferences: TerminalPreferences = {
  defaultShell: "auto-detect",
  commandChainStyle: "auto",
};

const defaultSources: SkillSource[] = [
  {
    id: "builtin",
    type: "builtin",
    name: "内置技能",
    enabled: true,
  },
];

const defaultConfig: SkillManagerConfig = {
  enabled: true,
  disabledSkillIds: [],
  autoActivate: false,
  externalScanEnabled: false,
  externalScanPaths: [],
  runtimeSettings: { ...defaultRuntimeSettings },
  terminalPreferences: { ...defaultTerminalPreferences },
  skillEnvVars: {},
  sources: [...defaultSources],
  builtinInstallRecords: {},
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

  /** 加载配置（含深度合并默认值，确保新字段有默认值） */
  async function loadConfig() {
    const loaded = await configManager.load();
    // 深度合并：确保新增字段有默认值
    config.value = {
      ...loaded,
      runtimeSettings: {
        javascript: { command: loaded.runtimeSettings?.javascript?.command ?? "" },
        python: { command: loaded.runtimeSettings?.python?.command ?? "" },
        shell: { command: loaded.runtimeSettings?.shell?.command ?? "" },
        powershell: { command: loaded.runtimeSettings?.powershell?.command ?? "" },
      },
      terminalPreferences: {
        defaultShell: loaded.terminalPreferences?.defaultShell ?? "auto-detect",
        commandChainStyle: loaded.terminalPreferences?.commandChainStyle ?? "auto",
      },
      // 清洗 externalScanPaths：剔除缺少 path 的无效旧数据
      externalScanPaths: (loaded.externalScanPaths ?? []).filter(
        (p) => typeof p.path === "string" && p.path.trim().length > 0,
      ),
      skillEnvVars: loaded.skillEnvVars ?? {},
      sources: loaded.sources ?? [...defaultSources],
      builtinInstallRecords: loaded.builtinInstallRecords ?? (loaded as any).ejectedBuiltins ?? {},
    };
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
    // 清理环境变量配置
    delete config.value.skillEnvVars[name];
    activeSkillNames.value.delete(name);
    manifests.value = manifests.value.filter((m) => m.name !== name);
    saveConfig();
  }

  /** 重命名技能（更新配置中的 ID） */
  function renameSkill(oldName: string, newName: string) {
    // 1. 更新禁用列表中的 ID
    const idx = config.value.disabledSkillIds.indexOf(oldName);
    if (idx >= 0) {
      config.value.disabledSkillIds[idx] = newName;
    }

    // 2. 更新激活状态中的 ID
    if (activeSkillNames.value.has(oldName)) {
      activeSkillNames.value.delete(oldName);
      activeSkillNames.value.add(newName);
    }

    // 3. 迁移环境变量配置
    if (config.value.skillEnvVars[oldName]) {
      config.value.skillEnvVars[newName] = config.value.skillEnvVars[oldName];
      delete config.value.skillEnvVars[oldName];
    }

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

  /** 判断是否为内置释出的 Skill */
  function isBuiltinInstalled(skillName: string): boolean {
    return !!config.value.builtinInstallRecords[skillName];
  }

  /** 获取安装信息 */
  function getInstallInfo(skillName: string): BuiltinInstallInfo | undefined {
    return config.value.builtinInstallRecords[skillName];
  }

  /** 更新安装记录 */
  async function updateInstallRecord(skillName: string, info: BuiltinInstallInfo) {
    config.value.builtinInstallRecords[skillName] = info;
    await saveConfig();
  }

  /** 获取指定 Skill 的环境变量 */
  function getSkillEnvVars(skillName: string): Record<string, string> {
    return config.value.skillEnvVars[skillName] ?? {};
  }

  /** 设置指定 Skill 的环境变量 */
  function setSkillEnvVars(skillName: string, envVars: Record<string, string>) {
    if (Object.keys(envVars).length === 0) {
      delete config.value.skillEnvVars[skillName];
    } else {
      config.value.skillEnvVars[skillName] = envVars;
    }
    saveConfig();
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
    renameSkill,
    isSkillEnabled,
    isSkillActive,
    resetActivation,
    getSkillEnvVars,
    setSkillEnvVars,
    isBuiltinInstalled,
    getInstallInfo,
    updateInstallRecord,
  };
});
