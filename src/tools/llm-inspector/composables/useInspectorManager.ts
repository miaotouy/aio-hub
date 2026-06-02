/**
 * useInspectorManager — LLM Inspector 顶层 facade
 *
 * 这是 inspector 工具页面唯一的入口 composable。它本身**不**负责具体业务，
 * 而是把以下三个子模块聚合在一起，并连接它们之间为数不多的耦合点：
 *
 * 1. [`useInspectorConfig`](src/tools/llm-inspector/composables/useInspectorConfig.ts:1)
 *    持久化层：config / layout / 历史 / API Key 脱敏复制。
 * 2. [`useExternalProxy`](src/tools/llm-inspector/composables/useExternalProxy.ts:1)
 *    外部代理生命周期：proxyService 启停 + 事件桥接。
 * 3. [`useInternalMonitor`](src/tools/llm-inspector/composables/useInternalMonitor.ts:1)
 *    内部钩子：双通道（本地 + Tauri event）写入 recordManager。
 *
 * 此外本 facade 集中处理：
 * - 状态机 `state: InspectorState`（总开关 / 内部 / 外部 / proxyStatus）
 * - 状态机联动：监听 `isGlobalEnabled & monitorInternal` 联动 `inspectorHookRegistry`
 * - 总开关关闭时强制停外部代理
 * - 自动保存 watch（config / 过滤项变化时调 saveConfig）
 * - 启动时序：loadConfig → checkInspectorStatus
 * - 对外 API（兼容旧调用方）
 */

import { reactive, computed, watch, onMounted, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";
import { useRecordManager } from "../core/recordManager";
import { useInspectorStreamStore } from "../stores/inspectorStreamStore";
import { inspectorHookRegistry } from "../core/hookRegistry";
import { useInspectorConfig } from "./useInspectorConfig";
import { useExternalProxy } from "./useExternalProxy";
import { useInternalMonitor } from "./useInternalMonitor";
import {
  INSPECTOR_SYNC_EVENT,
  type InspectorState,
  type InspectorSyncEnablePayload,
  type ProxyStatus,
} from "../types/hooks";

const logger = createModuleLogger("LlmInspector/InspectorManager");
const errorHandler = createModuleErrorHandler("LlmInspector/InspectorManager");

/**
 * LLM 检查器顶层管理器。整个 inspector 页面唯一的入口 composable。
 */
export function useInspectorManager() {
  // === 状态机（C3）===
  // 集中管理总开关 / 内部监控 / 外部代理 三层状态：
  // - isGlobalEnabled: 总开关，关闭后不再启用任何子监控
  // - monitorInternal: 是否启用前端钩子监控（驱动 hookRegistry.enable/disable）
  // - monitorExternal: 是否启用外部 HTTP 代理（由 useExternalProxy 写入）
  // - externalProxyStatus: 外部代理状态机（stopped / starting / running / stopping / error）
  const state = reactive<InspectorState>({
    isGlobalEnabled: true,
    monitorInternal: false,
    monitorExternal: false,
    externalProxyStatus: "stopped" as ProxyStatus,
  });

  // === 共享底层管理器 ===
  const recordManager = useRecordManager();
  const streamStore = useInspectorStreamStore();
  const { isStreamingActive, activeStreamCount } = storeToRefs(streamStore);

  // === 子 composable：配置层 ===
  const configMgr = useInspectorConfig({
    getFilterOptions: () => recordManager.getFilterOptions(),
  });

  // === 子 composable：外部代理层 ===
  const proxyMgr = useExternalProxy({
    config: configMgr.config,
    state,
    onTargetUrlChange: (url) => configMgr.addUrlToHistory(url),
  });

  // === 子 composable：内部钩子监控 ===
  // 默认开关 OFF（由 inspectorHookRegistry.enable() 控制），开启后会把前端
  // 内部 fetchWithTimeout 抓到的请求/响应/流写入 recordManager。
  useInternalMonitor();

  // === 兼容性别名 / 计算属性 ===
  const isRunning = proxyMgr.isRunning;

  const inspectorStatus = computed(() => ({
    isRunning: isRunning.value,
    port: configMgr.config.value.port,
    targetUrl: proxyMgr.currentTargetUrl.value,
    recordCount: recordManager.getRecords().length,
    activeStreams: activeStreamCount.value,
  }));

  // === 清理 / 复合操作 ===
  function clearRecords() {
    recordManager.clearAllRecords();
    streamStore.clearAllStreamBuffers();
  }

  // === 自动保存：配置 / UI 偏好变化 ===
  watch(
    [
      configMgr.config,
      configMgr.maskApiKeys,
      configMgr.targetUrlHistory,
      configMgr.layout,
      configMgr.autoEstimateTokens,
    ],
    () => {
      configMgr.saveConfig().catch((err) =>
        errorHandler.handle(err, {
          userMessage: "自动保存配置失败",
          showToUser: false,
        })
      );
    },
    { deep: true }
  );

  // === 自动保存：过滤选项变化 ===
  watch(
    () => recordManager.getFilterOptions(),
    () => {
      configMgr.saveConfig().catch((err) =>
        errorHandler.handle(err, {
          userMessage: "自动保存过滤选项失败",
          showToUser: false,
        })
      );
    },
    { deep: true }
  );

  // === 状态机联动：内部钩子开关 ===
  // monitorInternal 同时受 isGlobalEnabled 钳制：总开关关闭时强制停用。
  //
  // 跨窗口同步：
  // - watch 调用 enable/disable 时默认会广播 ENABLE_CHANGED，通知其他窗口。
  // - 当本窗口收到其他窗口的 ENABLE_CHANGED（见下方 onMounted），会更新
  //   state.monitorInternal，从而再次触发本 watch；但因 registry 已经处于
  //   目标状态，enable/disable 内部会幂等短路，不会形成回环。
  watch(
    () => state.isGlobalEnabled && state.monitorInternal,
    (effectiveOn) => {
      const currentRegistryState =
        inspectorHookRegistry.shouldCaptureInternal();
      if (effectiveOn === currentRegistryState) return;
      if (effectiveOn) {
        inspectorHookRegistry.enable(true);
      } else {
        inspectorHookRegistry.disable(true);
      }
    },
    { immediate: true }
  );

  // === 状态机联动：总开关关闭时停外部代理 ===
  // 设计语义：总开关是「检查器整体使能」的统一控制点，关闭后内部钩子
  // 已通过上面的 watch 自动失效；外部代理因仍占用端口转发流量但 inspector
  // 不再记录会造成困惑，因此一并停服更直观。
  watch(
    () => state.isGlobalEnabled,
    (enabled) => {
      if (!enabled && state.externalProxyStatus === "running") {
        proxyMgr.stopInspector().catch((err) =>
          errorHandler.handle(err, {
            userMessage: "关闭总开关时停止外部代理失败",
            showToUser: false,
          })
        );
      }
    }
  );

  // === 跨窗口同步监听 ===
  // 当其他窗口（如分离窗口）切换内部监控开关时，本窗口需同步 UI 状态，
  // 以及当其他窗口主动询问/回应状态时，对齐本地 monitorInternal。
  // 注意：hookRegistry 本身已经在全局 initGlobalSync 中处理了 captureInternal
  // 状态同步，这里的 listen 只负责把同步结果反映到 reactive state 上。
  let syncUnlisteners: UnlistenFn[] = [];

  async function setupSyncListeners() {
    try {
      // ENABLE_CHANGED：其他窗口切换开关 → 同步 UI
      const unlistenEnable = await listen<InspectorSyncEnablePayload>(
        INSPECTOR_SYNC_EVENT.ENABLE_CHANGED,
        (event) => {
          const enabled = event.payload?.enabled === true;
          if (state.monitorInternal !== enabled) {
            state.monitorInternal = enabled;
            logger.debug("跨窗口同步：monitorInternal 已更新", { enabled });
          }
        }
      );
      syncUnlisteners.push(unlistenEnable);

      // STATE_RESPONSE：新窗口启动时收到现有窗口回应 → 同步 UI
      const unlistenResponse = await listen<InspectorSyncEnablePayload>(
        INSPECTOR_SYNC_EVENT.STATE_RESPONSE,
        (event) => {
          const enabled = event.payload?.enabled === true;
          if (enabled && !state.monitorInternal) {
            state.monitorInternal = true;
            logger.debug("跨窗口同步：从现有窗口对齐 monitorInternal=true");
          }
        }
      );
      syncUnlisteners.push(unlistenResponse);
    } catch (error) {
      logger.debug("跨窗口同步 listener 注册失败（可能在非 Tauri 环境）", {
        error: String(error),
      });
    }
  }

  // === 生命周期 ===
  onMounted(async () => {
    await configMgr.loadConfig();
    await proxyMgr.checkInspectorStatus();

    // 保险性触发：main.ts 已在应用启动时调用过 initGlobalSync，此处再调用
    // 一次是幂等的（syncInitialized 标志位会短路）。
    // 这能覆盖 hookRegistry 在 main.ts 之后才被首次导入的边缘场景。
    inspectorHookRegistry
      .initGlobalSync()
      .catch((err) =>
        logger.debug("initGlobalSync 失败", { error: String(err) })
      );

    await setupSyncListeners();
  });

  onUnmounted(() => {
    // 注意：不在 unmount 时强制 disable hookRegistry，避免分离窗口场景下
    // 主窗口卸载导致全局钩子失效。开关由用户在 UI 上显式控制。
    streamStore.clearAllStreamBuffers();

    // 清理跨窗口同步 listener，避免组件销毁后仍持有引用
    for (const unlisten of syncUnlisteners) {
      try {
        unlisten();
      } catch {
        // ignore
      }
    }
    syncUnlisteners = [];
  });

  // === 对外 API（保持向后兼容） ===
  return {
    // 状态机
    state,

    // 状态（兼容字段）
    isRunning,
    currentTargetUrl: proxyMgr.currentTargetUrl,
    config: configMgr.config,
    maskApiKeys: configMgr.maskApiKeys,
    isLoading: proxyMgr.isLoading,
    error: proxyMgr.error,
    targetUrlHistory: configMgr.targetUrlHistory,
    layout: configMgr.layout,
    autoEstimateTokens: configMgr.autoEstimateTokens,

    // 计算属性
    inspectorStatus,
    canStartInspector: proxyMgr.canStart,
    canStopInspector: proxyMgr.canStop,

    // 记录管理器
    records: recordManager.records,
    selectedRecord: recordManager.selectedRecord,
    filterOptions: recordManager.filterOptions,
    filteredRecords: computed(() => recordManager.getFilteredRecords()),

    // 流式处理器
    isStreamingActive,
    activeStreamCount,

    // 方法 — 代理
    startInspector: proxyMgr.startInspector,
    stopInspector: proxyMgr.stopInspector,
    updateTargetUrl: proxyMgr.updateTargetUrl,
    checkInspectorStatus: proxyMgr.checkInspectorStatus,

    // 方法 — 配置
    loadConfig: configMgr.loadConfig,
    saveConfig: configMgr.saveConfig,
    copyWithMask: configMgr.copyWithMask,
    clearRecords,

    // 记录管理方法
    selectRecord: recordManager.selectRecord,
    updateFilterOptions: recordManager.updateFilterOptions,
    getRecordStats: recordManager.getRecordStats,

    // 流式处理方法
    getDisplayResponseBody: streamStore.getDisplayResponseBody,
    extractContent: streamStore.extractContent,
    canShowTextMode: streamStore.canShowTextMode,

    // 工具方法
    clearError: proxyMgr.clearError,
  };
}
