import { reactive, ref, computed, watch, onMounted, onUnmounted } from "vue";
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
import { useRecordManager } from "../core/recordManager";
import { useStreamProcessor } from "../core/streamProcessor";
import { useInternalMonitor } from "./useInternalMonitor";
import { inspectorHookRegistry } from "../core/hookRegistry";
import type { InspectorState, ProxyStatus } from "../types/hooks";
import {
  loadSettings,
  saveSettings,
  validateInspectorConfig,
  DEFAULT_SPLIT_RATIO,
} from "../core/configManager";
import { maskSensitiveData, copyToClipboard } from "../core/utils";
import type {
  InspectorConfig,
  InspectorLayoutSettings,
  LlmInspectorSettings,
} from "../types";

const logger = createModuleLogger("LlmInspector/InspectorManager");
const errorHandler = createModuleErrorHandler("LlmInspector/InspectorManager");

/**
 * LLM 检查器管理器组合式函数
 */
export function useInspectorManager() {
  // === Inspector 状态机（C3 新增）===
  // 集中管理总开关 / 内部监控 / 外部代理 三层状态。
  // - isGlobalEnabled: 总开关，关闭后不再启用任何子监控。
  // - monitorInternal: 是否启用前端钩子监控（驱动 hookRegistry.enable/disable）。
  // - monitorExternal: 是否启用外部 HTTP 代理（与现有 isRunning 计算属性绑定）。
  // - externalProxyStatus: 外部代理状态机，区分 stopped / starting / running / stopping / error。
  const state = reactive<InspectorState>({
    isGlobalEnabled: true,
    monitorInternal: false,
    monitorExternal: false,
    externalProxyStatus: "stopped" as ProxyStatus,
  });

  // 兼容性 computed：旧 UI 仍使用 isRunning 判断按钮状态，保留语义不变。
  const isRunning = computed(() => state.externalProxyStatus === "running");

  // 基础状态
  const currentTargetUrl = ref("");
  const config = ref<InspectorConfig>({
    port: 8999,
    target_url: "https://api.openai.com",
    header_override_rules: [],
  });

  // UI 状态
  const maskApiKeys = ref(true);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const targetUrlHistory = ref<string[]>([]);

  // 布局状态（D4）
  const layout = ref<InspectorLayoutSettings>({
    splitRatio: DEFAULT_SPLIT_RATIO,
  });

  // 获取各个管理器实例
  const recordManager = useRecordManager();
  const streamProcessor = useStreamProcessor();

  // 接入内部 LLM 调用监控（C2）
  // 默认开关 OFF（由 inspectorHookRegistry.enable() 控制），开启后会把前端
  // 内部 fetchWithTimeout 抓到的请求/响应/流写入 recordManager。
  useInternalMonitor();

  // 事件监听器清理函数
  let unlistenRequest: (() => void) | null = null;
  let unlistenResponse: (() => void) | null = null;
  let unlistenStream: (() => void) | null = null;

  // 计算属性
  const inspectorStatus = computed(() => ({
    isRunning: isRunning.value,
    port: config.value.port,
    targetUrl: currentTargetUrl.value,
    recordCount: recordManager.getRecords().length,
    activeStreams: streamProcessor.activeStreamCount.value,
  }));

  const canStartInspector = computed(() => {
    return Boolean(
      !isRunning.value &&
      config.value.port > 0 &&
      config.value.target_url &&
      !isLoading.value
    );
  });

  const canStopInspector = computed(() => {
    return isRunning.value && !isLoading.value;
  });

  // 方法
  async function startInspector() {
    if (!canStartInspector.value) {
      return;
    }

    try {
      isLoading.value = true;
      error.value = null;

      // 验证配置
      const validation = validateInspectorConfig(config.value);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      state.externalProxyStatus = "starting";
      await startInspectorService(config.value);
      state.externalProxyStatus = "running";
      state.monitorExternal = true;
      currentTargetUrl.value = config.value.target_url;

      // 添加到历史记录
      addUrlToHistory(config.value.target_url);

      // 设置事件监听器
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

  async function stopInspector() {
    if (!canStopInspector.value) {
      return;
    }

    try {
      isLoading.value = true;
      error.value = null;

      state.externalProxyStatus = "stopping";
      await stopInspectorService();
      state.externalProxyStatus = "stopped";
      state.monitorExternal = false;
      currentTargetUrl.value = "";

      // 清理事件监听器
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

  async function updateTargetUrl() {
    if (!isRunning.value || !config.value.target_url) {
      return;
    }

    try {
      isLoading.value = true;
      error.value = null;

      await updateInspectorTarget(config.value.target_url);
      currentTargetUrl.value = config.value.target_url;

      // 添加到历史记录
      addUrlToHistory(config.value.target_url);

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

  async function checkInspectorStatus() {
    try {
      const status = await getInspectorServiceStatus();
      state.externalProxyStatus = status.is_running ? "running" : "stopped";
      state.monitorExternal = status.is_running;

      if (status.is_running) {
        config.value.port = status.port;
        config.value.target_url = status.target_url;
        currentTargetUrl.value = status.target_url;

        // 如果代理正在运行，设置事件监听器
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

  async function setupEventListeners() {
    try {
      // 监听请求事件
      unlistenRequest = await onRequestEvent((request) => {
        recordManager.addRequestRecord(request);
      });

      // 监听响应事件
      unlistenResponse = await onResponseEvent((response) => {
        recordManager.updateResponseRecord(response);
      });

      // 监听流式更新事件
      unlistenStream = await onStreamUpdateEvent((update) => {
        streamProcessor.processStreamUpdate(update);
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

  function cleanupEventListeners() {
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

  // 配置管理
  async function loadConfig() {
    try {
      const settings = await loadSettings();
      config.value = settings.config;
      recordManager.updateFilterOptions({
        searchQuery: settings.searchQuery,
        filterStatus: settings.filterStatus,
      });
      maskApiKeys.value = settings.maskApiKeys ?? true;
      targetUrlHistory.value = settings.targetUrlHistory || [];
      layout.value = settings.layout ?? { splitRatio: DEFAULT_SPLIT_RATIO };

      logger.info("配置加载成功", {
        port: settings.config.port,
        targetUrl: settings.config.target_url,
        historyCount: targetUrlHistory.value.length,
        splitRatio: layout.value.splitRatio,
      });
    } catch (err) {
      errorHandler.handle(err, {
        userMessage: "加载配置失败",
        showToUser: false,
      });
      throw err;
    }
  }

  async function saveConfig() {
    try {
      const settings: LlmInspectorSettings = {
        config: config.value,
        searchQuery: recordManager.getFilterOptions().searchQuery,
        filterStatus: recordManager.getFilterOptions().filterStatus,
        maskApiKeys: maskApiKeys.value,
        targetUrlHistory: targetUrlHistory.value,
        layout: layout.value,
      };

      await saveSettings(settings);
      logger.debug("配置已保存");
    } catch (err) {
      errorHandler.handle(err, {
        userMessage: "保存配置失败",
        showToUser: false,
      });
      throw err;
    }
  }

  // 复制功能
  async function copyWithMask(text: string, message: string = "已复制") {
    try {
      const textToCopy = maskApiKeys.value ? maskSensitiveData(text) : text;
      await copyToClipboard(textToCopy, message);
    } catch (err) {
      error.value = err instanceof Error ? err.message : "复制失败";
      throw err;
    }
  }

  // 历史记录管理
  function addUrlToHistory(url: string) {
    if (!url || !url.trim()) return;

    const history = [...targetUrlHistory.value];
    const index = history.indexOf(url);

    if (index !== -1) {
      history.splice(index, 1);
    }

    history.unshift(url);
    targetUrlHistory.value = history.slice(0, 10);
    logger.debug("已添加到历史记录", { url });
  }

  // 清理功能
  function clearRecords() {
    recordManager.clearAllRecords();
    streamProcessor.clearAllStreamBuffers();
    logger.info("已清空所有记录和缓冲");
  }

  // 监听配置变化并自动保存
  watch(
    [config, maskApiKeys, targetUrlHistory, layout],
    () => {
      saveConfig().catch((err) =>
        errorHandler.handle(err, {
          userMessage: "自动保存配置失败",
          showToUser: false,
        })
      );
    },
    { deep: true }
  );

  // 监听过滤选项变化并自动保存
  watch(
    () => recordManager.getFilterOptions(),
    () => {
      saveConfig().catch((err) =>
        errorHandler.handle(err, {
          userMessage: "自动保存过滤选项失败",
          showToUser: false,
        })
      );
    },
    { deep: true }
  );

  // 监听内部监控开关，联动 hookRegistry（C3）
  // monitorInternal 同时受 isGlobalEnabled 钳制：总开关关闭时强制停用。
  watch(
    () => state.isGlobalEnabled && state.monitorInternal,
    (effectiveOn) => {
      if (effectiveOn) {
        inspectorHookRegistry.enable();
      } else {
        inspectorHookRegistry.disable();
      }
    },
    { immediate: true }
  );

  // 总开关关闭时联动停止外部代理（D3 新增）
  // 设计语义：总开关是「检查器整体使能」的统一控制点，关闭后内部钩子
  // 已通过上面的 watch 自动失效；外部代理因仍占用端口转发流量但 inspector
  // 不再记录会造成困惑，因此一并停服更直观。
  watch(
    () => state.isGlobalEnabled,
    (enabled) => {
      if (!enabled && state.externalProxyStatus === "running") {
        stopInspector().catch((err) =>
          errorHandler.handle(err, {
            userMessage: "关闭总开关时停止外部代理失败",
            showToUser: false,
          })
        );
      }
    }
  );

  // 生命周期
  onMounted(async () => {
    await loadConfig();
    await checkInspectorStatus();
  });

  onUnmounted(() => {
    cleanupEventListeners();
    streamProcessor.clearAllStreamBuffers();
    // 注意：不在 unmount 时强制 disable hookRegistry，避免分离窗口场景下
    // 主窗口卸载导致全局钩子失效。开关由用户在 UI 上显式控制。
  });

  return {
    // 状态机（C3 新增）
    state,

    // 状态（兼容字段）
    isRunning,
    currentTargetUrl,
    config,
    maskApiKeys,
    isLoading,
    error,
    targetUrlHistory,
    layout,

    // 计算属性
    inspectorStatus,
    canStartInspector,
    canStopInspector,

    // 记录管理器
    records: recordManager.records,
    selectedRecord: recordManager.selectedRecord,
    filterOptions: recordManager.filterOptions,
    filteredRecords: computed(() => recordManager.getFilteredRecords()),

    // 流式处理器
    isStreamingActive: streamProcessor.isStreamingActive,
    activeStreamCount: streamProcessor.activeStreamCount,

    // 方法
    startInspector,
    stopInspector,
    updateTargetUrl,
    checkInspectorStatus,
    loadConfig,
    saveConfig,
    copyWithMask,
    clearRecords,

    // 记录管理方法
    selectRecord: recordManager.selectRecord,
    updateFilterOptions: recordManager.updateFilterOptions,
    getRecordStats: recordManager.getRecordStats,

    // 流式处理方法
    getDisplayResponseBody: streamProcessor.getDisplayResponseBody,
    extractContent: streamProcessor.extractContent,
    canShowTextMode: streamProcessor.canShowTextMode,

    // 工具方法
    clearError: () => {
      error.value = null;
    },
  };
}
