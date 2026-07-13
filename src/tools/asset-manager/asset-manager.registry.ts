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

import type { ToolRegistry, ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import { FolderOpened } from "@element-plus/icons-vue";
import { createModuleLogger } from "@/utils/logger";
import { assetManagerEngine } from "@/composables/useAssetManager";

const logger = createModuleLogger("tools/asset-manager");

/**
 * AssetManager 注册器
 *
 * 将 assetManagerEngine 的功能封装为可跨模块调用的注册器。
 * 工具本身的 UI 应直接使用 useAssetManager composable。
 */
class AssetManagerRegistry implements ToolRegistry {
  public readonly id = "asset-manager";
  public readonly runMode = "main-only";
  public readonly name = "资产管理器";
  public readonly description = "管理应用内导入的所有资产，如图片、文档等。";

  constructor() {
    logger.info("AssetManagerRegistry 实例化");
  }

  /**
   * 暴露 assetManagerEngine 的所有方法
   */
  public readonly engine = assetManagerEngine;

  /**
   * 获取服务元数据
   */
  public getMetadata() {
    return {
      methods: [],
    };
  }
}

// 导出类供自动注册系统使用
export default AssetManagerRegistry;

// 同时导出单例实例供直接使用
export const assetManagerRegistry = new AssetManagerRegistry();
/** @deprecated 请使用 assetManagerRegistry */
export const assetManagerService = assetManagerRegistry;

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "资产管理器",
  path: "/asset-manager",
  runMode: "main-only",
  icon: markRaw(FolderOpened),
  component: () => import("./AssetManager.vue"),
  description: "可视化管理应用内导入的所有资产，支持搜索、筛选和预览",
  category: ["文件管理"],
  version: "1.2.0",
};
