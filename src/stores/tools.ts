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

/** 主页快捷栏允许固定的最大工具数 */
export const QUICK_ACCESS_MAX_ITEMS = 6;
/** 首次使用时展示的推荐快捷工具 */
export const DEFAULT_PINNED_QUICK_ACCESS_PATHS = [
  "/llm-chat",
  "/media-generator",
  "/smart-ocr",
] as const;

export type QuickAccessPinResult =
  "success" | "already-pinned" | "not-found" | "full";

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
  // 主页快速入口槽（固定快捷方式）。空数组是有效的用户选择。
  const pinnedQuickAccessPaths = ref<string[]>([]);
  // 区分“从未配置”与“用户明确清空”，以保留首次推荐工具。
  const hasPinnedQuickAccessPreference = ref(false);

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

    // 加载主页快速入口槽
    try {
      const saved = localStorage.getItem("app-pinned-quick-access");
      if (saved !== null) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          pinnedQuickAccessPaths.value =
            normalizePinnedQuickAccessPaths(parsed);
          hasPinnedQuickAccessPreference.value = true;
        }
      }
    } catch (e) {
      logger.error("Failed to load pinned quick access from cache", e);
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

  /** 当前应生效的快捷栏路径：仅在从未设置过时展示推荐项。 */
  const effectivePinnedQuickAccessPaths = computed<string[]>(() =>
    hasPinnedQuickAccessPreference.value
      ? pinnedQuickAccessPaths.value
      : [...DEFAULT_PINNED_QUICK_ACCESS_PATHS]
  );

  /**
   * 获取主页快速入口槽的工具配置列表。
   * 已不再注册的工具不会显示；路径仍会被保留，方便工具恢复后自动还原。
   */
  const pinnedQuickAccessTools = computed<ToolConfig[]>(() =>
    effectivePinnedQuickAccessPaths.value
      .map((path) => tools.value.find((tool) => tool.path === path))
      .filter((tool): tool is ToolConfig => !!tool)
  );

  function normalizePinnedQuickAccessPaths(paths: unknown[]): string[] {
    const uniquePaths = new Set<string>();
    for (const path of paths) {
      if (typeof path === "string" && !uniquePaths.has(path)) {
        uniquePaths.add(path);
      }
      if (uniquePaths.size === QUICK_ACCESS_MAX_ITEMS) break;
    }
    return [...uniquePaths];
  }

  function getActivePinnedQuickAccessPaths(): string[] {
    return [...effectivePinnedQuickAccessPaths.value];
  }

  function persistPinnedQuickAccessPaths(): void {
    try {
      localStorage.setItem(
        "app-pinned-quick-access",
        JSON.stringify(pinnedQuickAccessPaths.value)
      );
    } catch (e) {
      logger.error("Failed to save pinned quick access to cache", e);
    }
  }

  /** 更新主页快速入口槽，并将此次修改标记为用户偏好。 */
  function updatePinnedQuickAccess(paths: string[]): void {
    pinnedQuickAccessPaths.value = normalizePinnedQuickAccessPaths(paths);
    hasPinnedQuickAccessPreference.value = true;
    persistPinnedQuickAccessPaths();
  }

  /** 将一个工具固定到快捷栏末尾。 */
  function pinQuickAccess(toolPath: string): QuickAccessPinResult {
    if (!tools.value.some((tool) => tool.path === toolPath)) {
      return "not-found";
    }

    const paths = getActivePinnedQuickAccessPaths();
    if (paths.includes(toolPath)) return "already-pinned";

    // 未注册的旧工具不应占用当前可用快捷栏容量；用户下一次修改时顺带清理它们。
    const registeredPaths = paths.filter((path) =>
      tools.value.some((tool) => tool.path === path)
    );
    if (registeredPaths.length >= QUICK_ACCESS_MAX_ITEMS) return "full";

    updatePinnedQuickAccess([...registeredPaths, toolPath]);
    return "success";
  }

  /** 从快捷栏中移除工具；移除最后一项后仍会持久化空数组。 */
  function unpinQuickAccess(toolPath: string): boolean {
    const paths = getActivePinnedQuickAccessPaths();
    if (!paths.includes(toolPath)) return false;

    updatePinnedQuickAccess(paths.filter((path) => path !== toolPath));
    return true;
  }

  /** 按传入顺序重排已固定工具；未包含的既有路径保持在末尾。 */
  function reorderPinnedQuickAccess(paths: string[]): void {
    const currentPaths = getActivePinnedQuickAccessPaths();
    const requestedPaths = normalizePinnedQuickAccessPaths(paths).filter(
      (path) => currentPaths.includes(path)
    );
    const missingPaths = currentPaths.filter(
      (path) => !requestedPaths.includes(path)
    );
    updatePinnedQuickAccess([...requestedPaths, ...missingPaths]);
  }

  /** 用新工具替换一个既有快捷工具，并保留被替换工具的原始位置。 */
  function replacePinnedQuickAccess(
    replacedPath: string,
    replacementPath: string
  ): QuickAccessPinResult {
    if (!tools.value.some((tool) => tool.path === replacementPath)) {
      return "not-found";
    }

    const paths = getActivePinnedQuickAccessPaths();
    const replaceIndex = paths.indexOf(replacedPath);
    if (replaceIndex === -1) return "not-found";
    if (paths.includes(replacementPath)) return "already-pinned";

    paths.splice(replaceIndex, 1, replacementPath);
    updatePinnedQuickAccess(paths);
    return "success";
  }

  /** 恢复首次使用时的推荐快捷工具。 */
  function restoreDefaultPinnedQuickAccess(): void {
    updatePinnedQuickAccess([...DEFAULT_PINNED_QUICK_ACCESS_PATHS]);
  }

  return {
    tools,
    orderedTools,
    toolsOrder,
    openedToolPaths,
    recentToolPaths,
    recentTools,
    pinnedQuickAccessPaths,
    hasPinnedQuickAccessPreference,
    effectivePinnedQuickAccessPaths,
    pinnedQuickAccessTools,
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
    updatePinnedQuickAccess,
    pinQuickAccess,
    unpinQuickAccess,
    reorderPinnedQuickAccess,
    replacePinnedQuickAccess,
    restoreDefaultPinnedQuickAccess,
  };
});
