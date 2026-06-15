import { useAppSettingsStore } from "@/stores/appSettingsStore";
import {
  defaultEnvironmentSettings,
  type DocumentConverterEnvironmentSettings,
  type EnvironmentRuntimeSettings,
  type EnvironmentSettings,
} from "@/utils/appSettings";

export type EnvironmentPathKey = "ffmpeg" | "ffprobe" | "git";
export type EnvironmentRuntimeKey =
  | "javascript"
  | "python"
  | "shell"
  | "powershell";
export type DocumentConverterKey = "libreOffice" | "abiWord";

export interface PluginEnvironmentAPI {
  /**
   * 获取当前全局运行环境配置快照。
   *
   * 返回值是拷贝，插件修改它不会写回用户设置。
   */
  get: () => EnvironmentSettings;
  /**
   * 获取常用可执行文件路径。
   */
  getPath: (key: EnvironmentPathKey) => string;
  /**
   * 获取脚本运行时命令。
   */
  getRuntimeCommand: (key: EnvironmentRuntimeKey) => string;
  /**
   * 获取文档转换器路径。
   */
  getDocumentConverterPath: (key: DocumentConverterKey) => string;
}

function cloneEnvironment(settings?: EnvironmentSettings): EnvironmentSettings {
  const merged: EnvironmentSettings = {
    ...defaultEnvironmentSettings,
    ...(settings ?? {}),
    runtimes: {
      ...defaultEnvironmentSettings.runtimes,
      ...(settings?.runtimes ?? {}),
    },
    documentConverters: {
      ...defaultEnvironmentSettings.documentConverters,
      ...(settings?.documentConverters ?? {}),
    },
  };

  return {
    ...merged,
    runtimes: { ...(merged.runtimes ?? {}) },
    documentConverters: { ...(merged.documentConverters ?? {}) },
  };
}

function getEnvironmentSettings(): EnvironmentSettings {
  const settingsStore = useAppSettingsStore();
  return cloneEnvironment(settingsStore.settings.environment);
}

const pathKeyMap: Record<EnvironmentPathKey, keyof EnvironmentSettings> = {
  ffmpeg: "ffmpegPath",
  ffprobe: "ffprobePath",
  git: "gitPath",
};

const runtimeKeyMap: Record<
  EnvironmentRuntimeKey,
  keyof EnvironmentRuntimeSettings
> = {
  javascript: "javascriptCommand",
  python: "pythonCommand",
  shell: "shellCommand",
  powershell: "powershellCommand",
};

const documentConverterKeyMap: Record<
  DocumentConverterKey,
  keyof DocumentConverterEnvironmentSettings
> = {
  libreOffice: "libreOfficePath",
  abiWord: "abiWordPath",
};

export const pluginEnvironmentService: PluginEnvironmentAPI = {
  get: getEnvironmentSettings,

  getPath(key) {
    const environment = getEnvironmentSettings();
    return String(environment[pathKeyMap[key]] ?? "");
  },

  getRuntimeCommand(key) {
    const environment = getEnvironmentSettings();
    return environment.runtimes?.[runtimeKeyMap[key]] ?? "";
  },

  getDocumentConverterPath(key) {
    const environment = getEnvironmentSettings();
    return (
      environment.documentConverters?.[documentConverterKeyMap[key]] ?? ""
    );
  },
};
