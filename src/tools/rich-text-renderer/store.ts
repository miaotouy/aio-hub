/**
 * 富文本渲染器测试工具的状态管理
 */

import { defineStore } from 'pinia';
import { ref, reactive, watch } from 'vue';
import type { TesterConfig } from './types';
import { createConfigManager } from '@/utils/configManager';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('rich-text-renderer/store');

// 创建配置管理器
const configManager = createConfigManager<TesterConfig>({
  moduleName: 'rich-text-renderer',
  fileName: 'tester-config.json',
  version: '1.0.0',
  createDefault: () => ({
    version: '1.0.0',
    isInputCollapsed: false,
    selectedPreset: '',
    streamEnabled: true,
    streamSpeed: 100,
    initialDelay: 500,
    fluctuationEnabled: false,
    delayFluctuation: {
      min: 50,
      max: 200,
    },
    charsFluctuation: {
      min: 1,
      max: 10,
    },
    inputContent: '',
    autoScroll: true,
    visualizeBlockStatus: false,
  }),
});

export const useRichTextRendererStore = defineStore('richTextRenderer', () => {
  // ===== State =====
  const isInputCollapsed = ref(false);
  const selectedPreset = ref('');
  const inputContent = ref('');
  const streamEnabled = ref(true);
  const streamSpeed = ref(100);
  const initialDelay = ref(500);
  const fluctuationEnabled = ref(false);
  const delayFluctuation = reactive({
    min: 50,
    max: 200,
  });
  const charsFluctuation = reactive({
    min: 1,
    max: 10,
  });
  const autoScroll = ref(true);
  const visualizeBlockStatus = ref(false);

  // 是否已加载配置
  const isConfigLoaded = ref(false);

  // ===== Actions =====

  /**
   * 从文件加载配置
   */
  async function loadConfig(): Promise<void> {
    try {
      logger.info('开始加载配置');
      const config = await configManager.load();

      // 应用配置到状态
      isInputCollapsed.value = config.isInputCollapsed;
      selectedPreset.value = config.selectedPreset;
      inputContent.value = config.inputContent;
      streamEnabled.value = config.streamEnabled;
      streamSpeed.value = config.streamSpeed;
      initialDelay.value = config.initialDelay;
      fluctuationEnabled.value = config.fluctuationEnabled;
      delayFluctuation.min = config.delayFluctuation.min;
      delayFluctuation.max = config.delayFluctuation.max;
      charsFluctuation.min = config.charsFluctuation.min;
      charsFluctuation.max = config.charsFluctuation.max;
      autoScroll.value = config.autoScroll;
      visualizeBlockStatus.value = config.visualizeBlockStatus;

      isConfigLoaded.value = true;
      logger.info('配置加载成功');
    } catch (error) {
      logger.error('加载配置失败', error);
      // 加载失败时使用默认值（已在 ref 初始化时设置）
      isConfigLoaded.value = true;
    }
  }

  /**
   * 保存配置到文件
   */
  async function saveConfig(): Promise<void> {
    try {
      const config: TesterConfig = {
        version: '1.0.0',
        isInputCollapsed: isInputCollapsed.value,
        selectedPreset: selectedPreset.value,
        inputContent: inputContent.value,
        streamEnabled: streamEnabled.value,
        streamSpeed: streamSpeed.value,
        initialDelay: initialDelay.value,
        fluctuationEnabled: fluctuationEnabled.value,
        delayFluctuation: {
          min: delayFluctuation.min,
          max: delayFluctuation.max,
        },
        charsFluctuation: {
          min: charsFluctuation.min,
          max: charsFluctuation.max,
        },
        autoScroll: autoScroll.value,
        visualizeBlockStatus: visualizeBlockStatus.value,
      };

      await configManager.save(config);
      logger.debug('配置保存成功');
    } catch (error) {
      logger.error('保存配置失败', error);
    }
  }

  /**
   * 创建防抖保存函数
   */
  const debouncedSave = configManager.createDebouncedSave(1000);

  /**
   * 自动保存配置（防抖）
   */
  function autoSaveConfig(): void {
    if (!isConfigLoaded.value) return;

    const config: TesterConfig = {
      version: '1.0.0',
      isInputCollapsed: isInputCollapsed.value,
      selectedPreset: selectedPreset.value,
      inputContent: inputContent.value,
      streamEnabled: streamEnabled.value,
      streamSpeed: streamSpeed.value,
      initialDelay: initialDelay.value,
      fluctuationEnabled: fluctuationEnabled.value,
      delayFluctuation: {
        min: delayFluctuation.min,
        max: delayFluctuation.max,
      },
      charsFluctuation: {
        min: charsFluctuation.min,
        max: charsFluctuation.max,
      },
      autoScroll: autoScroll.value,
      visualizeBlockStatus: visualizeBlockStatus.value,
    };

    debouncedSave(config);
  }

  /**
   * 重置为默认配置
   */
  function resetConfig(): void {
    isInputCollapsed.value = false;
    selectedPreset.value = '';
    inputContent.value = '';
    streamEnabled.value = true;
    streamSpeed.value = 100;
    initialDelay.value = 500;
    fluctuationEnabled.value = false;
    delayFluctuation.min = 50;
    delayFluctuation.max = 200;
    charsFluctuation.min = 1;
    charsFluctuation.max = 10;
    autoScroll.value = true;
    visualizeBlockStatus.value = false;

    saveConfig();
  }

  // ===== 监听状态变化自动保存 =====
  
  // 在配置加载完成后，监听所有状态变化并自动保存
  watch(
    [
      isInputCollapsed,
      selectedPreset,
      inputContent,
      streamEnabled,
      streamSpeed,
      initialDelay,
      fluctuationEnabled,
      () => delayFluctuation.min,
      () => delayFluctuation.max,
      () => charsFluctuation.min,
      () => charsFluctuation.max,
      autoScroll,
      visualizeBlockStatus,
    ],
    () => {
      autoSaveConfig();
    }
  );

  return {
    // State
    isInputCollapsed,
    selectedPreset,
    inputContent,
    streamEnabled,
    streamSpeed,
    initialDelay,
    fluctuationEnabled,
    delayFluctuation,
    charsFluctuation,
    autoScroll,
    visualizeBlockStatus,
    isConfigLoaded,

    // Actions
    loadConfig,
    saveConfig,
    resetConfig,
  };
});