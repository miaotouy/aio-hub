import { createConfigManager } from "@/utils/configManager";
import type { AssetSortBy, AssetGroupBy } from "@/types/asset-management";

/**
 * 资产管理器配置接口
 */
export interface AssetManagerConfig {
  version: string;
  viewMode: "grid" | "list";
  gridCardSize: "large" | "medium" | "small";
  sortBy: AssetSortBy;
  groupBy: AssetGroupBy;
  sidebarCollapsed: boolean;
  searchQuery: string;
}

/**
 * 创建默认配置
 */
export function createDefaultConfig(): AssetManagerConfig {
  return {
    version: "1.0.0",
    viewMode: "grid",
    gridCardSize: "medium",
    sortBy: "date",
    groupBy: "month",
    sidebarCollapsed: false,
    searchQuery: "",
  };
}

/**
 * 资产管理器配置管理器
 */
export const assetManagerConfigManager = createConfigManager<AssetManagerConfig>({
  moduleName: "asset-manager",
  fileName: "config.json",
  version: "1.0.0",
  createDefault: createDefaultConfig,
  mergeConfig: (defaultConfig, loadedConfig) => {
    return {
      ...defaultConfig,
      ...loadedConfig,
      version: defaultConfig.version, // 总是使用最新的版本号
    };
  },
});

/**
 * 保存配置的防抖函数
 */
export const debouncedSaveConfig = assetManagerConfigManager.createDebouncedSave(500);