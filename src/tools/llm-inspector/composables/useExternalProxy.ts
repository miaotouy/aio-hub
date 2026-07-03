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

/**
 * useExternalProxy — 外部 HTTP 代理生命周期 子 composable
 *
 * 从原 `useInspectorManager` 拆出的「外部代理」职责块：
 * - 通过 [`proxyService`](src/tools/llm-inspector/core/proxyService.ts:1) 启停后端 Axum 服务
 * - 同步状态机字段 `externalProxyStatus` / `monitorExternal`
 * - 注册请求 / 响应 / 流式 三种 Tauri event 监听器，桥接到 inspectorRecordsStore + streamProcessor
 * - `checkInspectorStatus` 启动期对账，避免后端已运行而前端不知
 *
 * **不**持有：
 * - 配置（由 useInspectorConfig 拥有，作为入参传入）
 * - 状态机定义（由 useInspectorManager 拥有，本模块只读写其中字段）
 * - 总开关联动（由 useInspectorManager 集中处理）
 *
 * 设计动机：原 useInspectorManager 中代理启停逻辑占 ~200 行，与配置 / 状态机
 * 强耦合。拆出后调用方明确「我只关心外部代理」时可单独跟踪本模块的副作用。
 */

import { ref, computed, type Ref, onUnmounted } from "vue";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";
import { customMessage } from "@utils/customMessage";
import {
  startInspectorService,
  stopInspectorService,
  getInspectorServiceStatus,
  updateInspectorTarget,
  onRequestEvent,
  onResponseEvent,
  onStreamUpdateEvent,
  clearAllEventListeners,
} from "../core/proxyService";
import { useInspectorRecordsStore } from "../stores/inspectorRecordsStore";
import { useInspectorStreamStore } from "../stores/inspectorStreamStore";
import { validateInspectorConfig } from "../core/configManager";
import type { InspectorConfig } from "../types";
import type { InspectorState } from "../types/hooks";

const logger = createModuleLogger("LlmInspector/ExternalProxy");
const errorHandler = createModuleErrorHandler("LlmInspector/ExternalProxy");

export interface UseExternalProxyOptions {
  /** 当前配置（由 useInspectorConfig 拥有，本模块只读） */
  config: Ref<InspectorConfig>;
  /** 状态机（由 useInspectorManager 拥有，本模块需要写入 externalProxyStatus / monitorExternal） */
  state: InspectorState;
  /** 启动 / 更新成功后回调，用于把 target_url 加入历史 */
  onTargetUrlChange?: (url: string) => void;
}

export function useExternalProxy(options: UseExternalProxyOptions) {
  const { config, state, onTargetUrlChange } = options;

  const recordsStore = useInspectorRecordsStore();
  const streamStore = useInspectorStreamStore();

  const currentTargetUrl = ref("");
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // 事件监听器清理函数
  let unlistenRequest: (() => void) | null = null;
  let unlistenResponse: (() => void) | null = null;
  let unlistenStream: (() => void) | null = null;

  const isRunning = computed(() => state.externalProxyStatus === "running");

  const canStart = computed(() => {
    return Boolean(
      !isRunning.value &&
      config.value.port > 0 &&
      config.value.target_url &&
      !isLoading.value
    );
  });

  const canStop = computed(() => isRunning.value && !isLoading.value);

  // === 事件监听器 ===

  async function setupEventListeners(): Promise<void> {
    try {
      unlistenRequest = await onRequestEvent((request) => {
        recordsStore.addRequestRecord(request);
      });
      unlistenResponse = await onResponseEvent((response) => {
        recordsStore.updateResponseRecord(response);
      });
      unlistenStream = await onStreamUpdateEvent((update) => {
        streamStore.processStreamUpdate(update);
      });
      logger.debug("事件监听器设置完成");
    } catch (err) {
      errorHandler.handle(err, {
        userMessage: "设置事件监听器失败",
        showToUser: false,
      });
      cleanupEventListeners();
      throw err;
    }
  }

  function cleanupEventListeners(): void {
    if (unlistenRequest) {
      unlistenRequest();
      unlistenRequest = null;
    }
    if (unlistenResponse) {
      unlistenResponse();
      unlistenResponse = null;
    }
    if (unlistenStream) {
      unlistenStream();
      unlistenStream = null;
    }
    clearAllEventListeners();
    logger.debug("事件监听器已清理");
  }

  // === 生命周期操作 ===

  async function startInspector(): Promise<void> {
    if (!canStart.value) return;

    try {
      isLoading.value = true;
      error.value = null;

      const validation = validateInspectorConfig(config.value);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      state.externalProxyStatus = "starting";
      await startInspectorService(config.value);
      state.externalProxyStatus = "running";
      state.monitorExternal = true;
      currentTargetUrl.value = config.value.target_url;

      onTargetUrlChange?.(config.value.target_url);

      await setupEventListeners();

      logger.info("代理服务启动成功", {
        port: config.value.port,
        targetUrl: config.value.target_url,
      });
    } catch (err) {
      state.externalProxyStatus = "error";
      error.value = err instanceof Error ? err.message : "启动失败";
      errorHandler.handle(err, {
        userMessage: "启动代理服务失败",
        showToUser: false,
      });
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function stopInspector(): Promise<void> {
    if (!canStop.value) return;

    try {
      isLoading.value = true;
      error.value = null;

      state.externalProxyStatus = "stopping";
      await stopInspectorService();
      state.externalProxyStatus = "stopped";
      state.monitorExternal = false;
      currentTargetUrl.value = "";

      cleanupEventListeners();

      logger.info("代理服务停止成功");
    } catch (err) {
      state.externalProxyStatus = "error";
      error.value = err instanceof Error ? err.message : "停止失败";
      errorHandler.handle(err, {
        userMessage: "停止代理服务失败",
        showToUser: false,
      });
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function updateTargetUrl(): Promise<void> {
    if (!isRunning.value || !config.value.target_url) return;

    try {
      isLoading.value = true;
      error.value = null;

      await updateInspectorTarget(config.value.target_url);
      currentTargetUrl.value = config.value.target_url;
      onTargetUrlChange?.(config.value.target_url);

      logger.info("代理目标地址更新成功", {
        newTargetUrl: config.value.target_url,
      });
      customMessage.success("代理目标地址已更新");
    } catch (err) {
      error.value = err instanceof Error ? err.message : "更新失败";
      errorHandler.handle(err, {
        userMessage: "更新代理目标地址失败",
        showToUser: false,
      });
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 启动时对账：检测后端是否已经在跑代理（前端重启 / 分离窗口场景）。
   * 若已运行则同步状态机、回填配置、并补挂事件监听器。
   */
  async function checkInspectorStatus(): Promise<void> {
    try {
      const status = await getInspectorServiceStatus();
      state.externalProxyStatus = status.is_running ? "running" : "stopped";
      state.monitorExternal = status.is_running;

      if (status.is_running) {
        config.value.port = status.port;
        config.value.target_url = status.target_url;
        currentTargetUrl.value = status.target_url;

        if (!unlistenRequest) {
          await setupEventListeners();
        }

        logger.info("检测到代理服务正在运行", {
          port: status.port,
          targetUrl: status.target_url,
        });
      }
    } catch (err) {
      errorHandler.handle(err, {
        userMessage: "检查代理状态失败",
        showToUser: false,
      });
      state.externalProxyStatus = "stopped";
      state.monitorExternal = false;
    }
  }

  // 卸载时清理事件监听
  onUnmounted(() => {
    cleanupEventListeners();
  });

  return {
    // 状态
    currentTargetUrl,
    isLoading,
    error,

    // 计算属性
    isRunning,
    canStart,
    canStop,

    // 方法
    startInspector,
    stopInspector,
    updateTargetUrl,
    checkInspectorStatus,

    // 工具
    clearError: () => {
      error.value = null;
    },
  };
}
