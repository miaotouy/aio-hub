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

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ToolConfig } from "@/services/types";
import { DEFAULT_TOOLS_ORDER } from "@/config/tools";
import { useAppSettingsStore } from "./appSettingsStore";
import { createModuleLogger } from "@/utils/logger";

// 内置工具的静态配置（模块私有）
// 注意：此数组已清空，工具配置将通过 autoRegisterServices 自动扫描注册
const initialTools: ToolConfig[] = [];
const logger = createModuleLogger("ToolsStore");

export const useToolsStore = defineStore("tools", () => {
  // 使用浅拷贝以保留图标的 markRaw 状态
  // lodash-es 的 cloneDeep 会破坏 markRaw
  const tools = ref<ToolConfig[]>(initialTools.map((t) => ({ ...t })));
  const isReady = ref(false); // 新增状态，标记工具是否已加载完成

  // 响应式的工具顺序配置
  const toolsOrder = ref<string[]>([]);
  // 已打开的工具路径列表（标签页模式）
  const openedToolPaths = ref<string[]>([]);
  // 最近使用的工具路径列表
  const recentToolPaths = ref<string[]>([]);

  /**
   * 初始化工具顺序和已打开的工具（从配置文件和缓存加载）
   */
  function initializeOrder() {
    const appSettingsStore = useAppSettingsStore();
    toolsOrder.value = appSettingsStore.toolsOrder || [];

    // 加载已打开的工具标签
    try {
      const saved = localStorage.getItem("app-opened-tools");
      if (saved) {
        openedToolPaths.value = JSON.parse(saved);
      }
    } catch (e) {
      logger.error("Failed to load opened tools from cache", e);
    }

    // 加载最近使用的工具
    try {
      const saved = localStorage.getItem("app-recent-tools");
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          recentToolPaths.value = parsed
            .filter((path): path is string => typeof path === "string")
            .slice(0, 8);
        }
      }
    } catch (e) {
      logger.error("Failed to load recent tools from cache", e);
    }
  }

  /**
   * 更新工具顺序
   */
  function updateOrder(newOrder: string[]) {
    toolsOrder.value = newOrder;
    const appSettingsStore = useAppSettingsStore();
    appSettingsStore.update({ toolsOrder: newOrder });
  }

  /**
   * 根据用户保存的顺序返回排序后的工具列表
   */
  const orderedTools = computed<ToolConfig[]>(() => {
    // 优先使用用户手动调整的顺序，如果没有则使用内置默认顺序
    const activeOrder =
      toolsOrder.value.length > 0 ? toolsOrder.value : DEFAULT_TOOLS_ORDER;

    // 创建工具路径到配置的映射
    const toolMap = new Map<string, ToolConfig>();
    tools.value.forEach((tool) => {
      toolMap.set(tool.path, tool);
    });

    // 按照确定的顺序排列工具
    const ordered: ToolConfig[] = [];
    activeOrder.forEach((path) => {
      const tool = toolMap.get(path);
      if (tool) {
        ordered.push(tool);
        toolMap.delete(path);
      }
    });

    // 将剩余的（新添加的）工具添加到末尾
    toolMap.forEach((tool) => {
      ordered.push(tool);
    });

    return ordered;
  });

  /**
   * 将工具加载状态设置为就绪
   */
  function setReady() {
    isReady.value = true;
  }

  /**
   * 打开一个工具标签
   */
  function openTool(toolPath: string) {
    // 如果不是有效的工具路径，不处理
    const isTool = tools.value.some((t) => t.path === toolPath);
    if (!isTool) return;

    if (!openedToolPaths.value.includes(toolPath)) {
      openedToolPaths.value.push(toolPath);
      saveOpenedTools();
    }
  }

  /**
   * 关闭一个工具标签
   */
  function closeTool(toolPath: string) {
    const index = openedToolPaths.value.indexOf(toolPath);
    if (index !== -1) {
      openedToolPaths.value.splice(index, 1);
      saveOpenedTools();
    }
  }

  /**
   * 保存已打开的工具到缓存
   */
  function saveOpenedTools() {
    localStorage.setItem(
      "app-opened-tools",
      JSON.stringify(openedToolPaths.value)
    );
  }

  /**
   * Adds a new tool to the store.
   * @param tool The tool configuration to add.
   */
  function addTool(tool: ToolConfig) {
    if (!tools.value.some((t) => t.path === tool.path)) {
      tools.value.push(tool);
    }
  }

  /**
   * Removes a tool from the store by its path.
   * @param toolPath The unique path of the tool to remove.
   */
  function removeTool(toolPath: string) {
    const index = tools.value.findIndex((t) => t.path === toolPath);
    if (index !== -1) {
      tools.value.splice(index, 1);
      // 同时从已打开列表中移除
      closeTool(toolPath);
    }
  }
  /**
   * 更新已打开工具的顺序
   */
  function setOpenedToolPaths(paths: string[]) {
    openedToolPaths.value = paths;
    saveOpenedTools();
  }

  /**
   * 添加工具到最近使用列表
   */
  function addRecentTool(toolPath: string) {
    if (!tools.value.some((tool) => tool.path === toolPath)) return;

    const paths = recentToolPaths.value.filter((p) => p !== toolPath);
    paths.unshift(toolPath);
    recentToolPaths.value = paths.slice(0, 8);
    try {
      localStorage.setItem(
        "app-recent-tools",
        JSON.stringify(recentToolPaths.value)
      );
    } catch (e) {
      logger.error("Failed to save recent tools to cache", e);
    }
  }

  /**
   * 获取最近使用的工具配置列表
   */
  const recentTools = computed<ToolConfig[]>(() =>
    recentToolPaths.value
      .map((path) => tools.value.find((t) => t.path === path))
      .filter((t): t is ToolConfig => !!t)
  );

  return {
    tools,
    orderedTools,
    toolsOrder,
    openedToolPaths,
    recentToolPaths,
    recentTools,
    isReady,
    setReady,
    initializeOrder,
    updateOrder,
    addTool,
    removeTool,
    openTool,
    closeTool,
    setOpenedToolPaths,
    addRecentTool,
  };
});
