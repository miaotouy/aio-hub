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
  documentConversion: AssetManagerDocumentConversionConfig;
}

export interface AssetManagerDocumentConversionConfig {
  autoConvertLegacyDoc: boolean;
  preferredProvider:
    "auto" | "libreOffice" | "microsoftWord" | "abiWord" | "textutil";
  libreOfficePath: string;
  abiWordPath: string;
  timeoutSeconds: number;
  isolatedProfile: boolean;
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
    documentConversion: {
      autoConvertLegacyDoc: true,
      preferredProvider: "auto",
      libreOfficePath: "",
      abiWordPath: "",
      timeoutSeconds: 120,
      isolatedProfile: true,
    },
  };
}

/**
 * 资产管理器配置管理器
 */
export const assetManagerConfigManager =
  createConfigManager<AssetManagerConfig>({
    moduleName: "asset-manager",
    fileName: "config.json",
    version: "1.0.0",
    createDefault: createDefaultConfig,
    mergeConfig: (defaultConfig, loadedConfig) => {
      return {
        ...defaultConfig,
        ...loadedConfig,
        documentConversion: {
          ...defaultConfig.documentConversion,
          ...(loadedConfig.documentConversion ?? {}),
        },
        version: defaultConfig.version, // 总是使用最新的版本号
      };
    },
  });

/**
 * 保存配置的防抖函数
 */
export const debouncedSaveConfig = assetManagerConfigManager.saveDebounced;
