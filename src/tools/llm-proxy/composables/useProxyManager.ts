import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { createModuleLogger } from '@utils/logger';
import { customMessage } from '@utils/customMessage';
import {
  startProxyService,
  stopProxyService,
  getProxyServiceStatus,
  updateProxyTarget,
  onRequestEvent,
  onResponseEvent,
  onStreamUpdateEvent,
  clearAllEventListeners
} from '../proxyService';
import { useRecordManager } from '../recordManager';
import { useStreamProcessor } from '../streamProcessor';
import { loadSettings, saveSettings, validateProxyConfig } from '../configManager';
import { maskSensitiveData, copyToClipboard } from '../utils';
import type { ProxyConfig, LlmProxySettings } from '../types';

const logger = createModuleLogger('LlmProxy/ProxyManager');

/**
 * LLM 代理管理器组合式函数
 */
export function useProxyManager() {
  // 基础状态
  const isRunning = ref(false);
  const currentTargetUrl = ref('');
  const config = ref<ProxyConfig>({
    port: 8999,
    target_url: 'https://api.openai.com',
    header_override_rules: []
  });
  
  // UI 状态
  const maskApiKeys = ref(true);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // 获取各个管理器实例
  const recordManager = useRecordManager();
  const streamProcessor = useStreamProcessor();

  // 事件监听器清理函数
  let unlistenRequest: (() => void) | null = null;
  let unlistenResponse: (() => void) | null = null;
  let unlistenStream: (() => void) | null = null;

  // 计算属性
  const proxyStatus = computed(() => ({
    isRunning: isRunning.value,
    port: config.value.port,
    targetUrl: currentTargetUrl.value,
    recordCount: recordManager.getRecords().length,
    activeStreams: streamProcessor.activeStreamCount.value
  }));

  const canStartProxy = computed(() => {
    return !isRunning.value && 
           config.value.port > 0 && 
           config.value.target_url &&
           !isLoading.value;
  });

  const canStopProxy = computed(() => {
    return isRunning.value && !isLoading.value;
  });

  // 方法
  async function startProxy() {
    if (!canStartProxy.value) {
      return;
    }

    try {
      isLoading.value = true;
      error.value = null;

      // 验证配置
      const validation = validateProxyConfig(config.value);
      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }

      await startProxyService(config.value);
      isRunning.value = true;
      currentTargetUrl.value = config.value.target_url;

      // 设置事件监听器
      await setupEventListeners();

      logger.info('代理服务启动成功', {
        port: config.value.port,
        targetUrl: config.value.target_url
      });

    } catch (err) {
      error.value = err instanceof Error ? err.message : '启动失败';
      logger.error('启动代理服务失败', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function stopProxy() {
    if (!canStopProxy.value) {
      return;
    }

    try {
      isLoading.value = true;
      error.value = null;

      await stopProxyService();
      isRunning.value = false;
      currentTargetUrl.value = '';

      // 清理事件监听器
      cleanupEventListeners();

      logger.info('代理服务停止成功');

    } catch (err) {
      error.value = err instanceof Error ? err.message : '停止失败';
      logger.error('停止代理服务失败', err);
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

      await updateProxyTarget(config.value.target_url);
      currentTargetUrl.value = config.value.target_url;

      logger.info('代理目标地址更新成功', {
        newTargetUrl: config.value.target_url
      });

      customMessage.success('代理目标地址已更新');

    } catch (err) {
      error.value = err instanceof Error ? err.message : '更新失败';
      logger.error('更新代理目标地址失败', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function checkProxyStatus() {
    try {
      const status = await getProxyServiceStatus();
      isRunning.value = status.is_running;
      
      if (status.is_running) {
        config.value.port = status.port;
        config.value.target_url = status.target_url;
        currentTargetUrl.value = status.target_url;

        // 如果代理正在运行，设置事件监听器
        if (!unlistenRequest) {
          await setupEventListeners();
        }

        logger.info('检测到代理服务正在运行', {
          port: status.port,
          targetUrl: status.target_url
        });
      }

    } catch (err) {
      logger.error('检查代理状态失败', err);
      isRunning.value = false;
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

      logger.debug('事件监听器设置完成');

    } catch (err) {
      logger.error('设置事件监听器失败', err);
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
    logger.debug('事件监听器已清理');
  }

  // 配置管理
  async function loadConfig() {
    try {
      const settings = await loadSettings();
      config.value = settings.config;
      recordManager.updateFilterOptions({
        searchQuery: settings.searchQuery,
        filterStatus: settings.filterStatus
      });
      maskApiKeys.value = settings.maskApiKeys ?? true;

      logger.info('配置加载成功', {
        port: settings.config.port,
        targetUrl: settings.config.target_url
      });

    } catch (err) {
      logger.error('加载配置失败', err);
      throw err;
    }
  }

  async function saveConfig() {
    try {
      const settings: LlmProxySettings = {
        config: config.value,
        searchQuery: recordManager.getFilterOptions().searchQuery,
        filterStatus: recordManager.getFilterOptions().filterStatus,
        maskApiKeys: maskApiKeys.value
      };

      await saveSettings(settings);
      logger.debug('配置已保存');

    } catch (err) {
      logger.error('保存配置失败', err);
      throw err;
    }
  }

  // 复制功能
  async function copyWithMask(text: string, message: string = '已复制') {
    try {
      const textToCopy = maskApiKeys.value ? maskSensitiveData(text) : text;
      await copyToClipboard(textToCopy, message);
    } catch (err) {
      error.value = err instanceof Error ? err.message : '复制失败';
      throw err;
    }
  }

  // 清理功能
  function clearRecords() {
    recordManager.clearAllRecords();
    streamProcessor.clearAllStreamBuffers();
    logger.info('已清空所有记录和缓冲');
  }

  // 监听配置变化并自动保存
  watch([config, maskApiKeys], () => {
    saveConfig().catch(err => {
      logger.error('自动保存配置失败', err);
    });
  }, { deep: true });

  // 监听过滤选项变化并自动保存
  watch(() => recordManager.getFilterOptions(), () => {
    saveConfig().catch(err => {
      logger.error('自动保存过滤选项失败', err);
    });
  }, { deep: true });

  // 生命周期
  onMounted(async () => {
    await loadConfig();
    await checkProxyStatus();
  });

  onUnmounted(() => {
    cleanupEventListeners();
    streamProcessor.clearAllStreamBuffers();
  });

  return {
    // 状态
    isRunning,
    currentTargetUrl,
    config,
    maskApiKeys,
    isLoading,
    error,
    
    // 计算属性
    proxyStatus,
    canStartProxy,
    canStopProxy,
    
    // 记录管理器
    records: recordManager.records,
    selectedRecord: recordManager.selectedRecord,
    filterOptions: recordManager.filterOptions,
    filteredRecords: computed(() => recordManager.getFilteredRecords()),
    
    // 流式处理器
    isStreamingActive: streamProcessor.isStreamingActive,
    activeStreamCount: streamProcessor.activeStreamCount,
    
    // 方法
    startProxy,
    stopProxy,
    updateTargetUrl,
    checkProxyStatus,
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
    clearError: () => { error.value = null; }
  };
}